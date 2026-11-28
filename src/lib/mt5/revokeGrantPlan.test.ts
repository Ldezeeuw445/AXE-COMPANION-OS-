/**
 * TOS-SEC-2: the revoke statement itself, held to what the code actually needs.
 *
 * `revokeBlockers.test.ts` answers "is the revoke safe yet" and the answer is
 * now yes for every privilege except the handful a trader genuinely uses. What
 * it does not produce is the statement to run, and a hand-written REVOKE in a
 * runbook is exactly the kind of thing that is correct the day it is written
 * and wrong three commits later — in the direction that logs traders out of
 * their own accounts, because nobody notices a grant is missing until someone
 * presses the button.
 *
 * So the SQL lives in `docs/TOS-SEC-2-REVOKE.md`, this test parses it, and the
 * two are held to each other in both directions:
 *
 *   - Nothing may be revoked that the code still sends on the trader's own
 *     client. That is the failure that breaks the app, and it is the reason
 *     this test exists rather than a review.
 *   - Nothing may stay granted that nothing uses. That is the failure that
 *     makes the revoke pointless: a grant left behind is the one an attacker
 *     gets, and "we revoked it" would be believed.
 *
 * The scan below asks a different question from `revokeBlockers.test.ts` —
 * *which privilege* per table, not how many writes per file — so it is its own
 * scan rather than a shared helper. Two independent readings of the source
 * agreeing is worth more here than one shared parser being reused.
 *
 * `select` is deliberately not part of this: every one of these tables is read
 * on the trader's client all over the app, and RLS is what scopes those reads.
 *
 * Whole suite: npm test
 * This file only: npx tsx --test src/lib/mt5/revokeGrantPlan.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";

const RUNBOOK = "docs/TOS-SEC-2-REVOKE.md";

/** The tables TOS-SEC-2 covers: owner-scoped, and written by the MT5 sync. */
const TABLES = ["broker_trades", "mt5_positions", "user_broker_accounts"] as const;
type Table = (typeof TABLES)[number];

/** The write privileges in play. `select` is out of scope, see the header. */
const WRITE_PRIVILEGES = ["insert", "update", "delete"] as const;
type Privilege = (typeof WRITE_PRIVILEGES)[number];

/**
 * Same exclusion `revokeBlockers.test.ts` makes, for the same reason: every
 * caller of this file hands it a service-role client, which a source scan
 * cannot see because the parameter is named `supabase` either way. That file
 * asserts the callers really do build one; this one takes it from there.
 */
const SERVICE_ROLE_ONLY = new Set(["services/paperStopWatcher.ts"]);

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      found.push(path);
    }
  }
  return found;
}

/** Statement from `.from("<table>")` to the terminating semicolon. */
function tableStatements(code: string, table: string): { at: number; text: string }[] {
  const statements: { at: number; text: string }[] = [];
  const marker = `.from("${table}")`;
  let at = code.indexOf(marker);
  while (at !== -1) {
    const end = code.indexOf(";", at);
    statements.push({ at, text: code.slice(at, end === -1 ? code.length : end) });
    at = code.indexOf(marker, at + marker.length);
  }
  return statements;
}

/**
 * Which privileges one statement needs. An upsert needs both: it inserts, and
 * on conflict it updates. Getting that pair wrong is the subtle way to break a
 * sync that looks like it only inserts.
 */
