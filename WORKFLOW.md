# AXE Companion Workflow

These rules apply to agent work in this repo.

## Operating Rules

- Inspect before changing.
- Work one task at a time.
- Keep changes small and scoped.
- Prefer small commits.
- Show changed files after every task.
- Verify after every change.
- If unsure, ask or audit; do not guess.

## Architecture Rules

- Do not invent new architecture.
- Do not redesign the app unless explicitly asked.
- Do not refactor unrelated code.
- Do not change Supabase schema unless explicitly required for the task.
- Do not touch Trading OS unless explicitly asked.
- Trading OS is a separate future desktop terminal app.
- Future Trading OS integration should use shared contracts through the AXE / Supabase / Edge ecosystem, not direct coupling.

## Secrets Rules

- Never move secrets to frontend code.
- Never expose provider/API keys in browser code.
- Supabase / Edge / server secrets are the source of truth for provider/API keys.

## MT5 / MetaAPI Rules

- Never rebuild working MT5 / MetaAPI logic blindly.
- Audit existing MT5 paths before changing them.
- Preserve existing account connection, sync, live chart, and guarded order behavior unless the task explicitly requires a targeted change.
- Do not replace Cloudflare chart live or SSE fallback without a dedicated audit and explicit approval.

## Verification Rules

- Run the relevant verification after every code change.
- For app changes, prefer:
  - `npm run lint`
  - `npm run build`
  - `tsc --noEmit` when type-level confirmation is needed
- Use Node 22 for build verification because the repo declares Node `22.x`.
- Report verification commands and outcomes clearly.
- Do not claim completion without fresh verification evidence.

## Phase 1 Protection

Phase 1 runtime stability is verified. Do not revert the timeout, stale, offline, fallback, and non-stuck pending protections unless explicitly instructed.

