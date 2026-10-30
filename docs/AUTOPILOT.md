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
   zes tot tien minuten.

   Een oude `builtAt` is op zichzelf géén alarm — hij betekent net zo goed dat
   er sinds die build niets te bouwen viel. Op 29 oktober stond er een
   `builtAt` van drie uur oud en was alles in orde: de laatste commit ervoor
   wás de laatste commit. Controleer het verschil met
   `git log --oneline <live-commit>..HEAD`: komt daar niets uit, dan loopt de
   deploy gewoon achter op jouw push van zojuist en moet je wachten. Staan er
   wél commits in die ouder zijn dan een kwartier, dan faalt de build en lees
   je `/var/log/axe-autodeploy.log`.

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

- **Een tabel wordt nooit aangemaakt zonder dat RLS in dezelfde uitvoering
  aangaat.** Op 28 oktober liep `apply_migration` drie keer in een
  bevestiging die een cloud-sessie niet kan beantwoorden. Ik knipte de
  migratie toen in tweeën om er langs te komen, de eerste helft slaagde en de
  tweede liep opnieuw vast — en precies die tweede helft was het
  beveiligingsdeel. Gevolg: `public.paper_positions` stond een tijd lang open
  voor de anon-sleutel, gemeten met een echte GET die `http 200` gaf. De tabel
  was leeg, dus er lekte niets, maar de fout was dezelfde als die van de 34
  `core_*`-policies die diezelfde ochtend gerepareerd zijn.

  Moet een migratie opgesplitst worden, dan is de volgorde: eerst
  `enable row level security`, dan pas de tabel vullen of openzetten. Een
  tabel zonder policies is dicht; een tabel zonder RLS is open. Falen hoort
  de veilige kant op te vallen.

  En meet het na met een vraag die onderscheid maakt: een `GET` op een lege
  tabel geeft `http 200` met `[]` of RLS nu aan staat of niet. Wat je wil
  weten is `relrowsecurity` en of er een policy voor `anon` of `public`
  bestaat.

- **`REVOKE ... FROM PUBLIC` sluit `anon` niet buiten.** Supabase geeft elke
  nieuwe functie in `public` een eigen grant aan `anon` via
  `ALTER DEFAULT PRIVILEGES`, en die overleeft een revoke op `PUBLIC`. Een
  migratie die netjes `REVOKE ALL ... FROM PUBLIC` doet en daarna aan
  `authenticated` en `service_role` grant, laat `anon` dus gewoon staan.

  Op 29 oktober kwam zo `axe_chat_daily_limit(uuid)` binnen: SECURITY DEFINER,
  neemt een willekeurige user-id, en met de publieke anon-sleutel was van elk
  account het abonnement af te lezen. In dezelfde sweep stonden ook drie
  AXE Core-functies open — dáár was de grant wél `PUBLIC` (`=X/postgres` in
  `proacl`), dus daar moest juist `FROM PUBLIC` eraf.

  Lees daarom `proacl` in plaats van te gokken welke van de twee het is, en
  meet achteraf met `has_function_privilege('anon', oid, 'EXECUTE')`. Die
  vraag maakt onderscheid; "de revoke gaf geen fout" niet.

