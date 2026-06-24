# Ollama via Tailscale Funnel (makkelijkste optie)

Als je Tailscale al gebruikt, is **Tailscale Funnel** de makkelijkste manier om Ollama bereikbaar te maken vanaf Vercel.

## Wat is Tailscale Funnel?

Tailscale Funnel maakt een **publieke URL** voor een service op je Tailscale machine. Het is als een veilige tunnel die alleen werkt als je Tailscale app draait.

## Stap 1: Enable Funnel op je Mac Mini

```bash
# Op je Mac Mini (waar Ollama draait)
tailscale funnel --bg 11434
```

Dit maakt een publieke URL zoals:
```
https://mac-mini-van-luka.tail03735e.ts.net:443
```

Of je kunt een custom subdomain kiezen:
```bash
tailscale funnel --bg --name ollama 11434
```

## Stap 2: Test of het werkt

```bash
# Vanaf elke computer (zonder Tailscale!)
curl https://mac-mini-van-luka.tail03735e.ts.net/api/tags
```

Je zou je modellen moeten zien:
```json
{"models": [{"name": "deepseek-r1:8b"}, {"name": "qwen2.5-coder:7b"}]}
```

## Stap 3: Zet env vars op Vercel

```
OLLAMA_URL=https://mac-mini-van-luka.tail03735e.ts.net
OLLAMA_MODEL=deepseek-r1:8b
```

**Geen `OPENAI_API_KEY` nodig als je alleen Ollama wilt gebruiken.** Maar het is slim om hem te houden als fallback.

## Stap 4: Stop Funnel (als je wilt)

```bash
tailscale funnel down
```

## Veiligheid

- Funnel gebruikt **Tailscale's eigen TLS certificaten**
- Alleen **HTTPS** (geen HTTP)
- Je kunt **ACLs** instellen in Tailscale om toegang te beperken
- Geen port forwarding op je router nodig

## Alternatief: Cloudflare Tunnel (stabieler voor 24/7)

Als Tailscale Funnel niet betrouwbaar genoeg is, gebruik dan een **named Cloudflare Tunnel** (zie `docs/ollama-cloudflare-tunnel.md`).

## Troubleshooting

**"Funnel not available"**
→ Tailscale Funnel is nog in beta. Zorg dat je de nieuwste Tailscale versie hebt:
```bash
tailscale update
```

**"Connection refused"**
→ Ollama draait niet op poort 11434:
```bash
ollama serve
```

**"404 Not Found"**
→ Check je Tailscale machine name:
```bash
tailscale status
```
