# AXE Chart Actions

Safe structured chart-action layer for AXE Companion.

This module does not replace AXE chat, auth, API keys, Cloudflare live stream, or the existing draggable chart renderers. It routes AXE/tool intents into the existing local-first chart annotation system.

Supported now:

- `draw_fibonacci`
- `draw_trendline`
- `clear_ai_drawings`
- `add_indicator` (SMC + indicator layer toggles, per account+symbol prefs)
- `mark_key_level`

Queued from chat via `route_chart_action` tool → `axe_pending_chart_actions` → chart applies on open.

The real app already has draggable `FibAnnotationLayer` and `TrendlineAnnotationLayer`, so this module reuses them instead of shipping replacement overlay files.
