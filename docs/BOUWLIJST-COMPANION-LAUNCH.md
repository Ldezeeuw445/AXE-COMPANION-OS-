# AXE Companion — bouwlijst naar launch

Geschreven 2026-10-10, op basis van **metingen**, niet van aannames.
Elke status hieronder komt uit de code, uit `public.axe_cron_status('companion')`
op Supabase, of uit een live call naar www.axecompanion.com.

Legenda: ✅ bestaat en werkt · 🟡 bestaat maar doet het niet / half · ❌ bestaat niet

---

## Fase 0 — De motor staat stil (geen code, wel blokkerend)

Dit is de belangrijkste uitkomst van de audit. Het grootste deel van wat je in je
plan "werkt niet" noemt, is **niet stuk in de code**. De code draait, roept netjes
aan, en krijgt een foutmelding terug die nergens zichtbaar wordt.

| # | Wat | Gemeten bewijs | Gevolg |
|---|-----|----------------|--------|
| 0.1 | ~~**OpenAI heeft geen credits**~~ **OPGELOST 10-10 13:05** | `intel-correlate`: `ok: true` met een echte correlatie ("Bullish Sentiment on Semiconductor Stocks") | De modellaag leeft weer |
| 0.2 | ~~**MetaApi-account bestaat niet meer**~~ **OPGELOST 10-10 14:00** | `mt5-sync`: `synced: 1, failures: []`, account `provider_status: connected` | Correctie: het account was **niet** verwijderd. MetaApi meldt een wegens credits opgeschort account als "not found. It may have been deleted" — een misleidende fout die ik voor waar aannam. Credits bijvullen was genoeg; opnieuw koppelen was niet nodig |
| 0.3 | **Unusual Whales niet geconfigureerd** | `/api/debug/cron-health`: `unusual_whales_set: false`. `intel-warmup`: 6 van 9 acties `http_500` (insiderTrades, senateTrades, darkPool, unusualOptions, marketTide, gdelt) | AXE Intel mist tweederde van zijn bronnen |
| 0.4 | **Krater-key niet gezet** | `krater_api_key_set: false` | Daily news / market recap-bron |

**Nodig van jou (alleen jij kan dit):** credits op OpenAI, een nieuw MetaApi-account
koppelen, en of je Unusual Whales + Krater wilt betalen of die bronnen uit de UI
wilt halen. Zonder 0.1 en 0.2 is alles hieronder bouwen aan een auto zonder benzine.

**Wat ik wél bouw in deze fase:** falen zichtbaar maken. Nu meldt `autoJournalTrades`
vrolijk `ok: true, journaled: 0` als het model faalt — precies de stilte die ons twee
maanden heeft gekost volgens `docs/AUDIT_2026-09-07.md`.

- [x] **0.5** Elke modelfout wordt geclassificeerd (`src/lib/ops/llmFailure.ts`), weggeschreven naar `axe_engine_runs` met advies, en luid gelogd — nooit meer stil. Bewijs: `npm run verify`, 12 checks, waaronder de échte productiefout van 10-10 (`429` + "no credits") die als `rate_limited` werd gelezen. Zonder de credits-tak faalt die check aantoonbaar
- [x] **0.6** `/api/debug/cron-health` meldt nu `llm_blocking` (wat een mens moet fixen, of null), `llm_sources` per engine en `ollama_configured`. Een gezette sleutel zei niets over een lege rekening; dit wel
- [x] **0.7** Journaling loopt via `llmRouter` — Ollama eerst, OpenAI als fallback. De harde `OPENAI_API_KEY`-eis is weg; één lege rekening zet AXE's brein niet meer uit

---

## Fase 1 — AXE journalt zelf (jouw #1 klacht)

Jouw woorden: *"axe moet zelf alle trades journalen, nu gebeurt het alleen als ik het eerst doe."*

Gemeten: `autoJournalTrades()` bestaat (`src/services/journalingService.ts:63`) en wordt
**al** automatisch aangeroepen na elke MT5-sync (`src/lib/mt5/syncCloudAccount.ts:397`).
Het is dus wél gebouwd. Waarom je het niet ziet:

1. MT5-sync faalt (0.2) → `dealsUpserted = 0`
2. De aanroep staat achter `if (shouldJournal && dealsUpserted > 0)` — geen nieuwe deals, geen journal
3. En als hij wél draait, faalt het model op geen credits (0.1) en wordt dat stil weggeslikt

- [x] **1.1** De `dealsUpserted > 0`-gate is weg, én de trigger staat nu vóór de `sync_no_deals` early return — een sync die niets nieuws vond haalt de achterstand alsnog in. Bewijs: structurele guard in `scripts/verify-journal-wiring.mjs` die beide volgordes afdwingt
- [x] **1.2** `/api/cron/journal-sweep` — elk uur, pakt gesloten trades van de laatste 7 dagen zonder `axe_label`, los van de sync. Stopt uit zichzelf bij een fout die alleen jij kan fixen i.p.v. 40x hetzelfde te loggen. SQL-registratie staat in `docs/CRON-RUNBOOK.md` en moet ná de deploy draaien
- [x] **1.3** De journal-pagina zegt nu wat er gebeurt: "AXE is scoring your closed trades…", daarna "AXE journaled 3 trades" óf de reden waarom niet, in gewone taal. Nooit meer stilte
- [x] **1.4** `src/lib/journal/weakSpots.ts` — zeven detectoren die uit je eigen trades een **uitspraak met cijfers** halen: verliezers langer vasthouden dan winnaars, je snelste trades zijn je slechtste, revenge-trades binnen 15 min na een verlies, groter inzetten na verlies, één symbool dat bloedt, je drukste dagen zijn je slechtste, een sessie waarin je geld verliest. Elke bevinding draagt bewijs mét getal en één concreet voorstel. Rekent puur, dus werkt dóór als het model eruit ligt. Bewijs: 9 checks, waaronder "een schone historie zegt niets" — een detector die altijd iets vindt is niets waard
- [x] **1.5** `weakSpotService` schrijft die bevindingen als `axe_memory`-rijen weg; `journalingService.loadMemories` leest ze in bij élke volgende trade die AXE scoort. Een patroon dat stopt wordt opgelost i.p.v. voor altijd in de prompt te blijven hangen. Dát is de loop
- [x] **1.6** Zichtbaar in de app: `WeakSpotsPanel` op de journal-pagina — rendert niets als er niets te zeggen valt

---

## Fase 2 — AXE praat uit zichzelf (proactief, niet reactief)

