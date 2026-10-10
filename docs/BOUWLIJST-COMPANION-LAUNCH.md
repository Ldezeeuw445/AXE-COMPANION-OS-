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
| 0.1 | **OpenAI heeft geen credits** | `intel-correlate` laatste run: `429 — "You have no credits remaining"`, 17 fouten/24u. `user-knowledge-sync`: zelfde fout op `distil:lessons` en `distil:preferences` | Geen auto-journal, geen correlaties, geen lessen-distillatie, geen learning loop. De hele "2e brein"-laag is dark |
| 0.2 | **MetaApi-account bestaat niet meer** | `mt5-sync`: `"The MetaApi account was not found. It may have been deleted in MetaApi."` — account `0364372e…`, elke 10 min | Geen nieuwe deals → geen trades → niets om te journalen, niets om van te leren |
| 0.3 | **Unusual Whales niet geconfigureerd** | `/api/debug/cron-health`: `unusual_whales_set: false`. `intel-warmup`: 6 van 9 acties `http_500` (insiderTrades, senateTrades, darkPool, unusualOptions, marketTide, gdelt) | AXE Intel mist tweederde van zijn bronnen |
| 0.4 | **Krater-key niet gezet** | `krater_api_key_set: false` | Daily news / market recap-bron |

**Nodig van jou (alleen jij kan dit):** credits op OpenAI, een nieuw MetaApi-account
koppelen, en of je Unusual Whales + Krater wilt betalen of die bronnen uit de UI
wilt halen. Zonder 0.1 en 0.2 is alles hieronder bouwen aan een auto zonder benzine.

**Wat ik wél bouw in deze fase:** falen zichtbaar maken. Nu meldt `autoJournalTrades`
vrolijk `ok: true, journaled: 0` als het model faalt — precies de stilte die ons twee
maanden heeft gekost volgens `docs/AUDIT_2026-09-07.md`.

- [ ] **0.5** Elke LLM-fout in journal/intel/briefing schrijft naar `axe_ops` én naar een zichtbare healthregel, niet alleen `console.error`
- [ ] **0.6** `/api/debug/cron-health` uitbreiden met: openai_credits_ok, metaapi_account_resolvable, laatste auto-journal-run
- [ ] **0.7** Fallback: journaling via `llmRouter` (ollama) i.p.v. hard OpenAI-only, zodat één lege rekening niet het hele brein uitzet

---

## Fase 1 — AXE journalt zelf (jouw #1 klacht)

Jouw woorden: *"axe moet zelf alle trades journalen, nu gebeurt het alleen als ik het eerst doe."*

Gemeten: `autoJournalTrades()` bestaat (`src/services/journalingService.ts:63`) en wordt
**al** automatisch aangeroepen na elke MT5-sync (`src/lib/mt5/syncCloudAccount.ts:397`).
Het is dus wél gebouwd. Waarom je het niet ziet:

1. MT5-sync faalt (0.2) → `dealsUpserted = 0`
2. De aanroep staat achter `if (shouldJournal && dealsUpserted > 0)` — geen nieuwe deals, geen journal
3. En als hij wél draait, faalt het model op geen credits (0.1) en wordt dat stil weggeslikt

- [ ] **1.1** Journal-trigger loskoppelen van `dealsUpserted > 0` — draai op *elke* gesloten trade zonder `axe_label`, ook als de sync niets nieuws vond
- [ ] **1.2** Een eigen cron `axe-journal-sweep` (elk uur) die achterstallige trades inhaalt, los van de sync
- [ ] **1.3** Zichtbaar in de UI: "AXE heeft 3 trades gejournald" i.p.v. stilte
- [ ] **1.4** **Per-user patroonherkenning** — jouw "wat gaat er het meest fout". `computeJournalAnalytics.ts` telt labels al; wat mist is de stap *van telling naar uitspraak*: "je laatste 9 verliezers waren allemaal binnen 4 min na een entry — je knijpt te vroeg. Voorstel: minimum-hold-regel." ❌ bestaat niet
- [ ] **1.5** Die uitspraak terug de RAG in, zodat de volgende journal hem meeweegt → dit ís de learning loop

---

## Fase 2 — AXE praat uit zichzelf (proactief, niet reactief)

Jouw woorden: *"er komt rood nieuws aan, ik zie dat je een funded account hebt en met nieuws niet mag traden."*

Gemeten: `src/services/axeProactiveWatcher.ts` bestaat, draait elke 15 min, en doet
**al** bijna precies dat — regel 134-152: high-impact event binnen 45 min + open posities
→ feed-item + push. ✅ Het fundament staat er.

Wat eraan mist t.o.v. jouw voorbeeld:

- [ ] **2.1** Account-type bewustzijn: funded/prop vs eigen geld. De regel vuurt nu alleen bij *open posities*; bij een funded account moet hij ook waarschuwen als je nog **geen** positie hebt — dat is juist het moment
- [ ] **2.2** Prop-firm regels als profielveld (news-ban, daily drawdown, max lot) en die meewegen in élke proactieve regel
- [ ] **2.3** De watcher pakt nu alleen users die een **push-subscription** hebben (`runAxeProactiveWatcher`, eerste bron). Wie push weigert krijgt nooit een proactief item. Dat moet los: feed-item altijd, push alleen bij toestemming
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

- [ ] **8.1** Feed-kaart rendert `BriefSection[]` i.p.v. platte tekst: elke sectie een eigen kop, witruimte, alinea's
- [ ] **8.2** Sectiekoppen in de kleur van het item, body in leesbaar grijs met echte regelafstand
- [ ] **8.3** Zelfde renderer voor alle drie de briefs — nu wijken daily news en market recap af
- [ ] **8.4** Weerzin wegknippen uit MARKET OUTLOOK: "Good morning Luka, partly cloudy" en "MARKET OUTLOOK" horen niet in dezelfde alinea

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
