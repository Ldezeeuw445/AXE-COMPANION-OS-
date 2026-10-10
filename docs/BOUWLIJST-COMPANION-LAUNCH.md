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
- [ ] **2.4** Meer regels: correlatie-waarschuwing (3 posities die hetzelfde risico zijn), sessie-overgang, swap-nacht, je eigen meest-gemaakte fout uit 1.4

---

## Fase 3 — Adaptive + learning arc zichtbaar

Gemeten: `src/lib/adaptive/profileEngine.ts`, `trackAdaptiveEvent.ts`, `eventTypes.ts`
✅ bestaan. `src/services/learningArcService.ts` + `CockpitLearningArc.tsx` ✅ bestaan.
`/api/adaptive/suggestions/[id]` ✅ bestaat.

Dus "hey dit gebruikt de user veel, zal ik dat standaard aanzetten" is **gebouwd**.
Te verifiëren zodra 0.1 is opgelost: of de arc daadwerkelijk groeit of op nul blijft staan
(`user-knowledge-sync` schreef vanmorgen `docsWritten: 0, chunksEmbedded: 0` —
"only 0 records (need 3)" voor trading-profile, omdat er geen trades binnenkomen).

- [ ] **3.1** Arc valideren met echte data zodra MT5 weer synct
- [ ] **3.2** Arc ook in Companion zelf tonen, niet alleen in cockpit — jij wilt *zien* dat hij meegroeit
- [ ] **3.3** AXE Intel een eigen arc geven (nu alleen Companion)
- [ ] **3.4** Vooruitdenken op strategie: de profileEngine kent gebruik, nog niet *strategie*. Playbook-herkenning uit trades → "jij traadt London open breakouts; vandaag is de range te smal"

---

## Fase 4 — Chart: MT5-gevoel, dark én light

Gemeten: `src/components/chart/chartTheme.ts` ✅ met 4 thema's, waarvan er 2 in de
toggler zitten (`midnight`, `paper`). `ChartThemeTogglerButton` ✅.
Indicatoren, annotaties, SL/TP-lijnen, trade-plan-lijnen ✅ bestaan allemaal.

- [ ] **4.1** `CHART_ORDER_BUY_COLOR` / `CHART_ORDER_SELL_COLOR` zijn **thema-onafhankelijke constanten** (`chartTheme.ts:193-194`) — die zijn op `paper` niet gegarandeerd leesbaar. Per thema maken
- [ ] **4.2** 3 hardgecodeerde hexen in `ChartIndicatorLayer.tsx` + `IndicatorPane.tsx` naar tokens
- [ ] **4.3** Contrast-check op beide thema's voor: prijslijn, SL, TP, entry, fib, elke indicator. Meten, niet kijken
- [ ] **4.4** Rechter prijsbalk — al verkleind naar 10px vorige ronde ✅
- [ ] **4.5** Bottom dock in elke combinatie — gebouwd vorige ronde ✅, nog door jou te bevestigen op de PWA

---

## Fase 5 — AXE op de chart (fib + indicators plaatsen)

Gemeten: `src/lib/axeChartActions/` ✅ compleet — bus, queue, guards, memory, swing-analyse,
indicator-mapping. `draw_fibonacci` ✅ werkt.

**Maar**: de herkenning is een **hardgecodeerde zinnenlijst** (`chartActionBus.ts:51-67`) —
"draw fib", "zet fib", "fib op de chart", 16 varianten. Zeg je het net anders, dan gebeurt er niets.

- [ ] **5.1** Van zinnenlijst naar **tool-calling**: het model kiest de actie, niet een `includes()`
- [ ] **5.2** Alle indicatoren uit de app beschikbaar als AXE-actie, niet alleen fib (jouw "alles wat de app kan moet AXE ook kunnen")
- [ ] **5.3** Terugkoppeling: AXE zegt wát hij tekende en waarom, als feed-item met `chart_action`-kleur

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
