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

2. ~~**Stochastic en ADX op de chart tekenen.**~~ **Af, `6815dec`, 28 oktober,
   live gemeten.** Ze staan op de chart, met hun eigen asschaal (stoch tegen
   80/20, ADX tegen 25 — niet 50, dat leest niemand op ADX) en met gaten waar
   hun wiskunde geen antwoord heeft. Onderweg drie stille fouten gevonden en
   gerepareerd: de paneHeight-sleutel staat in twee lijsten en ik vergat de
   tweede; de opgeslagen panevolgorde werd gelezen met `parsed.length === 3`,
   wat bij vijf panes elke oudere volgorde zou weggooien; en de pro-gate stond
   op drie plekken hardgecodeerd op `m !== "macd"`, zodat stoch en ADX gratis
   zouden zijn geweest. 15 checks in `scripts/verify-indicator-panes.mjs`,
   vier mutaties bewezen dat ze omvallen. `normalizePaneOrder` en
   `toSegmentedPath` staan nu in `src/lib/chart/` zodat ze toetsbaar zijn —
   een regel in een component van 5.000 regels kan niemand controleren.

   Wat hierna nog kan: Ichimoku, een echt Volume Profile (nu alleen de
   POC-lijn), multi-timeframe overlays. Alle rekenkunde hoort in
   `indicatorMath.ts` — daar is een check op. Elke nieuwe indicator krijgt
   analytische testgevallen, geen onthouden getallen, en bij Wilder-smoothing
   een tweede implementatie met de hand zodat een typefout niet met zichzelf
   instemt. Een nieuwe pane toevoegen is nu: hem in `PANE_MODES` zetten en de
   checks vertellen je de rest.

   *Oorspronkelijke opdracht:* De rekenkunde is af en bewezen
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
3. ~~**`L19.8`** `alert_auto_trade_enabled` en het autonomieniveau.~~ **Af,
   `ab797f2`, 28 oktober, live gemeten.** Het waren er niet twee maar vier:
   de voorkeur, de opt-in per alarm, het arm-venster en het autonomieniveau —
   en twee ervan gaven helemaal geen signaal terug.
   `evaluateAlertTradeGate` in `src/lib/trading/alertAutoTrade.ts` stelt de
   vier vragen op één plek en noemt de poort die dicht zit, met het
   autonomieniveau eerst: iemand met niveau 1 moet niet te horen krijgen dat
   hij moet armen. Geen vijfde poort en geen enkele ruimer — een check loopt
   alle zestien combinaties af en eist dat er precies één doorheen komt. Het
   settings-scherm vraagt nu dezelfde functie als de server, dus scherm en
   gedrag kunnen niet uit elkaar lopen. 11 checks in
   `scripts/verify-alert-trade-gate.mjs`, drie mutaties bewijzen dat ze
   omvallen.

   *Oorspronkelijke opdracht en wat er toen uitgezocht is:*

   - `alert_auto_trade_enabled` (boolean) wordt gelezen in
     `src/services/alertAutoTradeService.ts` regel 30 en stopt daar alles.
   - Het autonomieniveau wordt gewogen in
     `src/services/tradeGuardService.ts` regel 182, via
     `autonomyAllows("place", …)`.

   Ze staan in AND, dus onveilig is het niet. Verwarrend wel: een trader kan
   niveau 3 helemaal inrichten, drie limieten invullen, drie vinkjes zetten —
   en er gebeurt niets, omdat er elders nog een schakelaar uit staat. Of
   andersom, en dan denkt hij klaar te zijn terwijl de guard hem tegenhoudt.

   De vorm die past bij de rest: één pure functie die zegt *of* een alert mag
   handelen en **waarom niet**, met dezelfde opzet als `resolveAutonomy` en
   `provenanceBlocks` — een lijst redenen, leeg betekent gaan. De UI toont dan
   de ladder, en de losse toggle wordt wat hij werkelijk is: een per-alarm
   uitzondering, geen tweede hoofdschakelaar. Let op dat de bestaande
   `readAlertAutoTradeEnabled` op de alert-metadata (per alarm) iets anders is
   dan de voorkeur op de gebruiker — die twee niet samenvoegen.

   En de herkomstregel hoort hier meteen aangesloten: `provenanceBlocks`
   weigert al een order zonder leesbare reden, maar `alertAutoTradeService`
   roept hem nog niet aan.
4. ~~**`10.1`** Onboarding: tier kiezen → eigen MT5 koppelen.~~ **Af,
   28 oktober.** De flow eindigde op de chart met alleen voorkeuren opgeslagen.
   Er is nu een laatste stap die de twee ontbrekende dingen noemt met hun
   gevolg — account vóór plan, want dat is de eerlijke volgorde — en die niet
   blokkeert. `describeSetupGaps` leest de chat-limiet uit `tiers.ts` in plaats
   van hem over te typen, en een lopende fetch mag nooit als "je bent klaar"
   lezen: dat was de bug die ik zelf maakte en die een check nu vastlegt.
