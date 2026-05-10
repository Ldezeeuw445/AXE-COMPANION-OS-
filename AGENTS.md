<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Next.js dev server | `npm run dev` | 5000 | Main app; binds `0.0.0.0` |

See `README.md` for the full file-structure table and schema overview.

### Running the app without external credentials

The app has a built-in **demo/mock mode** that works without Supabase or OpenAI keys. Navigate directly to `http://localhost:5000/chat` after starting the dev server — the app bypasses authentication and loads seed data automatically. No `.env.local` file is needed for basic development.

### Lint / Build / Dev

Standard npm scripts — see `package.json`:
- `npm run lint` — ESLint (0 errors expected; warnings are acceptable)
- `npm run build` — production build (Turbopack)
- `npm run dev` — dev server on port 5000

### Gotchas

- The `.nvmrc` specifies Node **22**. Ensure `nvm use 22` (or equivalent) before running.
- Next.js version is **16.2.1** — consult `node_modules/next/dist/docs/` for API docs, not training data.
- The `README.md` mentions port 3000, but `package.json` scripts bind to **port 5000** (`-p 5000`). Use port 5000.
- Optional sub-projects (`cloudflare/chart-edge/`, `node/metaapi-streamer/`) each have their own `package.json` and are not needed for core app development.
