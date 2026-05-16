# AXE Companion Realtime Fallbacks

Current launch path, without replacing existing infrastructure:

1. **Cloudflare WebSocket**
   - `src/components/chart/useLiveChart.ts` requests `/api/chart/session`.
   - The session points the browser to `cloudflare/chart-edge`.
   - UI status: `connected` with `ws` transport.

2. **SSE fallback**
   - If the WebSocket session or socket open fails, the hook falls back to `/api/chart/live`.
   - UI status: `delayed_polling` with `sse` transport.

3. **Poll-mode MetaAPI fetch**
   - Cloudflare `chart-edge` and the Next SSE route keep their existing poll-mode MetaAPI behavior.
   - The UI treats this as a live fallback, not a frozen loading state.

4. **Cached/stale display**
   - The chart preserves the last stable candles, price, and position overlays during reconnect.
   - After 30 seconds without a live update, status becomes `stale`.
   - After 90 seconds without a live update, status becomes `offline`.

5. **User-visible recovery**
   - Reconnect attempts use one scheduled retry at a time.
   - Backoff starts at 1.5 seconds and caps at 15 seconds.
   - Existing candles remain visible while AXE reconnects.

Operational rule: do not add frontend provider keys or replace the MetaAPI/Cloudflare/SSE contracts. Stabilize adapters around these paths.
