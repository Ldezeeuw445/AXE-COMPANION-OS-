/**
 * Runs the scripts/verify-*.mjs checks.
 *
 * This used to be 47 `tsx scripts/verify-x.mjs &&` clauses spelled out in
 * package.json. Two things were wrong with that. A new check only ran if
 * someone remembered to append it — `verify-chart-session.mjs` sat on disk
 * unreferenced for exactly that reason. And `&&` stops at the first failure,
 * which tells you one check broke but not whether the rest are fine.
 *
 * Discovering them instead means a file dropped in scripts/ is a check that
 * runs. Each one is a separate process, as before, because several of them set
 * process.env for their own cases.
 *
 * Run: npm run verify   (or: npm run verify intel-sources)
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPTS = new URL("./", import.meta.url);
const LOADER = fileURLToPath(new URL("./bundler-resolve.mjs", SCRIPTS));

/**
 * These hit a running app over HTTP rather than reading the source, so they
 * cannot pass on a cold checkout. Kept out of the default run — name one to
 * include it, once `npm run dev` is up:
 *
 *   npm run verify chart-session
 */
const NEEDS_SERVER = new Set(["verify-chart-session.mjs"]);

/** Optional argv filter, so one check can be run on its own by name. */
const only = process.argv.slice(2);

const checks = readdirSync(fileURLToPath(SCRIPTS))
  .filter((file) => file.startsWith("verify-") && file.endsWith(".mjs"))
  .filter((file) => file !== "verify-all.mjs")
  .filter((file) => only.length === 0 || only.some((name) => file.includes(name)))
  .filter((file) => only.length > 0 || !NEEDS_SERVER.has(file))
  .sort();

if (checks.length === 0) {
  console.error(only.length ? `no verify script matches ${only.join(", ")}` : "no verify scripts found");
  process.exit(1);
}

const failed = [];

for (const file of checks) {
  const { status, error } = spawnSync(
    process.execPath,
    ["--import", LOADER, fileURLToPath(new URL(file, SCRIPTS))],
    { stdio: "inherit" },
  );
  if (error) {
    console.error(`\n${file}: ${error.message}`);
    failed.push(file);
  } else if (status !== 0) {
    failed.push(file);
  }
}

console.log(`\n${checks.length - failed.length}/${checks.length} verify scripts passed`);

if (failed.length > 0) {
  console.error(`failed:\n${failed.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
