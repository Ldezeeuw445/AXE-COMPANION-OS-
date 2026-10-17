/**
 * Structural guards for PHASE C4 quick-journal.
 *
 * Run: tsx scripts/verify-quick-journal.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { netPnl, sumLedger } from "../src/lib/journal/tradePnl.ts";
import { journalAttachmentObjectPath } from "../src/lib/journal/attachmentPath.ts";
import { buildQuickJournalDraft } from "../src/lib/journal/quickJournalDraft.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const migration = readFileSync("supabase/migrations/20261017200000_journal_attachments.sql", "utf8");
const history = readFileSync("src/components/history/HistoryScreen.tsx", "utf8");
const host = readFileSync("src/components/journal/QuickJournalHost.tsx", "utf8");
const sheet = readFileSync("src/components/journal/QuickJournalSheet.tsx", "utf8");
const chart = readFileSync("src/components/chart/ChartScreen.tsx", "utf8");
const shell = readFileSync("src/components/shell/MobileShell.tsx", "utf8");

console.log("quick journal");

check("net P&L is pnl + signed fees, not abs(fees)", () => {
  assert.equal(netPnl(100, -8), 92);
  assert.equal(sumLedger([{ pnl: 10, fees: 2 }]).netPnl, 12);
});

check("attachment object keys start with the user id", () => {
  const path = journalAttachmentObjectPath({
    userId: "aaaa",
    tradeId: "bbbb",
    attachmentId: "cccc",
    mime: "image/png",
  });
  assert.ok(path.startsWith("aaaa/"));
});

check("migration is private: RLS, no anon grant, owner path prefix", () => {
  assert.ok(/enable row level security/.test(migration));
  assert.ok(/revoke all on table public.journal_attachments from anon/.test(migration));
  assert.ok(/to authenticated/.test(migration));
  assert.ok(!/to anon/.test(migration.replace(/revoke all on table public.journal_attachments from anon/, "")));
  assert.ok(/split_part\(storage_path, '\/', 1\) = auth.uid\(\)::text/.test(migration));
  assert.ok(/public = excluded.public/.test(migration) || /public,\s+false/.test(migration));
  assert.ok(/insert into storage.buckets/.test(migration));
});

check("history opens the sheet from a closed row in one tap", () => {
  assert.ok(/openQuickJournal/.test(history));
  assert.ok(/data-testid="history-trade-row"/.test(history));
  assert.ok(!/totalProfit - Math\.abs\(totalFees\)/.test(history));
});

check("chart journals the last close instead of navigating to /journal", () => {
  assert.ok(/Journal this setup/.test(chart));
  assert.ok(/openQuickJournal/.test(chart));
  assert.ok(/registerChartFrameCapture/.test(chart));
});

check("the mobile shell hosts the sheet so any tab can open it", () => {
  assert.ok(/QuickJournalHost/.test(shell));
  assert.ok(/data-testid="quick-journal-sheet"/.test(sheet));
  assert.ok(/MediaRecorder/.test(sheet));
  assert.ok(/flushOfflineJournalQueue/.test(host));
});

check("prefill carries account from the active session when ids match", () => {
  const draft = buildQuickJournalDraft(
    {
      id: "t",
      accountId: "a1",
      symbol: "EURUSD",
      side: "buy",
      pnl: 12,
      fees: -1,
      openPrice: 1.08,
      closePrice: 1.09,
    },
    { accountId: "a1", accountLabel: "Live", accountType: "live" },
  );
  assert.equal(draft.accountLabel, "Live");
  assert.equal(draft.netPnl, 11);
});

console.log(`\n${passed} checks passed`);
