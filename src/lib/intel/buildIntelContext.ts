import type { IntelSnapshot } from "@/lib/intel/intelClient";

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Structured intel snapshot for LLM correlation / chat context. */
export function buildIntelContext(intel: IntelSnapshot, symbol?: string): string {
  const parts: string[] = [];

  if (symbol) parts.push(`Target symbol: ${symbol}\n`);

  if (intel.insiders.length > 0) {
    parts.push(`## INSIDER TRANSACTIONS (${intel.insiders.length} trades)`);
    for (const t of intel.insiders.slice(0, 10)) {
      parts.push(
        `- ${t.ticker}: ${t.insider} (${t.role ?? "?"}) ${t.type} $${formatCompact(t.value)} on ${t.date}`,
      );
    }
  }

  if (intel.senate.length > 0) {
    parts.push(`\n## CONGRESSIONAL TRADES (${intel.senate.length} disclosures)`);
    for (const t of intel.senate.slice(0, 10)) {
      parts.push(
        `- ${t.ticker}: ${t.politician} (${t.chamber}) ${t.direction} ${t.size} on ${t.date}`,
      );
    }
  }

  if (intel.darkPool.length > 0) {
    parts.push(`\n## DARK POOL PRINTS (${intel.darkPool.length} prints)`);
    for (const p of intel.darkPool.slice(0, 10)) {
      parts.push(
        `- ${p.symbol}: $${p.price.toFixed(2)} × ${p.size.toLocaleString()} = $${formatCompact(p.notional)}${p.side ? ` (${p.side})` : ""}`,
      );
    }
  }

  if (intel.options.length > 0) {
    parts.push(`\n## UNUSUAL OPTIONS (${intel.options.length} flows)`);
    for (const o of intel.options.slice(0, 10)) {
      parts.push(
        `- ${o.symbol}: $${o.strike} ${o.side} exp ${o.exp} premium $${formatCompact(o.premium)}${o.sweep ? " SWEEP" : ""}`,
      );
    }
  }

  if (intel.tide) {
    parts.push(`\n## MARKET TIDE`);
    parts.push(`- Net call premium: $${formatCompact(intel.tide.netCallPremium)}`);
    parts.push(`- Net put premium: $${formatCompact(intel.tide.netPutPremium)}`);
    parts.push(`- Bias: ${intel.tide.bias}`);
  }

  if (intel.jets.length > 0) {
    const airborne = intel.jets.filter((j) => !j.onGround);
    parts.push(
      `\n## CORPORATE JET TRACKING (${airborne.length} airborne / ${intel.jets.length} tracked)`,
    );
    for (const j of airborne.slice(0, 10)) {
      parts.push(
        `- ${j.company}: ${j.callsign || j.icao24} — alt ${j.altitude ? Math.round(j.altitude) + "m" : "?"}, vel ${j.velocity ? Math.round(j.velocity) + "m/s" : "?"}, from ${j.originCountry || "?"}`,
      );
    }
    if (airborne.length === 0) {
      parts.push(`- All ${intel.jets.length} tracked executive jets are currently grounded`);
    }
  }

  if (intel.vessels.length > 0) {
    parts.push(`\n## SUPPLY CHAIN & VESSEL TRACKING (${intel.vessels.length} entries)`);
    for (const v of intel.vessels.slice(0, 10)) {
      parts.push(
        `- ${v.vesselName}: ${v.vesselType} — ${v.owner} | ${v.nearChokepoint ? `near ${v.nearChokepoint}` : v.destination || "unknown"} | ${v.alertLevel}`,
      );
    }
  }

  if (intel.chokepoints.length > 0) {
    parts.push(`\n## CHOKEPOINTS (${intel.chokepoints.length})`);
    for (const c of intel.chokepoints.slice(0, 6)) {
      parts.push(
        `- ${c.name}: risk ${c.riskLevel}${c.riskFactors ? ` — ${c.riskFactors.slice(0, 120)}` : ""}`,
      );
    }
  }

  if (intel.conflicts.length > 0) {
    parts.push(`\n## GEOPOLITICAL / SEISMIC (${intel.conflicts.length} events)`);
    for (const c of intel.conflicts.slice(0, 10)) {
      parts.push(
        `- ${c.country} (${c.eventDate}): ${c.eventType} ${c.subEventType ? `[${c.subEventType}]` : ""} — ${c.notes.slice(0, 150)}${c.fatalities > 0 ? ` [${c.fatalities} fatalities]` : ""}`,
      );
    }
  }

  if (intel.energy.length > 0) {
    parts.push(`\n## ENERGY FLOWS (${intel.energy.length} data points)`);
    const seen = new Set<string>();
    for (const e of intel.energy) {
      if (seen.has(e.seriesId)) continue;
      seen.add(e.seriesId);
      parts.push(
        `- ${e.seriesName}: ${e.value != null ? e.value.toFixed(2) : "?"} ${e.unit} (${e.period})`,
      );
    }
  }

  if (intel.cyber.length > 0) {
    parts.push(`\n## CYBER THREAT INTELLIGENCE (${intel.cyber.length} signals)`);
    for (const t of intel.cyber.slice(0, 10)) {
      parts.push(
        `- ${t.ip}: ${t.classification} — ${t.name || t.category}${t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""}`,
      );
    }
  }

  if (intel.military?.length) {
    parts.push(`\n## MILITARY RADAR (${intel.military.length} tracks)`);
    for (const m of intel.military.slice(0, 8)) {
      parts.push(`- ${m.callsign || m.hex}: ${m.aircraftType ?? "unknown"} (${m.category})`);
    }
  }

  if (intel.emergency?.length) {
    parts.push(`\n## EMERGENCY SQUAWKS (${intel.emergency.length})`);
    for (const e of intel.emergency.slice(0, 6)) {
      parts.push(`- ${e.callsign}: squawk ${e.squawk} — ${e.aircraftType ?? "?"}`);
    }
  }

  return parts.join("\n");
}