5. **`3.1`** De learning arc tegen echte data valideren zodra er trades
   binnenkomen.
6. ~~**Live ticks voor elk MT5-account.**~~ **Nagegaan op 28 oktober — het
   staat er al en het draait. Geen code geschreven, met opzet.**

   De opdracht was expliciet "nagaan voor er iets bij komt", en dat was
   terecht: de streamer in `node/metaapi-streamer/` draait in dynamic mode,
   leest zelf alle actieve `cloud_mt5`-accounts uit Supabase, start per
   account een stream en heeft een reconciliation-loop die nieuwe accounts
   oppikt. Daarnaast bestaan de websocket (Cloudflare `ChartLiveRoom`), de
   SSE-fallback op `/api/chart/live` en een REST-poller die stilvalt zodra de
   streamer echte ticks levert.

   Gemeten tegen productie, niet aangenomen:

   - `chart_live_snapshots`: nieuwste rij **0,35 seconden oud**, 340 rijen
     over 54 accounts.
   - Van de drie actieve `cloud_mt5`-accounts hebben er **drie** verse ticks
     binnen tien minuten. Nul zonder.

   Hier was dus niets te bouwen. Wat de meting wél liet zien, als losse
   observatie en niet als dit punt: de 39 actieve `cloud_alpaca`-accounts
   krijgen geen live ticks. Dat is geen bug maar een ontwerpkeuze — Alpaca
   haalt bars via REST op (`src/lib/alpaca/bars.ts`) en de streamer is
   MetaApi-only. Wil je daar ooit een live feed bij, dan is dat een eigen
   punt met een eigen afweging over kosten.

7. ~~**Waarom deze trade — de herkomstregel.**~~ **Af, `7964012`, 28 oktober,
   live gemeten.** `src/lib/axe/provenance.ts`: herkomst reist als data mee
   met het idee — bron, regel, getal, staat van dienst, en wanneer het
   gemeten is. Een ongetoetste regel zegt dat hij ongetoetst is, een dunne
   steekproef wordt in aantallen gemeld en nooit als percentage, en
   `provenanceBlocks` weigert een order waarvan de redenering ontbreekt of
   hol is — suggereren mag zonder, voorbereiden en plaatsen niet. 17 checks
   in `scripts/verify-provenance.mjs`, waarvan twee de watcher lezen zodat
   dit geen laag wordt die niemand invult. De playbook-edge is de eerste
   bron die hem vult; `alertProvenance` staat klaar voor de tweede.
   Wat nog mist: de regel zichtbaar maken in de UI onder het idee.
   Oorspronkelijke opdracht hieronder, want de rest ervan staat nog open.

   *Dit was wat Luka op 28 oktober het hardst vroeg.* Op dit moment kan
   AXE een idee sturen en een order voorbereiden (`autonomy.ts` niveau 2), maar
   nergens staat in één leesbare regel waar dat idee vandaan komt. De bronnen
   bestaan los van elkaar: `playbookEdge.ts` (je eigen afgesloten trades),
   `src/lib/intel/` (correlatie, congress trades, de kennislaag),
   `src/lib/market/` (nieuws, FRED, de kalender) en de alerts. Wat mist is een
   herkomst-object dat met het idee meereist tot in de UI: welke bron, welke
   regel, welk getal, en hoe vaak die regel eerder klopte. Zonder dat is
   niveau 3 niet te verdedigen — je kunt een machine geen geld laten uitgeven
   met een reden die niemand kan nalezen. Bouw het als één type dat elke bron
   invult, niet als een tekstje per bron. Hierna kan AXE Core hem ook lezen.

8. ~~**De 40 kwetsbaarheden in de dependencies.**~~ **Gedaan wat kon,
   28 oktober.** Zeven weg binnen semver (axios, undici, brace-expansion,
   js-yaml, browserslist, build-tooling); 33 blijven staan. `npm audit fix`
   lost ze wél op maar trekt `@reown/appkit` en zijn wagmi-adapter uit elkaar,
   waarna de typecheck faalt op `WalletsAppKitProvider.tsx` — geprobeerd,
   gemeten, teruggedraaid. Negentien van de 33 zijn de wallet-stack zonder
   patch, zes zijn build-gereedschap dat nooit bij een gebruiker draait.
   Het volledige verhaal staat in `docs/VOOR-LUKA.md` punt 4; de major bump
   van de wallet-stack vraagt dat iemand daarna echt verbindt met een wallet,
   en dat kan een autopilot-sessie niet.

   *Oorspronkelijke opdracht:* `npm ci` meldt er 40, waarvan
   29 high. Dat zit in packages, niet in onze code, en het blokkeert niets —
   maar het hoort niet te blijven staan in iets waar straks mensen voor
   betalen. Draai `npm audit`, los op wat zonder breaking change kan, en zet
   wat een major bump nodig heeft in `docs/VOOR-LUKA.md` met het risico erbij.
   Lockfile mee committen, koude build erna, anders telt het niet.

