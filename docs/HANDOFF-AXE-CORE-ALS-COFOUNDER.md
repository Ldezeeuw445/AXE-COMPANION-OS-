# AXE Core als co-founder, niet als cron

Geschreven 5 november 2026, op Luka's vraag: alles vanuit AXE Core managen, en
Core plus de agents moeten een 24/7 persoonlijke superassistent worden die
zélf met dingen komt en dingen zelf gaat zien — adaptief, slim, lerend. Een
co-founder, niet iets dat alleen praat als je het aanspreekt of als er een
cronjob afgaat.

Dit document zegt eerst waarom dat er nu nog niet is, dan wat het verschil
precies ís, en dan in welke volgorde je het bouwt.

---

## 1. Begin bij de eerlijke diagnose: ik ben zelf het voorbeeld

Deze sessie is een autopilot voor AXE Companion. Elke vier uur gaat er een
cron af met een vaste opdracht: synchroniseer, lees de afspraken, draai
typecheck/tests/verify, pak het bovenste punt van de lijst, rapporteer.

Dat werkt goed. Het heeft vandaag een dode `/pricing`-link gevonden, drie
dubbele koppen uit een gemergde PR gehaald, en een landing teruggebracht naar
jouw ontwerp. Maar het is precies wat jij beschrijft als niet genoeg:

**Ik word wakker omdat er een klok afgaat, en ik doe dan een vaste
boodschappenlijst.** Als er tussen twee cycli iets kapotgaat, ligt het daar
tot de volgende keer. Als er iets kapotgaat dat niet op mijn lijst staat, zie
ik het alleen als ik er toevallig overheen struikel — zoals vandaag, toen ik
uit verveling productie langsliep en die dode link vond. Dat was geluk, geen
systeem.

Een co-founder werkt niet zo. Die heeft een beeld in zijn hoofd van hoe het
hoort te zijn, merkt dat er iets wringt, en komt er uit zichzelf over
beginnen. Het verschil zit hem niet in "vaker draaien". Een cron die elke
minuut draait is nog steeds een cron.

**Het verschil zit in vier dingen, en geen daarvan is "een snellere cron".**

---

## 2. De vier dingen die het verschil maken

### 2.1 Een model van wat er wáár hoort te zijn

Een co-founder merkt dingen op omdat hij een beeld heeft van hoe het hoort,
en voelt wanneer de werkelijkheid daarvan afwijkt. Zonder zo'n beeld kun je
niets opmerken — je kunt alleen een lijstje afvinken dat iemand heeft
opgeschreven.

Op dit moment zit dat beeld verspreid over documenten, een bouwlijst, en de
hoofden van jou en vijf managers. Niets daarvan is machineleesbaar. Daarom
bestaat elke controle alleen omdat iemand hem met de hand heeft geschreven —
ik heb er dit jaar honderden geschreven.

**Maar er is al een kiem, en die is beter dan je denkt.** `npm run verify` in
Companion is 835 uitvoerbare uitspraken over hoe het hoort te zijn. Niet
"test of de code doet wat hij doet", maar "deze eigenschap moet waar blijven".
Voorbeelden:

- elke betaalde route hangt aan een feature, of staat met reden op gratis
- geen provider in de etalage die niet betaald is
- prijzen komen uit de bron, nooit overgetypt
- geen kop staat twee keer op de pagina
- elke interne link wijst naar een pagina die bestaat

Dat is precies het soort ding waar een co-founder over valt. Het staat alleen
in één app, het draait alleen als iemand het aanroept, en het kent de wereld
buiten de repo niet.

**Wat je bouwt:** die vorm uitbreiden tot een *wereldmodel* dat ook de dingen
buiten de code dekt. Draait productie op dezelfde commit als main? Syncen de
rekeningen die actief heten? Staat er een secret in een frontend die
geroteerd had moeten zijn? Wijst een routine naar een repo die niet meer
bestaat? Dat zijn allemaal uitspraken van dezelfde vorm, en ze zijn alle vier
vandaag schendbaar zonder dat iets afgaat.

### 2.2 Een lus die kijkt, niet een script dat draait

