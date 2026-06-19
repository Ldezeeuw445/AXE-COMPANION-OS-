# Trading OS

Private, mobile-first AI trading companion — chat, alerts, vault, and **guarded** trade approvals.

## Quick start

```bash
cd tradingos-companion
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Private demo channel** on the login screen when Supabase env vars are not set.

For real authentication, copy `.env.local.example` to `.env.local`, add your Supabase URL and anon key, then sign in with email + password (enable Email provider in Supabase).

## Supabase database

Apply the SQL migration in the Supabase SQL editor (or CLI):

- `supabase/migrations/20260329120000_init.sql`

### Storage (Phase 2)

Create buckets, for example:

- `vault` — screenshots, files, voice objects (private)
- `chat-attachments` — message attachments (private)

Add RLS policies on `storage.objects` scoped by `auth.uid()` path prefix.

## File structure

| Path | Role |
|------|------|
| `src/app/(auth)/login` | Login + demo session |
| `src/app/(app)/*` | Main shell: chat, alerts, vault, actions, settings |
| `src/app/api/auth/demo` | Sets/clears httpOnly `companion_demo` cookie |
| `src/components/shell` | Mobile frame, bottom nav, screen headers |
| `src/components/ui` | Glass panels, badges (design system primitives) |
| `src/components/chat` | Thread, composer, pinned context, inline action cards |
| `src/components/alerts` | Filterable alert feed (client) |
| `src/components/vault` | Search + tabs for notes / media / voice |
| `src/components/actions` | Execution request cards with approve/reject UI |
| `src/services/*` | Data façade — currently **mock**; swap for Supabase calls |
| `src/lib/tradingos` | **`TradingOSClient`** contract + `MockTradingOSClient`** |
| `src/lib/supabase` | Browser/server/middleware Supabase helpers |
| `middleware.ts` | Session refresh + route guard + demo cookie |
| `src/app/globals.css` | Design tokens (premium dark, warm accent) |

## Schema overview

Core tables (all with **RLS** on `user_id` / ownership):

- **`profiles`** — extends `auth.users`
- **`conversations`**, **`messages`** — private AI threads
- **`attachments`** — files linked to messages or vault
- **`notes`** — text notes
- **`vault_items`** — screenshots, charts, files, voice metadata (+ optional `note_id`)
- **`alerts`** — terminal → companion feed (`read_at`, related refs)
- **`execution_requests`** — proposed trades; status includes `pending_approval` / `approved` / etc.
- **`setup_reviews`** — structured review cards linked optionally to an execution request
- **`assistant_memory_entries`** — assistant-visible memory (embeddings later)
- **`assistant_learning_signals`** — append-only events (approvals, rejections, corrections, preferences, risk behavior…)
- **`assistant_learning_metrics`** — rolled-up metrics keyed by `metric_key` + `period_start`
- **`assistant_cockpit_snapshots`** — alignment score, confidence trend JSON, behavior maps — for **Assistant Cockpit** UI

**Rule:** no blind automation — execution stays blocked until explicit user confirmation; broker/terminal execution is a later integration.

## Where TradingOS plugs in later

1. **Replace or wrap** `MockTradingOSClient` (`src/lib/tradingos/MockTradingOSClient.ts`) with a real client (REST/WebSocket) that:
   - pushes **`alerts`** rows or realtime payloads
   - syncs **terminal heartbeat** / workspace ID for Settings
   - receives **`submitApprovedExecution`** only after Companion marks an `execution_request` approved

2. **Services** (`src/services/*.ts`) become thin wrappers over Supabase + that client instead of `mock/seed.ts`.

3. **Realtime** — Supabase Realtime on `alerts`, `messages`, or a dedicated `terminal_events` table if you prefer DB-first fan-out.

## Assistant Cockpit (Phase 2)

- **Write path:** when the user approves/rejects setups, corrects the assistant, or changes preferences, insert into **`assistant_learning_signals`** (and optionally recompute **`assistant_learning_metrics`** via Edge Function or cron).
- **Read path:** aggregate metrics + latest **`assistant_cockpit_snapshots`** for charts (alignment, confidence trends, behavior mapping).
- Settings already shows a **preview strip** of mock metrics; point it at real queries when ready.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint

---

Display name: **TradingOS Companion**. Package folder: `tradingos-companion` (npm naming).
