# Autopilot — doorbouwen als Luka er niet is

Luka vroeg hierom op 27 oktober 2026, na een paar dagen ziek: *"wil je
alsjeblieft zorgen dat het weer helemaal automatisch verder gaat en door gaat
zodat het echt af komt."*

In die vier dagen is er nul gepusht. De app bleef gezond draaien, maar er
bewoog niets. Dit bestand is er zodat een sessie die hier koud binnenkomt
weet wat te doen, wat niet, en wanneer iets af is — zonder eerst de hele
geschiedenis te hoeven lezen.

`WORKFLOW.md` blijft gelden en gaat hier bovenop: inspecteer voor je wijzigt,
één taak per keer, klein houden, verifiëren na elke wijziging.

---

## De lat: wanneer is iets af

Niet "de code staat er". Af is:

1. `npx tsc --noEmit` — schoon.
2. `npm test` — alles groen (116 tests op het moment van schrijven).
3. `npm run verify` — alles groen (463 checks op het moment van schrijven).
   Een nieuwe gedraging hoort een nieuwe check te krijgen, in het script dat
   er het dichtst bij staat, en die check moet **omvallen tegen de oude code**
   — anders bewijst hij niets.
4. `rm -rf .next && npm run build` — koude build groen. Dit is het echte
   vangnet: er is geen test runner die componenten rendert.
5. Gepusht naar `main`. Dat *is* de deploy: een cron op de VPS pullt, bouwt en
   herstart elke vijf minuten.
6. **Gemeten dat het live staat**, niet aangenomen:

   ```bash
   curl -s https://www.axecompanion.com/api/debug/build
   ```

   `shortCommit` moet gelijk zijn aan `git rev-parse --short HEAD`. Reken op
   zes tot tien minuten. Een oude `builtAt` bij een nieuwe commit op `main`
   betekent dat de build faalt — lees dan `/var/log/axe-autodeploy.log`.

   Dit endpoint bestaat omdat er twee keer verkeerd over de deploy geredeneerd
   is in plaats van hem te meten. Vertrouw de runbook niet, vraag het
   productie.

Gaat stap 1 tot 4 niet groen, dan wordt er niet gepusht. Een rode build
herstart niets en het oude proces blijft doorserveren, dus een mislukte deploy
is stil.

---

## Waar niemand aan mag beginnen zonder Luka

Dit zijn geen "nog niet gedaan"-punten. Het zijn punten die **alleen hij kan
doen**, en ze als werk oppakken kost tijd en levert niets:

- Schakelaars in de Supabase-console: `L1.5b` (Sign In / Providers),
  `auth_leaked_password_protection`.
- `L2.1` één echte testaankoop met een live kaart.
- `L2.2` wie `founder` mag houden.
- `L8.9`, `L13.2`, `L13.3`, `L14.3` — werk op zijn Mac / de bron van Trading OS.
- `L7.5c` `ALPHAVANTAGE_API_KEY` op de host zetten.
- `L18.4` `OLLAMA_BASIC_AUTH` op de Companion-host.
- `L18.5` tunnelopruiming bevestigen.
- `4.5` bottom dock bevestigen op de PWA.
- `L1.6` de 182 anonieme accounts: **niet opruimen** tenzij hij letterlijk
  "opruimen" zegt.
- Upcomers verbinden: de servernaam komt uit zijn MT5-app en het wachtwoord
  heeft hij. Zie `docs/mt5-metaapi.md`.

Staat zo'n punt in de weg, schrijf dan op wat er van hem nodig is en pak het
volgende. Niet eromheen bouwen.

## Harde grenzen, uit eerdere sessies

- **Nooit een sleutelwaarde in chat of in een commit.** Alleen namen van
  sleutels. Dat geldt ook voor logs die je plakt.
- **Geen LSE-data in Companion of Trading OS.** De licentie staat intern en
  commercieel gebruik toe maar geen doorgifte. Alleen AXE Core.