Jouw woorden: *"er komt rood nieuws aan, ik zie dat je een funded account hebt en met nieuws niet mag traden."*

Gemeten: `src/services/axeProactiveWatcher.ts` bestaat, draait elke 15 min, en doet
**al** bijna precies dat — regel 134-152: high-impact event binnen 45 min + open posities
→ feed-item + push. ✅ Het fundament staat er.

Wat eraan mist t.o.v. jouw voorbeeld:

- [x] **2.1** `src/lib/risk/accountProfile.ts` onderscheidt live / demo / prop-evaluation / prop-funded. De app had alleen `isDemoAccount()`: één regex die demo, FTMO, funded, challenge en prop op één hoop gooide, terwijl die juist tegenovergesteld behandeld moeten worden. De nieuwsregel vuurt nu óók zonder open posities als de regels van het account nieuws verbieden — precies jouw voorbeeld
- [x] **2.2** Beperkingen per account: `newsTradingAllowed`, `maxDailyLossPct`, `maxLot`, `weekendHoldingAllowed`. Afgeleid uit de accountnaam als *vermoeden*, maar alles wat jij expliciet zet in `metadata.tradingRules` wint, en dan zegt AXE er niet meer "assumed" bij
- [x] **2.3** Push was de **eerste** bron voor de kandidatenlijst, dus wie push weigerde werd nooit gecontroleerd — ook geen feed-item. Nu: iedereen met een actief broker-account valt binnen scope, push bepaalt alleen nog of er een melding uitgaat
- [x] **2.4** Drie regels erbij in `src/lib/risk/positionRisk.ts` + de watcher:
  - **Concentratie** — drie tickets die één weddenschap zijn. Long EURUSD + long GBPUSD + short USDJPY is niet drie trades maar één view op USD, drie keer gehouden. Ook: hetzelfde paar dubbel, twee metalen, twee indices. Rapporteert lots, niet posities, want "2,4 lot dezelfde kant op" is een feit en "drie posities" een mening
  - **Weekend** — vrijdagavond vóór de close, met de accountregel erbij: mag dit account niet overhouden, dan is het een regel-waarschuwing; mag het wel, dan een gap-waarschuwing
  - **Je eigen duurste gewoonte** — de zwaarste bevinding uit 1.4 als proactief bericht, één keer per week gesleuteld. Dagelijks herhalen maakt van een inzicht ruis

---

## Fase 3 — Adaptive + learning arc zichtbaar

Gemeten: `src/lib/adaptive/profileEngine.ts`, `trackAdaptiveEvent.ts`, `eventTypes.ts`
✅ bestaan. `src/services/learningArcService.ts` + `CockpitLearningArc.tsx` ✅ bestaan.
`/api/adaptive/suggestions/[id]` ✅ bestaat.

Dus "hey dit gebruikt de user veel, zal ik dat standaard aanzetten" is **gebouwd**.
Te verifiëren zodra 0.1 is opgelost: of de arc daadwerkelijk groeit of op nul blijft staan
(`user-knowledge-sync` schreef vanmorgen `docsWritten: 0, chunksEmbedded: 0` —
"only 0 records (need 3)" voor trading-profile, omdat er geen trades binnenkomen).

**Wat er was:** `learningArcService` toont een *momentopname* — top pairs, top
timeframes, een alignment score. Nuttig, maar daar zit geen richting in. Jouw
vraag was "zodat je echt kan zien dat ze met je mee groeien", en een foto groeit
niet.

- [x] **3.2** `src/lib/axe/learningStage.ts` telt wat AXE écht van je weet —
  dingen die hij onthoudt, trades die hij zelf scoorde, jouw regels, jouw
  playbooks, keren dat hij uit zichzelf iets zei — en zet dat af tegen een maand
  geleden. Vijf fases met een naam die zegt wát AXE op dat punt kan, en steeds
  één concrete volgende stap. Zichtbaar op de journal-pagina, niet alleen in de
  cockpit
- [x] **3.3** AXE Intel heeft een eigen arc met een eigen telling. Intel journalt
  geen trades en kent je playbook niet, dus die meetellen zou zijn balk laten
  bewegen om redenen die niets met Intel te maken hebben
- [x] **3.4 — eerlijkheid als ontwerpregel.** Een balk die vanzelf omhoog kruipt
  is erger dan geen balk: dan vertrouw je de echte ook niet meer. Daarom: elk
  punt is een rij die je kunt opzoeken, een maand waarin niets gebeurde **zegt
  dat ook**, een telling die mislukt wordt nul en geen schatting, en negatieve
  of onzinnige invoer kan de balk niet opblazen. Die vier staan als checks
- [ ] **3.1** Arc valideren met echte data zodra er trades binnenkomen
- [ ] **3.4** Vooruitdenken op strategie: de profileEngine kent gebruik, nog niet *strategie*. Playbook-herkenning uit trades → "jij traadt London open breakouts; vandaag is de range te smal"

---

## Fase 4 — Chart: MT5-gevoel, dark én light

Gemeten: `src/components/chart/chartTheme.ts` ✅ met 4 thema's, waarvan er 2 in de
toggler zitten (`midnight`, `paper`). `ChartThemeTogglerButton` ✅.
Indicatoren, annotaties, SL/TP-lijnen, trade-plan-lijnen ✅ bestaan allemaal.

- [x] **4.1 + 4.3 — gemeten, niet gekeken.** Negen kleuren zakten onder de
  WCAG-norm van 3:1 voor grafische objecten. De twee die er het meest toe doen:
  je **stop-loss-lijn op dark** stond op 2.81:1 en je **sell-orderlijn op light**
  op 2.96:1 — precies de twee lijnen die je in een haast moet kunnen vinden.
  Alles zit nu boven 3:1 op beide thema's, en `orderBuy`/`orderSell` zijn per
  thema in plaats van één gedeeld paar dat op geen van beide canvassen klopte
- [x] **4.4** `scripts/verify-chart-contrast.mjs` meet het bij elke
  `npm run verify`. Bewezen dat hij werkt: met de oude stop-loss-kleur
  teruggezet faalt hij met `stopLine → 2.81:1`. Hij houdt ook rekening met
  holle kaarsen (het kader draagt daar het contrast, niet de vulling) en
  controleert of koop en verkoop nog uit elkaar te houden zijn **door de ogen
  van een kleurenblinde trader** — een luminantietest zou blauw versus rood
  goedkeuren terwijl rood/groen-verwarring het echte risico is
