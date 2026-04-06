import type { ProviderResult } from "../types.js";
import { callGatewayTool } from "openclaw/plugin-sdk/browser-support";

export interface BrowserRuntimeContext {
  sandboxBridgeUrl?: string;
  allowHostControl?: boolean;
  sessionKey?: string;
}

/**
 * OpenClaw Browser Screenshot Provider (SDK runtime)
 * Uses gateway method browser.request (owner scope) to avoid HTTP /tools/invoke auth.
 */

export async function takeScreenshot(
  _ctx: BrowserRuntimeContext,
  url: string,
  width: number = 1280,
  height: number = 720
): Promise<ProviderResult<Buffer>> {
  try {
    // 1) open tab
    const opened = await callGatewayTool("browser.request", {}, {
      method: "POST",
      path: "/tabs/open",
      body: { url },
      query: { profile: "clawd" },
      timeoutMs: 20000,
    });

    const targetId = (opened as any)?.targetId;

    // 2) optional navigate (ensures load)
    await callGatewayTool("browser.request", {}, {
      method: "POST",
      path: "/navigate",
      body: { url, targetId },
      query: { profile: "clawd" },
      timeoutMs: 20000,
    });

    // 3) screenshot
    const shot = await callGatewayTool("browser.request", {}, {
      method: "POST",
      path: "/screenshot",
      body: { targetId, type: "png", width, height },
      query: { profile: "clawd" },
      timeoutMs: 20000,
    });

    const imagePath = (shot as any)?.path;
    const imageBase64 = (shot as any)?.base64;
    if (imageBase64) {
      return { ok: true, data: Buffer.from(imageBase64, "base64") };
    }
    if (!imagePath) {
      return { ok: false, error: "Screenshot action returned no image data." };
    }

    // If gateway returns file path only, the browser.request should already map files to base64.
    // Fallback if it doesn't.
    return { ok: false, error: `Screenshot returned file path without base64: ${imagePath}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Screenshot provider error: ${msg}` };
  }
}
