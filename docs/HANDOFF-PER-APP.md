# Handoff per app — wat er nog moet gebeuren tot het echt af is

Geschreven 5 november 2026. Vervangt de managers-handoff van 09:40, die drie
fouten bevatte (zie "Correcties" onderaan).

Dit document gaat **per onderdeel**, want dat is hoe ze afgemaakt worden: niet
door overal een beetje, maar door er één tegelijk klaar te verklaren. Per
onderdeel staat er wat "af" betekent, wat er nog ligt, in welke volgorde, en
wie de volgende stap zet.

## Wat is wat — de indeling klopte eerst niet

Luka corrigeerde dit op 5 november, en het verandert de volgorde:

- **Twee commerciële producten met abonnementen:** AXE Companion (telefoon) en
  Trading OS (web/PWA). Dit zijn de dingen die geld opbrengen.
- **AXE Core is geen product.** Geen abonnementen, geen klanten. Het is Luka's
  commandocentrum, en — dit is het punt — **het is de fabriek die de andere
  twee afmaakt en onderhoudt.** Daarmee is het niet onderdeel nummer vier maar
  het onderdeel waar de andere twee van afhangen.
- **AXON Memory** is de geheugenlaag onder alles, geen losse app.
- **Northsea Desk is geen software.** Het is Luka's koperhandel; de managers
  doen daar de uitgaande acquisitie voor.

Dit document houdt de volgorde Companion → Trading OS → AXON → Core aan omdat
dat de volgorde is waarin ik ze heb kunnen meten, niet de volgorde van belang.
Op belang staat Core bovenaan.

## Hoe je dit leest

Elke regel is één van drie dingen, en die worden nooit door elkaar gehaald:

- **Gemeten** — ik heb het zelf nagekeken, met het commando of de query erbij.
- **Gemeld** — het komt uit een bericht van een manager en ik kon het niet
  controleren. Staat er expliciet bij.
- **Te meten** — het moet gecontroleerd worden en hoe dat moet staat erbij.

Een handoff waarin die drie door elkaar lopen is gevaarlijker dan geen
handoff, want dan vertrouw je een regel die niemand heeft nagekeken.

---

# 1. AXE Companion (axecompanion.com)

Dit is de app waar ik het meest van gemeten heb. De rest van dit document is
dunner, en dat staat erbij.

**Wat "af" betekent:** een retail-trader kan zich aanmelden, betalen, zijn
MT5- of Alpaca-rekening koppelen, op zijn telefoon handelen met de guard
ertussen, zijn journaal bijhouden, en AXE stelt vragen over zijn eigen
handel die kloppen. Alles wat op de verkooppagina staat bestaat ook. Als er
iets stukgaat, weet iemand het binnen tien minuten.

## 1.1 Wat er nu staat — gemeten

| | |
|---|---|
| Productie | `e67f376`, gelijk aan `main` |
| Tests | 207, allemaal groen |
| Typecheck | schoon |
| Verify-keten | groen, 835 checks |
| pg_cron | 19 jobs, allemaal actief, laatste run overal geslaagd |
| MT5-rekeningen | 6: 3 actief en gesynchroniseerd (laatste 09:10 vandaag), 3 op `sync_failed` sinds 25 juni |
| Alpaca-rekeningen | 39, paper |
| Deploy | push naar `main` is de deploy; VPS-cron pakt het binnen ~5 min |

## 1.2 De blokkade die alles raakt: GitHub

Staat uitgewerkt in `docs/VOOR-LUKA.md` punt 0e. Kort:

1. **Actions is geblokkeerd op accountniveau.** Bewijs in de repo zelf:
   commit `ab63e60` van 29 september 19:20 — *"do not add GitHub Actions
   while the account is locked … The new CI workflow failed immediately
   (billing lock)"*. De eerste dode run is van 19:18 diezelfde avond. **Alleen
   Luka:** github.com → Settings → Billing and plans.
2. **Er is daarnaast helemaal geen CI.** De drie workflows deployen alleen.
   Nul check-runs op `main`. PR #144 brengt er een terug.
3. **`npm run lint` kan niet falen.** Gemeten: kaal `eslint`, 192
   waarschuwingen, exit 0. Met `--max-warnings=0` exit 1. Lint zit niet in
   `npm run verify`. PR #146 repareert dit.