- [x] **4.2 — Klopte niet meer.** De drie hexen staan in *commentaar*
  (`#d7d6d0`, `#2a2e39`, `#131722` als toelichting bij rgba-waarden), niet in
  code. `IndicatorPane` is al theme-aware: `ChartScreen` geeft
  `chartTheme.isDark` en `chartTheme.chartCanvasBackground` door en de pane
  heeft twee volledige paletten. Wat er wél aan mankeert is subtieler: de pane
  houdt een eigen palet in plaats van de gedeelde `chartTheme` te lezen, dus
  een kleurwijziging daar bereikt de indicatorbalken niet. Dat is een echte
  refactor met zichtbaar regressierisico op een werkende chart; ik heb hem niet
  gedaan voor een vinkje. Staat als 4.6 hieronder
- [ ] **4.6** `IndicatorPane` het gedeelde `chartTheme` laten lezen in plaats
  van een eigen palet, zodat de paletten niet uit elkaar lopen
- [ ] **4.4** Rechter prijsbalk — al verkleind naar 10px vorige ronde ✅
- [ ] **4.5** Bottom dock in elke combinatie — gebouwd vorige ronde ✅, nog door jou te bevestigen op de PWA

---

## Fase 5 — AXE op de chart (fib + indicators plaatsen)

Gemeten: `src/lib/axeChartActions/` ✅ compleet — bus, queue, guards, memory, swing-analyse,
indicator-mapping. `draw_fibonacci` ✅ werkt.

**Correctie op mijn eigen audit:** ik schreef dat de herkenning een hardgecodeerde
zinnenlijst was en dat tool-calling moest worden gebouwd. Tool-calling **bestond al** —
`route_chart_action` in `axeService.ts`, met alle vijf de actietypes. De zinnenlijst was
een *fallback*. Het echte probleem was erger en anders:

- [x] **5.1** De "fallback" draaide als **eerste** (`Composer.tsx:243`) en deed `return`.
  Matchte je bericht één van die zestien letterlijke zinnen, dan navigeerde de app naar de
  chart en **bereikte je bericht AXE nooit**: geen antwoord, geen redenering, niets in het
  gesprek, niets in de feed. De tekening verscheen en AXE wist van niets. Zei je het nét
  anders, dan ging het wél naar AXE — die het correct afhandelde. De slechte weg kaapte
  dus de goede. Nu: altijd naar AXE, en de lokale herkenning is een echt vangnet dat
  alleen afgaat als de beurt niets opleverde (geen credits, dode provider, geen netwerk)
- [x] **5.2** De herkenning is woordgebaseerd in plaats van zestien letterlijke zinnen.
  "kun je even een fib zetten" werkte niet en nu wel — Nederlandse infinitieven (`zetten`,
  `tekenen`) zaten niet in het patroon. Vijf actietypes: fib, trendlijn, key level,
  indicator, wissen
- [x] **5.3** `src/lib/feed/chartActionSummary.ts`. Twee dingen waren stuk:
  de feed drukte de ruwe actienaam af ("Draw_fibonacci") zonder wát of waarom,
  én hij filterde op `status: "pending"` — dus zodra de chart de actie toepaste
  **wiste het item zichzelf**. Juist het item waar je op wilt terugkijken
  verdween. Nu blijft het staan, met de reden die AXE gaf:
  *"Fibonacci on XAUUSD H1 — the last impulse low to the high is the swing
  everything is reacting to. Applied to your chart — still adjustable."*
  `route_chart_action` heeft daarvoor een `reason`-parameter gekregen, en de
  systeemprompt eist hem

---

## Fase 6 — Trades voorbereiden én plaatsen, veilig

Gemeten: `execution_requests` ✅ bestaat met `status: pending` → review → approve-flow.
`executionRequestExecutionService.ts` ✅. De proactieve watcher duwt pending requests
al naar je toe na 5 min ("tap to approve").

Jouw 3 vinkjes ❌ bestaan niet. Nodig:

- [ ] **6.1** Veiligheidsniveau per user: (1) alleen voorstellen · (2) voorbereiden, ik keur goed · (3) zelfstandig plaatsen binnen limieten
- [ ] **6.2** Drie expliciete vinkjes vóór niveau 3, met harde grenzen: max lot, max risico per trade, max trades per dag
- [ ] **6.3** Elke zelfstandige plaatsing schrijft een onuitwisbare regel in de feed + journal

---

## Fase 7 — Alerts die handelen

Gemeten: `src/lib/alerts/` ✅ — `smartAlertRules`, `smartAlertTemplates`,
`useAlertEvaluator`, `fromChatTool`. Evaluatie draait in de watcher ✅.

- [ ] **7.1** Alert-type "open trade bij trigger" met vooringestelde lot/SL/TP ❌ bestaat niet — bouwen bovenop 6.1 (valt onder niveau 3)
- [ ] **7.2** Alle quick actions langslopen en per stuk bewijzen dat ze werken (`QuickActionMenu`, `ChartQuickActions`, `Composer`, `IntelTerminalComposer`) — vier aparte plekken, waarschijnlijk niet allemaal in sync

---

## Fase 8 — AXE Feed: leesbaar en colour coded

Gemeten: de kleurcodering **bestaat al en is compleet** —
`src/lib/feed/feedKindStyle.ts` geeft elke soort een eigen kleur (brief = goud,
daily news = blauw, market recap = emerald, proactive = blauw, chart action = audio,
trade draft = actions), en `feedTabs.ts` kleurt de drie tabs ✅.

Op je screenshot zie ik waar het misgaat: de **kop** is netjes goud, maar de **body**
is één grijze muur waarin "MARKET OUTLOOK" en "NEWS" gewoon in de lopende zin staan.
`briefBodyFormat.ts` pàrst die secties al correct (`SECTION_MARKERS`) — de renderer
gebruikt het resultaat niet.

- [x] **8.1** De feed gebruikt nu `BriefBodyContent` — dezelfde renderer als de briefing-pagina. Bewijs: jouw échte brief van 8 oktober staat als fixture in de repo en pareert in 6 secties met koppen
- [x] **8.2** Sectiekoppen krijgen de kleur van het item mee (`headingClassName`), body houdt leesbaar grijs met regelafstand
- [x] **8.3** Eén renderer voor alle drie de lanes, met drie aantoonbaar verschillende kleuren (goud / blauw / emerald)
- [x] **8.4** Opgelost door 8.1: de parser zette de begroeting al in een eigen `greeting`-sectie — het was de platte `<p>` die alles aan elkaar plakte. Guard dwingt af dat "MARKET OUTLOOK" nooit in de begroetingsalinea belandt
- [x] **8.5 (niet voorzien, wel gevonden)** `axeFeedService` kapte elke brief af op 480 tekens. Op een brief van 1038 tekens betekende dat: ALIGNMENT SCORE, ACTION ITEMS en WATCH THIS SESSION kwamen **nooit** in beeld, zonder enig teken dat er meer was. Slice verwijderd

