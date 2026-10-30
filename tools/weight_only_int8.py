"""Weight-only int8 for a small ONNX model: every large float weight becomes int8 + per-row scale and a
DequantizeLinear node with the original name, so all maths stays float. Unlike dynamic quantisation (which
quantises activations per call), a one-token cached step computes the same numbers as a full pass."""
import sys, numpy as np, onnx
from onnx import numpy_helper, helper

def main(src, dst, min_size=4096):
    m = onnx.load(src); g = m.graph; keep, nodes = [], []
    for init in g.initializer:
        w = numpy_helper.to_array(init)
        if w.dtype != np.float32 or w.ndim != 2 or w.size < min_size: keep.append(init); continue
        s = np.abs(w).max(axis=1) / 127.0; s[s == 0] = 1.0
        q = np.clip(np.round(w / s[:, None]), -127, 127).astype(np.int8)
        n = init.name
        keep += [numpy_helper.from_array(q, n + '_q8'), numpy_helper.from_array(s.astype(np.float32), n + '_s'), numpy_helper.from_array(np.zeros(len(s), np.int8), n + '_z')]
        nodes.append(helper.make_node('DequantizeLinear', [n + '_q8', n + '_s', n + '_z'], [n], axis=0, name='dq_' + n))
    del g.initializer[:]; g.initializer.extend(keep)
    old = list(g.node); del g.node[:]; g.node.extend(nodes + old)
    onnx.checker.check_model(m); onnx.save(m, dst)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
