// `import "server-only"` is a marker Next resolves inside its own bundler; the
// package is not in node_modules, so a test that reaches dispatch.ts or
// deliver.ts would fail to load. Resolve it to an empty module — which is what
// it compiles to on the server anyway. Used by `npm test` via `--import`.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      'export async function resolve(s, c, n) { return s === "server-only" ? { url: "data:text/javascript,export {}", shortCircuit: true } : n(s, c); }',
    ),
);