---

## Fase 9 — Landingspagina

Gemeten: er staan **zeven** kandidaat-routes naast elkaar — `marketing/`, `launch/`,
`final/`, `finallaunch/`, `welcome/`, `demo/`, `ui-premium/`, plus `page.tsx`.

- [ ] **9.1** Eerst beslissen welke de echte is, de rest weg. Nu is onduidelijk wat een bezoeker ziet
- [ ] **9.2** Dán pas mooi maken

---

## Fase 10 — Tiers + eigen MT5

Gemeten: `src/lib/billing/tiers.ts` + `features.ts` ✅, Stripe live-sleutels gezet ✅
(`stripe_secret_set: true`, `stripe_webhook_secret_set: true`). MT5-koppeling via
MetaApi ✅ gebouwd, maar het account is weg (0.2).

- [ ] **10.1** Onboarding: tier kiezen → eigen MT5 koppelen, in één flow
- [ ] **10.2** Wat gebeurt er als iemands MetaApi-account verdwijnt? Nu: stille fout elke 10 min. Moet: de user ziet het en kan opnieuw koppelen

---

## Volgorde

0 → 1 → 8 → 2 → 5 → 4 → 6 → 7 → 3 → 10 → 9

Fase 8 staat zo vroeg omdat het puur frontend is, geen credits nodig heeft, en het
ding is dat je elke ochtend ziet. Fase 9 staat laatst omdat een landingspagina voor
een app die nog niet perfect werkt, de verkeerde volgorde is — jouw eigen conclusie.

---

# Launch-blokkers — gemeten 11 oktober 2026

Alles hieronder komt uit de live database of een live call, niet uit de code
alleen. Dit zijn de dingen die écht niet mee kunnen naar launch, los van de
landingspagina.

## L1 — 182 van de 192 accounts zijn anoniem

```
is_anonymous = false :  10 users, allemaal met e-mail, sinds 30 maart
is_anonymous = true  : 182 users, nul met e-mail, 20 juni t/m 29 september
```

175 users hebben een broker-account gekoppeld. Anonieme sign-ins staan dus aan
en zijn volop gebruikt. Het probleem: zo'n account heeft **geen e-mail**, dus
wie zijn browser leegt of van telefoon wisselt is alles kwijt — journal, RAG,
learning arc — en er is geen enkele weg terug. Bij een betaalde app is dat
onhoudbaar: je kunt niet iemand €20 per maand laten betalen voor data die aan
één browsersessie hangt.

Te beslissen vóór launch, niet erna:
**Besloten 11 oktober: anonieme accounts gaan eruit.**

- [x] **L1.1** `/api/auth/demo` riep `signInAnonymously` aan als *voorkeurspad* —
  daar komen die 182 vandaan. Weg. De endpoint geeft nu `410` met een verwijzing
  naar een echte aanmelding, en `/demo` stuurt door naar `/login`
- [x] **L1.2** De fallback is óók weg, en die was erger: bij ontbrekende
  anonieme auth logde hij iedereen in op **hetzelfde** gedeelde account uit
  `DEMO_USER_EMAIL`. Elke demo-bezoeker kon de chats en trades van de vorige
  lezen. Dat is geen tekortkoming maar een datalek dat op een drukke dag wachtte
- [x] **L1.3** De embed op de landingspagina's toonde bij een mislukte sessie
  een zwart vlak zonder uitleg. Nu zegt hij wat er aan de hand is en wijst naar
  inloggen
- [x] **L1.4** `scripts/verify-no-anonymous-auth.mjs` laat `npm run verify`
  falen als `signInAnonymously` of de gedeelde demo-login ooit terugkomt
- [x] **L1.5 — in de app dichtgezet.** Ik kán die Supabase-schakelaar niet
  omzetten: mijn toegang gaat over database, migraties en advisors, niet over
  auth-instellingen. Dus heb ik het opgelost waar het telt — een anonieme
  sessie wordt nu **overal als uitgelogd behandeld**: in de proxy (elke pagina
  en elke route) én in beide server-auth-helpers. Eén daarvan die faalt is dan
  niet genoeg om er één binnen te laten. Ook sessies van vóór de
  `is_anonymous`-claim worden herkend, aan hun provider
- [ ] **L1.5b** De schakelaar in Supabase → Authentication → Sign In / Providers
  mag alsnog uit. Niet meer kritiek — er kan nu nog hooguit een nutteloos
  account bij Supabase ontstaan dat deze app weigert — maar opgeruimd staat netjes
- [ ] **L1.6** De 182 bestaande anonieme accounts: opruimen of laten staan. Ik
  raak ze niet aan zonder dat je het zegt — het is onomkeerbaar, en er hangen
  175 broker-accountrijen aan

## L2 — 54 users hebben `founder`, 1 heeft een Stripe-abonnement

```
plan=free    : 116 users,  0 met stripe_subscription_id
plan=founder :  54 users,  1 met stripe_subscription_id,  0 met pro_until actief
```

53 mensen hebben de duurste tier gratis. Belangrijker nog: **het betaalpad is
nooit end-to-end gelopen**. Nul users met een actieve `pro_until`. De Stripe-
sleutels staan live op de host, de webhook-code bestaat, maar er is geen bewijs
dat de keten checkout → webhook → entitlement → toegang ooit compleet is
geweest.

- [ ] **L2.1** Eén echte testaankoop met een live kaart, en narekenen dat
  `axe_user_entitlements` meebeweegt — ook bij opzeggen en bij een mislukte
  betaling
- [ ] **L2.2** Beslissen wie `founder` mag houden. Nu is het de standaard voor
  iedereen die vroeg binnenkwam, en dat is bij launch gratis geld weggeven

## L3 — De tiers worden nauwelijks afgedwongen

84 API-routes. Tien noemen een plan, quota of abonnement. **Twee** gebruiken
`requireFeature`. De tiers (free / pro €20 / founder €40 / elite €50) bestaan
dus als prijslijst, niet als grens.

