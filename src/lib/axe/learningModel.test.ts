import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeLearningState,
  learningBriefSentence,
  learningChanges,
  learningHistory,
  LEARNING_REQUIRED_POINTS,
  type LearningInput,
  type LearningTrade,
  type LearningVote,
} from "./learningModel";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const DAY = 24 * 3600 * 1000;

function trade(i: number, opts: Partial<LearningTrade> & { daysAgo?: number; hourUtc?: number } = {}): LearningTrade {
  const day = NOW - (opts.daysAgo ?? 1) * DAY;
  const d = new Date(day);
  d.setUTCHours(opts.hourUtc ?? 8, 0, 0, 0);
  const open = d.toISOString();
  return {
    id: `t${i}`,
    accountId: opts.accountId ?? "acc-1",
    symbol: opts.symbol ?? "XAUUSD",
    openTime: open,
    closeTime: new Date(d.getTime() + 3600_000).toISOString(),
    pnl: opts.pnl ?? (i % 2 ? 100 : -50),
  };
}

function votes(n: number, up: number, daysAgo = 1): LearningVote[] {
  return Array.from({ length: n }, (_, i) => ({
    messageId: `m${i}`,
    rating: i < up ? ("up" as const) : ("down" as const),
    at: new Date(NOW - daysAgo * DAY + i * 1000).toISOString(),
  }));
}

function input(partial: Partial<LearningInput>): LearningInput {
  return { trades: [], labels: [], votes: [], declaredSymbols: [], overrides: [], now: NOW, ...partial };
}

