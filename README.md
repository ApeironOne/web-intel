# Web Intelligence — OpenClaw Plugin

Smart-routing web search & fetch for OpenClaw. Zero API cost, self-hosted.

## What It Does

Replaces the built-in `web_search` with an intelligent routing chain:

### Search Chain
```
web_search("query")
    ↓
SearXNG (local, ~200ms) → Browser DDG fallback (~3-5s)
```

### Fetch Chain
```
web_intel_fetch("https://example.com")
    ↓
Scrapling (fast) → Scrapling (stealthy) → FlareSolverr (Cloudflare) → Browser
```

## Prerequisites

- **SearXNG** instance (self-hosted)
- **FlareSolverr** instance (for Cloudflare bypass)
- **Python 3** with `scrapling` installed (for anti-bot page reading)

## Install

```bash
openclaw plugins install @ApeironOne/openclaw-web-intel
```

Or from source:
```bash
git clone https://github.com/ApeironOne/web-intel
cd web-intel
npm install && npm run build
openclaw plugins install ./
```

## Configuration

In your OpenClaw config:

```json5
{
  plugins: {
    entries: {
      "web-intel": {
        config: {
          searxng: {
            baseUrl: "http://192.168.0.126:8890",
            categories: "general",
          },
          flaresolverr: {
            baseUrl: "http://192.168.0.126:8191",
          },
          scrapling: {
            enabled: true,
            pythonPath: "python3",
          },
          browser: {
            enabled: true,
          },
        },
      },
    },
  },
  tools: {
    web: {
      search: {
        provider: "web-intel",
      },
    },
  },
}
```

Or use environment variables:
```bash
export SEARXNG_BASE_URL="http://192.168.0.126:8890"
export FLARESOLVERR_URL="http://192.168.0.126:8191"
```

## Tools Provided

### `web_search` (provider replacement)
Replaces the built-in web_search with smart routing.

Parameters:
- `query` (string, required) — Search query
- `count` (number, 1-10) — Number of results
- `categories` (string) — general, news, it, science, files, images
- `language` (string) — Language code (en, ja, de, etc.)

### `web_intel_fetch` (new tool)
Fetches and reads web pages with automatic escalation through anti-bot measures.

Parameters:
- `url` (string, required) — URL to fetch

## How It Works

### Search Routing
1. **SearXNG** (local, ~200ms) — great for tech, code, docs, Reddit, GitHub
2. **DuckDuckGo Lite** (browser fallback, ~3s) — guaranteed results for general queries

### Fetch Routing
1. **Scrapling GET** (~500ms) — works for 80% of sites
2. **Scrapling Stealthy** (~2s) — anti-bot fingerprint evasion
3. **FlareSolverr** (~5-15s) — solves Cloudflare challenges with real Chrome
4. **Browser Fetch** (~3s) — simple browser-header fallback

Each step only runs if the previous one fails. The response includes which provider succeeded and the full escalation chain.

## Ship Deployment

This plugin runs **locally on each ship** — not on DS9.
It just points at whatever SearXNG/FlareSolverr endpoints are available on the network.

- **USS Prometheus** (Mac) → SearXNG + FlareSolverr on DS9
- **USS Hathaway** (DS9) → localhost SearXNG + FlareSolverr
- **USS DaVinci** (work) → Can use any reachable SearXNG instance

## License

MIT
