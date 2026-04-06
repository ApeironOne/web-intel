import { definePluginEntry } from "./types.js";
import { loadConfig } from "./config.js";
import { routeFetch } from "./router.js";
import { takeScreenshot } from "./providers/screenshot.js";
import { Type } from "@sinclair/typebox";

export default definePluginEntry({
  id: "web-intel",
  name: "Web Intelligence",
  description:
    "Smart-routing web fetch: Scrapling → FlareSolverr → Browser",

  register(api) {
    const config = loadConfig() as any;

    api.logger.info(
      `web-intel: registering (searxng=${config.searxng?.baseUrl}, flaresolverr=${config.flaresolverr?.baseUrl}, scrapling=${config.scrapling?.enabled}, browser=${config.browser?.enabled})`
    );

    // Register web_intel_fetch for page reading with escalation
    api.registerTool({
      name: "web_intel_fetch",
      label: "Web Fetch (Smart Escalation)",
      description:
        "Fetch and read a web page with smart escalation: Scrapling → FlareSolverr → Browser. Handles Cloudflare, anti-bot, and JS-heavy sites automatically. For SearXNG searches, use the URL format: http://localhost:8890/search?q=YOUR_QUERY&format=json",
      parameters: Type.Object(
        {
          url: Type.String({ description: "URL to fetch and read. For SearXNG searches, use: http://localhost:8890/search?q=YOUR_QUERY&format=json" }),
        },
        { additionalProperties: false }
      ),
      async execute(_id: string, params: { url: string }) {
        const runtimeConfig = loadConfig(undefined);
        const result = await routeFetch(runtimeConfig, params.url);

        return {
          content: [
            {
              type: "text" as const,
              text: result.content,
            },
          ],
          details: {
            provider: result.provider,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
          },
        };
      },
    });

    // Register screenshot tool (OpenClaw Browser)
    api.registerTool((ctx) => ({
      name: "web_intel_screenshot",
      label: "Web Screenshot (OpenClaw Browser)",
      description:
        "Take a screenshot of a web page using OpenClaw's native browser automation. Returns a PNG image buffer.",
      parameters: Type.Object(
        {
          url: Type.String({ description: "URL to capture." }),
          width: Type.Optional(
            Type.Number({
              description: "Screenshot width in pixels (default 1280).",
              minimum: 320,
              maximum: 4096,
            })
          ),
          height: Type.Optional(
            Type.Number({
              description: "Screenshot height in pixels (default 720).",
              minimum: 240,
              maximum: 4096,
            })
          ),
        },
        { additionalProperties: false }
      ),
      async execute(
        _id: string,
        params: { url: string; width?: number; height?: number }
      ) {
        const result = await takeScreenshot(
          {
            sandboxBridgeUrl: ctx.browser?.sandboxBridgeUrl,
            allowHostControl: ctx.browser?.allowHostControl,
            sessionKey: ctx.sessionKey,
          },
          params.url,
          params.width ?? 1280,
          params.height ?? 720
        );

        if (!result.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Screenshot failed: ${result.error}`,
              },
            ],
            details: {
              provider: "openclaw-browser",
              width: params.width ?? 1280,
              height: params.height ?? 720,
              url: params.url,
              error: result.error,
            },
          };
        }

        return {
          content: [
            {
              type: "image" as const,
              data: result.data!.toString("base64"),
              mimeType: "image/png",
            },
          ],
          details: {
            provider: "openclaw-browser",
            width: params.width ?? 1280,
            height: params.height ?? 720,
            url: params.url,
          },
        };
      },
    }));

    api.logger.info("web-intel: registered web_intel_fetch + web_intel_screenshot tools");
  },
});
