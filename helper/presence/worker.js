// The Presence Durable Object's own small Worker (Pages Functions can't define a Durable Object, only bind to one in a Worker).
// It holds the live table for the creator's view (see "presence" in ../worker.js); it has no public route of its own.
// Deploy (once, and again when the class changes): npx wrangler deploy -c helper/presence/wrangler.toml
// then bind it to the Pages project as PRESENCE (class Presence, script idle-presence) for the environments that should have it.
export { Presence } from '../worker.js';
export default { async fetch() { return new Response('not here', { status: 404 }); } };
