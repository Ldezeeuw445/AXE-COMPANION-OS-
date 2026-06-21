<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This is a single Next.js 16 / React 19 app ("AXE Companion" / `tradingos-companion`). Dependencies are managed with npm (`package-lock.json`); the startup update script runs `npm install`.

- Use Node 22 (declared in `.nvmrc` and `package.json` `engines`). The default VM Node already satisfies this.
- Dev server: `npm run dev` serves on `http://localhost:5000` (`-p 5000 -H 0.0.0.0`), not the Next.js default 3000. The README's `localhost:3000` reference is outdated.
- Verification commands (see `WORKFLOW.md`): `npm run lint` and `npm run build`. Lint currently reports ~70 warnings but 0 errors — that is the expected clean state, not a regression.
- Auth/data require Supabase. The login form and protected routes (`/chat`, `/alerts`, `/vault`, `/actions`, `/cockpit`, `/settings`, `/history`, `/journal`, `/accounts`, `/upgrade`) only work when `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_DATA_SOURCE=supabase` are set. Without them, protected routes redirect to `/login` and the login form shows a "Supabase is not configured" message.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are provided as Cursor secrets (already in the shell env). The third flag, `NEXT_PUBLIC_DATA_SOURCE=supabase`, is **not** a secret and must be set explicitly — otherwise `isMockDataSource()` stays true and services return demo seed data even though login works. To enable the full Supabase data path, create a `.env.local` (gitignored) containing the two secret vars plus `NEXT_PUBLIC_DATA_SOURCE=supabase`, then (re)start `npm run dev`.
- The configured Supabase project is the **live production** project (`pqnngpcgbdwxavbatbia`, "AXE Companion"). Be cautious with writes; clean up any test rows you create.
- Email confirmation is ON in that project, so REST/UI signup returns no session until confirmed. To make a usable test user, sign up, then set `auth.users.email_confirmed_at = now()` for that user (via the Supabase admin API or SQL), then sign in. Deleting the `auth.users` row cascades to `profiles` → `conversations`/`messages`/etc.
- AI chat replies need a server-side `OPENAI_API_KEY` (not configured here). Sending a chat message still persists the user message to Supabase (RLS) and returns success — only the assistant reply is skipped (`callAxe` returns null gracefully).
- The "Private demo channel" described in `README.md` is no longer available: `/api/auth/demo` returns HTTP 403. Do not rely on demo cookies for local auth.
- Routes that render fully without Supabase: public landing (`/`), `/login`, `/welcome`, `/marketing/*`, and the legal pages. The landing-page waitlist form is a client-only (localStorage) action, useful for no-credential smoke tests.
- A full local Supabase stack would need Docker + the Supabase CLI (neither is preinstalled here).