De cron is niet het probleem. Een hart klopt ook op een ritme. Het probleem
is dat de cron een *vast script* draait in plaats van oordeel te wekken.

De lus die je wilt is:

> **observeer → vergelijk met het model → bepaal wat aandacht verdient →
> handel of meld**

Alleen de eerste stap hoort op een klok. De rest is oordeel, en dat is wat
het een co-founder maakt in plaats van een wekker.

Concreet verschil, aan een echt voorbeeld van vandaag:

- **Cron-gedrag:** "het is 03:35, draai de checklist. Alles groen. Rapporteer
  'niets te doen'."
- **Co-founder-gedrag:** "alles groen, maar productie draait al 3,7 uur op
  dezelfde build terwijl er twee PR's open staan die zeggen *do not merge* —
  en de vorige keer dat niemand naar deploys keek stond de app bijna negen uur
  stil. Dat is geen storing, maar het is wel het patroon dat eraan voorafging."

Dat tweede vereist geen nieuwe data. Het vereist dat de lus een geheugen heeft
van wat er eerder misging, en de vrijheid om een verband te leggen dat niet op
de lijst stond.

### 2.3 Een aandachtsbeleid — het moeilijkste stuk

Dit is waar zulke systemen stuklopen, en waar je het meeste over na moet
denken.

Een assistent die alles meldt is ruis. Na een week lees je hem niet meer, en
dan is hij erger dan niets, want je denkt dat je gedekt bent. Een assistent
die niets meldt slaapt. De kunst zit ertussenin, en die grens is persoonlijk
en verandert.

**Dat is precies het soort ding dat geleerd moet worden, en het enige stuk
waar echt leren onmisbaar is.** De rest van dit document kun je met goede
regels bouwen. Dit niet.

Wat het systeem moet bijhouden:

- Waar heb je op gereageerd, en hoe snel?
- Wat heb je genegeerd? Twee keer genegeerd is een signaal.
- Waarover heb je gezegd "dit hoef ik niet te weten"?
- Waarover zei je "dit had ik eerder willen horen"? Dat is de duurste les en
  de waardevolste.

En dan drie niveaus, waarbij alleen het eerste je onderbreekt:

| Niveau | Wanneer | Vorm |
|---|---|---|
| **Onderbreken** | er gaat nu geld, data of vertrouwen verloren | push, meteen |
| **Bundelen** | het moet gebeuren, maar niet binnen het uur | één bericht per dag |
| **Noteren** | het is waar en ooit relevant | in het geheugen, niet naar jou |

Je zei het zelf al: *"Vraag liever om één bundelupdate per dag dan om losse
statusberichten, en laat routines alleen melden als er echt iets veranderd
is."* Dat is het aandachtsbeleid in één zin. Het moet alleen in het systeem
zitten in plaats van in een instructie die een agent kan vergeten.

### 2.4 Geheugen met gevolgen

AXON Memory bestaat en is gedeeld over je assistenten. Dat is het fundament.

Maar geheugen maakt je pas adaptief als het de volgende beslissing
daadwerkelijk verandert. Opslaan dat "Luka wil geen losse statusberichten" is
waardeloos als de volgende agent dat niet leest vóórdat hij een statusbericht
stuurt.

**De toets of dit werkt is niet "staat het in het geheugen" maar "is er een
beslissing anders uitgevallen".** Dat is meetbaar: tel hoe vaak een agent een
opgeslagen regel ophaalde en daardoor iets anders deed. Staat die teller op
nul, dan heb je een dagboek, geen geheugen.

Twee dingen horen er altijd in, en precies die twee worden meestal vergeten:

- **De reden, niet de verandering.** "Ik heb X gedaan" veroudert meteen.
  "Dit mag niet omdat Y" blijft waar.
- **Wat er misging en hoe het gemeten is.** Mijn eigen
  `docs/AUTOPILOT.md` doet dit al: een blok harde grenzen die allemaal zijn
  ontstaan uit een fout die echt gemaakt is. Daardoor maakt een volgende
  sessie die fout niet nog eens. Dát is leren — en het kostte geen
  machine learning, alleen de discipline om op te schrijven wat er stukging.

---