- **Nooit een branch in zijn geheel mergen.** Elke oude branch draagt een
  oudere `package.json` mee, en de `test`- en `verify`-ketens in main zijn
  alleen maar gegroeid. Een hele merge gooit er dus checks uit zonder dat er
  iets rood wordt: `cursor/realtime-companion-automation-merged` zou in één
  keer negen verify-scripts wissen, de hele paper-trading-suite. Neem per
  branch alleen wat echt nieuw is en laat `package.json` staan.

  En meet of een branch nog werk heeft met een vraag die onderscheid maakt.
  `git log main..branch` telt commits, en na een squash-merge staan die er
  nog terwijl de inhoud al binnen is. Vergelijk de bomen rechtstreeks, over
  alleen de bestanden die de branch zelf aanraakt — zie `docs/BRANCHES.md`.

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
5. ~~**`3.1`** De learning arc tegen echte data valideren.~~ **Af,
   29 oktober.** Er staan 501 afgesloten trades van 3 traders in productie.
   De arc is op de 16 echte trades van één trader gedraaid en naast een
   onafhankelijke SQL-telling gelegd: symbolen, P/L en sessieverdeling kwamen
   exact overeen, en de suffix-normalisatie deed zijn werk op `XAUUSD.x` en
   `BTCUSD.nx` zonder `US30` te raken.

   De fout die alleen bij echte data opvalt: de kop zei "in the last 90 days"
   als vaste tekst terwijl het venster als `ARC_WINDOW_DAYS` in de service
   stond. Eén feit op twee plekken drift stil. Nu één bron.

   De validatie zelf draaide in de scratchpad, niet in de repo: het is
   handelsdata van echte gebruikers en die hoort niet in een publieke
   geschiedenis. Wat ervan terugkomt zijn de checks met de spellingen erin
   die er werkelijk staan.
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

   **Stap 3 (jargon) is af, 29 oktober.** "depth" en GDELT worden nu uitgelegd
   waar een bezoeker ze tegenkomt, en de iFVG-kop is uitgeschreven. De hero is
   bewust niet aangeraakt: die hoort bij stap 1 en is Luka's keuze. "phone OS"
   blijft daarom ook staan — hem alleen in de lagere secties vervangen zou de
   pagina met zichzelf in tegenspraak brengen.

   **Stap 2 en 4 wachten nog op die ene keuze.** Welke twee van de vier
   "slim"-secties blijven, en hoe kort de featurelijst mag, volgt uit wat de
   hero belooft. Vooruitlopen levert werk op dat weer weg moet.

   *Oorspronkelijke opdracht:* Hij staat
   er (veertien secties, `src/app/page.tsx`) en hij is af genoeg om te tonen.
   Wat niet gemeten is: of iemand die AXE niet kent binnen tien seconden snapt
   wat het doet. Doe het als lezer, niet als bouwer: schrijf eerst op wat er
   onduidelijk, druk of dubbel is, en pas daarna aan. Rustiger maken betekent
   bijna altijd iets weghalen. Niet alle veertien secties in één commit.

