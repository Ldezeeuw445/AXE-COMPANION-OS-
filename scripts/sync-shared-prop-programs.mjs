#!/usr/bin/env node
/**
 * Regenerate src/lib/risk/sharedPropPrograms.ts from a Trading OS checkout.
 *
 *   node scripts/sync-shared-prop-programs.mjs /path/to/trading-os-app
 *
 * Reads packages/trading-core/src/propFirm/catalog.ts through tsx and keeps
 * only verified rule values. Read-only on the Trading OS side.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tos = resolve(process.argv[2] ?? "../trading-os-app");
const dir = mkdtempSync(join(tmpdir(), "prop-sync-"));
const dump = join(dir, "dump.ts");
writeFileSync(
  dump,
  `import { PROP_FIRM_CATALOG, PROP_FIRM_CATALOG_VERSION } from ${JSON.stringify(join(tos, "packages/trading-core/src/propFirm/catalog.ts"))};
const v = (r: any) => (r && r.verification === "verified" ? r.value : null);
const out: Record<string, unknown> = {};
for (const p of PROP_FIRM_CATALOG as any[]) out[p.id] = {
  firmId: p.firmId, firmName: p.firmName, program: p.program, phaseLabel: p.phaseLabel,
  dailyPct: v(p.dailyDrawdownPercent), dailyUsd: v(p.dailyDrawdownUsd), dailyAnchor: v(p.dailyAnchor),
  dailyReset: v(p.dailyReset) ?? v(p.tradingDayWindow), maxPct: v(p.maxDrawdownPercent), maxUsd: v(p.maxDrawdownUsd),
  maxKind: v(p.maxDrawdownKind) };
console.log(JSON.stringify({ catalogVersion: PROP_FIRM_CATALOG_VERSION, programs: out }));`,
);
const json = JSON.parse(execFileSync("npx", ["tsx", dump], { encoding: "utf8" }));
const sha = execFileSync("git", ["-C", tos, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
console.log(`catalog ${json.catalogVersion} @ ${sha}: ${Object.keys(json.programs).length} programs`);
console.log("Paste into src/lib/risk/sharedPropPrograms.ts (SHARED_PROP_PROGRAMS + SHARED_PROP_CATALOG_VERSION).");
writeFileSync(join(process.cwd(), "shared-prop-programs.generated.json"), JSON.stringify(json, null, 2));