## 3. Handelen: kopieer de guard die je al hebt

Een co-founder die alleen mag praten is een adviseur. Initiatief betekent dat
Core dingen mag dóen zonder dat jij eerst ja zegt. Dat is ook precies waar
het eng wordt: een altijd-aan agent die mag handelen, kan om 03:00 iets
slopen.

**Je hebt het antwoord hier al staan, in Companion.** `autoTradeGuard`
controleert vijf grenzen vóór elke automatische order — nieuwsvenster,
weekend, lotgrootte, risico per trade, dagelijks verlies — en weigert mét de
regel erbij. Hij plaatst nooit stilletjes een kleinere trade.

Dat is exact het patroon dat Core nodig heeft voor operationele acties:

1. **Een opsomming van wat mag.** Niet "wees voorzichtig", maar een lijst.
   Een doc bijwerken: ja. Een PR openen: ja. Een branch pushen: ja. Naar
   `main` pushen op een repo die auto-deployt: nee. Een migratie toepassen:
   nee. Een secret roteren: nee. Iets verwijderen: nooit.
2. **Weigeren mét de reden.** "Ik heb dit niet gedaan omdat het een migratie
   is" is bruikbaar. Stil niets doen niet.
3. **Nooit stilletjes iets kleiners doen.** De gevaarlijkste agent is die
   welke, geblokkeerd op de goede actie, een half alternatief uitvoert dat
   je niet gevraagd had.
4. **Alles terugdraaibaar, of het gebeurt niet.** Initiatief betekent soms
   fout zitten. Dat mag alleen als fout zitten goedkoop is. Daarom is een
   PR wel goed en een push naar `main` niet: een PR kun je dichtklikken.

**De grens die ik zou trekken:** Core mag alles doen wat met één klik ongedaan
te maken is, en niets daarbuiten. Dat is ruim genoeg voor echt initiatief en
smal genoeg om 's nachts te laten draaien.

---

## 4. De volgorde waarin je het bouwt

Niet alles tegelijk. Elke stap levert op zichzelf iets op, en elke volgende
stap leunt op de vorige.

### Stap 1 — Maak het wereldmodel, klein en echt

Begin met wat je vandaag al niet weet zonder te kijken. Eén tabel, één rij per
uitspraak die waar hoort te zijn, per app:

| app | uitspraak | hoe gemeten | laatst | status |
|---|---|---|---|---|
| Companion | productie draait op `main` | `/api/debug/build` vs GitHub HEAD | 09:40 | ok |
| Companion | alle actieve rekeningen syncten < 1u | Supabase-query | 09:40 | ok |
| AXON | geen oud secret in de live frontend | fetch + grep | — | **onbekend** |
| Trading OS | hostnames geven 200 | curl | — | **onbekend** |
| Core | router op de VPS == goedgekeurde commit | ssh + git rev-parse | — | **afwijking** |

Begin met tien regels, niet met honderd. De waarde zit niet in de
volledigheid maar in dat "onbekend" en "afwijking" zichtbaar worden. Dat is
op dit moment nergens zichtbaar — vandaar dat een router zonder jouw ja op de
VPS kon staan en dat drie MT5-rekeningen sinds 25 juni stuk zijn zonder dat
iemand het wist.

**Dit alleen al had vier van de problemen in de handoff van vanochtend
gevangen.**

### Stap 2 — Laat de lus het model lezen in plaats van een script

De cronjobs die je hebt blijven. Ze roepen alleen iets anders aan: niet "draai
checklist A" maar "ververs het model, en kijk wat er veranderd is sinds de
vorige keer".

Dan krijg je vanzelf uitspraken die een co-founder doet: *"de rekening die
gisteren syncte doet dat vandaag niet"* — zonder dat iemand een check voor die
specifieke rekening heeft geschreven.

### Stap 3 — Zet er een aandachtsbeleid op

Drie niveaus zoals hierboven. Begin streng: alleen onderbreken bij geld, data
of vertrouwen. Alles anders in de dagbundel. Log wat je opende en wat je
negeerde — dat log is de trainingsdata voor de rest.

### Stap 4 — Geef Core handelingsruimte binnen de guard