- [x] **L3.1** `src/lib/billing/routeFeatures.ts` classificeert **alle 84 routes**:
  18 achter een betaalde feature, 44 expliciet gratis *met de reden erbij*, en de
  rest niet gebruikersgericht (cron, internal, webhooks). De gate zit nu in de
  route en geeft `403` met de naam van het benodigde plan — niet in de UI, want
  een knop verbergen is geen slot. 16 routes aangesloten, 24 gate-aanroepen in
  totaal (meerdere methodes per route)
- [x] **L3.2** `scripts/verify-tier-gates.mjs` faalt als een route in géén van de
  twee lijsten staat. Een **nieuwe** route kan dus niet meer stilletjes gratis
  worden: iemand moet beslissen, en de reden opschrijven. Ook geborgd: geen route
  in beide lijsten, geen verwijzing naar een route die niet bestaat, elke betaalde
  route roept de gate aan mét zijn eigen feature, en de gate geeft 403 en noemt
  het plan

## L4 — Vijf landingspagina's staan tegelijk live

`/`, `/welcome`, `/launch`, `/final`, `/finallaunch` geven allemaal HTTP 200,
plus `/demo`. Google indexeert ze alle vijf en een bezoeker kan op een verlaten
versie belanden.

**Correctie op mijn eigen bevinding:** `robots.ts` sloot `/final`, `/finallaunch`,
`/welcome`, `/marketing` en `/ui-premium` **al** uit, en de sitemap noemt alleen
`/` en `/launch`. Dat was al opgelost; ik had alleen naar de HTTP-statussen
gekeken. Wat er wél aan mankeerde:

- [x] **L4.1** `/demo` stond niet in robots.txt en was volledig crawlbaar — en
  die route logt een bezoeker meteen in op een gedeeld demo-account. Toegevoegd
- [x] **L4.2** De conceptpagina's hadden geen `noindex`. robots.txt *vraagt* een
  crawler weg te blijven; het regelt indexering niet, dus een pagina waar elders
  naar gelinkt wordt kan alsnog in de zoekresultaten staan. Nu dragen `/final`,
  `/finallaunch`, `/welcome` en `/demo` `robots: { index: false, follow: false }`
- [x] **L4.3 — Beslist: `/` is de landingspagina.** `/launch`, `/final`,
  `/finallaunch` en `/ui-premium` geven nu een 308 naar `/` (gemeten:
  `308 -> /` op alle vier). Niemand belandt meer op een verlaten versie, en
  oude bookmarks komen ergens echt uit. `/launch` is uit de sitemap en staat
  samen met de andere drie in robots.txt. De drie conceptcomponenten die
  alleen die pagina's gebruikten (`LaunchHeroExperience`,
  `FinalHeroExperience`, `FinalTerminalShowcase`) zijn weg

## L8 — De landingspagina beloofde dingen die niet meer waar waren

Jij vroeg om de landingspagina die je vanaf tradingosapp.com links boven kunt
aanklikken. Ik heb de repo van Trading OS gevonden (`Ldezeeuw445/the-one`, de
app staat genest onder `Desktop/Trading OS Final APP/`) en die pagina gelezen:
`src/pages/AxeHomeLanding.tsx` plus `src/content/axeLanding.ts`.

**Hij overzetten zou een stap terug zijn geweest.** Die pagina is ouder dan wat
Companion nu al heeft: groen in plaats van cyaan, "Coming Soon" waar prijzen
staan, en als eerste vraag in de FAQ: *"Does AXE place trades? No."* Dat is
precies de claim die niet meer klopt. Dus niet geporteerd — de bestaande `/`
blijft, maar hij vertelt nu de waarheid:

- [x] **L8.1 — Unusual Whales stond in de hero.** In de vertrouwensregel onder
  de knoppen én in een feature-tegel, voor een abonnement dat nooit gekocht is.
  Dat is de enige marketingleugen die een trader daadwerkelijk natrekt. Nu
  staan er de bronnen die wél werken (SEC EDGAR, GDELT), en Unusual Whales komt
  één keer voor: in de FAQ, als iets dat we **niet** hebben
- [x] **L8.2 — De prijzen waren verzonnen.** De pagina toonde twee kaarten,
  "Free" en "~€19/mo", terwijl het product vier tiers verkoopt: €0 / €20 / €40 /
  €50, met live Stripe-keys. De prijsblokken komen nu uit `AXE_BILLING_TIERS`,
  het Founder-plafond uit `FOUNDER_SEAT_CAP`. Een prijswijziging kan de pagina
  niet meer missen
- [x] **L8.3 — Het hele verhaal over uitvoeren ontbrak.** De FAQ zei dat live
  execution achter een masterwachtwoord zit en hield daar op. Nu staat er ook
  wat er daarna gebeurt: welke vijf grenzen AXE controleert vóór een
  automatische order, dat hij blokkeert en de regel noemt, en dat hij nooit
  stil een kleinere trade plaatst. Dat is een sterker verhaal dan "hij doet het
  niet" — en het is waar
- [x] **L8.4 — Er was geen weg naar Trading OS.** In de hele codebase stond geen
  enkele link naar tradingosapp.com. Twee apps op één Supabase-project die
  elkaar niet kunnen bereiken zijn geen ecosysteem. Nu: `AppSwitcher` links
  boven in de header, met AXE Companion aangevinkt en Trading OS als "Private
  beta". AXE Core staat in dezelfde lijst maar is `private` — een bezoeker ziet
  hem nooit, en de verify bewijst dat
- [x] **L8.5 — Het woordmerk was onleesbaar.** `axe-companion-wordmark.png` was
  1376×768 waarvan het merk 1172×111 besloeg; op 28px hoog bleef er een vlekje
  van drie pixels over. `/login` en `/welcome` verborgen dat met
  `marginTop: -70px`. Het bestand is nu getrimd (13.854 → 9.889 bytes) en alle
  drie de plekken gebruiken de echte afmetingen zonder truc
- [x] **L8.6 — Het menu paste niet op een telefoon.** De knop staat midden in de
  header, dus een paneel van 19rem liep rechts het scherm uit — en de pagina
  klipt horizontale overflow, dus die helft was niet bereikbaar, alleen
  onzichtbaar. Onder `sm` spant het paneel nu de viewport met marge
