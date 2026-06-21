# AXE Companion — standalone deploy

AXE ships from the **same repository** as Trading OS, but as a **separate production project** (recommended: own domain + own Vercel/hosting project).

## Build mode

Set the client mode at build time:

| Variable | Value | Effect |
|----------|--------|--------|
| Build with `--mode axe` | (via `npm run build:axe`) | **Required** for AXE routes: Vite injects `__TOS_APP_MODE__` at compile time (see `vite.config.ts`). Env alone is not enough. |
| `VITE_APP_MODE` | `axe` | Optional; legacy / docs. Routing does **not** rely on this at runtime anymore. |

Local env file `.env.axe` may still set `VITE_APP_MODE` for clarity; the decisive switch is `vite --mode axe` / `build:axe`.

## Commands

```bash
# Local AXE (standalone UI) — port 5175 so `npm run dev` (Trading OS) can use 5173/5174
npm run dev:axe
# Then open http://localhost:5175/  —  /auth  is http://localhost:5175/auth
```

```bash
# Production bundle for AXE domain
npm run build:axe
```

This runs `tsc -b` then `vite build --mode axe` (see `package.json`).

Trading OS terminal build (unchanged):

```bash
npm run build
```

## Routes (AXE standalone)

| Path | Page |
|------|------|
| `/` | `AxeHomeLanding` (marketing) |
| `/app` | `AxeCompanion` (signed-in experience; broker linking, etc.) — **requires login** (`AxeAppGate`) |
| `/journal` | Notes + trade journal (`JournalWorkspace`) — **requires login** |
| `/auth` | Supabase auth UI |
| `/privacy` | Placeholder privacy policy |
| `/terms` | Placeholder terms of service |
| `/disclaimer` | Placeholder risk disclaimer |
| `/settings` | Redirect naar **Next.js Companion** `/settings` (zelfde origin als `VITE_AXE_COMPANION_URL`) |

## Vercel (alleen deze repo op je Mac)

Root van **TRADING OS FINAL UI AND MAIN** bevat `vercel.json`: build = `npm run build:axe`, output = `dist`, SPA-rewrite naar `index.html`.

1. **Nieuw Vercel-project** → import deze GitHub-repo (of upload), **Root Directory** = repo-root (waar `package.json` staat).
2. Vercel leest `vercel.json` — geen framework-preset nodig.
3. **Environment Variables** (Production + Preview): zelfde keys als `.env.axe`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - optioneel `VITE_USE_ENGINE_EDGE`
   - **`VITE_AXE_COMPANION_URL`** = publieke URL van je **Next Companion** (bijv. `https://jouw-companion.vercel.app/chat` of alleen origin als je `/settings` op dezelfde host wilt) — nodig voor de **QR “Get AXE Companion”** op de landingspagina.
4. Deploy. Open `https://<jouw-project>.vercel.app/` → AXE-landing; `/app` = ingelogde Vite-shell; **mobiele chat** = die URL in `VITE_AXE_COMPANION_URL` (aparte Vercel-deploy van de Companion-map).

**Companion op Vercel:** apart project, root = map `AXE COMPANION FINAL APP` (Next). Zet daar `NEXT_PUBLIC_SUPABASE_*` + `NEXT_PUBLIC_APP_URL` naar die productie-URL. Daarna pas je in **deze** Vite-deploy `VITE_AXE_COMPANION_URL` aan naar die live Companion-URL en redeploy.

## Required environment variables (browser / client)

Set these on the **AXE** deployment (same Supabase project as backend is fine):

- `VITE_APP_MODE` = `axe`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_USE_ENGINE_EDGE` — only if AXE UI calls the engine edge proxy from the browser (match your Supabase project setup)
- **`VITE_AXE_COMPANION_URL`** — publieke Next Companion URL (QR + `/settings` bridge); zonder deze zie je alleen uitleg in de install-dialoog

Do **not** put service role keys in `VITE_*` variables.

## Post-deploy checks

1. Open `/` — landing loads, CTAs work (`Start free` → `/auth`, `View demo` → scrolls to `#demo`, waitlist → `#waitlist`).
2. Open `/app` while signed out — redirect to `/auth`; after login you should land on `/app` (or the path stored in `sessionStorage.tos_next_path`, e.g. `/journal` if that was the attempted URL).
3. Open `/journal` while signed out — same auth gate; after login you should return to `/journal` (not always `/app`).
4. Open `/privacy`, `/terms`, `/disclaimer` — no 404 from footer links.

