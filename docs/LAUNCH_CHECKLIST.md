# AXE Companion — Launch Checklist

> **Live checklist** — update status as items are verified or fixed.  
> Production: https://www.axecompanion.com · Supabase: `pqnngpcgbdwxavbatbia`

**Legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked / manual only

---

## A. Infra & deploy

| # | Item | Status | Notes |
|---|------|--------|-------|
| A1 | `main` branch contains launch foundation (feed, onboarding, alerts, risk) | [x] | PR #11 merged |
| A2 | Production deploy from `main` on Vercel | [x] | Latest checked commit `84860d1` deployed successfully |
| A3 | Supabase migrations applied (broadcast feed, onboarding prefs) | [x] | Verified via MCP |
| A4 | `KRATER_SYNC_MODE=generate` on Vercel Production | [x] | Set explicitly |
| A5 | `CRON_SECRET` + `KRATER_API_KEY` on Vercel Production | [x] | Encrypted vars present |
| A6 | Krater dashboard Scheduled Tasks paused (Daily News + Market Recap) | [x] | Confirmed manually by Luka — credits saved, no app impact |
| A7 | Railway active streamer deploy healthy | [x] | `superb-benevolence` / `axe-metaapi-streamer` SUCCESS; old AXE-COMPANION-OS Railway projects are not used |
| A8 | Smoke script passes from repo root | [x] | `npm run smoke:launch` — 9/9 public checks re-run 2026-07-04 |

---

## B. AXE Feed (broadcast)

| # | Item | Status | Notes |
|---|------|--------|-------|
| B1 | 3 tabs: Morning Brief / Daily News / Market Recap | [x] | |
| B2 | Per-tab unread badges | [x] | |
| B3 | Krater cron generates + upserts `axe_broadcast_feed` | [x] | force sync tested |
| B4 | Feed shows items for authenticated users | [~] | Prod broadcast rows + feed code verified; needs browser auth spot-check |
| B5 | Cron window 07:00 + 20:00 Amsterdam (no double with Krater dashboard) | [x] | Krater dashboard tasks paused; AXE-owned Vercel cron remains active |

---

## C. Onboarding & first-run

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | New user redirected to `/onboarding` | [x] | `OnboardingGate` mounted in `AppChrome`; unauth users skipped |
| C2 | Wizard: watchlist, theme, squawk, risk prefs | [x] | Implemented |
| C3 | `onboarding_completed_at` persisted | [x] | Migration applied |
| C4 | After onboarding → chart with saved prefs | [x] | Chart now falls back to saved `default_chart_timeframe`; build verified |

---

## D. Chart & trading

| # | Item | Status | Notes |
|---|------|--------|-------|
| D1 | AXE Demo Account — virtual market fills (no MT5 gate) | [x] | `ensureActiveDemoWhenEmpty` + chart build verified |
| D2 | Alpaca paper — US equities chart + orders (TSLA/AAPL) | [~] | Chart → `/api/alpaca/order` flow build-verified; needs authenticated paper order spot-check |
| D3 | MT5 cloud — live chart + orders with live-trading flag | [ ] | |
| D4 | No false "Connect MT5" block when demo/alpaca active | [x] | Copy + account fallback build verified |
| D5 | Live Risk Band widget (open positions, SL/TP scenarios) | [x] | Shows Open P&L, All SL, All TP; MT5-style SL/TP/pending line polish build-verified |
| D6 | Free tier: VOL, MA, RSI only | [x] | Pro gate |
| D7 | Pro tier: full indicators + SMC overlays | [x] | Pro gate render-hardened; Free cannot show Pro flags from stale localStorage |

---

## E. Quotes & watchlist

| # | Item | Status | Notes |
|---|------|--------|-------|
| E1 | Demo — synthetic ticks for watchlist | [x] | |
| E2 | Alpaca — live snapshots, unsupported pairs hidden | [x] | |
| E3 | MT5 — quote stream only for broker-supported symbols | [x] | |
| E4 | Watchlist add/remove/reorder on prod | [ ] | E2E |