function privilegesUsed(statement: string): Privilege[] {
  const used: Privilege[] = [];
  if (/\.upsert\(/.test(statement)) used.push("insert", "update");
  if (/\.insert\(/.test(statement)) used.push("insert");
  if (/\.update\(/.test(statement)) used.push("update");
  if (/\.delete\(/.test(statement)) used.push("delete");
  return used;
}

/** Names in this file that hold an elevated client — alias and hand-off included. */
function elevatedNames(code: string): { factories: string[]; names: Set<string> } {
  const factories = new Set(["syncWriteClient"]);
  for (const match of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*syncWriteClient\s*;/g)) {
    factories.add(match[1]);
  }

  const names = new Set<string>();
  for (const factory of factories) {
    const binding = new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${factory}\\(`, "g");
    for (const match of code.matchAll(binding)) names.add(match[1]);
  }
  return { factories: [...factories], names };
}

/** The expression `.from(...)` was called on. `await db\n  .from("x")` yields `db`. */
function receiver(code: string, at: number): string {
  const before = code.slice(Math.max(0, at - 120), at);
  const match = /([A-Za-z_$][\w$.]*(?:\([^()]*\))?)\s*$/.exec(before.replace(/\s+/g, " "));
  return match ? match[1] : "";
}

export type Usage = { privilege: Privilege; file: string };

/** Every privilege the trader's own client still needs, per table, with its source. */
export function traderPrivileges(
  files: { file: string; code: string }[],
): Record<Table, Usage[]> {
  const needed = Object.fromEntries(TABLES.map((t) => [t, [] as Usage[]])) as Record<Table, Usage[]>;

  for (const { file, code } of files) {
    const { factories, names } = elevatedNames(code);
    const isElevated = (on: string) =>
      names.has(on) || factories.some((factory) => on.startsWith(`${factory}(`));

    for (const table of TABLES) {
      for (const { at, text } of tableStatements(code, table)) {
        if (isElevated(receiver(code, at))) continue;
        for (const privilege of privilegesUsed(text)) {
          if (needed[table].some((u) => u.privilege === privilege && u.file === file)) continue;
          needed[table].push({ privilege, file });
        }
      }
    }
  }
  return needed;
}

function scanRepo(): Record<Table, Usage[]> {
  const files = sourceFiles(SRC)
    .map((path) => ({ file: relative(SRC, path).split(sep).join("/"), code: readFileSync(path, "utf8") }))
    .filter(({ file }) => !SERVICE_ROLE_ONLY.has(file));
  return traderPrivileges(files);
}

/**
 * `revoke a, b on public.t from authenticated;` out of the runbook's SQL
 * blocks, as `table -> privileges`. Only `authenticated` counts: a revoke
 * aimed at `anon` says nothing about what a signed-in trader can do.
 */
export function parseRunbookRevokes(markdown: string): Record<string, Privilege[]> {
  const sql = [...markdown.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
  const revoked: Record<string, Privilege[]> = {};

  const statement = /revoke\s+([a-z,\s]+?)\s+on\s+(?:table\s+)?public\.(\w+)\s+from\s+([\w,\s]+?);/gi;
  for (const match of sql.matchAll(statement)) {
    const roles = match[3].split(",").map((r) => r.trim().toLowerCase());
    if (!roles.includes("authenticated")) continue;

    const table = match[2];
    const privileges = match[1]
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is Privilege => (WRITE_PRIVILEGES as readonly string[]).includes(p));

    revoked[table] = [...new Set([...(revoked[table] ?? []), ...privileges])].sort();
  }
  return revoked;
}

describe("TOS-SEC-2 revoke statement", () => {
  const needed = scanRepo();
  const runbook = readFileSync(resolve(process.cwd(), RUNBOOK), "utf8");
  const revoked = parseRunbookRevokes(runbook);

  it("revokes exactly the write privileges no trader-client statement uses", () => {
    // Asserted as one object rather than per table, so a failure prints the
    // whole plan: a partial answer here sends someone to the SQL editor with
    // one table fixed and two still wrong.
    const expected = Object.fromEntries(
      TABLES.map((table) => {
        const used = new Set(needed[table].map((u) => u.privilege));
        return [table, WRITE_PRIVILEGES.filter((p) => !used.has(p)).sort()];
      }),
    );
    const actual = Object.fromEntries(TABLES.map((table) => [table, revoked[table] ?? []]));

    assert.deepEqual(
      actual,
      expected,
      `${RUNBOOK} and the source disagree about what is safe to revoke.\n\n` +
        `Still used by the trader's own client:\n` +
        TABLES.map(
          (table) =>
            `  ${table}: ` +
            (needed[table].map((u) => `${u.privilege} (src/${u.file})`).join(", ") || "nothing"),
        ).join("\n") +
        `\n\nIf a write moved to syncWriteClient(supabase), add its privilege to the ` +
        `runbook's revoke. If a new trader-client write is legitimate, take the ` +
        `privilege back out of the revoke and say why in the runbook — running it ` +
        `as written would break that write in production.`,
    );
  });

  it("revokes nothing on a table it has not reasoned about", () => {
    assert.deepEqual(
      Object.keys(revoked).filter((t) => !(TABLES as readonly string[]).includes(t)),
      [],
      `${RUNBOOK} revokes a privilege on a table outside TOS-SEC-2's three. Nothing ` +
        "in this test checked whether the app still needs it.",
    );
  });

  it("never revokes select: RLS is what scopes a trader's reads", () => {
    const sql = [...runbook.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
    for (const match of sql.matchAll(/revoke\s+([a-z,\s]+?)\s+on\s[\s\S]*?;/gi)) {
      const privileges = match[1].split(",").map((p) => p.trim().toLowerCase());
      assert.ok(
        !privileges.includes("select") && !privileges.includes("all"),
        `${RUNBOOK}: "${match[0].trim()}" takes away reads. Every one of these tables ` +
          "is read on the trader's client — the account list, the ledger, open positions.",
      );
    }
  });

  it("the runbook says the statement has not been applied yet", () => {
    // The repo's two earlier grant migrations both record the date they went
    // live, because "is this on?" is the first question anyone asks. This one
    // has no such line to write yet, and must not pretend otherwise: the file
    // sits outside supabase/migrations on purpose, since a push to main there
    // applies to the live project (.github/workflows/apply-supabase-migrations.yml).
    assert.match(
      runbook,
      /not (yet )?applied/i,
      `${RUNBOOK} must state plainly that nobody has run this yet. When it is run, ` +
        "replace that line with the date and project ref, the way the migrations in " +
        "supabase/migrations do.",
    );
  });

  it("the runbook names the precondition that would turn this into an outage", () => {
    // `syncWriteClient` falls back to the caller's own client when no
    // service-role key is configured. That fallback is what keeps local and
    // preview working — and the moment these grants are gone it stops being a
    // fallback and becomes a failing write. A runbook that does not say so is
    // the one somebody runs on a host with no key set.
    assert.match(
      runbook,
      /SUPABASE_SERVICE_ROLE_KEY/,
      `${RUNBOOK} must say the service-role key has to be present on the host before ` +
        "the revoke, because syncWriteClient falls back to the trader's client without it " +
        "(src/lib/supabase/syncWriteClient.ts).",
    );
  });

  it("the privilege reader sees an upsert as both insert and update", () => {
    // Guards the scan: an upsert read as insert-only would revoke UPDATE out
    // from under a working write.
    assert.deepEqual(privilegesUsed('.from("broker_trades").upsert(row)').sort(), ["insert", "update"]);
    assert.deepEqual(privilegesUsed('.from("broker_trades").delete()'), ["delete"]);
    assert.deepEqual(privilegesUsed('.from("broker_trades").select("id")'), []);
  });

  it("the scan ignores a write that went out elevated", () => {
    const trader = [{ file: "a.ts", code: 'await supabase\n  .from("broker_trades")\n  .upsert(row);' }];
    assert.deepEqual(
      traderPrivileges(trader).broker_trades.map((u) => u.privilege).sort(),
      ["insert", "update"],
    );

    const elevated = [
      { file: "a.ts", code: 'const db = syncWriteClient(supabase);\nawait db\n  .from("broker_trades")\n  .upsert(row);' },
    ];
    assert.deepEqual(traderPrivileges(elevated).broker_trades, []);
  });

  it("the SQL reader only counts a revoke aimed at authenticated", () => {
    const anonOnly = "```sql\nrevoke insert on public.broker_trades from anon;\n```";
    assert.deepEqual(parseRunbookRevokes(anonOnly), {});

    const both = "```sql\nrevoke insert, update on public.broker_trades from anon, authenticated;\n```";
    assert.deepEqual(parseRunbookRevokes(both), { broker_trades: ["insert", "update"] });
  });
});
