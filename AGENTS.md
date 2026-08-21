<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 / React 19 app ("AXE Companion"). Use Node 22 (`.nvmrc`) and npm (there is a `package-lock.json`).

- Dev server: `npm run dev` serves on `http://localhost:5000` (bound to `0.0.0.0`, Turbopack). `npm run start` (production) also uses port 5000. Standard scripts are in `package.json`.
- Lint/build/typecheck commands are documented in `WORKFLOW.md` (`npm run lint`, `npm run build`, `tsc --noEmit`). Lint currently passes with 0 errors but ~70 React-hooks warnings — warnings are expected, only errors should block.
- No external services are required to run the app: with no Supabase env vars the public landing (`/`), `/login`, `/welcome`, and legal pages render fine. The login form shows "Supabase is not configured" and all routes in `PROTECTED_PREFIXES` (`/chat`, `/journal`, `/accounts`, `/chart`, `/settings`, etc. — see `src/lib/supabase/middleware.ts`) redirect to `/login` until a real Supabase session exists.
- The old "demo channel" login is disabled: `src/app/api/auth/demo/route.ts` returns 403, so the README's "Private demo channel" instructions are stale. To exercise authenticated/trading features you must set the Supabase env vars below and sign in with a real Supabase user.

### Full env var matrix (for the complete launch stack)

Set these via the Cursor Secrets panel (injected as env vars; they take precedence over `.env.local`). `NEXT_PUBLIC_*` values are exposed to the browser bundle. Grouped by feature; the app degrades gracefully when a group is missing.

| Feature | Vars | Notes |
|---|---|---|
| Auth + DB (required) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_DATA_SOURCE=supabase` | Without these the app stays on mock/public mode; protected routes redirect to `/login`. Service-role key is used by webhooks, `/api/internal/migrate`, and push send. |
| AXE chat / cockpit | `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` (optional TTS) | `src/services/axeService.ts`, `/api/cockpit/generate`, `/api/chat/tts`. |
| Live chart (Cloudflare `axe-chart-edge`) | `CHART_SESSION_JWT_SECRET`, `NEXT_PUBLIC_CHART_WS_URL` | Must match the deployed worker; `/api/chart/session`. |
| MT5 / MetaAPI | `METAAPI_TOKEN` (aliases `AXE_METAAPI_TOKEN`, `AXE_MT5_METAAPI_TOKEN`); optional `METAAPI_PROVISIONING_URL`, `METAAPI_CLIENT_API_URL`, `METAAPI_MARKET_DATA_URL`, `METAAPI_DEFAULT_REGION` | `src/lib/mt5/metaApiEnv.ts`. |
| Market / news / intel | `POLYGON_API_KEY` (or `POLYGON_KEY`), `FINNHUB_API_KEY`, `EODHD_API_KEY`, `PERIGON_API_KEY`, `FRED_API_KEY`, `UNUSUAL_WHALES_TOKEN` (or `UNUSUAL_WHALES_API_KEY`) | `src/lib/market/providerStatus.ts`; results cached 5 min. |
| Stripe billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | `/api/stripe/webhook`, `/upgrade`. |
| Web push | `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET` | Generate VAPID keys with `node -e "console.log(require('web-push').generateVAPIDKeys())"`. |
| Chat quota (dev) | `AXE_SKIP_CHAT_QUOTA=true`, `AXE_UNLIMITED_CHAT_USER_IDS` | Optional local-dev overrides. |

`.env.local` is gitignored and does NOT persist to fresh VMs — anything that must survive a restart belongs in the Secrets panel.
