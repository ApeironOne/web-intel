import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WebIntelConfig, ProviderResult } from "../types.js";

const execFileAsync = promisify(execFile);

/**
 * Escalation levels for scrapling:
 * 1. get — fast HTTP fetch with browser fingerprint
 * 2. stealthy-fetch — full anti-bot evasion (slower)
 */
type ScraplingMode = "get" | "stealthy-fetch";

const SCRAPLING_SCRIPT = `
import sys, json
try:
    from scrapling import Fetcher, StealthyFetcher
    url = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "get"
    
    if mode == "stealthy-fetch":
        page = StealthyFetcher().fetch(url)
    else:
        page = Fetcher().get(url)
    
    # Extract readable text
    text = page.get_all_text(separator="\\n", strip=True) if hasattr(page, 'get_all_text') else str(page.text or "")
    
    result = {
        "ok": True,
        "content": text[:50000],  # Cap at 50k chars
        "status": getattr(page, 'status', 200),
        "url": url
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;

export async function fetchWithScrapling(
  config: WebIntelConfig,
  url: string,
  mode: ScraplingMode = "get"
): Promise<ProviderResult<string>> {
  if (!config.scrapling?.enabled) {
    return { ok: false, error: "Scrapling is disabled" };
  }

  const pythonPath = config.scrapling?.pythonPath || "python3";

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      ["-c", SCRAPLING_SCRIPT, url, mode],
      {
        timeout: mode === "stealthy-fetch" ? 30000 : 15000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      }
    );

    if (!stdout.trim()) {
      return {
        ok: false,
        error: `Scrapling (${mode}) returned empty output${stderr ? `: ${stderr.slice(0, 200)}` : ""}`,
      };
    }

    const result = JSON.parse(stdout.trim()) as {
      ok: boolean;
      content?: string;
      error?: string;
    };

    if (!result.ok || !result.content) {
      return {
        ok: false,
        error: result.error || "Scrapling returned no content",
      };
    }

    // If content is too short, likely blocked
    if (result.content.length < 200) {
      return {
        ok: false,
        error: `Scrapling (${mode}) got insufficient content (${result.content.length} chars)`,
      };
    }

    return { ok: true, data: result.content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Scrapling (${mode}) error: ${msg}` };
  }
}

/**
 * Full scrapling escalation chain: get → stealthy-fetch
 */
export async function fetchWithScraplingEscalation(
  config: WebIntelConfig,
  url: string
): Promise<ProviderResult<string> & { mode?: ScraplingMode }> {
  // Level 1: fast get
  const fast = await fetchWithScrapling(config, url, "get");
  if (fast.ok) return { ...fast, mode: "get" };

  // Level 2: stealthy fetch
  const stealth = await fetchWithScrapling(config, url, "stealthy-fetch");
  return { ...stealth, mode: "stealthy-fetch" };
}
