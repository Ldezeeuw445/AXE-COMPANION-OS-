<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Overview

AXE Companion is a Next.js 16 mobile-first trading companion app. See `README.md` for full details.

### Running the app

- **Dev server:** `npm run dev` (port 5000, binds `0.0.0.0`)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (ESLint; expect ~47 warnings, 0 errors)
- Node.js 22 required (`.nvmrc`); the VM comes with it pre-installed via nvm.

### Auth and demo mode

- Protected routes (`/chat`, `/alerts`, `/vault`, `/actions`, `/settings`, etc.) require Supabase auth.
- Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, the login page shows a configuration notice instead of a sign-in form.
- Public/marketing pages (`/`, `/login`, `/terms`, `/privacy`, `/marketing/*`, etc.) work without any env vars.
- The demo auth endpoint (`/api/auth/demo`) is currently locked (returns 403).

### Environment variables

- Copy `.env.local.example` to `.env.local` for local config. Supabase URL + anon key are required for authenticated features.
- Optional API keys: `OPENAI_API_KEY` (AI chat), `METAAPI_TOKEN` (MT5 trading), `FRED_API_KEY`, `POLYGON_API_KEY`, `PERIGON_API_KEY`, `FINNHUB_API_KEY`, `EODHD_API_KEY`, `UNUSUAL_WHALES_TOKEN` (market intel), `ELEVENLABS_API_KEY` (TTS).

### Gotchas

- The lockfile is `package-lock.json` — use **npm**, not pnpm/yarn.
- Next.js 16.2.1 with Turbopack — check `node_modules/next/dist/docs/` for current API docs before writing code (per the rule at top of this file).
