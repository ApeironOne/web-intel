import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { WebIntelConfig, ProviderResult } from "../types.js";

const execFileAsync = promisify(execFile);

/**
 * Scrapling CLI — anti-bot web scraper.
 * Used for: reading page content with anti-bot bypass.
 * Escalation: get (fast) → stealthy-fetch (anti-bot).
 *
 * Outputs as .txt for clean text, uses CSS selectors to target
 * main content and skip nav/header/footer junk.
 */

type ScraplingMode = "get" | "stealthy-fetch";

/**
 * Common CSS selectors for main content areas, tried in order.
 * First match with >200 chars wins.
 */
const CONTENT_SELECTORS = [
  "article",
  "main",
  "#content",
  "#mw-content-text",
  '[role="main"]',
  ".post-content",
  ".entry-content",
  ".article-body",
];

async function runScrapling(
  url: string,
  mode: ScraplingMode,
  timeout: number,
  selector?: string,
): Promise<string> {
  const tmpFile = join(
    tmpdir(),
    `web-intel-${randomBytes(6).toString("hex")}.txt`,
  );

  try {
    const args = ["extract", mode, url, tmpFile];
    if (selector) {
      args.push("-s", selector);
    }

    await execFileAsync("scrapling", args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });

    const content = await readFile(tmpFile, "utf-8");
    return content;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

/**
 * Try to extract just the main content using smart CSS selectors.
 * Falls back to full page text if no selector works.
 */
async function smartExtract(
  url: string,
  mode: ScraplingMode,
  timeout: number,
): Promise<string> {
  // First try with content selectors for cleaner output
  for (const selector of CONTENT_SELECTORS) {
    try {
      const content = await runScrapling(url, mode, timeout, selector);
      if (content && content.trim().length > 200) {
        return content.trim();
      }
    } catch {
      // selector didn't match or failed — try next
      continue;
    }
  }

  // Fallback: full page text (no selector)
  const fullPage = await runScrapling(url, mode, timeout);
  return fullPage.trim();
}

export async function fetchWithScrapling(
  config: WebIntelConfig,
  url: string,
  mode: ScraplingMode = "get",
): Promise<ProviderResult<string>> {
  if (!config.scrapling?.enabled) {
    return { ok: false, error: "Scrapling is disabled" };
  }

  let timeout = mode === "stealthy-fetch" ? 45000 : 25000;

  try {
    let content = await smartExtract(url, mode, timeout);

    // Retry once on timeout-like failures for GET mode
    if ((!content || content.length < 200) && mode === "get") {
      // backoff retry
      timeout = 35000;
      content = await smartExtract(url, mode, timeout);
    }

    if (!content || content.length < 200) {
      return {
        ok: false,
        error: `Scrapling (${mode}) got insufficient content (${content.length} chars)`,
      };
    }

    // Cap at 10k chars to avoid flooding the response
    return { ok: true, data: content.slice(0, 10000) };
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
  url: string,
): Promise<ProviderResult<string> & { mode?: ScraplingMode }> {
  // Level 1: fast get
  const fast = await fetchWithScrapling(config, url, "get");
  if (fast.ok) return { ...fast, mode: "get" };

  // Level 2: stealthy fetch (anti-bot bypass)
  const stealth = await fetchWithScrapling(config, url, "stealthy-fetch");
  return { ...stealth, mode: "stealthy-fetch" };
}