10. ~~**Een paper-account om op te testen.**~~ **Helemaal af, 30 oktober.**
    Luka vroeg hier op 28 oktober expliciet om.

    De cron die hier nog aan ontbrak hoefde niet van Luka te komen. Tien
    Companion-sweeps liepen al via pg_cron in Supabase, en daar kan een
    sessie zelf bij: `axe-companion-paper-stops` draait nu elke twee minuten
    via dezelfde `axe_ops.dispatch_cron` als de rest, dus met dezelfde
    `CRON_SECRET` uit de vault. Eerst één keer met de hand aangeroepen om te
    zien of de route het deed (`200`, `{"ok":true,"checked":0,...}`), pas
    daarna ingepland; de eerste geplande run om 14:48 deed hetzelfde.
    `scripts/vps.crontab` noemt hem nu in de pg_cron-lijst, zodat niemand
    hem er later ook als host-cron bij zet.

    Wat nagekeken is: `demo_paper`-accounts bestaan al (175 stuks), maar
    `/api/mt5/order` weigert ze met een 409 — het is iets om naar te kijken,
    niet om op te oefenen. `broker_trades` is waar journal, `playbookEdge` en
    de learning arc uit lezen, dus een paper-trade die daar landt laat de
    hele keten vanzelf werken. Geen nieuwe tabel nodig voor afgesloten trades.

    **Af en bewezen:** `src/lib/trading/paperBroker.ts`, 24 checks. De
    ontwerpregel die het waard maakt: papier vult aan dezelfde kant van de
    spread als echt geld. Een koop vult op de ask, een verkoop op de bid, en
    sluiten kruist terug — wie op de mid vult laat elke scalp-strategie één
    spread per trade beter lijken dan hij is, en dat is precies de marge die
    live het verschil maakt. Verder: een long's stop wordt tegen de **bid**
    gemeten, een gat door de stop vult op het gat en niet op de stop, en een
    bar die stop én doel raakte neemt de stop — binnen één bar is er geen
    bewijs welke eerst kwam, en je eigen onwetendheid in je voordeel
    beslechten is hoe een simulator een verliesweek in een winstweek
    verandert. `PAPER_LIMITS` noemt wat het niet modelleert (swap, commissie,
    slippage, margin call), want alles daarvan maakt papier mooier dan live.

    Onderweg een onbereikbare tak gevonden: de "stop wint"-regel kon met één
    quote nooit afgaan, omdat een long altijd op de bid sluit. Daar staat nu
    `evaluatePaperStopsOnBar` voor, waar de regel wél echt is — gevonden
    doordat een mutatietest níet omviel.

    **Ook af:** `src/lib/trading/paperQuoteSource.ts`, 12 checks. Dit beslecht
    de vraag die punt 10 eigenlijk stelt. Het demo-account prijst zichzelf met
    een seeded random walk (`getDemoQuotePrice`) — prima om de knoppen te
    leren, waardeloos als meting. En die trades landen in dezelfde
    `broker_trades`-rijen die `playbookEdge` leest, dat er zinnen van maakt
    over de *trader*: "jouw London XAUUSD longs winnen 64% van de tijd". Zonder
    markering wordt een toevalsgenerator aan iemand teruggegeven als zijn edge.

    Dus draagt elke quote zijn herkomst mee: `live` (echte bid/ask uit
    `chart_live_snapshots`, telt mee), `simulated` (gegenereerd, telt nooit
    mee) of `none` (dan geen fill — een paper-trade op een verzonnen prijs is
    erger dan geen paper-trade). Een tick ouder dan 90 seconden is geen live
    prijs meer. `countsAsEvidence` is de poort naar de learning arc.

    Onderweg een echte bug gevonden doordat een check omviel: `Number(null)`
    is `0` en `Number.isFinite(0)` is waar, dus een ontbrekende bid kwam er
    doorheen als een prijs van nul en zou een order op niets vullen.

    **Migratie geschreven, nog niet toegepast:**
    `supabase/migrations/20261028140000_paper_positions.sql`. De
    Supabase-koppeling vroeg om Luka's bevestiging en kreeg die niet — hij was
    er niet. Het is een nieuwe tabel, dus niets breekt zolang hij wacht, en er
    is nog geen code die hem leest. Staat in `docs/VOOR-LUKA.md` punt 5.

    **Ook af: de order-route.** `/api/mt5/order` vult een demo-account nu via
    `placePaperOrder` in plaats van 409 te geven. De tabel bestaat (RLS aan,
    vier policies, niets open voor anon). 10 checks in
    `scripts/verify-paper-order-route.mjs`, waarvan de belangrijkste eist dat
    de paper-tak *returnt* — valt hij ooit door, dan gaat een oefenorder naar
    een echte broker. Een mutatie die dat doet valt om.

    De MetaApi-check stond vóór de accountlookup, zodat ook een papieren order
    strandde als er geen token was. Die staat nu ná de paper-tak: papier heeft
    geen broker nodig. Pending orders worden op papier geweigerd in plaats van
    voorgewend — een limiet waar niets op wacht zou eeuwig blijven staan
    terwijl de UI hem als geplaatst toont.

    **Ook af: de stopbewaking.** `src/services/paperStopWatcher.ts` plus
    `/api/cron/paper-stops`, 15 checks. Een stop die nooit afgaat is erger dan
    geen stop: de trader oefent het plaatsen ervan en leert dat ze niet
    uitmaken. Afgesloten posities gaan naar `broker_trades` met
    `external_trade_id` als `paper:<uuid>` en `raw.counts_as_evidence`.

    De regel die hier het meest toe doet: **een positie sluit tegen dezelfde
    soort prijs als waarop hij opende.** Een positie gevuld op demo-prijzen en
    gesloten op een echte tick levert het verschil tussen een verzonnen en een
    echt getal — dat is geen winst of verlies, en het zou in het journaal
    precies als een echt resultaat staan. Gevolg, met opzet: een live positie
    waarvan de feed stilvalt blijft open in plaats van te sluiten op een
    verouderde prijs. Een stop die te laat afgaat is zichtbaar en bespreekbaar;
    een fill op een prijs die nooit bestond is geen van beide.

    De trade wordt weggeschreven vóór de positie verdwijnt, en de rij hergebruikt
    de positie-id als primary key — `broker_trades` heeft geen andere unieke
    sleutel (nagekeken tegen het echte schema, niet aangenomen), dus dat is
    wat de schrijfactie idempotent maakt als de sweep er tussenin uitvalt.

    **Ook af: de posities zijn zichtbaar.** `loadPaperPositions` plus een tak
    in `loadPositionsPageData`, 9 checks. De pagina eiste MetaApi en een
    `cloud_mt5`-account, dus wie op papier handelde zag niets — orders gingen
    erin en verdwenen, en dat is niet te onderscheiden van een kapotte app.
    De waardering gebruikt dezelfde poort als de watcher
    (`mayJudgeWith`): geen prijs van de eigen soort betekent een lege cel,
    geen verouderd getal. "Nu niet bekend" is waar; een oud getal zegt met
    volle overtuiging iets onwaars.

    **Ook af: handmatig sluiten.** `closePaperPositionById` plus de tak in
    `/api/mt5/close-position`, 6 checks erbij. Dezelfde prijsregel geldt ook
    als de trader zelf op de knop drukt: een live positie waarvan de feed stil
    is, kan niet gesloten worden — net zoals een broker dat weigert met een
    dichte markt. Niet kunnen sluiten is vervelend en waar; een verzonnen
    uitstapprijs is geen van beide.

    **Hiermee is de keten rond:** order → positie → zichtbaar → stop of
    handmatig → `broker_trades` → journal, playbookEdge, learning arc.

    **En daarna meteen een gat gedicht dat ik zelf had gemaakt.** De markering
    `raw.counts_as_evidence` werd vanaf dag één geschreven en door niemand
    gelezen: tien services bevragen `broker_trades` en geen ervan kende het
    veld. Een oefentrade op gegenereerde prijzen zou dus gewoon zijn
    meegeteld, en `playbookEdge` had hem teruggegeven als "jouw London XAUUSD
    longs winnen 64% van de tijd" — via het eigen journaal, waar een trader
    alle reden heeft het te geloven. `src/lib/trading/tradeEvidence.ts` is nu
    de enige plek die beslist, als PostgREST-filter zodat een service niet
    duizend rijen kan ophalen en hem vergeten. Toegepast op weakSpots /
    playbookEdge, de learning arc en wat AXE over de trader weet; níet op de
    cockpit-tellingen, want "je sloot twaalf trades" is ook waar van
    oefentrades. 10 checks in `scripts/verify-trade-evidence.mjs`.

    Let op de richting van de standaardwaarde: **afwezig betekent telt mee.**
    Elke rij van vóór het oefenaccount is een echte broker-fill, dus "onbekend
    = uitsluiten" zou de hele handelshistorie van iedereen wissen. Een mutatie
    die dat doet valt om.

    **Wat nog moet:** alleen de cron-regel op de VPS. `/api/cron/paper-stops`
    draait nergens vanzelf, dus stops gaan pas af als die regel er staat —
    `docs/VOOR-LUKA.md` punt 6. Handmatig sluiten werkt wel zonder.
    Daarna is dit punt af.

    *Oorspronkelijke opdracht:* `/demo` leidt sinds de 182 anonieme
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

