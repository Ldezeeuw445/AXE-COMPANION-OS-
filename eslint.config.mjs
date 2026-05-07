import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Separate runtimes that ship with the repo but are not part of the Next.js
    // app and intentionally use Node/Worker conventions (require, console, etc.).
    "scripts/**",
    "cloudflare/**",
    "node/**",
    "public/sw.js",
  ]),
  {
    // React 19 + eslint-plugin-react-hooks ships strict new rules ("ref access
    // during render", "setState inside effect") that flag many legitimate
    // patterns we already use in chart code. Demote them to warnings so the
    // production build keeps shipping while we migrate piecemeal.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
