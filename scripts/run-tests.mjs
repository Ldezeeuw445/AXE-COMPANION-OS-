/**
 * AXE Companion test runner — runs every scripts/test-*.mjs in one command.
 * Run: npm test            (all tests)
 *      npm test -- uw gate (only tests whose name matches a filter)
 *
 * The suite is deliberately zero-dep: each test is a standalone Node script
 * using node:assert and exits non-zero on failure. This runner just discovers,
 * executes and reports them, so CI and `npm test` agree on what "green" means.
 *
 * Node >= 22.18 strips TypeScript types by default; on older 22.x we pass
 * --experimental-strip-types so tests that import src/**.ts hit the real
 * source instead of their inline fallback mirrors.
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, "..");

/** Node 22.18+ strips types natively; older 22.x needs the flag. */
function typeStrippingFlags() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major > 22) return [];
  if (major === 22 && minor >= 18) return [];
  return ["--experimental-strip-types", "--no-warnings"];
}

async function discoverTests() {
  const entries = await readdir(scriptsDir);
  return entries
    .filter((f) => f.startsWith("test-") && f.endsWith(".mjs"))
    .sort();
}

function runTest(file, flags) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [...flags, join(scriptsDir, file)], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) => {
      resolve({ file, ok: false, ms: Date.now() - started, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({
        file,
        ok: code === 0,
        ms: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

const filters = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const all = await discoverTests();
const tests = filters.length
  ? all.filter((f) => filters.some((needle) => f.includes(needle)))
  : all;

if (tests.length === 0) {
  console.error(
    filters.length
      ? `No tests matched: ${filters.join(", ")}\nAvailable:\n  ${all.join("\n  ")}`
      : "No scripts/test-*.mjs files found.",
  );
  process.exit(1);
}

const flags = typeStrippingFlags();
console.log(
  `Running ${tests.length} test${tests.length === 1 ? "" : "s"} on Node ${process.versions.node}` +
    `${flags.length ? ` (${flags[0]})` : ""}\n`,
);

// Sequential: these are fast, pure and offline — ordered output beats parallelism.
const results = [];
for (const file of tests) {
  const result = await runTest(file, flags);
  results.push(result);
  const name = file.replace(/^test-|\.mjs$/g, "");
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${name} (${result.ms}ms)`);
  if (!result.ok) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trimEnd();
    if (detail) console.log(detail.replace(/^/gm, "      "));
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed` +
    (failed.length ? ` — failed: ${failed.map((r) => r.file).join(", ")}` : ""),
);

process.exit(failed.length ? 1 : 0);
