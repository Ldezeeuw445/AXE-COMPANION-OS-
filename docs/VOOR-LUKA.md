# Voor Luka — alles wat ik niet zelf kan

Eén bestand, in volgorde van belang. Niets hier hoeft vandaag. Niets hier
houdt de app tegen: alles draait. Dit zijn de dingen waar jouw handen,
je kaart of je wachtwoord bij moeten.

Geschreven 27 oktober 2026, toen je net ziek was geweest en zei dat je het even
kwijt was. Dus: je hoeft dit niet te onthouden, het staat hier.

---

## 1. Upcomers verbinden — 5 minuten, en daarna voor al je gebruikers geregeld

Alleen jij hebt het wachtwoord.

1. MT5-app op je telefoon → menu → **Accounts** → tik je Upcomers-account aan.
   Daar staat de servernaam zoals Upcomers hem noemt. Neem die letterlijk over.
2. AXE Companion → Accounts → verbinden met login, wachtwoord en die servernaam.
3. Lukt het: klaar. Sinds `39a6f2f` zoekt AXE zelf de echte MT5-server op bij
   een dashboardnaam, dus de kans is groot dat dit genoeg is.
4. Komt er `mt5_server_not_found`, dan verschijnt er een amber blok dat om
   `servers.dat` vraagt. Dat bestand zit op je iMac of Mac Mini:

   ```bash
   find ~/Library -name "servers.dat" -path "*config*" 2>/dev/null
   ```

   Of in MT5: **File → Open Data Folder → config**. Upload hem in dat blok.

Dit is eenmalig voor de hele app: het profiel komt op ons MetaApi-account te
staan als `axe:upcomers`, en elke volgende Upcomers-gebruiker slaat stap 4 over.

## 2. Die cron-secret rotaten — 2 minuten

De `X-Cron-Secret` voor `api.axecompanion.com/cron/tick` is langsgekomen in een
chat toen je je crontab plakte. Niet erg, maar wel rotaten:

- Nieuwe waarde zetten in `/root/AXE-COMPANION-OS-/.env.local` op de VPS **en**
  in Supabase Vault (`axe_companion_cron_secret`). Ze moeten byte-identiek zijn.
- Daarna de crontab-regel bijwerken met de nieuwe waarde.
- Controleren zonder de waarde te laten zien:
  `curl -s https://www.axecompanion.com/api/debug/cron-health` tegen
  `select * from axe_ops.cron_secret_fingerprint();` — gelijke vingerafdrukken
  betekent gelijke strings.

## 3. Twee schakelaars in Supabase — 1 minuut

Beide in de Supabase-console, ik kan er niet bij:

- **Authentication → Sign In / Providers** (bouwlijst `L1.5b`).
- **`auth_leaked_password_protection`** aanzetten. Staat nu uit.

## 4. Optioneel: de autopilot ook bij de database laten

De terugkerende taak draait elke vier uur en bouwt door. Hij heeft geen
database-tools, dus hij kan een migratie wel schrijven maar niet toepassen.
Dat blokkeert niets — de punten die nog op de rij staan kunnen zonder — maar
als je het netjes wilt: maak de routine opnieuw aan vanuit de routines-UI op
claude.ai, dan draagt hij je connectors mee. Via de API kan het niet, dat heeft
deze organisatie uitgezet.

## 5. Eén cron-regel op de VPS — 1 minuut, en hij geeft je limiet terug

`scripts/watchdog.sh` kijkt gratis of productie draait wat er op main staat.
Geen model, geen API, geen kosten. Nu doet de autopilot-sessie dat zelf, en dat
kost een deel van je vijf-uurs limiet dat anders aan bouwen was besteed.

Op de VPS:

```bash
( crontab -l 2>/dev/null; echo '*/10 * * * * /root/AXE-COMPANION-OS-/scripts/watchdog.sh >> /var/log/axe-watchdog.log 2>&1' ) | crontab -
```

En als je de hele suite één keer per nacht wil laten draaien:

```bash
( crontab -l 2>/dev/null; echo '40 4 * * * AXE_WATCHDOG_CHECKS=1 /root/AXE-COMPANION-OS-/scripts/watchdog.sh >> /var/log/axe-watchdog.log 2>&1' ) | crontab -
```

Kijken wat hij zegt: `tail -20 /var/log/axe-watchdog.log`. Hij schrijft één
regel per keer en eindigt met "niets te doen" of "er moet iemand kijken".

## 6. Beslissingen die alleen jij kunt nemen

Geen haast, maar ze staan open:

- **De 182 anonieme accounts**: opruimen of laten staan? Ik raak ze niet aan
  tot je letterlijk "opruimen" zegt.
- **Wie mag `founder` houden?** Nu is dat de standaard voor iedereen.
- **Eén echte testaankoop met een live kaart**, en narekenen dat de tier
  daadwerkelijk omklapt. Kan niet met een testkaart en niet door mij.

## 7. Op je Mac, als je er weer zin in hebt

- `ALPHAVANTAGE_API_KEY` op de host zetten (bouwlijst `L7.5c`).
- `OLLAMA_BASIC_AUTH` op de Companion-host, zodat `ollama.axecompanion.com`
  weer meedoet in plaats van 401 te geven. Nu serveert alleen de Mac Mini.
  Niets is stuk: de app heeft Ollama *en* OpenAI en beide zijn bereikbaar.
- Trading OS bouwen en serveren (`L8.9`, `L13.2`, `L13.3`, `L14.3`). Dit is de
  grootste, en het is de enige waar ik je echt niet bij kan helpen zolang de
  bron niet in een repo staat die ik kan zien.

---

## Wat ik niet voor je kan doen, en waarom

Je noemde je 3 Claude Pro-accounts, 2 ChatGPT Pro-accounts en Grok premium.
Daar kan ik niets mee, en het is beter dat je weet waarom:

- Ik kan niet inloggen op jouw accounts, en ik moet je daar ook niet om vragen.
- Belangrijker: **ChatGPT Pro en Grok premium zijn geen API-toegang.** Dat zijn
  consumenten-abonnementen voor jezelf. De app heeft API-credit nodig, en dat is
  een andere rekening. Als je dacht dat die abonnementen de app van modellen
  voorzien: dat doen ze niet.
- Goed nieuws: dat hoeft ook niet. De app staat nu op `ok_ollama` met OpenAI
  erbij, en beide zijn bereikbaar. Ollama is de gratis fallback en die werkt.
  Er is op dit moment geen modelprobleem.

Wat wél helpt als je ooit krap zit op modellen: credit op de OpenAI **API**
(platform.openai.com, niet chatgpt.com), of niets doen en op Ollama leunen.
