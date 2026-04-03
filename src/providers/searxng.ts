import type { WebIntelConfig, SearchResult, ProviderResult } from "../types.js";

export interface SearxngSearchParams {
  query: string;
  count?: number;
  categories?: string;
  language?: string;
}

interface SearxngRawResult {
  url: string;
  title: string;
  content?: string;
}

// In-memory cache: key → { results, expiresAt }
const cache = new Map<string, { data: SearchResult[]; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(params: SearxngSearchParams): string {
  return JSON.stringify({
    q: params.query,
    c: params.categories || "",
    l: params.language || "",
    n: params.count || 5,
  });
}

export async function searchSearxng(
  config: WebIntelConfig,
  params: SearxngSearchParams
): Promise<ProviderResult<SearchResult[]>> {
  const baseUrl = config.searxng?.baseUrl;
  if (!baseUrl) {
    return { ok: false, error: "SearXNG base URL not configured" };
  }

  const count = params.count || 5;
  const categories = params.categories || config.searxng?.categories || "general";
  const language = params.language || config.searxng?.language;

  // Check cache
  const key = cacheKey(params);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.data };
  }

  // Build URL
  const url = new URL(baseUrl);
  url.pathname = url.pathname.endsWith("/")
    ? `${url.pathname}search`
    : `${url.pathname}/search`;
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  if (categories) url.searchParams.set("categories", categories);
  if (language) url.searchParams.set("language", language);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "web-intel/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: `SearXNG returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { results?: SearxngRawResult[] };
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const results: SearchResult[] = rawResults
      .filter((r) => r.url && r.title)
      .slice(0, count)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content || "",
        source: "searxng",
      }));

    // Cache results
    cache.set(key, { data: results, expiresAt: Date.now() + CACHE_TTL_MS });

    return { ok: true, data: results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `SearXNG error: ${msg}` };
  }
}
