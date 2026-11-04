# Welke branch heeft nog werk?

Bijgewerkt: 29 oktober 2026, tegen `main` op `77419fd`.

De repo heeft 212 remote branches. Bijna allemaal zijn ze al binnen, en
`git log main..branch` liegt daarover: een squash-merge laat de branch staan
met commits die niet in main zitten terwijl de **inhoud** er wel in zit.

De eerlijke test vergelijkt de bomen rechtstreeks, en alleen over de bestanden
die de branch zelf aanraakt:

```sh
files=$(git diff --name-only origin/main...origin/$b)
git diff --stat origin/main origin/$b -- $files
```

Geen uitvoer betekent: helemaal binnen. Staan er alleen *verwijderingen*, dan
loopt de branch achter op main en heeft hij niets te geven.

## Nooit een branch in zijn geheel mergen

Elke branch hier draagt een **oudere `package.json`** mee. De `test`- en
`verify`-ketens in main zijn alleen maar gegroeid, dus een hele merge gooit er
checks uit. `cursor/realtime-companion-automation-merged` zou in één klap
negen verify-scripts wissen — de hele paper-trading-suite. Neem per branch
alleen wat echt nieuw is, en laat `package.json` met rust.

## Stand op 29 oktober

| Branch | Stand |
|---|---|
| `feat/mt5-quotes-watchlist-sync` | binnen (PR #133 → `64d7d7b`) |
| `fix/chart-account-pill-light-shadow` | binnen |
| `fix/risk-guard-p0-r3` | binnen; de `package.json` wijkt alleen áchteruit af |
| `feat/matte-charcoal-family-icons` | binnen (PR #134 → `77419fd`), maskable opnieuw opgebouwd |
| `cursor/streamer-publish-breaker-67ed` | ingehaald; main heeft een vollere breaker in `publish.ts` |
| `cursor/realtime-companion-automation-{merged,fb75}` | ingehaald door de symbol-registry uit #133 |
| `cursor/pwa-c9-stale-offline-2175` | ingehaald; de wizard staat nu in `BrokerConnectWizard.tsx` |
| `cursor/mt5-server-name-resolve-8de2` | ingehaald |
| `cursor/claude-unmerged-into-main-d86c` | ingehaald |
| `cursor/broker-support-check-cbad` | ingehaald |
| `cursor/restore-axe-feed-crontab-2147` | binnen |
| `axe-agent-archief-20261028-1113` | archief, blijft staan tot de tags bestaan |
| alles van vóór oktober | geschiedenis, niet om te mergen |

## Wat er nog wél ligt

**`axe-agent` — PR #130, draft.** Ongeveer 2100 regels die main niet heeft, en
het is echt werk: FINRA short-volume als gratis bron, een Unusual-Whales-gate,
`fmpCongress` en `fmpInsider` in de intel-proxy, tests voor push-aflevering en
voor de schrijfrechten van de sync.

Dit is geen `git merge`. Het vraagt vier dingen:

1. De migratie `20260704120000_intel_short_volume.sql` moet op de database.
   Hij is goed geschreven: RLS staat aan, alleen `authenticated` mag lezen,
   schrijven blijft bij de service-role.
2. `supabase/functions/intel-proxy/index.ts` verandert 266 regels — dat is een
   aparte deploy, een push naar main zet die niet live.
3. `src/lib/mt5/syncCloudAccount.ts` botst met de symbol-registry uit #133.
   Beide kanten hebben dat bestand herschreven.
4. De `package.json` van de branch ruilt de test-runner om van `tsx --test`
   naar `node --test --experimental-strip-types` en laat daarbij tests vallen.
   Die wissel hoort apart besproken, niet meegesmokkeld.

De branch is een draft en de agent die hem schrijft was vandaag nog bezig.
Daarom blijft hij liggen: niet omdat het werk niet deugt, maar omdat
halverwege iemand anders' werk binnenvallen alleen maar troep geeft.

**`cursor/restore-companion-landing-c581` — PR #124.** De landingspagina,
ruim 2000 regels, inclusief 913 regels `globals.css` en het weghalen van
componenten die main gebruikt. Punt 9 van de rij wacht op Luka's keuze over
de hero-tekst; zonder die keuze is dit niet te beoordelen. Blijft liggen.
