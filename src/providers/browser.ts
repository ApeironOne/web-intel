import type { WebIntelConfig, SearchResult, ProviderResult } from "../types.js";

/**
 * Agent Browser fallback — uses OpenClaw's built-in browser tool
 * or a remote headless Chrome endpoint.
 * 
 * This is the last resort in the escalation chain.
 * It's the slowest but most reliable — real Chrome handles everything.
 * 
 * For now, this provider shells out to a browser automation script.
 * When OpenClaw exposes browser APIs to plugins, we'll use those directly.
 */

// Inline DuckDuckGo HTML parser for search fallback
function parseDdgHtml(html: string, count: number): SearchResult[] {
  const results: SearchResult[] = [];
  
  // DuckDuckGo lite results pattern
  const linkPattern = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const snippetPattern = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  
  let linkMatch;
  const links: { url: string; title: string }[] = [];
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    links.push({ url: linkMatch[1], title: linkMatch[2].trim() });
  }

  let snippetMatch;
  const snippets: string[] = [];
  while ((snippetMatch = snippetPattern.exec(html)) !== null) {
    snippets.push(snippetMatch[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(links.length, count); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
      source: "browser-ddg",
    });
  }

  return results;
}

/**
 * Fetch a URL using a headless browser.
 * Falls through to FlareSolverr's Chrome if available,
 * otherwise uses a simple fetch with browser-like headers.
 */
export async function fetchWithBrowser(
  config: WebIntelConfig,
  url: string
): Promise<ProviderResult<string>> {
  // For now, use a browser-like fetch as a simple fallback.
  // Full headless Chrome integration requires OpenClaw plugin browser API
  // or a Playwright/Puppeteer subprocess.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: `Browser fetch returned ${response.status}`,
      };
    }

    const text = await response.text();
    if (text.length < 100) {
      return { ok: false, error: "Browser fetch got insufficient content" };
    }

    return { ok: true, data: text.slice(0, 100000) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Browser fetch error: ${msg}` };
  }
}

/**
 * Search via DuckDuckGo Lite (HTML) using browser-like fetch.
 * Used as the last-resort search fallback when SearXNG fails.
 */
export async function searchWithBrowser(
  config: WebIntelConfig,
  query: string,
  count: number = 5
): Promise<ProviderResult<SearchResult[]>> {
  const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

  const htmlResult = await fetchWithBrowser(config, ddgUrl);
  if (!htmlResult.ok) return htmlResult as ProviderResult<SearchResult[]>;

  const results = parseDdgHtml(htmlResult.data, count);
  if (results.length === 0) {
    return { ok: false, error: "No results parsed from DuckDuckGo" };
  }

  return { ok: true, data: results };
}
