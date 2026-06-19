# Trading OS op Vercel zetten

De **volledige app** (chart, chat, accounts, landing page, alles) staat al in **de root van deze repo** — niet in `trading-os/`.

| Wat | Waar |
|-----|------|
| Volledige app | `/` (repo root) — `src/app/` met 70+ routes |
| Live productie | [axecompanion.com](https://www.axecompanion.com) via Vercel project `axe-companion-os` |
| GitHub repo (bron) | `Ldezeeuw445/AXE-COMPANION-OS-` |
| Gewenste Trading OS domain | `tradingosapp.com` (nu 404 — nog niet gekoppeld) |
| Org repo `TRADING-AXE-OS-APPS/TRADING-OS-` | **Bestaat nog niet** op GitHub → daarom faalt import daar |

## Optie A — Snelst: domain toevoegen aan bestaand project

Als dezelfde app op **beide** domeinen mag draaien:

1. Ga naar [Vercel → axe-companion-os → Settings → Domains](https://vercel.com/axecompanionos/axe-companion-os/settings/domains)
2. Voeg toe: `tradingosapp.com` en `www.tradingosapp.com`
3. Zet DNS records zoals Vercel aangeeft (bij je domain registrar)
4. Optioneel env var: `NEXT_PUBLIC_APP_URL=https://tradingosapp.com` (alleen als je canonical/QR op Trading OS wilt)

Geen nieuwe repo, geen nieuwe build — alleen DNS.

## Optie B — Apart Vercel project “Trading OS”

Als je een **eigen** Vercel project wilt (aparte deploys, aparte env):

1. [Vercel → Add New Project](https://vercel.com/new)
2. Team: **AXE Companion OS**
3. Import Git repo: **`Ldezeeuw445/AXE-COMPANION-OS-`** (niet de org-repo — die is leeg/404)
4. **Root Directory:** `.` (repo root — **niet** `trading-os/`)
5. Framework: Next.js (auto-detect)
6. Project name: `trading-os`
7. **Environment Variables:** kopieer alles van `axe-companion-os` (Supabase, Stripe, MetaAPI, etc.)
8. Zet minimaal: `NEXT_PUBLIC_APP_URL=https://tradingosapp.com`
9. Deploy → koppel domain `tradingosapp.com`

## Optie C — Later: org GitHub repo

Als je code onder `TRADING-AXE-OS-APPS` wilt:

1. Maak lege repo `TRADING-OS-` in de org (GitHub UI)
2. Push de volledige codebase:

```bash
git remote add trading-os https://github.com/TRADING-AXE-OS-APPS/TRADING-OS-.git
git push trading-os main
```

3. Import **die** repo in een nieuw Vercel project (root `.`)

## Waarom het bij jou “blijft vallen”

| Probleem | Oorzaak |
|----------|---------|
| GitHub `TRADING-OS-` | Repo bestaat niet (404) |
| Vercel import org-repo | Geen code om te deployen |
| Sommige preview deploys | TypeScript error op feature branches (niet op `main`) |

`main` build lokaal: `npm run build` ✅

## Logo

TR logo: `public/trading-os-logo.png` — gebruik voor favicon/OG wanneer je Trading OS branding aanzet.
