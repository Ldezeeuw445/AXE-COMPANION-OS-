export interface Env {
  LIVE_ENGINE: DurableObjectNamespace;
  /** Polygon key(s) for upstream live WS (set via `wrangler secret put`). */
  POLYGON_API_KEY?: string;
  POLYGON_API_KEYS?: string;
}

export { LiveEngineRoom } from './room';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected websocket', { status: 426 });
      }

      // One Durable Object per "tab session" or "room".
      // v1: keep it simple: one global room. Later you can shard by user/org.
      const id = env.LIVE_ENGINE.idFromName('global');
      const stub = env.LIVE_ENGINE.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