describe("computeLearningState", () => {
  it("a trader with nothing gets no score, and says how far it is", () => {
    const s = computeLearningState(input({}));
    assert.equal(s.status, "learning");
    assert.equal(s.score, null);
    assert.equal(s.dataPoints, 0);
    assert.match(s.headline, new RegExp(`0 of ${LEARNING_REQUIRED_POINTS} data points`));
    assert.ok(s.components.every((c) => c.score === null && c.confidence === "insufficient"));
    assert.ok(s.unknowns.length >= 3);
  });

  it("stays 'learning' below the required data points even with some components ready", () => {
    const trades = Array.from({ length: 8 }, (_, i) => trade(i));
    const labels = trades.map((t) => ({ tradeId: t.id, axeScore: 70 }));
    const s = computeLearningState(input({ trades, labels }));
    assert.equal(s.status, "learning");
    assert.equal(s.score, null);
    assert.equal(s.components.find((c) => c.key === "setup")?.score, 70);
    assert.match(s.headline, /8 of 20 data points/);
  });

  it("scores from weighted components once enough data exists, with no volume bonus", () => {
    const trades = Array.from({ length: 20 }, (_, i) => trade(i, { hourUtc: i < 15 ? 8 : 14 }));
    const labels = trades.map((t) => ({ tradeId: t.id, axeScore: 60 }));
    const s = computeLearningState(input({ trades, labels, votes: votes(10, 8) }));
    assert.equal(s.status, "scored");
    const by = Object.fromEntries(s.components.map((c) => [c.key, c.score]));
    assert.equal(by.setup, 60);
    assert.equal(by.feedback, 80);
    assert.equal(by.risk, 100); // all losses equal → all within 1.5×
    assert.equal(by.timing, 75); // 15 of 20 in London
    assert.equal(by.focus, 100);
    const expected = Math.round((60 * 0.35 + 80 * 0.2 + 100 * 0.2 + 75 * 0.15 + 100 * 0.1) / 1);
    assert.equal(s.score, expected);
    // Same data, same number — the old smoother made the score depend on history.
    assert.equal(computeLearningState(input({ trades, labels, votes: votes(10, 8) })).score, s.score);
  });

  it("moves when behaviour changes (the old score could not)", () => {
    const base = Array.from({ length: 20 }, (_, i) => trade(i));
    const good = base.map((t) => ({ tradeId: t.id, axeScore: 80 }));
    const bad = base.map((t) => ({ tradeId: t.id, axeScore: 40 }));
    const a = computeLearningState(input({ trades: base, labels: good, votes: votes(10, 9) }));
    const b = computeLearningState(input({ trades: base, labels: bad, votes: votes(10, 2) }));
    assert.ok((a.score as number) - (b.score as number) >= 20);
  });

  it("ignores trades outside the window and counts accounts across all of them", () => {
    const trades = [
      ...Array.from({ length: 5 }, (_, i) => trade(i, { accountId: "a" })),
      ...Array.from({ length: 5 }, (_, i) => trade(10 + i, { accountId: "b" })),
      trade(99, { daysAgo: 200 }),
    ];
    const s = computeLearningState(input({ trades }));
    assert.equal(s.counts.trades, 10);
    assert.equal(s.counts.accounts, 2);
  });

  it("flags outsized losses in risk discipline", () => {
    const trades = [
      trade(0, { pnl: -50 }),
      trade(2, { pnl: -50 }),
      trade(4, { pnl: -60 }),
      trade(6, { pnl: -400 }),
    ];
    const s = computeLearningState(input({ trades }));
    const risk = s.components.find((c) => c.key === "risk")!;
    assert.equal(risk.score, 75);
    assert.match(risk.explanation, /3 of 4 losing trades/);
  });

  it("refuses to invent a main session from a tie", () => {
    const trades = [
      ...Array.from({ length: 3 }, (_, i) => trade(i, { hourUtc: 8 })),
      ...Array.from({ length: 3 }, (_, i) => trade(10 + i, { hourUtc: 14 })),
    ];
    const s = computeLearningState(input({ trades }));
    assert.equal(s.items.find((i) => i.key === "session:main"), undefined);
    assert.ok(s.unknowns.some((u) => u.key === "session:main"));
  });

  it("uses the watchlist as declared focus, so off-list trades count against focus", () => {
    const trades = [
      ...Array.from({ length: 6 }, (_, i) => trade(i, { symbol: "XAUUSD" })),
      ...Array.from({ length: 4 }, (_, i) => trade(10 + i, { symbol: "AUDUSD" })),
    ];
    const s = computeLearningState(input({ trades, declaredSymbols: ["XAUUSD", "BTCUSD"] }));
    assert.equal(s.components.find((c) => c.key === "focus")?.score, 60);
  });

  it("honours a correction and keeps the measured value visible", () => {
    const trades = Array.from({ length: 6 }, (_, i) => trade(i, { hourUtc: 8 }));
    const s = computeLearningState(
      input({
        trades,
        overrides: [{ itemKey: "timing", action: "correct", value: "newyork", createdAt: new Date(NOW - DAY).toISOString() }],
      }),
    );
    const item = s.items.find((i) => i.key === "session:main")!;
    assert.equal(item.value, "New York");
    assert.equal(item.status, "corrected");
    assert.equal(item.learnedValue, "London");
    assert.equal(s.components.find((c) => c.key === "timing")?.score, 0);
  });

  it("a reset forgets everything before it for that family only", () => {
    const trades = Array.from({ length: 10 }, (_, i) => trade(i, { daysAgo: 5 }));
    const labels = trades.map((t) => ({ tradeId: t.id, axeScore: 70 }));
    const s = computeLearningState(
      input({
        trades,
        labels,
        overrides: [{ itemKey: "setup", action: "reset", value: null, createdAt: new Date(NOW - 2 * DAY).toISOString() }],
      }),
    );
    assert.equal(s.components.find((c) => c.key === "setup")?.score, null);
    assert.equal(s.components.find((c) => c.key === "setup")?.userAdjusted, true);
    assert.notEqual(s.components.find((c) => c.key === "focus")?.score, null);
  });

  it("hides an item the trader hid", () => {
    const trades = Array.from({ length: 6 }, (_, i) => trade(i));
    const s = computeLearningState(
      input({ trades, overrides: [{ itemKey: "instrument:XAUUSD", action: "hide", createdAt: new Date(NOW - DAY).toISOString() }] }),
    );
    assert.equal(s.items.find((i) => i.key === "instrument:XAUUSD"), undefined);
  });

  it("dedupes votes per message (latest wins)", () => {
    const v: LearningVote[] = [
      { messageId: "m1", rating: "down", at: new Date(NOW - 2 * DAY).toISOString() },
      { messageId: "m1", rating: "up", at: new Date(NOW - DAY).toISOString() },
    ];
    const s = computeLearningState(input({ votes: v }));
    assert.equal(s.counts.votes, 1);
  });
});

