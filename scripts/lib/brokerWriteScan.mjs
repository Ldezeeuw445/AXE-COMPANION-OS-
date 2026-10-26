/**
 * TOS-SEC-2 — repo-wide scan for session-client writes on the broker tables.
 *
 * `20260705120000_tos_sec2_broker_tables_select_only.sql` drops every
 * INSERT/UPDATE/DELETE policy on `broker_trades` + `user_broker_accounts`, so
 * after ops applies it any mutation still running on the end-user session
 * client fails at runtime. This scanner walks `src/` and classifies every
 * `.from("<broker table>")` chain as a read or a write, so a *new* file cannot
 * reintroduce a session write — the earlier guard only checked a hand-listed
 * set of files and silently ignored everything else.
 *
 * Fail-closed: a `.from()` on these tables whose chain cannot be parsed is
 * reported as `unclassified` rather than assumed safe.
 *
 * Pure static analysis — no secrets, no network, no production data.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const BROKER_TABLES = ["broker_trades", "user_broker_accounts"];

/** supabase-js verbs that mutate rows. */
export const MUTATION_VERBS = ["insert", "update", "upsert", "delete"];

/**
 * Receiver names accepted as a service-role write client. Writes must resolve
 * through resolveMt5SyncWriteClient / tryResolveMt5SyncWriteClient, which the
 * codebase consistently binds to one of these.
 */
export const WRITE_CLIENT_NAMES = ["writeSb", "writeClient", "serviceSb", "serviceClient"];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);
const SOURCE_EXT = /\.(ts|tsx|mts|cts)$/;

/** Every `.from("<broker table>")` — the anchor for classification. */
const FROM_RE = new RegExp(
  String.raw`\.\s*from\(\s*["'\`](${BROKER_TABLES.join("|")})["'\`]\s*\)`,
  "g",
);

/** The verb directly after `.from(...)`; in supabase-js it always follows. */
const VERB_RE = /^\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/;

/** Trailing receiver expression before `.from(` — `writeGate.writeSb`, `this.supabase`. */
const RECEIVER_RE = /([A-Za-z_$][\w$]*(?:\s*\.\s*[\w$]+)*)\s*$/;

export function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") line++;
  return line;
}

/** Last segment of a dotted receiver: `writeGate.writeSb` -> `writeSb`. */
export function receiverTail(receiver) {
  const parts = receiver.replace(/\s+/g, "").split(".");
  return parts[parts.length - 1] ?? receiver;
}

/** Is this receiver an accepted service-role write client? */
export function isApprovedWriteReceiver(receiver) {
  return WRITE_CLIENT_NAMES.includes(receiverTail(receiver));
}

/**
 * Classify every broker-table chain in one file.
 * @returns {{writes: object[], reads: object[], unclassified: object[]}}
 */
export function scanSource(src, fileLabel) {
  const writes = [];
  const reads = [];
  const unclassified = [];

  for (const m of src.matchAll(FROM_RE)) {
    const table = m[1];
    const line = lineOf(src, m.index);
    const after = src.slice(m.index + m[0].length);
    const before = src.slice(0, m.index);

    const verbMatch = after.match(VERB_RE);
    const receiverMatch = before.match(RECEIVER_RE);

    if (!verbMatch || !receiverMatch) {
      unclassified.push({
        file: fileLabel,
        line,
        table,
        snippet: src.slice(m.index, m.index + 90).replace(/\s+/g, " ").trim(),
      });
      continue;
    }

    const hit = {
      file: fileLabel,
      line,
      table,
      verb: verbMatch[1],
      receiver: receiverMatch[1].replace(/\s+/g, ""),
    };

    if (MUTATION_VERBS.includes(hit.verb)) writes.push(hit);
    else reads.push(hit);
  }

  return { writes, reads, unclassified };
}

/**
 * Scan a whole tree.
 * @returns {{files: number, writes: object[], reads: object[], violations: object[], unclassified: object[]}}
 */
export function scanTree(rootDir, repoRoot = rootDir) {
  const files = listSourceFiles(rootDir);
  const writes = [];
  const reads = [];
  const unclassified = [];

  for (const file of files) {
    const label = relative(repoRoot, file).split("\\").join("/");
    const result = scanSource(readFileSync(file, "utf8"), label);
    writes.push(...result.writes);
    reads.push(...result.reads);
    unclassified.push(...result.unclassified);
  }

  const violations = writes.filter((w) => !isApprovedWriteReceiver(w.receiver));
  return { files: files.length, writes, reads, violations, unclassified };
}

export function formatHits(hits) {
  return hits
    .map((h) =>
      h.verb
        ? `  ${h.file}:${h.line} ${h.receiver}.from("${h.table}").${h.verb}()`
        : `  ${h.file}:${h.line} .from("${h.table}") — ${h.snippet}`,
    )
    .join("\n");
}
