# Ollama Cloudflare Tunnel Setup for AXE Companion

This guide explains how to expose your local Ollama instance to AXE Companion running on Vercel, using a **named Cloudflare Tunnel** (stable, permanent URL).

> ⚠️ **Important**: Ephemeral `trycloudflare.com` tunnels do NOT work for server-to-server requests because Cloudflare returns a browser challenge page. You must use a **named tunnel** with a domain you control.

## Prerequisites

- A domain managed by Cloudflare (e.g., `yourdomain.com`)
- Ollama installed and running locally on port 11434
- `cloudflared` CLI installed

## Step 1: Install cloudflared

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

## Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser to authorize `cloudflared` with your Cloudflare account.

## Step 3: Create a Named Tunnel

```bash
cloudflared tunnel create axe-ollama
```

This creates a tunnel and prints a tunnel ID. Save it — you'll need it later.

## Step 4: Route DNS to the Tunnel

```bash
cloudflared tunnel route dns axe-ollama ollama.yourdomain.com
```

This creates a DNS record `ollama.yourdomain.com` → your tunnel.

## Step 5: Configure the Tunnel

Create or edit `~/.cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /Users/<YOUR_USERNAME>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ollama.yourdomain.com
    service: http://localhost:11434
  - service: http_status:404
```

Replace `<YOUR_TUNNEL_ID>` with the ID from Step 3.

## Step 6: Run the Tunnel

```bash
cloudflared tunnel run axe-ollama
```

Keep this running. For production, set it up as a system service:

```bash
# macOS (launchd)
cloudflared service install

# Linux (systemd)
sudo cloudflared service install
sudo systemctl start cloudflared
```

## Step 7: Set Environment Variables on Vercel

In your Vercel project settings, add:

```
OLLAMA_URL=https://ollama.yourdomain.com
OLLAMA_MODEL=llama3.1
LLM_FALLBACK_ENABLED=true
```

Keep `OPENAI_API_KEY` set as the fallback.

## Step 8: Verify

Test from any machine:

```bash
curl https://ollama.yourdomain.com/api/tags
```

You should see a list of your locally installed models.

## Model Recommendations

| Use Case | Model | Size | Notes |
|----------|-------|------|-------|
| AXE chat (tools + reasoning) | `llama3.1` | 8B | Best tool support, good balance |
| AXE chat (heavier) | `llama3.1:70b` | 70B | Best quality, requires GPU |
| Memory extraction | `llama3.1` | 8B | Simple JSON extraction |
| Journaling | `mistral` | 7B | Fast structured JSON |
| Intel analysis | `mixtral:8x7b` | 47B | Complex multi-feed reasoning |

Start with `llama3.1` (8B) for everything. If quality is insufficient for a specific use case, upgrade that one.

## Troubleshooting

### "Ollama failed, falling back to OpenAI"
- Check tunnel is running: `cloudflared tunnel info axe-ollama`
- Verify DNS: `dig ollama.yourdomain.com`
- Test directly: `curl https://ollama.yourdomain.com/api/tags`

### Tool calls not working
- Ollama tool support requires models that support it: Llama 3.1+, Mistral, Qwen 2.5+
- Check model compatibility: `ollama show llama3.1 | grep -i tool`

### Slow responses
- 70B models are slow on CPU. Use 8B models for faster responses.
- Increase timeout: `OLLAMA_TIMEOUT_MS=120000` (2 minutes)

### Tunnel stops working after reboot
- Set up `cloudflared` as a system service (see Step 6)
- Or use a process manager like `pm2` or `systemd`

## Rollback

To disable Ollama and revert to OpenAI-only:

1. Unset `OLLAMA_URL` on Vercel, OR
2. Set `LLM_FALLBACK_ENABLED=false` (forces Ollama-only, will error if Ollama down)

## Architecture

```
AXE Companion (Vercel)
  → POST /api/intel-chat, /api/intel-conviction, etc.
    → llmRouter.ts
      → Try Ollama first (via Cloudflare tunnel)
        → Ollama on your local machine
      → If Ollama fails → OpenAI fallback
```

All AI calls now go through `src/lib/llm/llmRouter.ts` which implements the fallback logic centrally.