4. **Nog 3 openstaande PR's** (#144, #145, #146). Waren er 13; een andere
   sessie sloot er op 5 november elf, branches behouden. Alle drie wachten op
   een beslissing van Luka — zie `docs/VOOR-LUKA.md` punt 0e.
5. **219 branches** (gemeten vandaag). De Projects Manager meldde dat er 121
   verwijderd zijn; dat is niet terug te zien in dit getal.

## 1.3 Het gat dat niemand ziet

**Er gaat geen alarm af als productie achterloopt.** Op 30 oktober stond
productie 8 uur en 48 minuten stil op een favicon die de build brak. De
uptime-wacht draait elke twee minuten, maar vraagt "antwoordt de site?" — en
een oude build antwoordt met 200.

`scripts/watchdog.sh` stelt de goede vraag (vergelijkt productie met `main`)
maar draait nergens. **Alleen Luka:** die regel op de VPS zetten.

Let op voor wie dit bouwt: alarmeer op een *reeks* mislukkingen, niet op één.
Op 5 november faalden vier cronjobs tegelijk met `job startup timeout` — de
Postgres-cronworker die even niet kon starten, geen storing.

## 1.4 Werk dat klaarligt maar niet op het scherm zit

Drie rekenkernen zijn gebouwd, getoetst en aan niets gekoppeld:

- **Bar replay** (`src/lib/chart/replay.ts`) — 14 checks groen. Niet
  aangesloten. Half aansluiten is hier erger dan niet: een replay die de
  toekomst lekt is erger dan geen replay.
- **Positie-gereedschap** (`src/lib/trading/positionPlan.ts`) — 19 checks.
  Niet aangesloten.
- **Gestapelde timeframes** (punt 16) — zit wel in `ChartScreen`, maar achter
  `localStorage` sleutel `axe.chart.stackedBias` en zonder knop.

**Waarom ze blijven liggen:** `ChartScreen.tsx` is 5700 regels en een
cloud-sessie kan de app niet draaien (geen `.env.local`, de chart-pagina
redirect naar login). **Beslissing voor Luka:** mag een sessie die het scherm
niet kan zien hieraan beginnen? Zo ja, dan levert dat werk op dat jij daarna
moet nakijken. Zo nee, dan wacht het op iemand met een draaiende app.

## 1.5 Metingen die hier niet kunnen

- **M1 als timeframe** — of MetaApi `1m` teruggeeft voor deze brokers is
  alleen met een MetaApi-token te meten, en dat staat op de host.
- **`stopsLevel` per symbool** — daardoor staat `minDistance` van de trailing
  stop op `null`. Een gegokte ondergrens houdt een stop tegen die wel mocht;
  nu weigert de broker zelf wat te dicht staat, en dat komt als fout terug.

## 1.6 Openstaand dat alleen jij kunt

Uit `docs/BOUWLIJST-COMPANION-LAUNCH.md`, 12 punten:

| Punt | Wat |
|---|---|
| 4.5 | Bottom dock bevestigen op de PWA |
| L1.6 | 182 anonieme accounts: opruimen of laten staan |
| L2.1 | Eén echte testaankoop met een live kaart |
| L2.2 | Wie mag `founder` houden |
| L7.5c | `ALPHAVANTAGE_API_KEY` op de host |
| L7.6 | Gratis alternatief voor dark pool / options flow / market tide |
| L8.9 | De bron van Trading OS |
| L13.1 | Cloudflare API MCP |
| L15.3 | Hostnames voor Trading OS en AXE Core |
| L18.4 | `OLLAMA_BASIC_AUTH` |
| L18.5 | Tunnelopruiming |
| L19.8 | `alert_auto_trade_enabled` en autonomieniveau samenvoegen |

Plus: Supabase leaked-password-protection staat uit (één schakelaar), en
Railway `WORKER_URL` / `STREAMER_SECRET` voor de streamer.

## 1.7 Bewust niet opgepakt

Staan in `docs/AUTOPILOT.md` onder "Observaties". Elk kost meer dan het
oplevert zonder jou:

- **33 kwetsbaarheden in de wallet-stack.** `npm audit fix` lost ze op en
  breekt de typecheck op `WalletsAppKitProvider.tsx`. De echte weg is een
  major bump en daarna met een echte wallet verbinden.
- **`axeContextBuilder` filtert niet op `counts_as_evidence`.** Bewust: de
  laatste 25 trades zijn gespreksstof. Maar AXE baseert er wél uitspraken op.
  Nette oplossing: de herkomst meegeven, niet de rijen weglaten.
