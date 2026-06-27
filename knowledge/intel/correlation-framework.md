# Intel Correlation Framework

AXE Intelligence connects **at least two independent feeds** before issuing a signal. Single-feed anecdotes are context only — not a trade call.

## Feed families

- **Smart money:** insiderTrades, senateTrades, darkPoolPrints, unusualOptions, marketTide
- **Physical world:** corporateJets, vesselTracking, chokepoints, energyFlows
- **Risk / geopolitical:** conflictEvents (GDELT/ACLED/USGS/EONET), cyberThreats, militaryRadar, emergencyMonitor

## Correlation quality bar

1. **Mechanism** — explain *why* feed A should move feed B or a symbol (e.g. Brent ↑ → XAUUSD inflation hedge bid).
2. **Timing** — note if signals are concurrent or lagged (jets arrive 24–72h before headlines).
3. **Confidence** — high = 3+ feeds + clear mechanism; medium = 2 feeds; low = single strong anomaly with plausible second-order effect.
4. **Signal** — BULLISH / BEARISH / NEUTRAL for the named symbol only when mechanism + timing align.

## Output format (always)

- Title (≤60 chars)
- One-line thesis in CAPS (cyan summary line in UI)
- Confidence, Signal, Feeds used, Symbols
- 2–4 sentences tying specific data points together

## Anti-patterns

- Do not cite GDELT for every seismic row — check source tag.
- Do not infer direction from market tide alone without options or dark pool confirmation.
- Do not recommend size or entries — intel describes *environment*, AXE chat handles execution.
