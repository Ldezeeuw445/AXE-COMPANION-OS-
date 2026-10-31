/**
 * Lets plain `node` import this codebase's TypeScript the way Next's bundler
 * sees it, so the tests and the verify scripts need no separate runner.
 *
 * Node strips the type annotations itself; what it does not do is resolve the
 * three things the source leans on the bundler for:
 *
 *   1. `import "server-only"` — a marker package Next aliases away and which is
 *      not in node_modules, so anything reaching a server module (push
 *      `dispatch.ts`, `deliver.ts`, the mt5 sync) would fail to load.
 *   2. The `@/*` -> `./src/*` path mapping from tsconfig.json.
 *   3. Extensionless relative imports, which `moduleResolution: "bundler"`
 *      allows in source but Node's resolver rejects.
 *
 * Used via `--import` by `npm test` and by scripts/verify-all.mjs. Resolution
 * only ever *adds* candidates: anything not recognised here falls through to
 * Node untouched, so a genuinely broken import still fails as a broken import.
 */
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

/**
 * Tried in order, so an exact hit on a real file wins before any extension is
 * guessed. Mirrors what tsconfig's "bundler" resolution accepts in source.
 */
const SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"];

/** The first of those candidates that is an actual file on disk. */
function onDisk(base) {
  for (const suffix of SUFFIXES) {
    const candidate = new URL(base.href + suffix);
    const path = fileURLToPath(candidate);
    if (existsSync(path) && statSync(path).isFile()) return candidate.href;
  }
  return null;
}

/** Markers Next strips on the server; an empty module is what they compile to. */
const MARKERS = new Set(["server-only", "client-only"]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (MARKERS.has(specifier)) {
      return { url: "data:text/javascript,export {}", shortCircuit: true };
    }

    if (specifier.startsWith("@/")) {
      const found = onDisk(new URL(specifier.slice(2), SRC));
      if (found) return { url: found, shortCircuit: true };
    }

    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      const found = onDisk(new URL(specifier, context.parentURL));
      if (found) return { url: found, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
