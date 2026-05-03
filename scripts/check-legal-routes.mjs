/**
 * Smoke check: legal route files exist (no server required).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const files = [
  "src/app/(public-legal)/layout.tsx",
  "src/app/(public-legal)/legal/page.tsx",
  "src/app/(public-legal)/terms/page.tsx",
  "src/app/(public-legal)/privacy/page.tsx",
  "src/app/(public-legal)/risk-disclaimer/page.tsx",
  "src/app/(public-legal)/ai-disclaimer/page.tsx",
  "src/app/(public-legal)/cookies/page.tsx",
  "src/app/(public-legal)/refunds/page.tsx",
  "src/app/(public-legal)/subprocessors/page.tsx",
  "src/app/(public-legal)/contact/page.tsx",
  "src/lib/legal/constants.ts",
  "next.config.ts",
];

let failed = false;
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error("Missing:", rel);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log("Legal route files OK:", files.length);
