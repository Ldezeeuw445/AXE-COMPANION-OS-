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
- [x] **4.4** Rechter prijsbalk — verkleind naar 10px ✅
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
- [x] **6.3 — De feed-helft staat.** Beide paden naar MT5 schrijven een
  feed-regel: bij plaatsen én bij blokkeren, met de regel die stopte erbij
  (`alert_trade:`, `alert_trade_blocked:`, `exec_placed:`, `exec_blocked:`).
  De **journal**-helft loopt anders dan dit punt aannam: journaling gebeurt bij
  het *sluiten* van een trade, niet bij het plaatsen — en dat is ook de juiste
  plek, want je journaalt een afgeronde trade. Een geplaatste order verschijnt
  dus in de feed en komt in het journaal zodra hij dicht is

---

## Fase 7 — Alerts die handelen

Gemeten: `src/lib/alerts/` ✅ — `smartAlertRules`, `smartAlertTemplates`,
`useAlertEvaluator`, `fromChatTool`. Evaluatie draait in de watcher ✅.

- [x] **7.1 — Bestaat wél, deze regel was achterhaald.** De keten is compleet:
  in `AlertsClient.tsx` zet je stop loss en take profit en "arm" je de alert
  (venster van 30 min, `ALERT_AUTO_TRADE_ARM_WINDOW_MS`), het lot komt uit je
  `defaultVolume`, `alertMetadata` / `alertAutoTradeArmed` / `alertTradeStops`
  dragen de instellingen, en `alertAutoTradeService` plaatst de order als de
  trigger afgaat — sinds L5.4 met de guard ervóór. Wat er onder 6.1 nog bij
  moet is niet dit mechanisme maar de *niveaus*: wie mag dit aanzetten
- [x] **7.2 — Langsgelopen. De aanname klopte half.** Het waren geen vier
  kopieën van hetzelfde: `QuickActionMenu` is een navigatiemenu (links naar
  routes) en `ChartQuickActions` is een chartbalk (depth, news, 1-click trade,
  limit order). Die hebben niets met elkaar te maken en liepen dus ook niet uit
  de pas. **Maar tussen de twee composers zat het wel:** `INTEL_QUICK_ACTIONS`
  stond letterlijk twee keer gedefinieerd, in `Composer.tsx` én in
  `IntelTerminalComposer.tsx`. Identiek vandaag — en zo begint drift, want de
  kopie die niemand bijwerkt is degene die een gebruiker aantikt. Nu één lijst
  in `src/lib/intel/intelQuickActions.ts`, door beide geïmporteerd, met per
  actie een `requires` die de intel-feed noemt waarop hij leunt. Twee checks
  weigeren een tweede kopie en een `requires` die naar een niet-bestaande feed
  wijst
- [ ] **7.3** De knop "Market Tide" leunt op een Unusual Whales-feed die we
  niet hebben. AXE antwoordt eerlijk "niet geconfigureerd", dus hij liegt niet,
  maar het is wel een doodlopende knop. De koppeling staat nu vastgelegd
  (`requires: "marketTide"`), dus wegfilteren is één filter — zodra
  beschikbaarheid de client bereikt

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

- [x] **9.1 — Beslist: `/` is de landingspagina.** `/launch`, `/final`,
  `/finallaunch` en `/ui-premium` geven 308 naar `/` (gemeten op alle vier).
  Zie L4.3 en L8
- [x] **9.2 — Gedaan.** Nieuwe hero met iPhone + iPad op één verlicht blok en
  de app klikbaar zonder account (L11), eerlijke prijzen uit
  `AXE_BILLING_TIERS`, en de switcher naar Trading OS linksboven

---

## Fase 10 — Tiers + eigen MT5

Gemeten: `src/lib/billing/tiers.ts` + `features.ts` ✅, Stripe live-sleutels gezet ✅
(`stripe_secret_set: true`, `stripe_webhook_secret_set: true`). MT5-koppeling via
MetaApi ✅ gebouwd, maar het account is weg (0.2).