## Zo goed als MT5 en TradingView samen — gemeten, 29 oktober

Luka's vraag: wat moet er nog gebeuren zodat Companion net zo goed is als MT5
en TradingView bij elkaar. Hieronder staat wat er nu echt is en wat er echt
mist, geteld in de code en niet geschat.

**Wat Companion nu heeft.** Zes timeframes (M5, M15, M30, H1, H4, D1 —
`chartTimeframes.ts`). Negen indicatoren: volume, MA, MACD, Bollinger, RSI,
VWAP, POC, Stochastic, ADX, alle negen met analytische tests in
`verify-indicator-math.mjs`. Tien SMC-lagen: structuur, order blocks, FVG,
iFVG, PDH, PDL, PDQ, session open, swing points, supply/demand. Vijf
teken-gereedschappen: fib retracement, trendlijn, rechthoek, tekst,
horizontaal niveau. Orders: market, buy/sell limit, buy/sell stop, plus
`modify-position`, `modify-order` en `cancel-order`, en SL/TP slepen op de
chart. Smart alerts, journaal met AXE-score, learning arc, playbook-edge, de
herkomstregel, en sinds deze week een paper-account.

**De juiste maatstaf, en ik had hem eerst mis.** Ik vergeleek met MT5 en
TradingView op de desktop. Luka corrigeerde dat op 29 oktober en hij heeft
gelijk: Companion is een telefoon-app, dus de tegenstander is **MT5 mobile en
TradingView mobile**. Dat is een heel ander gevecht, en wel te winnen.

Wat die twee op een telefoon zijn:

- **MT5 mobile** kan uitvoeren — alle timeframes, deelsluitingen, elk
  ordertype — en is verder kaal. Geen journaal, geen uitleg, een chart waar
  niemand vrijwillig naar kijkt.
- **TradingView mobile** heeft de chart en het tekenen, en kan voor bijna
  niemand een order naar zijn eigen broker sturen. Geen journaal, en het weet
  niet wat je ooit verhandeld hebt.

