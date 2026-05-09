<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Product overview

TradingOS Companion (AXE Companion) — a mobile-first AI trading assistant built with Next.js 16 (App Router, React 19, Turbopack). Single operator + AI assistant.

### Running the app

- `npm run dev` — starts dev server on port 5000 (binds 0.0.0.0)
- `npm run build` — production build (Turbopack)
- `npm run lint` — ESLint 9 (expect ~47 warnings, 0 errors)
- Node.js 22.x required (`.nvmrc`); nvm is pre-installed in the VM with v22 active

### Demo mode (no external services needed)

When `NEXT_PUBLIC_DATA_SOURCE` is not set to `"supabase"`, the app runs with mock/seed data. Navigate directly to `/chat`, `/alerts`, `/vault`, `/positions`, etc. — the middleware allows access without auth in demo mode.

### Gotchas

- The chat composer in demo mode returns "Could not save message" because no Supabase backend exists — this is expected. The UI still demonstrates the full flow.
- The login page at `/login` shows a branded entry screen; without Supabase env vars the "Sign in" form won't work. Access app pages directly (e.g. `/chat`) to explore in demo mode.
- Build uses Turbopack (`next build`); no webpack config exists.
- Port 5000 is the default; port 5001 is available via `npm run dev:5001`.