## Mobile shell + Chat (separate Next app)

The **phone-first UI** with bottom tabs (Chat, Alerts, Vault, Actions, Cockpit, Settings) lives in a **different repo** on disk:

`~/Desktop/AXE Companion Final APP/AXE COMPANION FINAL APP` (Next.js 16).

Run it locally (default port **5000**; use `npm run dev:5001` if 5000 is busy), then open **`/chat`** — e.g. `http://localhost:5001/chat`.

That is **not** the same as `npm run dev:axe` in this repo (Vite marketing + `/app` dashboard on **5175**).

**Companion auth:** copy `.env.local.example` → `.env.local` in that Next folder with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_DATA_SOURCE=supabase` (same project as Trading OS is fine). Restart `next dev`.

**QR for the phone shell:** set optional `VITE_AXE_COMPANION_URL` in `.env.axe` to the **final** public URL of the Next Companion app (e.g. `https://companion.yourdomain.com/chat`). After you move off Replit, update this to the new host so the QR stays correct.

### Hosting the Next Companion outside Replit

1. **Deploy** the `AXE COMPANION FINAL APP` folder to Vercel, Railway, Render, etc. (Next.js 16 is supported on Vercel).

2. **Environment variables** in the host’s dashboard (same values you used locally / on Replit — **no separate “link” step**):
   - `NEXT_PUBLIC_SUPABASE_URL` — project URL from Supabase → Settings → API  
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **anon** public key (same idea as `VITE_SUPABASE_ANON_KEY` in Trading OS)  
   - `NEXT_PUBLIC_DATA_SOURCE=supabase`  
   - `NEXT_PUBLIC_APP_URL=https://www.axecompanion.com` — **required** for correct links/push/QR base URL (use your **canonical** host, usually `www`)

   With URL + anon key, **login uses the same Supabase Auth** as the Vite AXE site and Trading OS if they share one project — users sign in with the same email/password.

3. **Supabase Dashboard** → Authentication → URL configuration: add **`https://www.axecompanion.com/**`** (and apex `https://axecompanion.com/**` if you still use it) to **Redirect URLs**; set **Site URL** to `https://www.axecompanion.com`. The Companion middleware **308-redirects** `axecompanion.com` → `www.axecompanion.com` so cookies and auth stay on one host.

4. **Optional (features beyond login):** `OPENAI_API_KEY` (chat/AI), `SUPABASE_SERVICE_ROLE_KEY` (server routes like push/migrate — keep **server-only**, never `NEXT_PUBLIC_*`), VAPID keys for web push.

5. **This repo’s marketing QR:** set `VITE_AXE_COMPANION_URL` in `.env.axe` (build) to `https://www.axecompanion.com/chat` (must match the deployed Companion host).

### Public welcome / install (Next Companion)

Logged-out visitors to `/` go to **`/welcome`**: short copy, **Add to Home Screen** hints (iOS/Android), QR to `/chat`, and **Inloggen**. Logged-in users hitting `/` or `/welcome` go to **`/chat`**. PWA remains `manifest.json` + `start_url: /chat`.

### Next Companion — Phase 1 accounts (parity)

The Next.js app includes **`/accounts`**: list `user_broker_accounts`, create MT5 link token (hash-only in DB), set **`user_workspace_preferences.active_account_id`**, bottom-nav entry **Accounts**. Same Supabase project and RLS as Trading OS — no Vite/terminal code changes.

## Notes

- MT5 EA / bridge client is **out of scope** for this doc; ingest is via the `axe-mt5-ingest` Edge Function once the bridge posts trades.
- Replace placeholder legal pages with counsel-reviewed documents before a public launch.
