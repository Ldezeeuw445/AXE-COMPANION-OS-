<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Services overview

This is a **Next.js 16** app (TradingOS Companion). The only service needed for local development is the Next.js dev server — all external dependencies (Supabase, OpenAI, MetaApi, etc.) are optional and the app falls back to demo/mock mode without them.

### Running the app

- `npm run dev` — starts the dev server on port **5000** (binds 0.0.0.0)
- `npm run build` — production build (Turbopack)
- `npm run lint` — ESLint (warnings only are expected; 0 errors)

### Demo mode

Navigate to `http://localhost:5000/chat` directly to enter demo mode without authentication. No `.env.local` file or Supabase credentials are required for demo mode.

### Node version

The repo requires Node 22.x (see `.nvmrc`). The VM already has Node 22 installed via nvm.
