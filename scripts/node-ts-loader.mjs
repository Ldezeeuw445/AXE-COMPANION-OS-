/**
 * Let plain `node --test` run this repo's TypeScript the way `tsx` does.
 *
 * Node 23+ strips TypeScript types on its own, so `tsx` is no longer needed to
 * *read* a `.ts` file. Two things still stop it dead:
 *
 *   1. `@/lib/push/dispatch` — the tsconfig path alias. Node has no tsconfig.
 *   2. `./categories`        — an extensionless import. Node will not guess
 *                              `.ts`, where a bundler will.
 *
 * And one thing stops it even under `tsx`:
 *
 *   3. `import "server-only"` — a marker package Next aliases away inside its
 *      own bundler. It is not in node_modules and never will be, so every
 *      module that declares itself server-only is unloadable by any test
 *      runner. That is why the push delivery path had no test over it: the
 *      orchestrator in `dispatch.ts` could not be imported at all, only the
 *      leaf modules underneath it. Here it resolves to an empty module, which
 *      is exactly what it compiles to on the server anyway.
 *
 * Usage:
 *   node --test --experimental-strip-types --import=./scripts/node-ts-loader.mjs <files>
 *
 * `--experimental-strip-types` is a no-op on Node 23.6+ (where stripping is on
 * by default) and required on Node 22.6–22.17, so passing it keeps `npm test`
 * working across the range `engines.node: 22.x` allows. Needs Node >= 22.15 for
 * `module.registerHooks`.
 *
 * This is a test/dev harness only — nothing in the shipped app imports it, and
 * `next build` does its own resolution.
 */
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC_DIR = resolvePath(import.meta.dirname, "..", "src");

/** Empty ES module, for packages that only exist to be erased at build time. */
const EMPTY_MODULE = "data:text/javascript,export {};";

/** Bare specifiers that have no runtime half to load. */
const ERASED_PACKAGES = new Set(["server-only", "client-only"]);

/** Tried in order, mirroring how a bundler resolves a bare path. */
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", ".json"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js"];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** First path that actually exists as a file, or null. */
function resolveToFile(basePath) {
  for (const suffix of [...CANDIDATE_SUFFIXES, ...INDEX_SUFFIXES]) {
    const candidate = basePath + suffix;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (ERASED_PACKAGES.has(specifier)) {
      return { url: EMPTY_MODULE, shortCircuit: true };
    }

    let target = null;

    if (specifier.startsWith("@/")) {
      target = resolveToFile(resolvePath(SRC_DIR, specifier.slice(2)));
    } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const parent = context.parentURL;
      if (parent?.startsWith("file:")) {
        target = resolveToFile(resolvePath(dirname(fileURLToPath(parent)), specifier));
      }
    }

    if (target) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
