# AXE Chart Actions

Safe structured chart-action layer for AXE Companion.

This module does not replace AXE chat, auth, API keys, Cloudflare live stream, or the existing draggable chart renderers. It routes AXE/tool intents into the existing local-first chart annotation system.

Supported now:

- `draw_fibonacci`
- `draw_trendline`
- `clear_ai_drawings`

Prepared for later:

- `mark_key_level`
- `add_indicator`

The real app already has draggable `FibAnnotationLayer` and `TrendlineAnnotationLayer`, so this module reuses them instead of shipping replacement overlay files.
