#!/usr/bin/env node
/**
 * Local checks for /api/chart/session auth + live SSE auth.
 * Does not require a signed-in user.
 *
 *   CHART_VERIFY_BASE=http://127.0.0.1:5000 node scripts/verify-chart-session.mjs
 */
const BASE = (process.env.CHART_VERIFY_BASE ?? "http://127.0.0.1:5000").replace(/\/$/, "");

async function postSession() {
  const res = await fetch(`${BASE}/api/chart/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountId: "00000000-0000-0000-0000-000000000000",
      displaySymbol: "XAUUSD",
      brokerSymbol: "XAUUSDm",
      timeframe: "h1",
    }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function getLive() {
  const qs = new URLSearchParams({
    account: "00000000-0000-0000-0000-000000000000",
    symbol: "XAUUSD",
    broker: "XAUUSDm",
    tf: "h1",
  });
  const res = await fetch(`${BASE}/api/chart/live?${qs}`);
  const text = await res.text();
  return { status: res.status, text };
}

const session = await postSession();
const live = await getLive();
console.log("POST /api/chart/session", session.status, session.text.slice(0, 240));
console.log("GET  /api/chart/live   ", live.status, live.text.slice(0, 240));

const sessionOk = session.status === 401 || session.status === 503;
const liveOk = live.status === 401 || live.status === 503;
if (!sessionOk) {
  console.error("session route must require auth (401) or report supabase_not_configured (503)");
  process.exit(1);
}
if (!liveOk) {
  console.error("live SSE route must require auth (401) or report supabase_not_configured (503)");
  process.exit(1);
}
console.log("ok: chart session and SSE fallback still require auth");