- **De cockpit telt oefentrades mee** in "je sloot N trades".
- **Alpaca krijgt geen live ticks** — 39 rekeningen op REST-bars.
- **Behavior map mist zijn twee telefoons.** De mockups tonen "Market Tide"
  (een Unusual Whales-bron die nooit gekocht is) en zes functies die niet
  bestaan. Nodig: twee nieuwe screenshots van schermen die alleen tonen wat
  er is.

## 1.8 Volgorde om Companion af te maken

1. **Billing** → Actions werkt weer.
2. **Eén workflow handmatig herstarten** en zien dat er stappen verschijnen.
3. **#146 mergen** → lint kan echt falen. Daarna lint aan `npm run verify`.
4. **#144**: eerst migratie toepassen, dán mergen. CI komt daarmee terug.
5. **De 9 oude drafts sluiten.**
6. **watchdog.sh op de VPS** → het stille-storingsgat is dicht.
7. **De 3 dode MT5-rekeningen**: opruimen of repareren (sinds 25 juni stuk).
8. Pas daarna: chart-werk aansluiten, M1, `stopsLevel`.

Punt 1 tot en met 6 zijn samen ongeveer een uur van jou en maken de app
onderhoudbaar. De rest is bouwwerk dat daarna veilig kan.

---

# 2. Trading OS (tradingosapp.com)

**Gemeld, niet door mij gemeten.** Ik heb alleen de repo `Ldezeeuw445/the-one`
ingezien voor de landingspagina.

- P12, P13, P14 live; `main` op `c2484c5b`; 618/618 tests
- Alleen MT5 DEMO, propose-only
- P15 (nieuws/kalender) nog niet gestart
- De routine wijst naar de oude repo `Ldezeeuw445/trading-os-app` in plaats
  van `TRADING-AXE-OS-APPS/TRADING-OS-`