- `LSE_API_KEY` krijgt **geen** `VITE_`-prefix.
- **Nooit** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY` of
  `OPENAI_BASE_URL` zetten op een host waar de agents zelf draaien.
- Op de VPS **nooit** blind `git stash` of `git checkout --`.
- Nooit vragen om, of werken met, OAuth-autorisatiecodes.
- `AXE_TERMINAL_ALLOWED_USER_IDS` moet op elke host staan die
  `terminal-server.cjs` draait: één Supabase-project bedient ook Companion en
  Trading OS.
- De 52 gearchiveerde branches blijven staan tot de tags bestaan.

---

## Wat een autopilot-sessie níet heeft

De terugkerende taak (`trig_0162bNCRWwUNB3KSTNgHocsx`, elke vier uur) is
aangemaakt zonder connectors. De sessies die hij start hebben dus **geen**
`mcp__Supabase__*` en **geen** `mcp__github__*`. Praktisch:

- `git` werkt gewoon, dus pushen naar `main` en daarmee deployen kan.
- De database is niet te bereiken. Een migratie kun je wel **schrijven** in
  `supabase/migrations/`, maar niet toepassen. Doe dat dan ook in die volgorde:
  schrijf het bestand, zet de code zo dat hij zonder de nieuwe kolom nog werkt,
  en zet hier in één regel dat de migratie nog toegepast moet worden.
- Kies bij voorkeur een punt uit de rij dat geen schemawijziging nodig heeft.
  De eerste twee punten hieronder kunnen zonder.

Luka kan dit oplossen door de routine opnieuw aan te maken vanuit de
routines-UI op claude.ai; dan draagt hij de connectors wel mee. Via de API kan
het niet — `create_trigger` weigert de `connectors`-parameter voor deze
organisatie, geprobeerd op 27 oktober 2026. Het blokkeert niets: elk punt dat
nu op de rij staat kan zonder database-toegang.

Loopt er iets vast op iets wat alleen hij kan doen, zet het dan in
`docs/VOOR-LUKA.md` met de exacte stappen erbij. Eén bestand, zodat hij het
niet hoeft te reconstrueren.

## De rij, in deze volgorde

Eén punt per keer, helemaal af volgens de lat hierboven, dan het volgende.
Zet een punt op `[x]` in `docs/BOUWLIJST-COMPANION-LAUNCH.md` zodra het af en
gemeten is.

1. ~~`3.4` AXE die uit zichzelf ideeën stuurt.~~ **Af, `ce92289`,
   27 oktober.** `src/lib/journal/playbookEdge.ts` leidt uit eigen afgesloten
   trades af in welke sessie, welk instrument en welke richting een trader
   werkelijk geld maakt, en de watcher meldt het terwijl die sessie open staat.
   22 checks in `scripts/verify-playbook-edge.mjs`.

2. **Stochastic en ADX op de chart tekenen.** De rekenkunde is af en bewezen
   (`stochasticSeries` en `adxSeries` in `src/lib/chart/indicatorMath.ts`,
   51 checks in `scripts/verify-indicator-math.mjs`, waaronder Wilder's
   recurrence een tweede keer met de hand uitgeschreven). Wat nog mist is het
   zichtbare deel, en dat is plumbing door vijf bestanden:

   - `src/components/chart/indicators/IndicatorPane.tsx` — `Mode` uitbreiden
     van `"volume" | "rsi" | "macd"` naar ook `"stoch"` en `"adx"`, met een
     tak in de geometry-memo en een rendertak. Let op: de kleuren horen in
     `chartTheme.ts` per preset, niet hardcoded, en de memo-dependencies
     moeten compleet zijn — dat is eerder stilletjes fout gegaan.
   - `src/lib/axeChartActions/indicatorMapping.ts` — `INDICATOR_FLAG_KEYS` en
     de aliassen, zodat AXE ze op verzoek aan kan zetten.
   - `src/components/chart/ChartScreen.tsx` — de toggle, de paneOrder en de
     paneHeight-sleutel.
   - `src/lib/chart/chartPrefs.ts` — de nieuwe paneHeight-sleutel in
     `SYNCED_SYMBOL_KEYS`, anders synct hij niet. Er is een check die de twee
     lijsten vergelijkt, dus dit valt om als je het vergeet.
   - `src/lib/chart/chartPrefs.ts` opnieuw — `INDICATOR_LABELS`, zodat AXE ze
     bij naam noemt in de ochtendbrief.

   Daarna de rest: Ichimoku, een echt Volume Profile (nu alleen de POC-lijn),
   multi-timeframe overlays. Alle rekenkunde hoort in `indicatorMath.ts` —
   nergens anders, daar is een check op. Elke nieuwe indicator krijgt
   analytische testgevallen, geen onthouden getallen, en bij Wilder-smoothing
   een tweede implementatie met de hand zodat een typefout niet met zichzelf
   instemt.
3. **`L19.8`** `alert_auto_trade_enabled` en het autonomieniveau zijn nog twee
   aparte schakelaars voor hetzelfde. Eén maken.
4. **`10.1`** Onboarding: tier kiezen → eigen MT5 koppelen, in één flow.
5. **`3.1`** De learning arc tegen echte data valideren zodra er trades
   binnenkomen.
6. **Live ticks voor elk MT5-account.** Nagaan wat er al staat
   (`chart_live_snapshots`, de SSE-route, de streamer) voor er iets bij komt.

Komt er iets tussendoor dat kapot is, dan gaat dat voor. Een gebroken ding is
altijd belangrijker dan een nieuw ding.

---

## Hoe je een cyclus afsluit

Eén commit per punt, met in de boodschap wat er mis was en hoe het gemeten is
— niet alleen wat er veranderd is. Daarna:

- Staat het live en is het af: punt op `[x]`, volgende punt.
- Zit je vast op iets dat Luka moet doen: schrijf hier in één regel op wat je
  nodig hebt, en pak het volgende punt.
- Is er niets te doen: zeg dat, en verzin geen werk. Een cyclus die niets
  oplevert is beter dan een cyclus die iets kapotmaakt.
