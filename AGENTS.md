<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 / React 19 app ("AXE Companion"). Use Node 22 (`.nvmrc`) and npm (there is a `package-lock.json`).

- Dev server: `npm run dev` serves on `http://localhost:5000` (bound to `0.0.0.0`, Turbopack). `npm run start` (production) also uses port 5000. Standard scripts are in `package.json`.
- Lint/build/typecheck commands are documented in `WORKFLOW.md` (`npm run lint`, `npm run build`, `tsc --noEmit`). Lint currently passes with 0 errors but ~70 React-hooks warnings — warnings are expected, only errors should block.
- No external services are required to run the app: with no Supabase env vars the public landing (`/`), `/login`, `/welcome`, and legal pages render fine. The login form shows "Supabase is not configured" and all routes in `PROTECTED_PREFIXES` (`/chat`, `/journal`, `/accounts`, `/chart`, `/settings`, etc. — see `src/lib/supabase/middleware.ts`) redirect to `/login` until a real Supabase session exists.
- The old "demo channel" login is disabled: `src/app/api/auth/demo/route.ts` returns 403, so the README's "Private demo channel" instructions are stale. To exercise authenticated/trading features you must set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_DATA_SOURCE=supabase` in `.env.local` (template: `.env.local.example`) and sign in with a real Supabase user. Stripe / OpenAI / push / MT5 features need their own additional secrets.