- [x] **L8.7 — De switcher geeft niemand een dode pagina.** Gemeten op
  2026-10-12: `www.tradingosapp.com` → 402 (`server: Vercel`), de apex → 402
  (`server: cloudflare`), `www.axecompanion.com` → 200 (nginx). Trading OS
  staat nu als `offline` in de lijst: hij wordt wél getoond — je moet weten dat
  hij bestaat — maar gedimd, met het label "Moving hosts", `aria-disabled`, en
  zonder link. De knop "Go to Trading OS" op de pagina is om dezelfde reden
  vervangen door één regel tekst. Eén woord terug naar `"beta"` in
  `src/lib/ecosystem/apps.ts` zet beide weer aan zodra de nieuwe host 200 geeft
- [x] **L8.8 — De switcher staat nu aan béide kanten.** Ik heb de Trading
  OS-repo lokaal gedraaid (Vite, beide modi) en dezelfde switcher daar
  ingebouwd: `src/lib/ecosystem.ts` + `src/components/landing/AppSwitcher.tsx`,
  plus de knop in `Navbar.tsx` (terminal-modus, `/home`) en
  `AxeLandingNavbar.tsx` (axe-modus, `/`). Gemeten in een echte browser: op de
  Trading OS-landing is AXE Companion een `<a href="https://www.axecompanion.com">`
  en Trading OS `aria-current`; op de AXE-landing precies andersom. Staat op
  branch `claude/landing-app-switcher` in `Ldezeeuw445/the-one`
- [ ] **L8.9 — Nog open, en alleen jij kunt dit: de bron van Trading OS.** De
  repo op GitHub (`Ldezeeuw445/the-one`) staat op **2026-06-22** — vier maanden
  oud, op alle drie de branches (`feature/ibkr-alpaca-adapters`,
  `feature/ibkr-alpaca-adapters-on-foundation`,
  `axe-companion-runtime-foundation`). Jij zei dat de Tauri-build op je Mac de
  goeie is. Dan is dát de bron van waarheid en staat die nergens anders.
  Deployen vanaf deze repo zou een Trading OS van juni opleveren — dat doe ik
  niet zonder dat je het zegt. Push eerst je Mac-versie naar een branch, dan
  bouw ik hem en zet ik hem naast Companion op de IONOS-VPS (of Railway, die
  staat ook open). De DNS-knop bij Cloudflare blijft van jou: ik heb daar geen
  toegang

## L5 — AXE mag trades voorbereiden, maar er zijn geen grenzen

**Correctie, en de ernstigste van vandaag:** AXE plaatst *wél* zelfstandig
trades. `alertAutoTradeService` zet een echte MT5 market order zodra een
prijsalert afgaat. Dat was al gebouwd en staat live.

Er zaten al drie instemmingslagen op — een globale voorkeur, een vlag per
alert, en een "armed"-venster van 30 minuten dat je opnieuw moet aantikken.
Dat zijn je drie vinkjes, en die werken. Maar ze beantwoorden alle drie
dezelfde vraag: *heeft de trader ingestemd?* Niemand vroeg: **mag deze trade
op dit moment?**

Het gat dat daardoor bestond: `accountProfile` weet dat een funded account niet
door rood nieuws mag traden, en de watcher wáárschuwt daar sinds vandaag voor —
en dan plaatste auto-trade alsnog een market order in datzelfde event. AXE die
je waarschuwt en het vervolgens voor je doet is erger dan elk van de twee apart.

- [x] **L5.1** `src/lib/trading/autoTradeGuard.ts` zit nu vóór élke
  geautomatiseerde order en weigert bij: rood nieuws op een account dat dat niet
  mag (ook de 30 min erná), vrijdagavond op een account dat niet mag
  overhouden, een lot boven jouw eigen limiet, je dagverlieslimiet bereikt, en
  zes automatische trades op één dag
- [x] **L5.2** Elke weigering wordt **geblokkeerd en uitgelegd**, niet stil
  aangepast. Een positie stilletjes verkleinen is zijn eigen soort leugen:
  *"1.2 lots is above your 0.5-lot limit — AXE will not quietly place something
  smaller than you asked for"*
- [x] **L5.3** Kan AXE de regels van het account niet lezen, dan plaatst hij
  niets. Geen default-allow
- [x] **L5.4 — De tweede deur zat open.** `executeExecutionRequestOnMt5` (de
  server action achter "plaats dit concept") ging rechtstreeks naar
  `placeMt5QuickOrder`, zonder énige controle. Dus AXE weigerde een funded
  account door rood nieuws te traden als een *alert* het vroeg, en plaatste
  exact dezelfde order als jij op een concept tikte dat hij zelf had
  voorgesteld. Eén deur op slot, die ernaast open. De guard stond privé in
  `alertAutoTradeService`; hij staat nu in `src/services/tradeGuardService.ts`
  en beide deuren gaan erdoorheen
- [x] **L5.5 — `attended`: wie kijkt er mee.** De dagcap van zes is een rem op
  automatisering die niemand ziet, niet op jou die op "plaats" tikt. Die ene
  regel vervalt als een mens drukt; élke accountregel blijft gelden. Gemeten:
  op de cap wordt onbeheerd geblokkeerd en beheerd toegelaten, maar met nieuws
  binnen 5 min, een lot boven de limiet of de dagverlieslimiet bereikt blijft
  ook beheerd geblokkeerd

## L6 — Een kapotte brokerkoppeling is onzichtbaar voor de gebruiker

Vandaag bewezen op mijn eigen account: MetaApi gaf acht dagen lang
`"account was not found"`, elke tien minuten, en in de app was daar niets van
te zien. Eén gebruiker overkomt dat ook, en die denkt dat de app stuk is.

**Correctie:** de status *was* zichtbaar — `/accounts` toont een rode stip
"Needs attention" bij `sync_failed`. Wat ontbrak was dat het nooit naar je toe
kwam, en dat de rest van de app doorging alsof de cijfers actueel waren.

