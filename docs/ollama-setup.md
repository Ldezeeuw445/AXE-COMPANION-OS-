# Ollama Setup for AXE Companion

This guide explains how to run AXE's AI assistant locally using [Ollama](https://ollama.com) for **free**, with OpenAI as an automatic fallback.

## Why Local AI?

- **$0 per request** — Ollama runs on your own hardware
- **Privacy** — Your trading data never leaves your machine
- **Speed** — No network latency to OpenAI's servers
- **Fallback** — If Ollama fails, OpenAI kicks in automatically so users never see downtime

## Quick Start

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```

**Or download from:** https://ollama.com/download

### 2. Pull a Model

For **8GB RAM Macs** (recommended):
```bash
ollama pull qwen2.5-coder:7b
```

Alternative models:
```bash
# DeepSeek R1 (8B, good reasoning)
ollama pull deepseek-r1:8b

# Qwen 2.5 14B (better quality, needs 16GB+ RAM)
ollama pull qwen2.5:14b

# Vision model (for chart image analysis)
ollama pull qwen2.5-vl:7b
```

### 3. Start Ollama

```bash
ollama serve
```

By default, Ollama runs on `http://localhost:11434`.

### 4. Verify It's Working

```bash
curl http://localhost:11434/api/tags
```

You should see your pulled models listed.

### 5. Configure AXE Companion

Add to your `.env.local`:

```env
# Ollama (local AI — primary)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b

# OpenAI (fallback when Ollama fails)
OPENAI_API_KEY=sk-...
FALLBACK_TO_OPENAI=true

# Timeout: if Ollama takes longer than this, fall back to OpenAI
OLLAMA_TIMEOUT_MS=15000
```

### 6. Test the Chat

Open AXE Companion, go to **Chat**, and send a message. Check your terminal logs — you should see:

```
[llmClient] Trying Ollama at http://localhost:11434 with model qwen2.5-coder:7b
[llmClient] Ollama success (provider: ollama)
```

If Ollama is not running, you'll see:

```
[llmClient] Ollama failed: fetch failed
[llmClient] Falling back to OpenAI...
[llmClient] OpenAI fallback success (provider: openai)
```

## Connecting Vercel Production to Your Local Ollama (via Cloudflare Tunnel)

If you want your **live Vercel app** to use your local Ollama (instead of expensive OpenAI), use a Cloudflare Tunnel:

### 1. Install cloudflared

```bash
brew install cloudflared
```

### 2. Create a Tunnel

```bash
cloudflared tunnel --url http://localhost:11434
```

This gives you a public URL like:
```
https://mijntradingapp-abc123.trycloudflare.com
```

### 3. Set the Tunnel URL in Vercel

In your Vercel dashboard → Project Settings → Environment Variables:

```
OLLAMA_HOST=https://mijntradingapp-abc123.trycloudflare.com
OLLAMA_MODEL=qwen2.5-coder:7b
FALLBACK_TO_OPENAI=true
OPENAI_API_KEY=sk-...   (still needed as fallback)
```

### 4. Keep the Tunnel Running

Your Mac Mini must stay on with:
- `ollama serve` running
- `cloudflared tunnel` running

If either stops, Vercel automatically falls back to OpenAI.

---

## Securing Your Tunnel with Cloudflare Access (Recommended)

By default, anyone who knows your tunnel URL can access your Ollama. To secure it, add **Cloudflare Access Service Token** authentication:

### 1. Create a Service Token

1. Go to [Cloudflare Zero Trust Dashboard](https://dash.teams.cloudflare.com)
2. Navigate to **Access** → **Service Auth** → **Service Tokens**
3. Click **Create Service Token**
   - Name: `vercel-ollama-access`
   - Client ID: auto-generated (save this)
   - Client Secret: auto-generated (⚠️ **shown only once** — save it immediately!)

### 2. Add an Access Policy

1. Go to **Access** → **Applications**
2. Find your `ollama.axecompanion.com` application (or create one for your tunnel hostname)
3. Add a policy:
   - Name: `Vercel Service Auth`
   - Action: **Allow**
   - Include: **Service Token** → select `vercel-ollama-access`
   - Decision: **Non-identity** (no user login required)

### 3. Add Credentials to Vercel

In your Vercel dashboard → Project Settings → Environment Variables:

```
CF_ACCESS_CLIENT_ID=<your-service-token-client-id>
CF_ACCESS_CLIENT_SECRET=<your-service-token-client-secret>
```

The AXE app automatically sends these headers with every Ollama request. No code changes needed — it's already built in.

### 4. Test Authentication

```bash
curl -H "CF-Access-Client-Id: <your-id>" \
     -H "CF-Access-Client-Secret: <your-secret>" \
     https://ollama.axecompanion.com/api/tags
```

You should see your models listed. Without the headers, you'll get a 403 Forbidden.

---

## Model Recommendations by Hardware

| RAM | Recommended Model | Quality | Speed |
|-----|---------------------|---------|-------|
| 8GB | `qwen2.5-coder:7b` | Good | Fast |
| 8GB | `deepseek-r1:8b` | Good | Medium |
| 16GB | `qwen2.5:14b` | Better | Medium |
| 16GB | `deepseek-r1:14b` | Better | Slower |
| 32GB+ | `qwen2.5:32b` | Best | Slow |

## Troubleshooting

### Ollama connection refused
```
[llmClient] Ollama failed: fetch failed
```
**Fix:** Make sure `ollama serve` is running.

### Model not found
```
[llmClient] Ollama failed: model 'qwen2.5-coder:7b' not found
```
**Fix:** Run `ollama pull qwen2.5-coder:7b`

### Out of memory / slow responses
**Fix:** Use a smaller model (7B instead of 14B), or increase `OLLAMA_TIMEOUT_MS`.

### Tool calls not working
Some models handle tool calling better than others. Qwen 2.5 and DeepSeek are generally reliable. If tool calls fail, the app falls back to OpenAI for that request.

### Image analysis not working
Non-vision models can't see chart images. The app automatically strips the image and sends a text note instead. For full image support, use a vision model like `qwen2.5-vl:7b`.

## Advanced: Running Ollama on a Dedicated Server

If you have a more powerful machine (or a cheap VPS), run Ollama there and point both your local dev and Vercel production to it:

```env
# On your dev machine AND in Vercel
OLLAMA_HOST=https://your-ollama-server.com
OLLAMA_MODEL=qwen2.5:14b
```

This gives you one central AI server for all environments.
