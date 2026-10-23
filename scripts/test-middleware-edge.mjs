/**
 * Middleware must stay Edge so the Cloudflare (OpenNext) build keeps working.
 * Run: npm run test:middleware-edge
 *
 * Next 16 deprecates `middleware.ts` in favour of `proxy.ts`, but proxy always
 * runs on the Node.js runtime and @opennextjs/cloudflare rejects Node
 * middleware at build time. So: one `src/middleware.ts`, no `proxy.ts`, no
 * root-level duplicate (Next ignores it once src/app exists), no runtime
 * override. If a `.next` build is present, also checks the compiled output.
 * No secrets / no network / no production data.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SRC_MIDDLEWARE = join(root, "src", "middleware.ts");

assert.ok(existsSync(SRC_MIDDLEWARE), "src/middleware.ts must exist");

for (const rel of [
  "middleware.ts",
  "middleware.js",
  "proxy.ts",
  "proxy.js",
  "src/proxy.ts",
  "src/proxy.js",
]) {
  assert.ok(
    !existsSync(join(root, rel)),
    `${rel} must not exist (proxy is Node-only; root middleware is dead code next to src/app)`,
  );
}

const source = readFileSync(SRC_MIDDLEWARE, "utf8");
assert.match(
  source,
  /export\s+async\s+function\s+middleware\s*\(/,
  "src/middleware.ts must export `middleware`",
);
assert.doesNotMatch(
  source,
  /export\s+const\s+runtime\b/,
  "src/middleware.ts must not export `runtime`",
);
assert.doesNotMatch(
  source,
  /\bruntime\s*:\s*["']nodejs["']/,
  "src/middleware.ts config must not select the nodejs runtime",
);

// Same check @opennextjs/cloudflare does (cli/build/utils/middleware.js):
// an Edge entry in middleware-manifest.json, no Node `/_middleware` function.
const manifestPath = join(root, ".next", "server", "middleware-manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.ok(
    manifest.middleware?.["/"],
    "built middleware must be Edge (middleware-manifest.json has no '/' entry)",
  );
  const fnPath = join(root, ".next", "server", "functions-config-manifest.json");
  if (existsSync(fnPath)) {
    const fns = JSON.parse(readFileSync(fnPath, "utf8"));
    assert.ok(
      !fns.functions?.["/_middleware"],
      "built middleware must not be a Node function",
    );
  }
  console.log("ok middleware-edge (source + built manifest)");
} else {
  console.log("ok middleware-edge (source only; run `npm run build` to also check the manifest)");
}
