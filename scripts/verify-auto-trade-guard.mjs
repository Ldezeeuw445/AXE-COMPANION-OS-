/**
 * Verification for src/lib/trading/autoTradeGuard.ts
 *
 * The case this exists for: AXE warns a funded trader not to trade through red
 * news, and then — through alert auto-trade — places a market order into that
 * same event. Warning someone and then doing it for them is worse than either
 * alone.
 *
 * Run: node scripts/verify-auto-trade-guard.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildAccountProfile } from "../src/lib/risk/accountProfile.ts";
import { evaluateAutoTrade, MAX_AUTO_TRADES_PER_DAY } from "../src/lib/trading/autoTradeGuard.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const funded = buildAccountProfile({ label: "FTMO Funded 100K", mt5Server: "FTMO-Server" });
const live = buildAccountProfile({ label: "MT5 LIVE", mt5Server: "ICMarkets-Live" });
const TUESDAY = new Date("2026-10-13T10:00:00Z");
const FRIDAY_EVENING = new Date("2026-10-09T19:00:00Z");

const base = {
  profile: live,
  volumeLots: 0.1,
  openPositions: 0,
  autoTradesToday: 0,
  dayResultPct: 0,
  minutesToHighImpact: null,
  now: TUESDAY,
};

console.log("autoTradeGuard");

check("a normal trade on a live account goes through", () => {
  assert.deepEqual(evaluateAutoTrade(base), { allowed: true });
});

check("a funded account is NOT traded through red news", () => {
  const d = evaluateAutoTrade({ ...base, profile: funded, minutesToHighImpact: 12 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "news_restricted");
  assert.match(d.detail, /in 12 min/);
  assert.match(d.detail, /its own rules forbid/);
});

check("the block also covers the minutes just after the event", () => {
  const d = evaluateAutoTrade({ ...base, profile: funded, minutesToHighImpact: -8 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "news_restricted");
  assert.match(d.detail, /8 min ago/);
});

check("news far away does not block", () => {
  assert.equal(
    evaluateAutoTrade({ ...base, profile: funded, minutesToHighImpact: 120 }).allowed,
    true,
  );
});

check("a live account that permits news trading is not blocked by news", () => {
  assert.equal(evaluateAutoTrade({ ...base, minutesToHighImpact: 5 }).allowed, true);
});

check("an explicit permission beats the funded default", () => {
  const permitted = buildAccountProfile({
    label: "FTMO Funded 100K",
    mt5Server: "FTMO-Server",
    metadata: { tradingRules: { newsTradingAllowed: true } },
  });
  assert.equal(evaluateAutoTrade({ ...base, profile: permitted, minutesToHighImpact: 5 }).allowed, true);
});

check("a size above the stated limit is refused, not silently shrunk", () => {
  const capped = buildAccountProfile({
    label: "MT5 LIVE",
    mt5Server: "ICMarkets-Live",
    metadata: { tradingRules: { maxLot: 0.5 } },
  });
  const d = evaluateAutoTrade({ ...base, profile: capped, volumeLots: 1.2 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "lot_above_limit");
  assert.match(d.detail, /1\.2 lots is above your 0\.5-lot limit/);
  assert.match(d.detail, /will not quietly place something smaller/);
});

check("a size at the limit is allowed", () => {
  const capped = buildAccountProfile({
    label: "MT5 LIVE",
    mt5Server: "ICMarkets-Live",
    metadata: { tradingRules: { maxLot: 0.5 } },
  });
  assert.equal(evaluateAutoTrade({ ...base, profile: capped, volumeLots: 0.5 }).allowed, true);
});

check("the daily loss cap stops automation for the day", () => {
  // Asserted against the profile's own cap rather than a hardcoded 5%: an
  // FTMO account without a named model now resolves to the strictest of
  // FTMO's three models (3%), and a test that pins the number would fail
  // every time a firm's published rules are read more precisely. What has to
  // hold is that the guard enforces whatever cap the profile carries, and
  // says which cap that was.
  const cap = funded.maxDailyLossPct;
  assert.ok(cap !== null, "a funded profile must carry a daily cap");
  const breach = -(cap + 0.2);
  const d = evaluateAutoTrade({ ...base, profile: funded, dayResultPct: breach });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "daily_loss_reached");
  assert.match(d.detail, new RegExp(`${Math.abs(breach).toFixed(2)}% down today`));
  assert.match(d.detail, new RegExp(`limit is ${cap}%`));
});

check("a loss below the cap still trades", () => {
  const cap = funded.maxDailyLossPct;
  assert.equal(
    evaluateAutoTrade({ ...base, profile: funded, dayResultPct: -(cap / 2) }).allowed,
    true,
  );
});

check("the 0.5% buffer blocks before the hard daily loss limit", () => {
  // Cap 3% → effective 2.5%. At -2.7% the hard check would still allow; buffer must refuse.
  const cap = funded.maxDailyLossPct;
  assert.ok(cap !== null && cap > 0.5, "funded daily cap must leave room for the buffer");
  const insideHardOutsideBuffer = -(cap - 0.3); // e.g. -2.7 on a 3% cap
  assert.ok(
    insideHardOutsideBuffer > -cap,
    "fixture must still be under the published hard limit",
  );
  const d = evaluateAutoTrade({
    ...base,
    profile: funded,
    dayResultPct: insideHardOutsideBuffer,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "daily_loss_reached");
  assert.match(d.detail, /buffer/i);
});

check("a loss well under the buffered limit still trades", () => {
  const cap = funded.maxDailyLossPct;
  assert.ok(cap !== null);
  // e.g. cap 3 → effective 2.5; -1.0 is clearly under
  assert.equal(
    evaluateAutoTrade({ ...base, profile: funded, dayResultPct: -1.0 }).allowed,
    true,
  );
});

check("an unknown day result fails closed when a daily limit is set", () => {
  const d = evaluateAutoTrade({ ...base, profile: funded, dayResultPct: null });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "daily_loss_unknown");
  // A live account with no daily cap still may trade when the day result is unknown.
  assert.equal(evaluateAutoTrade({ ...base, dayResultPct: null }).allowed, true);
});

check("the daily trade cap is a brake, not a cliff", () => {
  assert.equal(
    evaluateAutoTrade({ ...base, autoTradesToday: MAX_AUTO_TRADES_PER_DAY - 1 }).allowed,
    true,
  );
  const d = evaluateAutoTrade({ ...base, autoTradesToday: MAX_AUTO_TRADES_PER_DAY });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "daily_trade_cap");
  assert.match(d.detail, /yours to place by hand/);
});

check("weekend rules block on Friday evening, not on Tuesday", () => {
  const d = evaluateAutoTrade({ ...base, profile: funded, now: FRIDAY_EVENING });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "weekend_restricted");
  assert.equal(evaluateAutoTrade({ ...base, profile: funded, now: TUESDAY }).allowed, true);
});

check("account rules are checked before the convenience brakes", () => {
  // Both the news rule and the trade cap apply. The news rule must win, because
  // that is the one that ends an account.
  const d = evaluateAutoTrade({
    ...base,
    profile: funded,
    minutesToHighImpact: 5,
    autoTradesToday: 99,
  });
  assert.equal(d.reason, "news_restricted");
});

console.log("wiring");
const service = readFileSync("src/services/alertAutoTradeService.ts", "utf8");
const guardService = readFileSync("src/services/tradeGuardService.ts", "utf8");

check("the guard runs before the order is placed", () => {
  // evaluateAutoTrade is called from the shared guard service now, which both
  // the alert path and the draft path go through.
  assert.ok(/evaluateAutoTrade\(/.test(guardService), "the guard is not wired in");
  assert.ok(
    /from "@\/services\/tradeGuardService"/.test(service),
    "the alert path must reach the guard through the shared service",
  );

  // Compare CALL order inside maybeAutoTradeOnAlert, not where the helper
  // happens to be defined. An earlier version of this check compared
  // definition positions and failed on correct code — the test was wrong,
  // not the wiring.
  const entry = service.indexOf("export async function maybeAutoTradeOnAlert");
  const body = service.slice(entry);
  const guard = body.indexOf("await decideAutoTradeAllowed(");
  const place = body.indexOf("await placeMt5QuickOrder(");
  assert.ok(guard > 0, "the guard is never called from the alert path");
  assert.ok(place > 0, "the order call moved — rewrite this guard");
  assert.ok(guard < place, "a guard after the order has already been placed is decoration");
});

check("an account whose rules cannot be read is a hard stop", () => {
  // The lookup lives in the shared guard service now, so both doors inherit it.
  assert.ok(
    /could not read this account's trading rules/.test(guardService),
    "no account row must mean no order, not a default-allow",
  );
  assert.ok(
    /reason: "no_account"/.test(guardService),
    "the refusal needs a stable reason so the feed does not repeat it",
  );
});

check("a blocked trade tells the trader why", () => {
  assert.ok(
    /recordProactiveFeedEvent[\s\S]{0,400}guardDecision\.detail/.test(service),
    "a silent block is the same failure as a silent error",
  );
});

// ── the second door: a draft the trader taps ─────────────────────────────
const execService = readFileSync("src/services/executionRequestExecutionService.ts", "utf8");

check("placing a draft goes through the same guard", () => {
  // This path had no guard at all. AXE would refuse to trade a funded account
  // through red news when an alert asked, and place the identical order when
  // the trader tapped a draft it had itself proposed.
  const guard = execService.indexOf("await decideAutoTradeAllowed(");
  const place = execService.indexOf("await placeMt5QuickOrder(");
  assert.ok(guard > 0, "the draft path does not ask the guard");
  assert.ok(place > 0, "the order call moved — rewrite this check");
  assert.ok(guard < place, "a guard after the order has already been placed is decoration");
});

check("a blocked draft is written to the feed, not swallowed", () => {
  assert.ok(
    /recordProactiveFeedEvent[\s\S]{0,400}guard\.detail/.test(execService),
    "the trader must be told which rule stopped their draft",
  );
  assert.ok(
    /return \{ ok: false, message: guard\.detail, code: guard\.reason \}/.test(execService),
    "the caller needs the reason, not a generic failure",
  );
});

check("the guard lives in one place, called by both doors", () => {
  for (const [file, src] of [
    ["alertAutoTradeService", service],
    ["executionRequestExecutionService", execService],
  ]) {
    assert.ok(
      /from "@\/services\/tradeGuardService"/.test(src),
      `${file} must import the shared guard, not keep a private copy`,
    );
  }
  assert.ok(
    !/async function decideAutoTradeAllowed/.test(service),
    "a second copy in the alert service is how the two doors drifted apart",
  );
});

check("a human tapping drops the daily cap and nothing else", () => {
  // The cap is a brake on automation running unattended. Every account rule
  // above it still applies: those are the ones that cost you the account.
  // The inferred funded profile carries no lot cap (maxLot is null), so the
  // lot case below needs an account that actually states one.
  const cappedFunded = buildAccountProfile({
    label: "FTMO Funded 100K",
    mt5Server: "FTMO-Server",
    metadata: { tradingRules: { maxLot: 0.5 } },
  });
  const atCap = {
    profile: cappedFunded,
    volumeLots: 0.1,
    openPositions: 0,
    autoTradesToday: MAX_AUTO_TRADES_PER_DAY,
    dayResultPct: 0,
    minutesToHighImpact: null,
    now: new Date("2026-10-14T10:00:00Z"),
  };
  assert.equal(evaluateAutoTrade(atCap).allowed, false, "unattended at the cap must stop");
  assert.equal(evaluateAutoTrade({ ...atCap, attended: true }).allowed, true, "a human may place past the cap");

  for (const [field, value, reason] of [
    ["minutesToHighImpact", 5, "news_restricted"],
    ["volumeLots", 99, "lot_above_limit"],
    ["dayResultPct", -99, "daily_loss_reached"],
  ]) {
    const d = evaluateAutoTrade({ ...atCap, attended: true, [field]: value });
    assert.equal(d.allowed, false, `attended must still be blocked by ${reason}`);
    assert.equal(d.reason, reason);
  }

  assert.ok(
    // The call gained a price context argument for the risk cap, so match the
    // part that matters: the `true` that says a human is looking at it.
    /decideAutoTradeAllowed\(supabase, userId, displaySymbol, volumeLots, true[,)]/.test(execService),
    "the draft path is attended — a human is looking at it",
  );
});


console.log("order-route wiring");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const placeCallers = walk("src").filter((p) => {
  if (p.endsWith("metaApiClient.ts")) return false;
  const src = readFileSync(p, "utf8");
  return /clientPlaceOrder/.test(src) && /from ["']@\/lib\/mt5\/metaApiClient["']/.test(src);
});

check("every clientPlaceOrder caller asks the shared guard first", () => {
  assert.ok(placeCallers.length >= 1, "expected at least one caller");
  for (const file of placeCallers) {
    const src = readFileSync(file, "utf8");
    const guard = src.search(/await\s+decideAutoTradeAllowed\s*\(/);
    const place = src.search(/await\s+clientPlaceOrder\s*\(/);
    assert.ok(guard >= 0, `${file} imports clientPlaceOrder but never calls decideAutoTradeAllowed`);
    assert.ok(place >= 0, `${file} no longer awaits clientPlaceOrder — rewrite this check`);
    assert.ok(guard < place, `${file}: guard must run before clientPlaceOrder`);
  }
});

check("the HTTP order route guards the request's brokerAccountId", () => {
  const route = readFileSync("src/app/api/mt5/order/route.ts", "utf8");
  assert.ok(/decideAutoTradeAllowed\(/.test(route));
  const guardCall = route.slice(route.indexOf("decideAutoTradeAllowed("), route.indexOf("clientPlaceOrder("));
  assert.ok(/brokerAccountId/.test(guardCall), "order route must pass brokerAccountId into the guard");
});

check("closing a position is not gated by live_trading_enabled", () => {
  const close = readFileSync("src/app/api/mt5/close-position/route.ts", "utf8");
  assert.ok(!/live_trading_enabled/.test(close), "kill switch must not block closes");
});

console.log(`\n${passed} checks passed`);