9. **De landing page — doorloop gedaan, aanpassen moet nog.** De bevindingen
   staan in `docs/LANDING-DOORLOOP.md` (28 oktober): de hero verkoopt een
   featurelijst in plaats van het ene verschil dat MT5 en TradingView niet
   kunnen namaken, er staan vier knoppen in de hero, vier secties zeggen vier
   keer "het is slim en het is één systeem", en er staan dertig claims onder
   een kop die belooft dat er niets te veel op staat.

   Daar staat ook de volgorde van aanpakken. Alleen stap 1 (de hero) vraagt
   Luka's oordeel, want dat is zijn positionering; stap 2 tot 4 kan een
   autopilot-sessie doen zodra die richting vaststaat. Niet alle veertien
   secties in één commit.

   *Oorspronkelijke opdracht:* Hij staat
   er (veertien secties, `src/app/page.tsx`) en hij is af genoeg om te tonen.
   Wat niet gemeten is: of iemand die AXE niet kent binnen tien seconden snapt
   wat het doet. Doe het als lezer, niet als bouwer: schrijf eerst op wat er
   onduidelijk, druk of dubbel is, en pas daarna aan. Rustiger maken betekent
   bijna altijd iets weghalen. Niet alle veertien secties in één commit.

10. **Een paper-account om op te testen.** `/demo` leidt sinds de 182 anonieme
    accounts bewust naar `/login` en dat blijft zo — dit is geen anonieme
    sessie maar een echt account met een MetaApi-demo eronder, zodat trades,
    journal en de learning arc met echte prijzen lopen zonder geld. Dit raakt
    het schema, dus een autopilot-sessie zonder database-toegang schrijft
    hooguit de migratie en zet hier dat hij nog toegepast moet worden.

Komt er iets tussendoor dat kapot is, dan gaat dat voor. Een gebroken ding is
altijd belangrijker dan een nieuw ding.

---

## Wat Luka op 28 oktober vroeg

Hij stuurde de Grok Bot-carrousel van @siddhantt.ai mee (zeven slides over een
"trading floor zonder personeel") en vroeg: hoe ver is de landing page, hoe
wordt dit beter dan MT5 en TradingView, waarom zet AXE een trade en waar komen
die ideeen vandaan, wat kunnen we met meer en betere data, en kan zoiets als
die bot-desk ook in Companion, Trading OS en AXE Core komen met een demo-account
om op te testen.

Drie dingen om te weten voordat iemand dit oppakt.

**De carrousel belooft meer dan de bron.** Het bijgevoegde document
(`GROKBOT-Build-by-siddhantt.ai.pdf`) zegt op zijn eigen titelblad
"TRADES BY BOTS: Zero" en in de eerste alinea: *"This guide builds a research
and alert desk. You make every call and place every order yourself."* De
"350 bots" zijn zes Grok Bots plus 300 Kimi sub-agents, en het getal 350 komt
in de bron nergens voor. Wat daar gebouwd is, is dus precies wat AXE al is: een
desk die leest, filtert en meldt. Bouw de plaatjes niet na alsof het een
auto-trader is.

**AXE wordt geen betere MT5 of TradingView op hun eigen terrein.** Die hebben
twintig jaar aan indicatoren, order types en depth. Daar winnen we niet, en
proberen kost alleen tijd. Waar we wel winnen: MT5 vertelt je nooit waarom, en
TradingView kent jouw trades niet. AXE heeft `playbookEdge.ts`, dat uit je eigen
afgesloten trades afleidt waar jij werkelijk geld verdient. Dat kunnen zij niet
bouwen en wij wel. Elk punt hieronder dient dat verschil, niet het inhalen van
hun featurelijst.

**AXE Core zit niet in deze repo.** De trading-tab, de algo en het
demo-account dat Luka daar wil, horen bij `axeheadquarters`. Een
autopilot-sessie hier kan daar niets aan doen. Wat hier wel kan is de
herkomstlaag (punt 2 hieronder) zo bouwen dat Core hem later kan lezen.

En de licentiegrens blijft staan: **geen LSE-data in Companion of Trading OS.**
Dat is geen openstaande vraag, dat is al besloten. Betere data voor Companion
loopt via de providers die er al zijn — MetaApi, Finnhub, Polygon,
AlphaVantage, FRED en de ForexFactory-kalender.

---

## Hoe je een cyclus afsluit

Eén commit per punt, met in de boodschap wat er mis was en hoe het gemeten is
— niet alleen wat er veranderd is. Daarna:

- Staat het live en is het af: punt op `[x]`, volgende punt.
- Zit je vast op iets dat Luka moet doen: schrijf hier in één regel op wat je
  nodig hebt, en pak het volgende punt.
- Is er niets te doen: zeg dat, en verzin geen werk. Een cyclus die niets
  oplevert is beter dan een cyclus die iets kapotmaakt.
