"""Export Tiny Oracle as ONE ONNX with a KV cache, for the Id|le arena.

Replaces the two arena models (the comment writer and the 'judge' copy that also returns hidden states):
they are the same checkpoint, so one graph returns logits AND hidden, and takes/returns per-layer K/V so
generation is one full pass plus one-token steps.

Inputs : input_ids [1,S] int64; past_k_i, past_v_i [1,H,P,Dh] float32 per layer (P may be 0 on the first pass)
Outputs: logits [1,S,V]; hidden [1,S,D] (post-norm, what the instruction head reads); present_k_i, present_v_i [1,H,P+S,Dh]
Positions are P..P+S-1, so P+S must stay <= max_seq_len (the page falls back to the full window past that).

Run from the jeffy research dir (needs its train_lm.py):
  cd ~/Documents/Projects/jeffy/experiments/scratch_classifier
  python3 ~/Documents/Projects/id-le/tools/export_oracle_kv.py --checkpoint checkpoints/best_lm_oracle_v2_grown_ct2.pt --out <dir>/oracle_v2_grown_ct2_kv
"""
import argparse, math, os, sys
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
sys.path.insert(0, os.getcwd())
from train_lm import CausalTransformer


class KVModel(nn.Module):
    def __init__(self, orig):
        super().__init__()
        self.token_emb, self.pos_emb, self.norm, self.lm_head = orig.token_emb, orig.pos_emb, orig.norm, orig.lm_head
        self.layers = nn.ModuleList(orig.transformer.layers)
        self.d = orig.pos_emb.embedding_dim; self.h = self.layers[0].self_attn.num_heads; self.dh = self.d // self.h

    def forward(self, input_ids, *past):
        B, S = input_ids.shape
        P = past[0].shape[2]
        pos = (torch.arange(S, device=input_ids.device) + P).unsqueeze(0)
        x = self.token_emb(input_ids) + self.pos_emb(pos)
        # query i (absolute P+i) sees keys 0..P+i
        mask = torch.triu(torch.full((S, P + S), float("-inf")), diagonal=1 + P)
        presents = []
        for li, layer in enumerate(self.layers):
            sa = layer.self_attn; pre = getattr(layer, "norm_first", False)
            hh = layer.norm1(x) if pre else x
            q, k, v = F.linear(hh, sa.in_proj_weight, sa.in_proj_bias).chunk(3, dim=-1)
            q = q.view(B, S, self.h, self.dh).transpose(1, 2)
            k = torch.cat([past[2 * li], k.view(B, S, self.h, self.dh).transpose(1, 2)], dim=2)
            v = torch.cat([past[2 * li + 1], v.view(B, S, self.h, self.dh).transpose(1, 2)], dim=2)
            presents += [k, v]
            a = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.dh) + mask
            out = torch.matmul(F.softmax(a, dim=-1), v).transpose(1, 2).contiguous().view(B, S, self.d)
            out = F.linear(out, sa.out_proj.weight, sa.out_proj.bias)
            x = x + out if pre else layer.norm1(x + out)
            ff = layer.linear2(F.gelu(layer.linear1(layer.norm2(x) if pre else x)))
            x = x + ff if pre else layer.norm2(x + ff)
        x = self.norm(x)
        return (self.lm_head(x), x, *presents)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--checkpoint", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    ck = torch.load(a.checkpoint, map_location="cpu", weights_only=False); cfg = ck["config"]
    assert cfg.get("n_iterations", 1) == 1 and not cfg.get("rope", False), "export assumes absolute positions, one pass over the layers"
    orig = CausalTransformer(vocab_size=cfg["vocab_size"], d_model=cfg["d_model"], n_heads=cfg["n_heads"], n_layers=cfg["n_layers"], d_ff=cfg["d_ff"],
                             max_seq_len=cfg["max_seq_len"], tie_weights=cfg["tie_weights"], n_iterations=1, pre_ln=cfg.get("pre_ln", False), rope=False)
    orig.load_state_dict(ck["model_state"]); orig.eval()
    m = KVModel(orig).eval(); L, H, Dh = len(m.layers), m.h, m.dh
    empty = [torch.zeros(1, H, 0, Dh) for _ in range(2 * L)]
    # wrapper == original, full pass and split pass
    t = torch.randint(0, cfg["vocab_size"], (1, 40))
    with torch.no_grad():
        ref = orig(t); full = m(t, *empty)
        d1 = (ref - full[0]).abs().max().item()
        first = m(t[:, :30], *empty); step = m(t[:, 30:], *first[2:])
        d2 = (ref[:, 30:] - step[0]).abs().max().item()
    print(f"wrapper vs original {d1:.2e}; cached split vs original {d2:.2e}"); assert d1 < 1e-4 and d2 < 1e-4
    names_p = [f"past_{kv}_{i}" for i in range(L) for kv in ("k", "v")]; names_o = [f"present_{kv}_{i}" for i in range(L) for kv in ("k", "v")]
    dyn = {"input_ids": {1: "s"}, "logits": {1: "s"}, "hidden": {1: "s"}, **{n: {2: "p"} for n in names_p}, **{n: {2: "ps"} for n in names_o}}
    f32 = a.out + "_f32.onnx"
    sample_past = [torch.zeros(1, H, 3, Dh) for _ in range(2 * L)]
    torch.onnx.export(m, (torch.randint(0, cfg["vocab_size"], (1, 5)), *sample_past), f32, input_names=["input_ids", *names_p],
                      output_names=["logits", "hidden", *names_o], dynamic_axes=dyn, opset_version=17, do_constant_folding=True, dynamo=False)
    from onnxruntime.quantization import quantize_dynamic, QuantType
    q8 = a.out + "_int8.onnx"; quantize_dynamic(f32, q8, weight_type=QuantType.QInt8)
    for f in (f32, q8): print(f, f"{os.path.getsize(f) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
