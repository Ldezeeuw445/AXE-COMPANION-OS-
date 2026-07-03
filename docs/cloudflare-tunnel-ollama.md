# Cloudflare Tunnel Setup voor Ollama (AXE Companion OS)

## Doel
Maak Ollama bereikbaar vanaf Vercel via een publieke HTTPS URL, zodat AXE Companion OS Ollama kan gebruiken als LLM (met OpenAI fallback).

## Vereisten
- Cloudflare account (gratis)
- Mac Mini met Ollama draaiend op poort 11434
- Ollama moet luisteren op `0.0.0.0:11434` (zie onder)

---

## Stap 1: Zorg dat Ollama op 0.0.0.0 draait

Open een terminal op je Mac Mini:

```bash
# Stop Ollama
killall ollama

# Start Ollama opnieuw op 0.0.0.0
OLLAMA_HOST=0.0.0.0 ollama serve
```

Laat dit venster open draaien. Test lokaal:
```bash
curl http://127.0.0.1:11434/api/tags
```

Je zou een JSON lijst van modellen moeten zien.

---

## Stap 2: Installeer Cloudflared op je Mac Mini

```bash
brew install cloudflared
```

Als je geen Homebrew hebt:
```bash
# Download direct
curl -L --output cloudflared.tgz https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz
tar -xzf cloudflared.tgz
sudo mv cloudflared /usr/local/bin/
```

---

## Stap 3: Maak een tunnel in Cloudflare Dashboard

1. Ga naar https://dash.cloudflare.com
2. Klik op **"Zero Trust"** (in de linkerbalk)
3. Klik op **"Networks"** → **"Tunnels"**
4. Klik **"Create a tunnel"**
5. Kies **"Cloudflared"**
6. Geef de tunnel een naam: `ollama-axe`
7. Klik **"Save tunnel"**
8. Bij **"Choose your environment"** selecteer **macOS**
9. Kopieer het commando dat er staat, het ziet eruit als:
   ```bash
   cloudflared service install <EEN-LANGE-TOKEN-HIER>
   ```
10. **Sluit deze pagina NIET** — je komt straks terug voor de hostname configuratie

---

## Stap 4: Installeer de tunnel op je Mac Mini

Open een **nieuw terminal venster** (Ollama blijft draaien in de eerste) en plak het commando:

```bash
cloudflared service install <EEN-LANGE-TOKEN-HIER>
```

Start de service:
```bash
sudo cloudflared service start
```

---

## Stap 5: Configureer de publieke hostname

Ga terug naar het Cloudflare dashboard (de pagina die je open hebt gelaten):

1. Klik **"Next"** na het installeren van de token
2. Bij **"Public Hostname"** vul in:
   - **Subdomain**: `ollama` (of kies zelf)
   - **Domain**: Selecteer je domein (bijv. `jouwdomein.nl`)
   - **Path**: laat leeg
   - **Type**: `HTTP`
   - **URL**: `localhost:11434`
3. Klik **"Save hostname"**

Je Ollama is nu bereikbaar op: `https://ollama.jouwdomein.nl`

---

## Stap 6: Test de tunnel

Open een terminal:

```bash
curl https://ollama.jouwdomein.nl/api/tags
```

Je zou de JSON lijst van modellen moeten zien. Werkt het? Mooi!

---

## Stap 7: Zet de Ollama URL in Vercel

1. Ga naar https://vercel.com/dashboard
2. Klik je AXE Companion OS project
3. Ga naar **Settings** → **Environment Variables**
4. Voeg toe of update:
   - **Name**: `OLLAMA_HOST`
   - **Value**: `https://ollama.jouwdomein.nl` (zonder trailing slash)
5. Klik **Save**
6. **Redeploy** je project (of wacht tot de volgende deploy)

---

## Stap 8: Zorg dat de code gedeployed is

De code wijzigingen (intel routes → llmClient) moeten ook op Vercel staan:

```bash
cd "/Users/luka/Desktop/AXE Companion /AXE-COMPANION-OS-runtime-fix"
git add -A
git commit -m "refactor: migrate intel routes to llmClient (Ollama + OpenAI fallback)"
git push
```

Vercel zal automatisch opnieuw deployen.

---

## Optioneel: Maak Ollama permanent op 0.0.0.0

Zodat je niet elke keer `OLLAMA_HOST=0.0.0.0` hoeft te typen:

```bash
# Maak een LaunchAgent plist
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.ollama.ollama.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.ollama</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/ollama</string>
        <string>serve</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_HOST</key>
        <string>0.0.0.0:11434</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Laad de service
launchctl load ~/Library/LaunchAgents/com.ollama.ollama.plist
```

---

## Troubleshooting

### "Connection refused" van Vercel
- Check of de tunnel draait: `sudo cloudflared service status`
- Check of Ollama draait: `curl http://localhost:11434/api/tags`

### "Empty response" van Ollama
- Ollama luistert mogelijk niet op `0.0.0.0`. Herstart met `OLLAMA_HOST=0.0.0.0 ollama serve`

### Cloudflare Tunnel disconnects
- `cloudflared` moet draaien als service. Check: `sudo cloudflared service status`
- Herstart: `sudo cloudflared service start`

---

## Samenvatting

| Component | URL / Command |
|-----------|---------------|
| Ollama lokaal | `http://localhost:11434` |
| Ollama via Cloudflare | `https://ollama.jouwdomein.nl` |
| Vercel env var | `OLLAMA_HOST=https://ollama.jouwdomein.nl` |
| Tunnel status | `sudo cloudflared service status` |
| Ollama status | `curl http://localhost:11434/api/tags` |
