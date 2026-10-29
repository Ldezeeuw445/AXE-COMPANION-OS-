# De landing page, gelezen als bezoeker

Punt 9 uit `docs/AUTOPILOT.md` vraagt om één doorloop met verse ogen, en zegt
erbij: schrijf eerst op wat onduidelijk, druk of dubbel is, en pas daarna aan.
Dit is dat eerste deel. Gedaan op 28 oktober 2026, tegen `src/app/page.tsx` en
`src/lib/marketing/landingCopy.ts`.

De maatstaf die ik heb aangehouden: **snapt iemand die AXE niet kent binnen
tien seconden wat het voor hem doet, en weet hij daarna wat hij moet klikken.**
Niet: staat alles erop.

Het is geen slechte pagina. Hij ziet er verzorgd uit en de tekst is netjes
geschreven. Wat eronder zit is een ordeningsprobleem, geen schrijfprobleem.

---

## 1. De hero verkoopt een featurelijst, niet het verschil

Wat er nu staat:

> Your trades, your journal, your intelligence.
> AXE Companion is the phone OS: live chart, depth, news, one-tap execution,
> quick journal, and AXE chat — synced with Trading OS on your desktop.

Elk van die zes dingen heeft MT5 ook, en TradingView heeft er vier beter. Een
bezoeker die drie trading-apps heeft geprobeerd leest dit als "nog een app met
een chart".

Wat er niet staat, terwijl het het enige is dat de concurrent niet kan: **AXE
leest je eigen afgesloten trades en vertelt je waar jij geld verdient.** Dat is
`playbookEdge.ts` — "jouw London XAUUSD longs: 14 trades, 64% gewonnen, +18.40
gemiddeld". MT5 weet dat niet over je en TradingView kent je trades niet.

Dat hoort boven de vouw te staan, niet als bullet 23.

## 2. Vier knoppen in de hero is er drie te veel

`Start free` · `Open app` · `Install as PWA` · `Join waitlist`.

Vier deuren naast elkaar is geen keuze aanbieden, het is de keuze bij de
bezoeker leggen die hem nog niet kan maken. `Open app` is er voor wie al
klant is — die komt niet via de landing page binnen. `Install as PWA` is een
installatie-instructie, geen eerste stap. `Join waitlist` staat er klein onder
en spreekt de eerste knop tegen: is het nu gratis te starten of is er een
wachtlijst?

Voorstel: één primaire knop, en de rest lager op de pagina waar iemand is die
al weet wat hij wil.

## 3. Vier secties zeggen vier keer hetzelfde

- `LANDING_SURFACES` — "Same stack · two surfaces"
- `LANDING_ENGINE` — "The brain behind every decision"
- `AXE ONE` — "One Source of Truth"
- `AXE` — "Adaptive Intelligence. Real Results."

Samengevat zeggen ze alle vier: *het is slim, en het is één systeem over
telefoon en desktop.* Dat is een goede boodschap, maar hij hoeft niet vier
keer. Dit is waar "rustiger maken" vandaan moet komen, en rustiger betekent
hier letterlijk: twee van deze vier samenvoegen of laten vallen.

## 4. Dertig claims voor de featurelijst begint

Die drie "slim"-secties hebben elk zes bullets. Dat zijn achttien bullets, en
daarna komt `LandingFeatureGrid` met nog eens twaalf. Dertig claims.

En de kop boven een deel ervan is: *"Everything you need. Nothing you don't."*
Een pagina met dertig opsommingstekens spreekt die belofte zelf tegen.

## 5. Jargon dat een nieuwe trader afschrikt

Zonder uitleg op de pagina:

- **"phone OS"** — staat er drie keer. Het is een term die Luka en ik snappen
  omdat wij hem bedacht hebben. Een bezoeker niet.
- **"depth" / "depth drawer"** — market depth. Een beginnend retail-trader
  heeft dat woord nooit gezien.
- **"Order Blocks, FVG, iFVG that extend"** — dit is Smart Money Concepts
  jargon. Voor wie het kent is het een goed verkoopargument; voor wie het niet
  kent is het ruis. Het hoeft niet weg, het hoort alleen niet in de eerste
  helft.
- **"GDELT"** — een database-naam. Zegt niets zonder uitleg.

## 6. Wat goed is en moet blijven

Om het eerlijk te houden, want hier zit het echte werk al in:

- De **Protect**-bullet is concreet en controleerbaar: "news window, weekend,
  lot cap, daily loss, max automatic trades". Dat is precies hoe de rest zou
  moeten klinken.
- **"Outcome Focused — Learning Arc follows real teaching moments, not a
  vanity score"** is een goede zin: hij zegt wat het níet is, en dat is hoe je
  een verschil uitlegt.
- De pricing-sectie leest helder en de founder-plekken worden live uit de
  database gelezen in plaats van hardgecodeerd — dat is zeldzaam eerlijk.

---

## Volgorde waarin ik dit zou aanpakken

Niet alles in één commit; de bouwlijst zegt dat ook over deze pagina.

1. **De hero.** Eén belofte die het verschil noemt, één knop. Dit is verreweg
   het grootste effect en raakt twee bestanden.
2. **De vier slimme secties naar twee.** Mechanisch werk zodra besloten is
   welke twee.
3. ~~**Jargon vervangen of uitleggen.**~~ **Gedaan, 29 oktober.** "depth"
   wordt nu uitgelegd waar een bezoeker het tegenkomt (*de orders die boven en
   onder de prijs wachten*), GDELT heet *world events from GDELT* in plaats
   van een kale databasenaam, en de kop "Order Blocks, FVG, iFVG that extend"
   — een afkorting van een afkorting, drie lagen diep — is *"Order blocks and
   fair value gaps, drawn forward"* geworden. Een check in
   `verify-landing-claims.mjs` houdt het zo.

   **"phone OS" staat er nog, met opzet.** Het is Luka's term en hij staat in
   de hero; hem alleen in de onderliggende secties vervangen zou de pagina
   met zichzelf in tegenspraak brengen. Hij hoort bij stap 1.
4. **De featurelijst inkorten** of achter een "alles zien"-opening zetten.

Punt 1 is het enige dat echt om Luka's oordeel vraagt, want het is zijn
positionering. De rest kan een autopilot-sessie doen zodra de richting vaststaat.

## Wat ik hiervan zelf vind, als mede-bouwer

De pagina verkoopt nu de verzameling onderdelen. Het product is geen
verzameling onderdelen — het is het enige stuk gereedschap dat de trader zijn
eigen patroon teruggeeft. Alles wat ik hierboven voorstel is één beweging:
minder beloven, en het ene ding dat waar is vooraan zetten.
