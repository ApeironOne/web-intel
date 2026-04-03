import type { WebIntelConfig, ProviderResult } from "../types.js";

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    cookies: Array<{ name: string; value: string }>;
    userAgent: string;
  };
}

/**
 * Use FlareSolverr to bypass Cloudflare challenges and fetch page content.
 * FlareSolverr spins up a real Chrome instance to solve challenges.
 */
export async function fetchWithFlaresolverr(
  config: WebIntelConfig,
  url: string
): Promise<ProviderResult<string>> {
  const baseUrl = config.flaresolverr?.baseUrl;
  if (!baseUrl) {
    return { ok: false, error: "FlareSolverr URL not configured" };
  }

  const maxTimeout = config.flaresolverr?.maxTimeout || 60000;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), maxTimeout + 5000);

    const response = await fetch(`${baseUrl}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: `FlareSolverr returned ${response.status}`,
      };
    }

    const data = (await response.json()) as FlareSolverrResponse;

    if (data.status !== "ok" || !data.solution?.response) {
      return {
        ok: false,
        error: `FlareSolverr failed: ${data.message || "no solution"}`,
      };
    }

    return { ok: true, data: data.solution.response };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `FlareSolverr error: ${msg}` };
  }
}

/**
 * Use FlareSolverr to search via a URL (e.g., DuckDuckGo HTML).
 * Returns raw HTML that can be parsed for search results.
 */
export async function searchWithFlaresolverr(
  config: WebIntelConfig,
  searchUrl: string
): Promise<ProviderResult<string>> {
  return fetchWithFlaresolverr(config, searchUrl);
}