Dus de punten hieronder vallen in twee soorten, en dat verschil bepaalt de
volgorde:

**Inhaalwerk — dit hebben die apps al, dus het ontbreken valt op.** Punt 11
(deel van een positie sluiten) en punt 12 (M1, W1, MN1) staan niet op deze
lijst omdat ze indruk maken, maar omdat MT5 mobile ze heeft en wij niet. Een
trader die hier zijn weekchart mist, gaat terug naar de app die hem wel heeft,
en dan is de rest van wat wij bouwen niet meer relevant. Dit gaat voor.

**Voorsprong — dit heeft geen van beide.** Het journaal met AXE's oordeel, de
playbook-edge uit je eigen trades, de firm-regels die meebeslissen, de
herkomstregel. Dat staat er al. Punt 13 (replay naast het paper-account) en
punt 14 (het positie-gereedschap dat je dag-limiet kent) horen hier: dat kan
TradingView niet bouwen, want zij kennen je account niet, en MT5 niet, want
die vertelt nooit waarom.

En de echte ambitie is niet Companion alleen. Companion plus Trading OS op één
Supabase-project is waar dit heen gaat: alles van TradingView aan charts, plus
een terminal die op jouw manier van handelen is gebouwd, plus een telefoon die
precies daarvoor gemaakt is zodat je het altijd bij je hebt. Geen van beide
concurrenten heeft die combinatie, en dat is het antwoord op "hoe wordt dit
beter dan die twee" — niet door hun lijst in te halen, maar door iets te zijn
wat zij niet zijn.

Wat blijft staan: Companion haalt hun **desktop**-featurelijst niet in en moet
dat niet proberen. 21 timeframes en Depth of Market horen niet op een telefoon.

11. ~~**Deel van een positie sluiten.**~~ **Af, 29 oktober.** De route neemt
    nu een `volume`; MetaApi krijgt het mee op `POSITION_CLOSE_ID` (de sleutel
    wordt weggelaten bij een volledige sluiting, want een aanwezige `volume`
    ís de deelsluiting-instructie). Papier kan het ook, met dezelfde regel —
    anders leert het oefenaccount een gewoonte die het echte account niet
    toestaat.

    Het werk zat niet in de rekenkunde maar in het restant.
    `src/lib/trading/partialClose.ts`: sluit 0,095 van 0,10 en er blijft 0,005
    over, kleiner dan wat een broker verhandelt — de trader houdt iets over dat
    hij niet meer kan sluiten, wijzigen of vergroten. Dat wordt hier geweigerd
    met de twee uitwegen erbij (alles sluiten, of hoogstans zoveel), in plaats
    van drie seconden later als brokerfout terug te komen.

    `MIN_LOT` en `LOT_STEP` staan apart, ook al zijn ze allebei 0,01: zolang
    ze hetzelfde getal zijn kan een restant alleen nul of minstens het minimum
    zijn, en dan is de restantregel onbereikbaar — een regel die niet kan
    vuren is er niet. Sommige brokers hebben stap 0,01 met minimum 0,10, en
    daar is hij wél nodig.

    20 checks in `scripts/verify-partial-close.mjs`, waarvan twee met een
    nep-database die het echte gedrag uitvoeren. Dat was nodig: de versie die
    alleen de broncode las liet een mutatie door die bij een deelsluiting de
    hele positie verwijderde — de duurste fout die deze functie kan maken.

    *Oorspronkelijke opdracht:* `src/app/api/mt5/close-position/route.ts`
    neemt geen volume aan, dus een positie gaat heel dicht of niet. Dit is wat
    een trader het vaakst doet na een winnende beweging: de helft eruit, de
    rest laten lopen. Zonder dit moet hij naar MT5 om iets te doen wat hij
    hier wilde doen, en dan komt hij niet terug. Dit is het grootste gat van
    allemaal en het is klein werk: MetaApi neemt een volume mee bij close.
    Let op de guard — een deelsluiting is geen nieuwe order, dus hij hoort
    niet langs `autoTradeGuard` maar wel in het journaal, en de learning arc
    moet twee fills op één trade kunnen lezen zonder dubbel te tellen.