Begin met de categorie "terugdraaibaar met één klik": een PR openen, een doc
bijwerken, een branch pushen, een issue aanmaken. Laat het een maand draaien
en kijk wat je ervan dichtklikt. Dat percentage ís de kalibratie.

### Stap 5 — Pas dán alles door Core heen managen

Nu pas is "alles vanuit Core" veilig. Core kent de staat van vijf apps, weet
wat de moeite van jouw aandacht waard is, en mag binnen grenzen handelen. De
managers worden dan wat ze horen te zijn: domeinexperts die Core voeden, in
plaats van vijf losse kanalen die jij moet samenvoegen — wat je nu met de
hand doet.

---

## 5. Wat er misgaat als je het verkeerd bouwt

Vier faalmanieren, alle vier eerder gezien:

1. **Te veel melden.** Binnen een week lees je het niet meer en denk je dat je
   gedekt bent. Dit is de dodelijkste, want hij ziet eruit als succes.
2. **Initiatief zonder terugdraaiknop.** Eén agent die om 03:00 iets "handigs"
   doet op productie kost meer vertrouwen dan een maand goed werk oplevert.
3. **Geheugen zonder gevolg.** Een dagboek dat niemand leest. Meetbaar: hoe
   vaak veranderde een opgeslagen regel een beslissing? Nul = geen geheugen.
4. **Een modelhiaat dat niemand ziet.** Een uitspraak die niemand heeft
   opgeschreven, bestaat niet voor het systeem. Daarom moet elke storing die
   je meemaakt eindigen in een nieuwe regel in het model — anders leer je er
   niets van. Dit is precies wat `docs/AUTOPILOT.md` nu al doet voor één app.

---

## 6. Hoe je weet dat het werkt

Niet aan het gevoel dat het slim is. Aan vier getallen:

| Vraag | Meting | Nu |
|---|---|---|
| Ziet het dingen die niemand vroeg? | aantal bevindingen per maand die op geen enkele lijst stonden | handmatig, toevallig |
| Zwijgt het als er niets is? | aandeel meldingen waarop je iets deed | onbekend, nergens gelogd |
| Leert het? | aantal keren dat een opgeslagen regel een beslissing veranderde | onbekend |
| Is het te vertrouwen? | aandeel autonome acties dat je terugdraaide | geen autonome acties |

Als die eerste kolom over drie maanden gevuld is met echte cijfers, heb je een
co-founder. Zo niet, dan heb je een mooiere cron.

---

## 7. Wat je vandaag al kunt doen, zonder iets te bouwen

Drie dingen die geen code kosten en meteen helpen:

1. **Schrijf de tien uitspraken op** uit stap 1, met de hand, in één bestand.
   Dat bestand is het wereldmodel, ook als het nog niets aanroept. Nu bestaat
   het nergens.
2. **Zet één gedeeld logboek op** waar elke manager zijn bevindingen in kwijt
   kan, in plaats van vijf losse chats die jij samenvoegt. Dat samenvoegen is
   nu jouw werk, en dat is precies het werk dat Core hoort te doen.
3. **Spreek de guard-grens af** en schrijf hem op: terugdraaibaar met één klik
   mag, de rest niet. Zolang die regel niet opgeschreven is, kiest elke agent
   zijn eigen grens — en vanochtend stond er al een router op de VPS zonder
   jouw ja.

---

## 8. Eén eerlijke kanttekening

Een altijd-aan systeem kost altijd-aan geld. Je zei zelf dat je usage wilt
sparen.

Dat hoeft niet te botsen, maar alleen als de lus goedkoop is en het oordeel
duur. Een query die vraagt "draait productie op main" kost niets en kan elke
minuut. Een model dat nadenkt over wat dat betekent hoef je alleen te roepen
als er iets veranderd is.

**Bouw het model en de observatie in gewone code, niet in een agent.** Roep de
agent pas als er een afwijking is. Dan is 24/7 aanstaan bijna gratis, en
betaal je alleen voor de momenten waarop er echt iets te denken valt. Een
agent die elke vijf minuten wakker wordt om te constateren dat alles in orde
is, is de duurste manier om niets te weten te komen.