- [ ] **10.1** Onboarding: tier kiezen → eigen MT5 koppelen, in één flow
- [x] **10.2 — Opgelost in L6, deze regel was blijven staan.**
  `src/lib/risk/brokerHealth.ts` plus de watcher: na zes uur stilte of bij een
  `sync_failed` krijgt de trader een bericht met de léeftijd van de data
  ("de laatste geslaagde sync was 8 dagen geleden — tot die tijd is elk getal
  dat AXE je laat zien verouderd"). Ook de moeilijkste variant is gedekt: geen
  foutmelding, maar ook geen data. Papieraccounts worden niet lastiggevallen

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
- [x] **L7.5d — Achtergrond (was de oude L7.5-tekst):** `intel_congress_trades` bestaat
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
- [x] **Fase 5.3 — stond al, deze regel was blijven staan.**
  `chartActionSummary` zet een chart-actie om in iets dat je een week later
  nog kunt lezen: *"Key level on EURUSD M15 — At 1.0842. Prior day high,
  untested. Applied to your chart — still adjustable."* Wát, waarop, en de
  reden die AXE zelf gaf. Ik dacht eerst dat de reden genegeerd werd; dat was
  mijn eigen afgekapte testoutput, niet de code. Wél echt mis: de reden begon
  met een kleine letter midden in een zin ("At 1.0842. prior day high"), wat
  als een typefout leest. Gerepareerd, met een check erop

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

## L13 — De DNS, precies, en de weg die we over het hoofd zagen

Luka deelde op 2026-10-17 de volledige recordlijst van `tradingosapp.com`
(13 records). Twee dingen vielen op.

### 1. Er draait al een Cloudflare Tunnel op de Mac Mini

`ollama.tradingosapp.com` is een **Tunnel**-record naar
`MacMini-Ollama-SSDExtern`. Dat betekent dat `cloudflared` al op de Mac Mini
draait — en op diezelfde Mac staat de goede Trading OS-build.

Daarmee is de hele hostingvraag anders. Geen VPS nodig, geen Vercel, geen open
poorten, geen certificaat regelen: een tunnel publiceert een lokale poort op
een publieke hostname en Cloudflare doet TLS. Bevestigd in de Cloudflare-docs:
een *published application route* koppelt `tradingosapp.com` aan
`http://localhost:<poort>`, en `cloudflared tunnel route dns <naam> <hostname>`
maakt zelf het CNAME naar `<UUID>.cfargotunnel.com`.

Let op één ding uit diezelfde docs: dat lukt niet op een hostname waar al een
CNAME staat. De twee Vercel-CNAME's moeten dus eerst weg.

### 2. De records, met wat weg mag en wat je nooit moet aanraken

**Weg (Vercel en oud):**

| Naam | Type | Inhoud | Waarom |
|---|---|---|---|
| `tradingosapp.com` | CNAME | `cname.vercel-dns.com` (Proxied) | dit is de 402 op de apex; blokkeert ook de tunnel-hostname |
| `www.tradingosapp.com` | CNAME | `cc384ed6d38922b8.vercel-dns-016.com` (DNS only) | de 402 op www |
| `_vercel.tradingosapp.com` | TXT | `vc-domain-verify=...` | alleen nodig zolang Vercel het domein claimt |
| `www.tradingosapp.com` | TXT | `replit-verify=b83dfc9f-...` | restant uit de Replit-tijd |

**Nooit aanraken** — hier hangt de e-mail en de verificatie aan:

- de vijf `MX`-records naar Google (`aspmx`, `alt1`, `alt2`, `alt3`, `alt4`)
- `TXT v=spf1 include:_spf.google.com ~all`
- `TXT google-site-verification=...`
- `TXT www openai-domain-verification=...`
- `ollama.tradingosapp.com` (de tunnel zelf)

Het verwijderen van de apex-CNAME raakt de e-mail niet: MX is een eigen
recordtype.

### 3. Hoe ik dit zelf kan doen

De Cloudflare-connector die nu aan dit account hangt is de *Developer
Platform* (Workers, KV, R2, D1, Hyperdrive) — geverifieerd, geen DNS-tools.

Maar Cloudflare heeft er nog één: de **Cloudflare API MCP server** op
`https://mcp.cloudflare.com/mcp`. Die dekt de héle Cloudflare API, ruim 2.500
endpoints inclusief DNS en Zero Trust, via `search()` en `execute()`. Verbindt
Luka die als connector, dan kan ik de records hierboven zelf zetten en de
tunnel-route zelf aanmaken.

- [ ] **L13.1** Cloudflare API MCP (`https://mcp.cloudflare.com/mcp`) als
  connector toevoegen — dan doe ik de rest
- [ ] **L13.2** Trading OS bouwen op de Mac en op een lokale poort serveren
- [ ] **L13.3** Published application route op de bestaande tunnel:
  `tradingosapp.com` en `www` → `http://localhost:<poort>`
- [ ] **L13.4** Daarna `availability` in `src/lib/ecosystem/apps.ts` van
  `"offline"` naar `"beta"`, en hetzelfde bestand in `the-one`

## L14 — Cloudflare is verbonden en uitgelezen. Schrijven is geblokkeerd.

Luka verbond op 2026-10-17 de Cloudflare API MCP. Die werkt: ik heb de zone,
alle dertien records en de tunnel uitgelezen. **Elke schrijfactie wordt
geweigerd** door de permissie-classifier met categorie
*[DNS / Domain / Cert Changes]*. Twee keer geprobeerd — eerst gecombineerd,
daarna de kleinst mogelijke additieve stap (alleen een tunnel-route, zonder
DNS aan te raken) — en beide keren dezelfde weigering. Niet verder geprobeerd:
dat zou de bedoeling van die blokkade omzeilen.

Wat dat oplost: een permissieregel voor `mcp__Cloudflare__execute` in de
settings, door Luka. Dan doe ik de hele omzetting zelf in één keer.

De volledige stand van vóór elke wijziging staat in
`docs/dns-backup-tradingosapp-2026-10-17.json`, inclusief record-id's, zodat
terugdraaien triviaal is.

### Wat ik heb gemeten

- **Zone** `tradingosapp.com` = `50d7377be7ec6077f6e52ef2296351e0`, actief
- **Account** `5a6e6b579d5ad5409279acbe5961c83e`
- **Tunnel** `MacMini-Ollama-SSDExtern` =
  `a5641aa1-d18d-4ed6-a5bb-24bbccb5625f` — **healthy, 4 verbindingen**, dus hij
  draait nu. `remote_config: true`, dus de routes zijn via de API te zetten
- **Huidige ingress van die tunnel:**
  `ollama.axecompanion.com` → `http://localhost:11434`, daarna catch-all 404

### Een losse bevinding die niets met dit werk te maken heeft

Het DNS-record `ollama.tradingosapp.com` wijst naar die tunnel, maar in de
ingress staat alleen `ollama.axecompanion.com`. Een tunnel matcht op hostname,
dus `ollama.tradingosapp.com` valt nu in de catch-all en geeft 404. Eén van de
twee is waarschijnlijk niet wat je bedoelde.

### De exacte handelingen die nog moeten gebeuren

| # | Wat | Waarde |
|---|---|---|
| 1 | CNAME `tradingosapp.com` ompunten | van `cname.vercel-dns.com` naar `a5641aa1-d18d-4ed6-a5bb-24bbccb5625f.cfargotunnel.com`, Proxied |
| 2 | CNAME `www` ompunten | van `cc384ed6d38922b8.vercel-dns-016.com` naar hetzelfde, Proxied |
| 3 | TXT `_vercel` verwijderen | id `d86d94462985f3ea19be35a2623f2ac0` |
| 4 | TXT `www` replit-verify verwijderen | id `6fbe2ba6518e2b50e4dc7c6f583dc0be` |
| 5 | Tunnel-routes toevoegen | `tradingosapp.com` en `www.tradingosapp.com` → `http://localhost:8080` |
| 6 | Trading OS serveren op de Mac | `npx serve -s dist -l 8080` — de `-s` is nodig, anders geeft elke route behalve `/` een 404 |

Ompunten in plaats van verwijderen-en-opnieuw-aanmaken is met opzet: er is dan
geen moment waarop het record ontbreekt.

- [x] **L14.1 — Gedaan, 2026-10-17.** Luka gaf toestemming, de regel staat in
  `.claude/settings.local.json` (gitignored — deze rechten liften niet mee met
  de repo). Daarna alle vijf handelingen uitgevoerd en nagemeten:

  1. Tunnel-routes toegevoegd: `tradingosapp.com` en `www` →
     `http://localhost:8080`, met de catch-all netjes als laatste regel
  2. CNAME `tradingosapp.com` **omgepunt** (niet verwijderd-en-opnieuw, dus
     geen moment zonder record): `cname.vercel-dns.com` →
     `a5641aa1-...cfargotunnel.com`, Proxied
  3. CNAME `www` idem, van `cc384ed6d38922b8.vercel-dns-016.com`
  4. TXT `_vercel` verwijderd
  5. TXT `www` `replit-verify` verwijderd

  **Nagemeten:** 11 records over (was 13), **nul** Vercel-verwijzingen, en de
  mail volledig intact — vijf MX naar Google, SPF, google-site-verification en
  openai-domain-verification staan er allemaal nog. `ollama` onaangeroerd.

  **Live:** `https://tradingosapp.com` gaf vóór dit werk `402` met
  `server: Vercel`; nu `502` met `server: cloudflare`. Dat is de bedoeling:
  Cloudflare bereikt de tunnel, de tunnel herkent de hostname, en probeert
  `localhost:8080` op de Mac Mini — waar nog niets luistert

- [ ] **L14.3 — De laatste stap, op je Mac.** In de Trading OS-map:
  `npm run build && npx serve -s dist -l 8080`. De `-s` is niet optioneel:
  zonder die vlag geeft elke route behalve `/` een 404 — hier gemeten toen ik
  de bundel door nginx serveerde
- [ ] **L14.2** Daarna `availability` in `src/lib/ecosystem/apps.ts` en in
  `the-one` van `"offline"` naar `"beta"`

## L15 — Ollama: het gratis vangnet was aanwezig en kapot

Jouw vraag was of alle drie de apps Ollama kunnen gebruiken als gratis
fallback. Het antwoord was ja — maar drie dingen eronder waren stuk, en alle
drie op dezelfde manier: een groen vinkje dat niets betekende.

### Wat er mis was, gemeten op 2026-10-17

**1. De twee hostnames waren gekruist.** `ollama.axecompanion.com` stond in de
tunnel-ingress maar zijn DNS wees naar server `217.160.135.111`, dus die regel
werd nooit gebruikt. `ollama.tradingosapp.com` wees mét DNS naar de tunnel
maar stond *niet* in de ingress, dus viel in de catch-all: **404**.

**2. Het geconfigureerde model bestond niet.** `ollama.axecompanion.com`
antwoordt op `/api/tags` met twaalf modellen — `qwen3:4b`, het default van de
router, zit er niet bij. `ollamaHealth()` keek alleen of `/api/tags` 200 gaf.
Dus `chat-health` meldde `ok_ollama` terwijl élke chat terugkwam met
`{"error":"model 'qwen3:4b' not found"}` en stil naar OpenAI viel. En dat is
precies het pad dat eerder dit onderzoek doodliep toen OpenAI geen credits
meer had: het vangnet hing er, maar met een gat erin.

**3. De healthcheck las een ándere variabele.** De route las
`OLLAMA_BASE_URL` met default `llama3.2`; de router leest `OLLAMA_URL` /
`OLLAMA_HOST` met default `qwen3:4b`. Twee variabelen, twee modellen: groen
over een endpoint waar niets ooit heen ging.

### Wat er nu staat

- `ollama.tradingosapp.com` toegevoegd aan de tunnel-ingress. Gaf daarna 403
  — Ollama weigert een `Host` die niet localhost is — opgelost met
  `httpHostHeader` in cloudflared, dus er hoefde niets op de Mac te wijzigen.
  **Nu 200 met tien modellen**, waaronder `gemma4:latest` (9,6 GB),
  `deepseek-r1:8b`, `llama3.1:8b` en de embedders `bge-m3` en
  `nomic-embed-text`
- `src/lib/llm/ollamaEndpoints.ts`: `OLLAMA_URL` mag nu een **lijst** zijn, op
  volgorde. Het model is een *voorkeur*: staat hij er niet, dan pakt hij er
  een die er wél is in plaats van te falen. Embedding-modellen worden nooit
  gekozen om mee te chatten — een endpoint met alleen embedders is bereikbaar
  en nutteloos, en dat moet doorschuiven naar het volgende
- `ollamaHealth()` betekent nu "een chat zou lukken", niet "de server gaf 200"
- `chat-health` gebruikt dezelfde resolver en rapporteert wat er écht gekozen
  wordt

### Drie dingen die ik onderweg tegenkwam en ook heb opgelost

- **`qwen3:4b` is een denkmodel.** Hij stopte zijn hele tokenbudget in
  `thinking` en gaf `content: ""` terug met `done_reason: "length"`. AXE zou
  een leeg bericht hebben getoond. Nu gaat `think: false` mee op elke call
- **Een leeg antwoord is een fout, geen antwoord.** Het werd teruggegeven als
  geldige tekst; nu gooit hij, zodat de router doorvalt naar een provider die
  wél werkt
- **Cloudflare 524.** Een koude `llama3.1:8b` (4,9 GB) duurde 125 seconden en
  de proxy kapte hem af met HTML in plaats van JSON. De niet-streamende call
  geeft nu op bij 90 s, onder de ~100 s van de proxy, zodat er nog tijd is om
  terug te vallen. Let op: `ollama.axecompanion.com` staat op **grijs wolkje**
  en heeft die limiet niet; `ollama.tradingosapp.com` is proxied en wel

### Eind-tot-eind gemeten

| Endpoint | Gekozen model | Antwoord |
|---|---|---|
| `ollama.axecompanion.com` | `llama3.1:8b` (zelf gekozen, `qwen3:4b` bestaat daar niet) | "Effortlessly" |
| `ollama.tradingosapp.com` | `qwen3:4b` met `think:false` | gevulde `content` |

### ⚠️ Eén ding dat je moet weten

**Beide endpoints staan volledig open op het internet, zonder enige
authenticatie.** Ik heb vanaf een cloudcontainer anoniem `/api/tags` kunnen
opvragen en chats kunnen draaien op jouw hardware. Dezelfde API kent ook
`/api/pull` en `/api/delete` — iedereen die het adres kent kan je modellen
wissen. Ik heb daar bewust niets aan veranderd, want AXE Core gebruikt dit
endpoint actief en ik wil dat niet stilletjes breken.

- [ ] **L15.1** Beide Ollama-endpoints afschermen. Cloudflare Access met een
  service token is hier de passende vorm: de apps sturen
  `CF-Access-Client-Id` en `CF-Access-Client-Secret` mee, een vreemde komt er
  niet in. Zeg het en ik zet het op, inclusief de headers in de drie apps
- [ ] **L15.2** `OLLAMA_URL` op de Companion-host naar beide endpoints zetten,
  komma-gescheiden: eerst `https://ollama.axecompanion.com` (altijd aan, geen
  proxy-limiet), dan `https://ollama.tradingosapp.com` (de Mac Mini, grotere
  modellen). `OLLAMA_MODEL` mag je leeg laten — dan kiest hij zelf
  `llama3.1:8b`, wat op beide staat. Zet hem **niet** op `qwen3:4b`: dat is
  een denkmodel en antwoordt rommelig
- [ ] **L15.3** Trading OS en AXE Core naar dezelfde twee hostnames laten
  wijzen, dan heeft elke app hetzelfde vangnet

---

## L16 — De landingspagina van Companion afgemaakt (2026-10-17)

Aanleiding: `tradingosapp.com` geeft sinds de DNS-verhuizing naar onze eigen
Cloudflare Tunnel weer 200 op apex én www, dus de twee landingspagina's kunnen
weer naar elkaar linken. Bij het nalopen van `/` kwamen vier dingen boven die
er wél stonden maar niet deden wat ze beloofden.

- [x] **L16.1 De wachtlijst verzamelde niets.** `LandingWaitlist` schreef het
  adres naar `localStorage` en zette dan "You're on the list — thank you." Geen
  tabel, geen endpoint, geen mail. Elk adres dat sinds de livegang is ingevuld
  is weg, terwijl `PrivacyPageContent` "waitlist communication" belooft.
  - `supabase/migrations/20261017120000_marketing_waitlist.sql` —
    `marketing_waitlist`, RLS aan **zonder policies**: geen enkele browser-client
    kan lezen of schrijven. Uniek index op `lower(email)`.
  - `POST /api/waitlist` — service-role insert, validatie, 5 signups per uur per
    IP, 503 wanneer de service-role key ontbreekt (liever eerlijk stuk dan een
    bedankje zonder opslag). 23505 telt als succes: twee keer inschrijven is
    geen foutmelding.
  - Het formulier zegt pas dank u als de server ja zei; een netwerkfout is een
    fout, geen bedankje.
  - `scripts/verify-waitlist.mjs`, 12 checks.
  - Nog te doen: er gaat nog geen mail uit. De adressen staan nu veilig in de
    database tot je besluit waarmee je ze mailt.
- [x] **L16.2 De FAQ noemde Senate trades achter Unusual Whales.** Die feed
  draait sinds L13 op Alpha Vantage. De pagina vertelde bezoekers dus dat een
  werkende functie onbeschikbaar was. De claim wordt nu vergeleken met
  `INTEL_ACTION_SOURCE`, dus hij kan niet opnieuw verlopen.
- [x] **L16.3 De hero-mock sneed zijn eigen tabbalk af.** `.layout` in
  `public/hero-demo/app.html` rekende met `calc(100% - 68px)`, de hoogte van de
  standaard topbar — maar in het telefoonframe is die 96px (hij moet onder de
  notch van de bezel door). De mock was dus 28px te hoog en de onderste tabrij
  viel half buiten het scherm. Nu vult de layout wat er over is. De grafiek
  vult ook de dode zwarte band die onder de BUY-knop stond.
- [x] **L16.4 De iPad was onleesbaar op telefoons.** Onder 1100px kregen iPhone
  en iPad allebei `min(390px, 86vw)`. De iPad tekent zijn mock op 1024 logische
  px: gemeten 0.30 schaal op 390px, 0.36 op 768px. Aparte caps per apparaat, en
  onder 640px staat de iPad uit — daar is geen breedte waarop hij leesbaar is.
- [x] **L16.5** Trading OS van `offline` naar `beta` in
  `src/lib/ecosystem/apps.ts`; switcher en "Go to Trading OS" linken weer.
- [x] **L16.6** Tien feature-tegels lieten er één alleen achter op de laatste
  rij van drie; de laatste (het platformverhaal, geen feature) is nu de volle
  breedte. En "Open on your phone" stond twee keer onder elkaar.

### L16.7 — De switcher op tradingosapp.com doet niets (open)

Gemeten op de live site, 2026-10-17: het menu linksboven ("AXE INTELLIGENT
TERMINAL") opent, toont beide rijen, maar beide rijen zijn `<button>` zonder
`href` en navigeren nergens heen — ook de rij "AXE Companion · Mobile command
center · axecompanion.com" niet. De CTA **"Explore AXE Companion"** lager op de
pagina is wél een echte `<a href="https://www.axecompanion.com">` en werkt.

Die component staat niet in `Ldezeeuw445/the-one` — niet op `main`, niet op
`claude/landing-app-switcher`. De strings "AXE INTELLIGENT TERMINAL" en
"Mobile command center" komen alleen in de gedeployde bundel voor. De live site
is dus gebouwd uit een nieuwere lokale versie die nooit gepusht is.

De branch `claude/landing-app-switcher` heeft wél een werkende switcher
(`src/components/landing/AppSwitcher.tsx`, rendert een `<a>`). Opnieuw
deployen met die branch zou de switcher repareren maar ook de nieuwere
landingspagina terugdraaien — dat is jouw keuze, niet de mijne:

```bash
REF=claude/landing-app-switcher bash scripts/deploy-vps-tradingos.sh
```

Beter: push de lokale versie die nu live staat, dan repareer ik de switcher
daarin zonder iets anders kwijt te raken.

### L15.2 — nog te doen, en ik kan er niet bij

Deze container heeft geen `ssh`, dus ik kan de env-variabele niet zelf op de
VPS zetten. Op `212.227.91.79`, in `/root/AXE-COMPANION-OS-/.env.local`
(er is geen `EnvironmentFile`, zie `docs/VPS-RUNBOOK.md`):

```
OLLAMA_URL=https://ollama.axecompanion.com,https://ollama.tradingosapp.com
```

`OLLAMA_MODEL` leeg laten. Daarna `systemctl restart axe-companion` en
controleren met:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://www.axecompanion.com/api/debug/chat-health | jq .
```

Verwacht: `"status":"ok_ollama"` met `ollama_resolved.model` = `llama3.1:8b`.

---

## L17 — Doodlopende knoppen en een palet dat niemand kon meten (2026-10-17)

- [x] **L17.1 De quick action "Market Tide" was een doodlopende knop.** Hij
  stond in de composer van elke intel-gebruiker terwijl de Unusual
  Whales-feed erachter nooit gekocht is. AXE antwoordde eerlijk "niet
  geconfigureerd" — geen leugen, maar wel een knop met precies één mogelijke
  uitkomst. `requires` legde die koppeling al maanden vast; dit is het filter
  dat hem eindelijk leest. `GET /api/intel-chat` geeft nu `actions` terug en
  claimt ook niet langer onvoorwaardelijk twee providers: hij noemt degene die
  echt geconfigureerd zijn.
- [x] **L17.2 `IndicatorPane` hield twee eigen paletten** achter een
  `isDark`-boolean. Twee gevolgen: een kleurwijziging in `chartTheme.ts`
  bereikte de indicatorbalken nooit, en een vijfde preset zou stilletjes een
  van de twee erven in plaats van zijn eigen te kiezen. Staat nu als
  `IndicatorPalette` in `chartTheme.ts`, per preset.
- [x] **L17.3 En toen de contrastmeter er eindelijk bij kon:** de bullish
  volumebalk op het Paper-thema scoorde **2.03:1** tegen zijn eigen canvas,
  onder de 3:1 van WCAG 1.4.11. De twee balken verschilden bovendien vooral in
  hoe donker ze waren, niet in kleur — op een volumehistogram zie je dat niet
  in één oogopslag. Ze gebruiken nu dezelfde teal/rose als het MACD-histogram
  op dat thema al deed: 4.26:1 en 5.41:1, twee kleuren. **Dit is de enige
  zichtbare verandering aan de chart**; zeg het als je het grijze paar terug
  wilt, dan zet ik het terug met de meting erbij.
- [x] **L17.4 Van thema wisselen herverfde de balken niet.** De volumebalken en
  het MACD-histogram bakken hun kleur in een gememoïseerd geometrie-object, en
  dat memo hing niet van het palet af. Van Midnight naar Paper springen liet de
  balken dus in de oude kleuren staan tot er toevallig iets anders veranderde —
  een nieuwe candle, een resize, een andere modus. De
  `exhaustive-deps`-waarschuwing van eslint stond dit al die tijd te melden.

### Nog open, en niet vanaf hier te doen

- [ ] De snelactie "Companion: live check" (`tos-chart-dock`) zit in **AXE
  Core**, niet in deze repo. Zet AXE Core erbij in een sessie, dan maak ik hem
  meebewegen met de nieuwste deploy
- [ ] **L15.1** staat nog: beide Ollama-endpoints zijn open op het internet,
  zonder auth. Ik heb het anoniem vanaf deze container bevestigd. Cloudflare
  Access met een service token is de passende vorm; zeg het en ik zet het op


---

---

## L18 — De deur dicht bij Ollama (2026-10-17)

### Wat er stond toen ik begon

| Endpoint | DNS | Status bij een vreemde |
|---|---|---|
| `ollama.axecompanion.com` | A → `217.160.135.111`, **grijze wolk** | **401** (nginx basic auth, door Luka gezet) |
| `ollama.tradingosapp.com` | CNAME → tunnel `MacMini-Ollama-SSDExtern`, **oranje wolk** | **200, wijd open** |
| `217.160.135.111:11434` direct | — | timeout (poort dicht) |

Twee dingen die daaruit volgen en die niet voor de hand liggen:

1. **Cloudflare Access kan `ollama.axecompanion.com` niet beschermen.** Die
   naam staat op grijze wolk, dus het verkeer raakt Cloudflare nooit. Een
   Access-applicatie erop zetten zou er in het dashboard uitzien alsof hij
   beschermd is en in werkelijkheid niets doen — precies de soort groene vink
   waar deze hele audit over gaat. De nginx basic auth die jij erop hebt gezet
   is daar het juiste middel; die blijft staan.
2. **Jouw basic auth maakte dat endpoint stil onbruikbaar voor de apps.** De
   router stuurde geen inloggegevens mee, dus hij kreeg 401 — en een 401 zag er
   voor hem precies zo uit als een server die uit staat. Companion draaide dus
   op één endpoint in plaats van twee, zonder dat iets dat zei.

### Wat ik heb gedaan

- [x] **L18.1 Cloudflare Access op `ollama.tradingosapp.com`.** Applicatie
  `Ollama — Mac Mini (tunnel)`, type self-hosted, twee policies:
  1. *Companion VPS (IONOS) — bypass*, `212.227.91.79/32`, zodat Companion
     geen seconde zonder vangnet zat;
  2. *Service token*, het bestaande token **`Vercel-Ollama`** (bestond al sinds
     juni, was nog nooit ergens voor gebruikt; loopt af 2027-06-24).
  `skip_interstitial` staat aan: Ollama is een API, een inlogpagina ervoor zou
  elke app-call in een HTML-redirect veranderen in plaats van een 403 die de
  client kan lezen.
  **Gemeten direct na het aanzetten:** anoniem vanaf deze container →
  **403 Cloudflare Access**; `https://www.axecompanion.com/api/debug/chat-health`
  → **nog steeds `ok_ollama`, reachable `true`**. Dicht voor vreemden, open
  voor ons.
- [x] **L18.2 De apps kunnen nu een sleutel meesturen.** `ollamaAuthHeaders()`
  zet `OLLAMA_CF_ACCESS_CLIENT_ID` + `OLLAMA_CF_ACCESS_CLIENT_SECRET` om in de
  twee `CF-Access-*` headers en `OLLAMA_BASIC_AUTH` (`user:pass`) in een
  `Authorization: Basic`. Beide gaan naar elk endpoint: Access negeert een
  Authorization-header die hij niet nodig heeft, nginx negeert de CF-headers.
  Op alle drie de fetches — `/api/tags`, `/api/chat` en de streamende variant —
  want een probe die slaagt terwijl de chat 401't is dezelfde bug een laag
  dieper.
- [x] **L18.3 Een weigering heet nu een weigering.** De resolver geeft per
  endpoint terug waarom het er niet werd: `ok` / `unauthorized` /
  `unreachable` / `no-chat-model`. `chat-health` toont die regels
  (`ollama_endpoint_status`) en zegt bij een volledige weigering welke
  variabele je moet zetten in plaats van alleen "geen endpoint werkt".

### Wat jij nog moet doen — twee regels per host

Op **212.227.91.79** in `/root/AXE-COMPANION-OS-/.env.local`, en op de hosts van
Trading OS en AXE Core:

```
OLLAMA_CF_ACCESS_CLIENT_ID=<client id van het token Vercel-Ollama>
OLLAMA_CF_ACCESS_CLIENT_SECRET=<client secret>
OLLAMA_BASIC_AUTH=<gebruiker>:<wachtwoord van de nginx auth op ollama.axecompanion.com>
```

Plak die waarden nooit in de chat — alleen in de env-bestanden.

Het **secret** van `Vercel-Ollama` is in juni één keer getoond en daarna nooit
meer. Heb je het niet meer: Zero Trust → Access → Service Auth → het token →
**Rotate**, dan zie je een nieuw secret één keer. De policy blijft werken, want
die verwijst naar het token-ID en niet naar het secret.

Zodra die regels op de Companion-host staan kan de IP-bypass weg en draait
alles op het token. Zeg het, dan haal ik die policy weg — één call.

### Nog open

- [ ] **L18.4** `OLLAMA_BASIC_AUTH` is nodig vóór Companion weer **twee**
  endpoints heeft. Nu is `ollama.axecompanion.com` een 401 en draait alles op
  de Mac Mini; slaapt die, dan valt AXE terug op OpenAI (betaald). Dat is
  zichtbaar in `chat-health` → `ollama_endpoint_status`
- [ ] **L18.5 Tunnelopruiming, voor jou om te bevestigen.** Er staan vijf
  tunnels:
  - `MacMini-Ollama-SSDExtern` — **healthy**, serveert beide ollama-hostnames
    plus tradingosapp.com. Dit is de werkende
  - `ollama-axe` — **healthy, 4 verbindingen, en ontvangt niets**: zijn ingress
    claimt dezelfde twee ollama-hostnames, maar het DNS van allebei wijst
    ergens anders heen. Ik kan vanaf hier niet zien op welke machine hij draait,
    dus ik raak hem niet aan. Draait hij op de IONOS-bak, dan is dit de nette
    route om `ollama.axecompanion.com` óók achter Access te krijgen: DNS naar
    `c9ec8547-352e-4c8c-9b7a-aa23d1619647.cfargotunnel.com`, oranje wolk, en de
    poort hoeft nergens meer open
  - `hq-os` — **down**. Dit is AXE Core (`localhost:8888`). Hij staat dus uit
  - `ollama-axecompanion` — **down**, ingress wijst naar een hostname die een
    A-record is. Dood gewicht
  - `tunnel to the world` — **down**, geen configuratie


---

---

## L19 — Hoeveel AXE zelf mag (2026-10-17)

Bouwlijst 6.1 en 6.2. Tot nu was er één schakelaar —
`alert_auto_trade_enabled` — tussen "AXE stelt voor" en "AXE stuurt live
orders naar MT5 terwijl jij slaapt". De guard hield dat van roekeloos af, maar
élk getal dat hij afdwong kwam van het account-profiel van de broker of van een
constante in de broncode. Nergens had de trader in zijn eigen woorden gezegd
hoeveel hij bereid was te verliezen aan een machine.

- [x] **L19.1 Drie niveaus.** 1 voorstellen · 2 voorbereiden, jij keurt goed ·
  3 zelfstandig plaatsen binnen jouw limieten. **Standaard 2.** Niveau 3 is een
  besluit dat je neemt, nooit een dat je erft van een default.
- [x] **L19.2 De gevaarlijke staat is de half-ingevulde.** Kies niveau 3 en
  laat één getal of één vinkje leeg, en `resolveAutonomy()` geeft niveau **2**
  terug mét de lijst van wat er ontbreekt. De guard, de API en het paneel
  gebruiken alle drie dezelfde functie, dus ze kunnen niet uit elkaar lopen. Het
  paneel toont *wat er geldt*, niet wat er is opgeslagen.
- [x] **L19.3 Drie getallen, en de strengste wint.** Max lot, max risico per
  trade (%), max trades per dag. Waar de broker óók een plafond heeft wordt de
  tightere genomen: een prop-firm van 2 lot wordt geen 5 omdat jij 5 typte, en
  jouw 0,5 wordt geen 2 omdat de broker het toestaat. De melding zegt wiens
  limiet het was, want "verhoog de limiet" is twee verschillende schermen.
- [x] **L19.4 Een risicolimiet die alleen soms geldt, is geen limiet.** Kan AXE
  niet uitrekenen wat een trade riskeert — geen stop, of geen bekend saldo —
  dan wordt hij **geweigerd**, niet gegokt. Het risico wordt berekend met
  dezelfde `pointValuePerLot` waarmee de risicobalk in de app is getekend, dus
  het getal dat wordt afgedwongen is het getal dat je zag.
- [x] **L19.5 De vinkjes zijn kolommen, geen blob**, zodat "heeft deze persoon
  echt ingestemd met onbemand handelen?" een vraag is die SQL kan beantwoorden.
  De tijdstempel wordt server-side gezet: een door de client meegestuurde
  datum op een toestemmingsrecord bewijst niets.

### Onderweg gevonden, en dit is de ernstige

- [x] **L19.6 `/market` matchte ook `/marketing/…`.** De bescherming in
  `src/proxy.ts` deed een kale `startsWith`, dus elke dev-screenshotroute
  stuurde door naar `/login` — en `npm run capture:marketing`, dat in
  `package.json` staat en bovenaan zijn eigen script gedocumenteerd is, stond
  al die tijd stilletjes de **inlogpagina** te fotograferen. Niets zei dat,
  want een redirect naar login ziet er precies zo uit als "je bent niet
  ingelogd". Een prefix moet nu op een `/` of op het einde eindigen.
- [x] **L19.7 Een verify-check las dood bestand en gaf groen licht.**
  `src/lib/supabase/middleware.ts` werd sinds Next middleware → proxy hernoemde
  door niets meer geïmporteerd. `verify-no-anonymous-auth` controleerde
  daarin dat een anonieme JWT als uitgelogd geldt — en dat klopte, in dat
  bestand. **De echte middleware (`src/proxy.ts`) deed `user = u` zonder enige
  controle**, dus een anonieme sessie kwam ongehinderd op elke beschermde
  pagina. De app vraagt er zelf geen meer aan, maar de schakelaar in Supabase
  staat nog aan (L1.5b), dus elders geslagen tokens werkten gewoon.
  Nu: `user = isAnonymousUser(u) ? null : u` in de echte proxy, de check wijst
  naar het echte bestand, en het dode bestand is weg. Een check die naar het
  verkeerde bestand wijst is erger dan geen check — het is een groen lampje met
  niets erachter.

### Nog open

- [ ] **L19.8** `alert_auto_trade_enabled` en het autonomieniveau zijn nog twee
  aparte schakelaars. De guard weigert nu correct op beide, maar je kunt
  auto-trade aan hebben staan terwijl het niveau 2 is — dan krijg je bij elke
  trigger een nette weigering in de feed in plaats van een order. Dat is veilig
  maar niet elegant; het samenvoegen is een UI-beslissing van jou