12. **~~W1 en MN1~~ af, 30 oktober. M1 wacht op een meting.**

    De waarschuwing hierboven — meet eerst of de broker de timeframe
    teruggeeft — bleek het antwoord in zich te dragen. Een weekcandle is geen
    eigen meting; het is dezelfde prijs, grover bekeken. Dus komen W1 en MN1
    niet van MetaApi maar worden ze uit de dagcandles gevouwen die de app al
    ophaalt. Dan kan W1 niet leeg zijn als D1 werkt, hoeft geen enkele broker
    `1w` te ondersteunen, en is er niets te meten dat mis kan gaan. Ze delen
    daardoor ook de dag-cache: één ophaalactie bedient D1, W1 en MN1.

    `src/lib/chart/aggregateCandles.ts`, 19 checks. De regel die het verschil
    maakt is de weekgrens: die volgt de **brokerdag**, niet UTC. FX opent
    zondagavond, en op een UTC-sleutel is dat een eigen dag van twee uur —
    die zou als zijn eigen week eindigen, en dan ziet de trader op maandag
    een weekcandle die alleen zondagavond bevat. `sessionDay.ts` had die
    redenering al staan voor PDH/PDL; hier geldt hij opnieuw.

    Drie mutaties getoetst en alle drie gevangen: de slotkoers uit de hoogste
    close in plaats van de laatste (tekent een week die altijd sterk sluit),
    de weekgrens op UTC, en de lopende week als voldragen candle. Die laatste
    is geen detail: een halve week als afgeronde candle laat iemand een
    omkeerpatroon zien dat vrijdag nog kan verdwijnen, dus draagt elke
    gevouwen candle `complete`.

    Onderweg ving een check een fout in mijn eigen code (`dailyCandlesNeeded`
    telde een feestdagenmarge op bij D1, waar niets gevouwen wordt) en een in
    het oefenaccount: `timeframeMs` kende `w1` niet en viel terug op een uur,
    dus het demo-account tekende uurcandles met W1 erboven.

    **M1 is bewust niet toegevoegd.** Dat is wél een eigen meting en kan
    alleen van de broker komen. Die meting vraagt een MetaApi-token, en dat
    staat op de host en niet in een sessie — niet in de Supabase-kluis
    (daar staan alleen `axe_companion_cron_secret` en `axe_uptime_webhook`)
    en niet in deze container. `timeframeMs` in `demoAccount.ts` kent `m1`
    al, dus zodra iemand met het token kan meten of `1m` candles teruggeeft
    voor de aangesloten brokers, is het toevoegen één regel in
    `CHART_TF_MAP` en één in `CHART_TF_OPTIONS`.

13. **Bar replay.** Nul bestanden. Dit is hoe mensen op TradingView leren, en
    sinds deze week staat er een paper-account naast: replay plus paper is een
    oefenlus zonder geld en zonder wachten op de markt. Van alle punten hier
    is dit het enige dat Companion iets geeft wat MT5 niet heeft én wat mensen
    daadwerkelijk gebruiken. Begin klein: een candle-index die terugloopt over
    de gecachte candles (`clientChartCache`), en de indicatoren alleen tot die
    index laten rekenen. De rekenkunde in `indicatorMath.ts` is al puur, dus
    dat kan zonder iets te veranderen.

14. **Het positie-gereedschap.** In TradingView het meest gebruikte
    teken-gereedschap: sleep een entry, een stop en een target, en zie meteen
    R:R en wat het kost. Companion heeft de risicorekenkunde al
    (`autonomyRisk.ts`, `accountProfile.ts` met de firm-limieten), dus dit is
    het ene punt waar wij het beter kunnen dan TradingView: daar staat een
    percentage, hier kan staan "dit is 0,8% van je dag-limiet van 4%, en je
    hebt vandaag al 1,2% gebruikt". Bouw het als teken-gereedschap, en laat
    het de bestaande `maxDailyLossPct` en `maxTotalLossPct` lezen.

15. **Trailing stop en stop-limit.** MetaApi ondersteunt beide; de app kent
    alleen market, limit en stop. Trailing is wat een trader aanzet als hij
    weg moet, en dat is precies het moment waarop Companion zijn waarde
    bewijst. Stop-limit is minder dringend maar hoort erbij.

16. **Twee timeframes naast elkaar.** Niet een volledige multi-chart layout —
    dat is Trading OS' werk, en op een telefoon past het niet. Wel: dezelfde
    pair op twee timeframes boven elkaar, zodat de bias en de uitvoering in
    één blik zitten. Dit is de telefoon-versie van wat een desk met vier
    schermen doet.