describe("history and changes", () => {
  it("history is a real reconstruction: empty past weeks stay null", () => {
    const trades = Array.from({ length: 20 }, (_, i) => trade(i, { daysAgo: 1 }));
    const labels = trades.map((t) => ({ tradeId: t.id, axeScore: 65 }));
    const h = learningHistory(input({ trades, labels, votes: votes(6, 5) }), 4);
    assert.equal(h.length, 4);
    assert.equal(h[0]!.score, null);
    assert.equal(h[0]!.dataPoints, 0);
    assert.notEqual(h[3]!.score, null);
  });

  it("the change log names the source events", () => {
    const old = Array.from({ length: 6 }, (_, i) => trade(i, { daysAgo: 20, hourUtc: 8 }));
    const fresh = Array.from({ length: 12 }, (_, i) => trade(100 + i, { daysAgo: 2, hourUtc: 8 }));
    const changes = learningChanges(input({ trades: [...old, ...fresh] }));
    const session = changes.find((c) => c.key === "session:main");
    assert.ok(session, JSON.stringify(changes));
    assert.match(session!.text, /12 trades this week, 12 in London/);
    assert.equal(session!.evidence.trades, 12);
    assert.deepEqual(session!.evidence.symbols, ["XAUUSD"]);
  });

  it("a hidden item is not reported as forgotten, and an unchanged item with no new events is silent", () => {
    const old = [
      ...Array.from({ length: 6 }, (_, i) => trade(i, { daysAgo: 20, hourUtc: 8 })),
      ...Array.from({ length: 3 }, (_, i) => trade(50 + i, { daysAgo: 20, symbol: "AUDUSD" })),
    ];
    const changes = learningChanges(
      input({
        trades: old,
        votes: votes(6, 4, 20),
        overrides: [{ itemKey: "instrument:AUDUSD", action: "hide", createdAt: new Date(NOW - DAY).toISOString() }],
      }),
    );
    assert.equal(changes.find((c) => c.key === "instrument:AUDUSD"), undefined, JSON.stringify(changes));
    assert.equal(changes.find((c) => c.key === "feedback:tone"), undefined);
  });

  it("no new events, no changes", () => {
    const old = Array.from({ length: 6 }, (_, i) => trade(i, { daysAgo: 20 }));
    assert.deepEqual(learningChanges(input({ trades: old })), []);
  });
});

describe("learningBriefSentence", () => {
  it("never claims 'knows your style well' and never quotes a number while learning", () => {
    const s = learningBriefSentence(computeLearningState(input({})));
    assert.doesNotMatch(s, /knows your style/i);
    assert.doesNotMatch(s, /%/);
    assert.match(s, /still learning/);
  });
  it("quotes the score with its basis once scored", () => {
    const trades = Array.from({ length: 20 }, (_, i) => trade(i));
    const labels = trades.map((t) => ({ tradeId: t.id, axeScore: 60 }));
    const s = learningBriefSentence(computeLearningState(input({ trades, labels, votes: votes(10, 8) })));
    assert.match(s, /AXE fit is \d+% from 20 closed trades and 10 rated replies/);
  });
  it("says so when data could not be read", () => {
    assert.match(learningBriefSentence(null), /could not read/);
  });
});