---

## F. Smart alerts

| # | Item | Status | Notes |
|---|------|--------|-------|
| F1 | Templates panel on `/alerts` (Pro) | [x] | |
| F2 | Free users see UpgradeGate | [x] | |
| F3 | Server evaluators: missing SL, sentiment, correlation, context, confluence, predictive | [x] | axe-watcher cron |
| F4 | Price alerts on chart (client evaluator) | [x] | Evaluator wired; Demo/Alpaca price-alert creation fixed; build verified |
| F5 | End-to-end trigger + feed event on prod | [~] | Trigger route records feed event; needs authenticated prod trigger spot-check |

---

## G. AXE Chat & Intelligence

| # | Item | Status | Notes |
|---|------|--------|-------|
| G1 | `/chat` loads without crash | [x] | Smoke HTTP 200 |
| G2 | `/chat?intel=1` — intelligence mode works | [x] | Prod HTTP 200 |
| G3 | `LLM_TARGET=auto` — Ollama first, OpenAI fallback | [x] | chat-health: ok_ollama |
| G4 | Ollama VPS reachable from Vercel | [x] | chat-health ollama=true |
| G5 | Chat quota: Free 20/day, Pro unlimited | [x] | Supabase RPC verified: free=20, paid/exempt `remaining=-1` |

---

## H. Cockpit & briefings (Pro)

| # | Item | Status | Notes |
|---|------|--------|-------|
| H1 | Cockpit loads for Pro users | [~] | `/cockpit` prod HTTP 200; needs signed-in Pro browser spot-check |
| H2 | Morning Brief + Learning Arc gated correctly | [x] | Page + API both use entitlement gates (`briefings`, `cockpit_learning`) |
| H3 | Daily + weekly briefing cron | [~] | Routes present and anonymous 401; needs authenticated cron/live delivery check |
| H4 | Intel section (seismic, vessels, jets labels correct) | [x] | Intel labels/code spot-check verified |

---

## I. Billing & tiers

| # | Item | Status | Notes |
|---|------|--------|-------|
| I1 | Stripe checkout Pro/Founder/Elite | [~] | Payment-link flow + webhook mapping verified in code; needs live Stripe env/E2E |
| I2 | Upgrade page + portal | [~] | Upgrade grid + portal route present; needs live Stripe env/E2E |
| I3 | Founder seat cap (100) enforced | [x] | UI hides Founder after cap; webhook validates cap server-side |
| I4 | Feature gates match `tiers.ts` (chat, cockpit, indicators, alerts) | [x] | Chat, alerts, indicators, cockpit gates verified in code |

---

## J. Premium polish

| # | Item | Status | Notes |
|---|------|--------|-------|
| J1 | Typography tokens (`.axe-label`, `.axe-body`) consistent | [x] | |
| J2 | Adaptive UI suggestions wired | [ ] | Audit |
| J3 | Indicator math vs MT5 (RSI shared) | [x] | rsiSeries centralized |
| J4 | AXE tool calling + live price in chat | [ ] | Audit |
| J5 | Push notifications (VAPID) optional path | [ ] | |

---

## K. Legal & marketing

| # | Item | Status | Notes |
|---|------|--------|-------|
| K1 | Terms, privacy, risk disclaimer, AI disclaimer live | [x] | All HTTP 200 on prod |
| K2 | `/launch` or marketing pages load | [x] | `/launch` HTTP 200 |

---

## Progress summary

| Section | Done | Total |
|---------|------|-------|
| A Infra | 8 | 8 |
| B Feed | 4 | 5 |
| C Onboarding | 4 | 4 |
| D Chart | 5 | 7 |
| E Quotes | 3 | 4 |
| F Alerts | 4 | 5 |
| G Chat | 5 | 5 |
| H Cockpit | 2 | 4 |
| I Billing | 2 | 4 |
| J Polish | 2 | 5 |
| K Legal | 2 | 2 |
| **Total** | **41** | **53** |

_Last updated: 2026-07-04 (risk band labels + MT5-style chart line polish build-verified)_