Wat hier bewust **niet** op staat, met de reden erbij:

- **Depth of Market.** Nul bestanden, en dat blijft zo. MetaApi geeft geen
  echte order book voor de meeste retail-brokers, en een DOM met verzonnen
  diepte is erger dan geen DOM.
- **Een screener.** Dat is Trading OS. Op een telefoon scan je niet
  vijfduizend instrumenten; daar kijk je naar de vier die je volgt.
- **Honderd teken-gereedschappen.** Vijf plus het positie-gereedschap dekt
  wat mensen echt tekenen. Elk extra gereedschap maakt de werkbalk op een
  telefoon slechter voor iedereen die het niet gebruikt.

## De rij is leeg. Wat nu?

Stand op 29 oktober: punt 1 tot 10 is af en live gemeten, behalve twee
dingen die op Luka wachten — de hero-regel van de landing (waar stap 2 en 4
uit volgen) en de cron-regel voor de paper-stops.

**Punt 11 tot 16 hierboven is nieuw** en komt uit Luka's vraag van 29 oktober
over MT5 en TradingView. De rij is dus niet leeg. Begin bij 11: een positie
half kunnen sluiten is het grootste gat en het kleinste werk.

**Een cyclus die niets te doen vindt, hoort niets te doen.** Dat staat
onderaan al, maar het is makkelijk te negeren met een opdracht in de hand die
zegt "pak het bovenste punt". Dus expliciet: als de checks groen zijn en er
staat niets open, is "niets gepusht, want de rij is leeg en dit wacht op
Luka" het juiste verslag. Een verzonnen taak kost zijn limiet en kan iets
breken dat werkte.

Wel altijd eerst: `npx tsc --noEmit`, `npm test`, `npm run verify`, en kijken
of de laatste commit live staat. Kapot gaat voor nieuw, ook als nieuw er niet
is. En een regressie van iemand anders is echt werk.

### Observaties, geen opdrachten

Deze zijn onderweg gemeten en bewust niet opgepakt. Ze staan hier zodat ze
niet verloren gaan, **niet** om zonder Luka aan te beginnen — elk kost meer
dan het oplevert zolang hij er niet is, of vraagt een afweging die niet aan
een autopilot is.

- **33 kwetsbaarheden in de wallet-stack.** `npm audit fix` lost ze op en
  breekt dan de typecheck op `WalletsAppKitProvider.tsx`, omdat
  `@reown/appkit` en zijn wagmi-adapter uit elkaar lopen. De echte weg is een
  major bump en daarna met een wallet verbinden om te zien of het nog werkt.
  Dat laatste kan hier niemand.
- **`axeContextBuilder` filtert niet op `counts_as_evidence`.** Bewust: dat is
  de laatste 25 trades als gespreksstof, en wie net drie oefentrades deed moet
  ze kunnen bespreken. Maar AXE baseert er wél uitspraken op. De nette
  oplossing is de herkomst meegeven in de context, niet de rijen weglaten.
- **De cockpit telt oefentrades mee in "je sloot N trades".** Ook bewust —
  dat is waar. Zodra iemand veel op papier handelt wordt die telling wel
  misleidend naast de echte cijfers ernaast.
- **Alpaca-accounts krijgen geen live ticks.** De streamer is MetaApi-only en
  Alpaca gaat via REST-bars. 39 actieve accounts. Een eigen punt met een eigen
  kostenafweging.
- **Chart: Ichimoku, een echt Volume Profile (nu alleen de POC-lijn),
  multi-timeframe overlays.** De rekenkunde hoort in `indicatorMath.ts`, er is
  een check op, en een nieuwe pane is sinds 28 oktober: opnemen in
  `PANE_MODES` en de checks vertellen je de rest.

Komt Luka terug met een nieuwe richting, dan gaat die boven alles hier.

---

## Hoe je een cyclus afsluit

Eén commit per punt, met in de boodschap wat er mis was en hoe het gemeten is
— niet alleen wat er veranderd is. Daarna:

- Staat het live en is het af: punt op `[x]`, volgende punt.
- Zit je vast op iets dat Luka moet doen: schrijf hier in één regel op wat je
  nodig hebt, en pak het volgende punt.
- Is er niets te doen: zeg dat, en verzin geen werk. Een cyclus die niets
  oplevert is beter dan een cyclus die iets kapotmaakt.