**Wat "af" betekent:** dezelfde Supabase-bron als Companion, dezelfde login,
live execution in plaats van propose-only, en de datamodellen samengevoegd
(dat is wat Companion-PR #144 aan die kant mogelijk maakt).

**Te meten voordat dit af heet:**
- Draait `main` echt op de hostnames, of alleen de Mac? (`curl -s -o /dev/null
  -w '%{http_code}' https://tradingosapp.com`)
- Delen Companion en Trading OS al één `user_alerts` / `user_chart_states` /
  `axe_user_rules`, of wacht dat op #144?
- Werkt de auth-handoff (`/auth/handoff`, vandaag in Companion gemerged) ook
  vanaf de Trading OS-kant?

**Volgende stap:** routinetekst naar de juiste repo, P15 starten.

---

# 3. AXON Memory

**Gemeld, niet gemeten.**

- Backend live, PR #45–#48 gemerged, repo privé, 7 oude branches weg
- Frontend is nog de oude; daarin zit het oude secret, dus rotatie wacht
- **Geblokkeerd:** de Cloudflare-connector zit op het verkeerde account
  (hotmail `5a6e6b57…`) in plaats van op `78d47158…`, het account met
  axon-memory.com

**Wat "af" betekent:** nieuwe frontend live op axon-memory.com, secret
geroteerd, oude secret nergens meer, en Companion/Trading OS/Core schrijven
er alle drie naartoe.

**Volgende stap, alleen Luka:** opnieuw inloggen met het juiste
Cloudflare-account. Daarna: deploy, smoke-test, rotatie, en het nieuwe secret
in je AXON-GPT.

**Let op:** zolang het oude secret in de live frontend zit, is rotatie een
*breaking* actie. Deploy eerst, roteer daarna — niet andersom.

---

# 4. AXE Core (axeheadquarters.com) — de fabriek

**Deels gemeten op 5 november.** Repo `Ldezeeuw445/AXE-CORE-`, publiek.

| | |
|---|---|
| Default branch | **`orchestrator`**, niet `main` |
| Laatste commit | `e50c38b`, vandaag |
| Omvang | 324 Python-bestanden, 1585 TS/TSX — groter dan Companion |
| Testbestanden | 521 |
| Branches | 33 |
| Workflows | 3: `apply-design-wire`, `reassemble-codeeditor-wire`, `tauri-build` |
| **CI** | **geen** — net als Companion toetst geen enkele workflow de code |

De branches sluiten aan op de managersberichten: `cursor/notch-look-sync-d0b7`
(#300), `cursor/lint-gate-baseline-2c8e` (#301),
`cursor/provider-router-fallback-8ade` (de router),
`cursor/managers-composer-routing-2b1d` (de Managers-composer).

**Het probleem dat hieruit springt:** Core is de fabriek die Companion en
Trading OS moet afmaken en onderhouden, en die fabriek heeft zelf geen
kwaliteitspoort. Een werkplaats zonder controle die twee producten bouwt die
ook geen controle hebben. Dat is dezelfde blinde vlek, maar één laag hoger —
en daarom kost hij meer.

## 4.1 Waar Core écht zit

Gemeten 5 november. De repo-root is misleidend.

**Het levende systeem is `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`**
— 2624 bestanden, 308.989 regels, met een nette `src/domain` /
`src/application` / `src/infrastructure`-indeling en tests naast de code.
Dat is doordacht gebouwd.

Alles eromheen is vorige generatie:

| Wat | Laatst aangeraakt |
|---|---|
| `AXE-CORE-ORCHESTRATOR-content/` | **vandaag** |
| `main.py` (183 KB), `agent_loop.py`, `crew_runner.py`, `flow_runner.py`, `backend/`, `frontend/` | 31 oktober, allemaal in **één** commit |
| `AXE-CORE-ORCHESTRATOR-content.zip` | 28 oktober — een zip van de map ernaast, mee-gecommit |
| `brain/`, `memory/`, `knowledge/`, `os3/`, `supabase/`, `tests/` | 1 tot 5 bestanden elk; stellage zonder inhoud |

Die 31-oktober-commit raakte zes verschillende dingen tegelijk met één
boodschap over een overlay. Dat is een bulk-hersync, geen werk aan elk ervan.

**Dus: niet vier generaties spaghetti, maar één goed systeem in een
verwarrende verpakking.** Dat is beter nieuws dan het eruitziet, en het
opruimen is navenant simpeler: verplaats de inhoud naar de root, gooi de zip
en de dode stellage weg, en Core is ineens een leesbaar project.

## 4.2 Gemeten staat van het levende systeem

| | |
|---|---|
| Tests | **3161**, waarvan **3158 slagen en 3 falen** (79s) |
| Typecheck | **exit 2** — 18 TS-fouten, 15 daarvan in testbestanden |
| Lint | **exit 1** — 478 problemen, waarvan **444 errors** |
| CI | geen |

De drie falende tests zijn alle drie hetzelfde soort ding, en dat is het
interessante:

1. `src/design/colourRule.test.ts` — *"expected 129 to be less than or equal
   to 128"*. Een ratel op hoeveel plekken de kleurregel nog geschonden wordt.
   Er is er één bijgekomen.
2. `src/domain/dodeCode.test.ts` — *"Nieuwe export zonder aanroeper
   gevonden"*. Een dodecode-detector.
3. `src/domain/architecture/generateArchitectureManifest.test.ts` — de
   architectuur-momentopname loopt achter op een migratie van 4 november.

Dat zijn geen bugs maar **ratels tegen verval**. Iemand heeft hier serieus
nagedacht: een dodecode-detector en een ontwerpregel-ratel bouw je niet per
ongeluk. Maar een ratel werkt alleen als er iets aan draait, en er draait
niets aan.

De 444 lint-errors zijn vooral `no-unused-vars` (130), `set-state-in-effect`
(97), `only-export-components` (65) en `react-hooks/refs` (64) — hetzelfde
patroon als Companion had, maar daar zijn het warnings en hier errors.

## 4.3 De conclusie die eruit springt

**Core heeft een betere testsuite dan Companion en slechtere poorten.**

| | Companion | Core |
|---|---|---|
| Tests | 207 groen | 3161, 3 rood |
| Typecheck | schoon | exit 2 |
| Lint | 0 errors | 444 errors |
| Verify-keten | 835 checks groen | — |
| CI | geen | geen |
| Draait iets de checks? | **ja, elke 4 uur** | **nee** |

Dat laatste rijtje verklaart alle andere. Het verschil tussen groen en rood
is hier niet zorgvuldigheid of codekwaliteit — Core's tests zijn
geavanceerder dan die van Companion. Het verschil is dat er bij Companion
elke vier uur iets wakker wordt dat de checks draait en repareert wat rood
staat, en bij Core niet.

Twee projecten, dezelfde eigenaar, dezelfde agents. Bij de één draait een lus
op de poorten, bij de ander niet. Dat is zo ongeveer een gecontroleerd
experiment, en de uitkomst is eenduidig.

## 4.4 Wat "Core perfect" betekent, en in welke volgorde

Luka wil Core eerst af, dan Companion, dan Trading OS. Dat is de goede
volgorde, want Core is de fabriek. Concreet:

1. **Zet de poorten op groen.** De 3 ratels repareren (het zijn er drie, geen
   drieduizend), de 18 TS-fouten weg, en de 444 lint-errors terugbrengen.
   Dat laatste is het meeste werk en kan stapsgewijs met een ratel: zet de
   bovengrens op het huidige getal en laat hem alleen dalen.
2. **Zet er CI op.** Pas dán blijven ze groen. Zonder stap 2 is stap 1
   eenmalig opruimen in plaats van onderhoud. Let op: Actions ligt
   accountbreed stil (punt 1 van dit document), dus dit hangt aan de billing.
3. **Ruim de verpakking op.** Inhoud naar de root, de zip weg, de dode
   stellage weg, de root-generatie van 31 oktober archiveren als tag en
   verwijderen. Daarna snapt een nieuwe sessie binnen een minuut waar hij is.
4. **Pas daarna bouwen** aan wat Core moet kunnen (zie
   `docs/HANDOFF-AXE-CORE-ALS-COFOUNDER.md`).

Stap 1 tot en met 3 zijn geen nieuwe functies. Ze maken Core tot iets dat
Companion en Trading OS kán onderhouden zonder er zijn eigen verval bij op
te tellen.

**Gemeld, niet gemeten:**

- Router #298 gemerged, draait op de VPS als `1907452a`
- #299 (Fix-knop bij lint-meldingen) gemerged, nog niet op de VPS
- #300 (notch) en #301 (lint-gate) wachten op jouw ja
- Mac mini draait `1907452a`, launchd KeepAlive aan
- `sudo pmset` (nooit slapen) moet jij nog doen

**Openstaand waar jij over moet beslissen:**
- Router `1907452a` houden of terug naar `5121265e` — hij staat op de VPS
  zonder dat jij ja zei
- #299 naar de VPS
- #300 + #301 mergen plus Mac-rebuild

Wat AXE Core uiteindelijk moet worden staat in het tweede document:
`docs/HANDOFF-AXE-CORE-ALS-COFOUNDER.md`.

---

# 5. Northsea Desk — geen app, maar het bedrijf

**Gemeld, niet gemeten.** Loopt autonoom en vraagt niets van jou.

- 28 koude koper-intro's naar Turkije, India, China; 26 afgeleverd, 2 gebounced
  (Gupta Power, Nanning Jiayou)
- Harcros: NCNDA en FPA getekend, KYC-follow-up 4 nov 19:30
- Open: bounces repareren, op 9 nov 09:00 Harcros en Brixlegg najagen

---

# Correcties op de handoff van 09:40

Drie dingen in die handoff kloppen niet. Ik noem ze omdat er anders op
gestuurd wordt.

**1. "#124 (founder-prijs €40)" — nee.** PR #124 is *"Restore AXE Companion
landing (honest claims, current-app hero)"*, gemerged 4 november. De
founder-prijs zat in **#139** (*"make pricing-page promises real … founder
return"*). Gemeten met `git log --grep`.

**2. "Koersen lopen voor 1 van de 3 MetaApi-accounts; bij de andere 2 lukt de
broker-sync niet" — nee.** Er zijn **6** MT5-rekeningen. Drie staan actief en
synchroniseerden alle drie nog om 09:10 vandaag. De andere drie staan op
`sync_failed` met een laatste sync van **25 juni** — vier maanden stuk, niet
iets van deze week. Wie "2 accounts die niet syncen" onderzoekt, zoekt naar
iets dat er niet is. (Live *ticks* via de streamer zijn iets anders dan sync;
dat kon ik hier niet meten.)

**3. "121 gemergde branches verwijderd" — niet terug te zien.** Ik meet
vandaag **219** remote branches. Of de opschoning is niet doorgekomen, of ze
zijn weer aangegroeid.

**Wat de handoff miste, en wat wél speelt:** dat er helemaal geen CI is (los
van de Actions-blokkade), dat `npm run lint` een check is die niet kan falen,
dat er 9 stale PR-drafts in de weg staan, en dat er geen alarm afgaat als
productie achterloopt — het gat waardoor de app in oktober bijna negen uur
stil stond zonder dat iemand het zag.
