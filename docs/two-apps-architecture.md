# Twee apps, één Supabase — deploy architectuur

Trading OS en AXE Companion zijn **twee aparte producten**. Ze delen Supabase als single source of truth (auth, memory, accounts), maar hebben elk:

- eigen codebase / GitHub repo
- eigen Vercel project
- eigen domein + landingspagina
- eigen Stripe subscription(s)

## Overzicht

| | **AXE Companion** | **Trading OS** |
|---|---|---|
| Product | Phone / operator app | Desktop terminal |
| Domein | `axecompanion.com` | `tradingosapp.com` |
| GitHub (doel) | `Ldezeeuw445/AXE-COMPANION-OS-` | `TRADING-AXE-OS-APPS/TRADING-OS-` |
| Vercel project | `axe-companion-os` ✅ live | `trading-os` ❌ nog niet |
| Root directory | repo root `.` | repo root `.` |
| Stripe | eigen Payment Link + webhook | eigen Payment Link + webhook |

## Gedeeld (Supabase)

Beide apps gebruiken **dezelfde** Supabase project (`pqnngpcgbdwxavbatbia`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://pqnngpcgbdwxavbatbia.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<zelfde anon key>
SUPABASE_SERVICE_ROLE_KEY=<zelfde service role — alleen server>
```

Eén login werkt op beide domeinen (zelfde `auth.users`). Memory, accounts, journal — één workspace.

## Apart (per app)

```env
# AXE Companion (axecompanion.com)
NEXT_PUBLIC_APP_URL=https://www.axecompanion.com
NEXT_PUBLIC_STRIPE_PAYMENT_LINK=<companion pro link>
STRIPE_WEBHOOK_SECRET=<companion webhook secret>

# Trading OS (tradingosapp.com)
NEXT_PUBLIC_APP_URL=https://tradingosapp.com
NEXT_PUBLIC_STRIPE_PAYMENT_LINK=<trading os pro link>
STRIPE_WEBHOOK_SECRET=<trading os webhook secret>
```

Stripe webhooks: **twee endpoints** — één per Vercel project:

- `https://www.axecompanion.com/api/stripe/webhook`
- `https://tradingosapp.com/api/stripe/webhook`

Maak in Stripe **twee producten** (bijv. “AXE Companion Pro” en “Trading OS Pro”). Entitlements in Supabase kunnen later per app gesplitst worden (`app_id` kolom); vandaag is `axe_user_entitlements` Companion-first.

## Vercel — AXE Companion (bestaat al)

- Project: `axe-companion-os`
- Repo: `Ldezeeuw445/AXE-COMPANION-OS-`
- Production: `www.axecompanion.com` ✅

Geen wijziging nodig tenzij je env vars opschoont.

## Vercel — Trading OS (stappen)

### 1. Zorg dat de Trading OS **code** op GitHub staat

De org-repo `TRADING-AXE-OS-APPS/TRADING-OS-` moet de **volledige Trading OS app** bevatten (niet AXE Companion, niet alleen een waitlist).

Als de code nu alleen lokaal staat:

```bash
# Maak lege repo in org (GitHub UI), dan:
git remote add trading-os https://github.com/TRADING-AXE-OS-APPS/TRADING-OS-.git
git push trading-os main   # vanuit je Trading OS projectmap
```

### 2. Nieuw Vercel project

1. [vercel.com/new](https://vercel.com/new) → team **AXE Companion OS**
2. Import **`TRADING-AXE-OS-APPS/TRADING-OS-`**
3. Project name: **`trading-os`**
4. Root directory: **`.`** (root van die repo)
5. Framework: Next.js

### 3. Environment variables

Kopieer infra-vars van `axe-companion-os` (MetaAPI, chart edge, OpenAI, etc.) **waar Trading OS ze ook gebruikt**.

Zet app-specifiek:

- `NEXT_PUBLIC_APP_URL=https://tradingosapp.com`
- `NEXT_PUBLIC_DATA_SOURCE=supabase`
- Eigen Stripe keys / payment link / webhook secret

### 4. Domain

Settings → Domains → `tradingosapp.com` + `www.tradingosapp.com`

DNS instellen bij je registrar zoals Vercel aangeeft.

## Wat **niet** doen

- ❌ Dezelfde repo root (`AXE-COMPANION-OS-`) deployen als “Trading OS” — dat is AXE Companion
- ❌ Alleen `tradingosapp.com` als extra domain op `axe-companion-os` — dan is het **één** app, geen twee subscriptions
- ❌ `trading-os/` subfolder in Companion-repo als volledige app behandelen — dat was een tijdelijke waitlist shell, geen desktop terminal

## Huidige status in deze workspace

| Artifact | Status |
|----------|--------|
| AXE Companion volledige app | ✅ `/workspace` (repo root) |
| AXE Companion op Vercel | ✅ `axecompanion.com` |
| Trading OS volledige app | ❌ **niet in deze repo** — moet in `TRADING-AXE-OS-APPS/TRADING-OS-` |
| Org GitHub repo | ❌ 404 — nog aanmaken + code pushen |
| `tradingosapp.com` | ❌ 404 — wacht op Vercel project |

## Connect tussen apps

- Zelfde Supabase user → shared memory / accounts
- Cross-links op landingspagina’s (Companion ↔ Trading OS)
- `TradingOSClient` contract in Companion (`src/lib/tradingos/`) — terminal integration later via API, geen directe code coupling

---

**Kort:** twee repos, twee Vercel projecten, twee domeinen, twee Stripe producten — **één Supabase**. De blocker voor Trading OS op Vercel is dat de Trading OS codebase nog niet in `TRADING-AXE-OS-APPS/TRADING-OS-` staat.
