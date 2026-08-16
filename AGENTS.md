<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Project overview

AXE Companion (`tradingos-companion`) — a mobile-first AI trading companion built with Next.js 16, React 19, Supabase, and OpenAI. Three components live in this repo: the Next.js web app (root), a Cloudflare chart-edge worker (`cloudflare/chart-edge/`), and a MetaApi Node streamer (`node/metaapi-streamer/`). Only the Next.js app is required for development.

### Running the app

- `npm run dev` starts the dev server on **port 5000** (not the default 3000).
- Without `.env.local` or Supabase credentials, the app runs in **demo/mock mode** — navigate directly to `/chat` to bypass the login page and see mock trading data.
- Sending messages in demo mode shows "Could not save message" because there is no Supabase backend — this is expected.

### Key commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 5000) |
| Lint | `npm run lint` (0 errors expected; warnings are known) |
| Build | `npm run build` |
| Production | `npm run start` (port 5000) |

### Gotchas

- The `.nvmrc` specifies Node 22. Ensure Node 22.x is active before running.
- The lockfile is `package-lock.json` — use **npm**, not pnpm/yarn.
- `NEXT_PUBLIC_DATA_SOURCE` must be exactly `"supabase"` (not `"true"`) to switch from mock to live data.
- The Cloudflare worker and MetaApi streamer are optional for local dev — the app gracefully degrades without them.