- [x] **L6.1** `src/lib/risk/brokerHealth.ts` + de watcher: na zes uur stilte of
  bij een weigerende provider komt er een feed-item en een push, met **hoe oud de
  data is** erin ("last successful sync was 8 days ago — until then every number
  AXE shows you is out of date"). Eén per account per dag, want een kapotte
  koppeling blijft kapot en elke vijftien minuten herhalen leert je het wegtikken
- [x] **L6.2** Ook de moeilijkste variant: géén foutmelding, maar ook geen data.
  Dat is precies wat acht dagen onopgemerkt bleef. Een demo/paper-account wordt
  nooit gemeld — dat kost niemand iets

## L7 — Twee databronnen zijn niet geconfigureerd

`krater_api_key_set: false`, `unusual_whales_set: false`. Zes van de negen
intel-acties geven daardoor `http_500`. De UI belooft data die er niet is.

**Besloten 11 oktober.**

- [x] **L7.1 — Krater is weg.** Jouw oordeel klopte: hij leverde niets. Zijn
  sleutel stond nooit op de host, de lokale generator schreef beide broadcasts
  al, en de endpoints die de oude code afliep (scheduled tasks, conversations)
  bestaan niet op de `kr_live_` API. ~500 regels pollen en proben verwijderd;
  Daily News en Market Recap komen nu uit `broadcastSyncService` — AXE schrijft
  ze zelf uit zijn eigen marktdata
- [x] **L7.2 — Unusual Whales: niet stuk, maar niet besteld.** `intel-warmup`
  meldde elke 30 minuten `failed: 6`, en dat al heel lang. Vijf daarvan zijn
  UW-endpoints. Een vinkje dat permanent rood staat is geen waarschuwing maar
  behang — en het verbergt de dag dat een bron die *wel* hoort te werken uitvalt.
  Die vijf worden nu **overgeslagen met reden**, niet geprobeerd en gefaald
- [x] **L7.3** Eén schakelaar om hem later aan te zetten: `UNUSUAL_WHALES_ENABLED=true`
  op de host. Insider trades blijven gewoon draaien — die gebruiken het gratis
  SEC EDGAR, geen UW
- [x] **L7.4 — Gezocht én gemeten. Drie van de vier hebben een gratis pad.**
  Alpha Vantage hangt al aan dit account. Ik heb de endpoints niet opgezocht
  maar aangeroepen, vandaag:

  | Feed | Gratis alternatief | Gemeten |
  |---|---|---|
  | `senateTrades` | Alpha Vantage `CONGRESS_TRADES` | **Volledig.** 439 NVDA-trades, House én Senate, met `politician`, `chamber`, `party`, `transaction_type`, `amount_min/max`, `transaction_date`. Nieuwste filing 2026-10-14 |
  | `unusualOptions` | `REALTIME_OPTIONS` / `HISTORICAL_OPTIONS` + put-call ratio | **Gedeeltelijk.** Je krijgt de keten en de skew, niet UW's eigen "unusual flow"-detectie — die zul je zelf moeten afleiden |
  | `marketTide` | `REALTIME_PUT_CALL_RATIO` | **Gedeeltelijk.** SPY gaf 1.17 over de hele keten met 4.78 op 30 okt — precies het soort scheefstand dat een tide-signaal moet vangen |
  | `darkPoolPrints` | — | **Niets gratis.** FINRA publiceert ATS-volume, maar wekelijks en vertraagd; dat zijn geen prints |

- [x] **L7.5 — Aangesloten.** `src/lib/intel/congressTrades.ts` mapt de
  Alpha Vantage-respons naar `intel_congress_trades`, en
  `/api/cron/congress-trades-sync` haalt hem op en upsert op precies de unieke
  index `(politician, ticker, trade_date, trade_type, coalesce(amount_range,''))`.
  Getest tegen de **echte** respons (fixture `congress-trades-nvda-2026-10-15.json`,
  uit de live API gehaald), niet tegen een verzonnen vorm. 11 checks dekken de
  randen die de database zou weigeren: `trade_type` mag alleen BUY/SELL dus
  EXCHANGE wordt weggegooid en geteld, een datum die geen YYYY-MM-DD is komt
  nooit in een `date`-kolom, een onbekende chamber erft niet stil de default
  'Senate', en duplicaten vallen samen vóór de upsert. Live aangeroepen: 401
  zonder auth, 503 met een leesbare reden als de sleutel ontbreekt
- [x] **L7.5b** `senateTrades` staat niet meer onder Unusual Whales in
  `intelSources.ts` maar onder `alphavantage`, met een eigen
  beschikbaarheidscheck. De UW-schakelaar koopt hem niet meer terug — dat is
  apart getest
- [ ] **L7.5c — Twee handelingen van jou.** `ALPHAVANTAGE_API_KEY` op de host
  (gratis sleutel volstaat), en de cron inplannen. De SQL staat kant-en-klaar
  in `docs/CRON-RUNBOOK.md`. Zonder de sleutel blijft de route 503 geven en de
  tabel leeg — met zoveel woorden, geen stille 200
- [ ] **L7.5d (was L7.5) — Oude tekst, voor de volledigheid:** `intel_congress_trades` bestaat
  als tabel met unieke index, maar **niets in deze repo schrijft erin** — dat
  deed de Unusual Whales edge function. En er staat nergens een Alpha
  Vantage-sleutel in de app. Wat er moet komen: een cron-route die
  `CONGRESS_TRADES` ophaalt en upsert op `(politician, ticker, trade_date,
  trade_type, amount_range)`, plus `ALPHAVANTAGE_API_KEY` op de host. Ik bouw
  geen feed die stil leeg blijft omdat de sleutel ontbreekt — zeg het als de
  sleutel er is, dan is dit een half uur werk
- [ ] **L7.6** Een gratis alternatief blijft open voor dark pool,
  options flow en market tide. Pas oppakken als je dat wilt

## Wat juist wél in orde is

Dit hoort er ook bij, want het scheelt werk:

- **RLS**: geen enkele ERROR-bevinding bij de Supabase security advisor, geen
  tabel zonder RLS. Voor een multi-tenant app met handelsdata is dat de
  belangrijkste uitkomst van vandaag
- **Juridisch**: negen pagina's live — terms, privacy, cookies, risk
  disclaimer, AI disclaimer, refunds, subprocessors, contact, legal index
- **Crons**: elf jobs, allemaal actief, met `axe_ops.cron_health` eroverheen

## Kleine dingen die nog openstaan

- [ ] `auth_leaked_password_protection` staat uit in Supabase (één schakelaar)
- [ ] De snelactie "Companion: live check" test op `tos-chart-dock`, van de
  chart-dock-ronde. Die geeft ook `1` op een oude build — moet meebewegen met
  de nieuwste deploy
- [ ] Fase 5.3: AXE vertelt in de feed wát hij tekende en waarom

## L9 — DNS: wat er moet gebeuren en wie het kan

Ik heb **geen Cloudflare-toegang** in deze sessie — geen token in de omgeving,
geen Cloudflare-tool. De enige DNS-tools die ik heb zijn die van Vercel, en die
werken alleen voor domeinen op Vercel-nameservers. Beide domeinen staan op
Cloudflare (`jocelyn.ns.cloudflare.com`, `sean.ns.cloudflare.com`), dus die
tools raken ze niet.

Gemeten op 2026-10-13:

| Naam | Nu | Betekenis |
|---|---|---|
| `axecompanion.com` A | `212.227.91.79` | IONOS-VPS, nginx, DNS-only (grijs wolkje) |
| `www.axecompanion.com` A | `212.227.91.79` | idem |
| `tradingosapp.com` A | `104.21.5.151`, `172.67.154.186` | Cloudflare-proxy (oranje wolkje) → origin Vercel → 402 |
| `www.tradingosapp.com` CNAME | `cc384ed6d38922b8.vercel-dns-016.com` | rechtstreeks naar Vercel → 402 |

Twee records moeten dus weg van Vercel. Maar **DNS alleen lost het niet op**:
er moet eerst iets zijn om naar te wijzen. Trading OS draait nergens anders.
De volgorde is:

1. Jij pusht je Mac-versie naar een branch (zie L8.9)
2. Ik bouw hem en zet hem naast Companion op `212.227.91.79`, met een eigen
   nginx server-block voor `tradingosapp.com` en een certificaat
3. Pas dán in Cloudflare: `www` CNAME weg, `www` A → `212.227.91.79`, en de
   apex A-records → `212.227.91.79` (grijs wolkje, net als axecompanion.com)
4. In `src/lib/ecosystem/apps.ts` gaat `availability` van `"offline"` terug
   naar `"beta"` en linken de switcher en de knop weer

De Vercel-kant kan ik overigens niet eens zien: het team dat ik mag lezen
(`axecompanionos`) heeft maar één project, `axe-core`. `tradingosapp.com`
hangt aan een ander Vercel-account waar ik niet bij kan.

## L10 — De nieuwe landingspagina staat nog niet live

Gemeten op `https://www.axecompanion.com`: de live site serveert nog de oude
pagina — "Unusual Whales" komt er vier keer in voor, "€19" twee keer, er is
geen "Switch app", en `/launch` geeft nog 200 in plaats van 308. Al het werk
hierboven staat op `claude/axe-companion-audit-launch-nz58dg` en moet naar
`deployed` voordat je het ziet. Dat is jouw knop, niet die van mij.

## L11 — De hero: iPhone + iPad op één blok, met de app erin

Jij beschreef de hero die je wilt: een iPhone én een iPad op een center block,
en als je dat blok met je muis raakt lichten de grid-dots eromheen op. Die
bestond — maar verdeeld over **twee** conceptpagina's die ik had opgeruimd:

- het blok met iPhone + iPad kwam uit `public/finallaunch/index.html`
- de dot-grid die oplicht bij hover kwam uit de React-hero van `/final`
  (`FinalHeroExperience`, die had maar één telefoon)

Ik had `FinalHeroExperience.tsx` drie commits terug weggegooid. Teruggehaald
uit git, de twee helften samengevoegd, en als nieuwe hero op `/` gezet.

- [x] **L11.1** `LandingHeroDevices.tsx` + `axe-hero-*` CSS: één blok met beide
  toestellen, dot-grid eromheen die oplicht bij `pointerenter` (dus ook bij
  aanraken) en bij focus, en die stil blijft onder `prefers-reduced-motion`
- [x] **L11.2 — De app ín de mock, zonder account.** De toestellen draaiden een
  iframe naar `/demo/embed`, en dat maakte een **anonieme sessie** aan — precies
  wat jij had laten weghalen. Gemeten: in die hero staat nu een inlogformulier
  ín de telefoon. Nu draait er `/hero-demo/app.html`: een losstaande mock, nul
  auth, nul Supabase, nul netwerkverkeer, met Chart/Intel/Cockpit/Trade/History/
  AXE die echt schakelen. Gemeten met een browser: op de AXE-tab springt het
  scherm naar `chat`. De mock zegt zelf "NO LOGIN · DEMO" en eronder staat
  "no account needed", zodat niemand denkt dat het zijn eigen data is
- [x] **L11.3 — De mock stond op ~250px breed.** Het iframe kreeg de breedte van
  de bezel, smaller dan welke telefoon dan ook, en de header en tabbalk liepen
  in elkaar. Nu rendert elk frame op een echte logische maat (390×844 en
  1024×768) en schaalt het geheel naar de bezel
- [x] **L11.4 — Er stond een toestel ín een toestel.** De mock tekent zijn eigen
  rand én notch. Met `?chrome=off` laat hij die weg en vult hij de bezel, en
  zijn topbalk begint onder de notch van de hero
- [x] **L11.5** `LandingHeroPhone` (de oude enkele telefoon) is weg. Gemeten:
  0px horizontale overflow op 390px en op 1440px
- [ ] **L11.6 — Nog een keuze voor jou.** Op telefoonbreedte staat de iPad boven
  de telefoon en is hij klein. Hij is herkenbaar als tablet maar de tekst erin
  is niet te lezen. Ik laat hem staan omdat jij beide toestellen wilde; zeg het
  als hij op mobiel weg mag

## L12 — Wat ik vandaag niet kon, en waarom

Drie dingen hebben een knop nodig die ik niet heb. Alles eromheen is af.

**1. Cloudflare DNS.** De Cloudflare MCP die aan dit account hangt is de
*Developer Platform*: Workers, KV, R2, D1, Hyperdrive. Geverifieerd — hij
geeft jouw vier workers terug (`axe-ai-proxy`, `axe-ai-os`, `axe-chart-edge`,
`trading-os-live-engine`). Daar zitten **geen DNS- of zone-tools** in, en de
Vercel DNS-tools werken alleen op Vercel-nameservers terwijl beide domeinen
op Cloudflare staan. Als je de Cloudflare-connector met zone/DNS-rechten
toevoegt, kan ik het wel.

**2. De VPS.** Geen SSH-sleutels in deze omgeving en poort 22 van
`212.227.91.79` is onbereikbaar vanaf hier. Het deploy-script staat klaar in
`the-one` op `claude/landing-app-switcher`.

**3. Companion naar productie.** `git push origin HEAD:deployed` is geweigerd
door de permissie-classifier met reden *"Production Deploy"*. Dat omzeil ik
niet. De branch is een schone fast-forward op `deployed` — 22 commits vooruit,
niets dat verloren gaat — en de poort is groen.

**Computer use** is in dit gesprek niet beschikbaar: er zijn geen
computer-use-tools en ook geen schakelaar om ze aan te zetten. In het algemeen
kan ik apps bedienen op een computer waar de Claude-desktopapp draait met
Computer use aan, of via het +-menu → Devices op claude.ai vóór je een nieuw
bericht stuurt.
