import { definePluginEntry } from "./types.js";
import { loadConfig } from "./config.js";
import { routeSearch, routeFetch } from "./router.js";
import { Type } from "@sinclair/typebox";

export default definePluginEntry({
  id: "web-intel",
  name: "Web Intelligence",
  description:
    "Smart-routing web search & fetch: SearXNG → Scrapling → FlareSolverr → Browser",

  register(api) {
    const config = loadConfig() as any;

    api.logger.info(
      `web-intel: registering (searxng=${config.searxng?.baseUrl}, flaresolverr=${config.flaresolverr?.baseUrl}, scrapling=${config.scrapling?.enabled}, browser=${config.browser?.enabled})`
    );

    // Register as a web search provider — replaces built-in web_search
    api.registerWebSearchProvider({
      id: "web-intel",
      label: "Web Intelligence (Smart Router)",
      hint: "Smart-routing search: SearXNG → FlareSolverr → Browser fallback. Zero API cost.",
      requiresCredential: false,
      credentialLabel: "SearXNG Base URL (optional, auto-detected)",
      envVars: ["SEARXNG_BASE_URL", "FLARESOLVERR_URL"],
      placeholder: "http://192.168.0.126:8890",
      signupUrl: "https://github.com/ApeironOne/web-intel",
      autoDetectOrder: 10, // Highest priority (lower = higher priority)
      credentialPath: "plugins.entries.web-intel.config.searxng.baseUrl",

      getCredentialValue: (searchConfig?: Record<string, unknown>) => {
        return (searchConfig as Record<string, unknown>)?.["web-intel"] ?? undefined;
      },

      setCredentialValue: (
        searchConfigTarget: Record<string, unknown>,
        value: unknown
      ) => {
        searchConfigTarget["web-intel"] = value;
      },

      createTool: (ctx) => ({
        description:
          "Search the web using smart routing: tries SearXNG (fast, local) first, then DuckDuckGo via browser fallback. Returns titles, URLs, and snippets. Zero API cost.",
        parameters: Type.Object(
          {
            query: Type.String({ description: "Search query string." }),
            count: Type.Optional(
              Type.Number({
                description: "Number of results (1-10).",
                minimum: 1,
                maximum: 10,
              })
            ),
            categories: Type.Optional(
              Type.String({
                description:
                  "Search categories: general, news, it, science, files, images, music, videos.",
              })
            ),
            language: Type.Optional(
              Type.String({
                description: "Language code for results (e.g., en, ja, de).",
              })
            ),
          },
          { additionalProperties: false }
        ),
        execute: async (args: Record<string, unknown>) => {
          const runtimeConfig = loadConfig(
            ctx.config?.plugins?.entries?.["web-intel"]?.config as
              | Record<string, unknown>
              | undefined
          );

          const result = await routeSearch(runtimeConfig, {
            query: args.query as string,
            count: args.count as number | undefined,
            categories: args.categories as string | undefined,
            language: args.language as string | undefined,
          });

          return {
            query: result.query,
            provider: result.provider,
            count: result.count,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
            externalContent: {
              untrusted: true,
              source: "web_search",
              provider: "web-intel",
              wrapped: true,
            },
            results: result.results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              siteName: r.source || undefined,
            })),
          };
        },
      }),
    });

    // Also register a web_fetch tool for page reading with escalation
    api.registerTool({
      name: "web_intel_fetch",
      label: "Web Fetch (Smart Escalation)",
      description:
        "Fetch and read a web page with smart escalation: Scrapling → FlareSolverr → Browser. Handles Cloudflare, anti-bot, and JS-heavy sites automatically.",
      parameters: Type.Object(
        {
          url: Type.String({ description: "URL to fetch and read." }),
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

    // ALSO register web_search as a direct tool override
    api.registerTool({
      name: "web_search",
      label: "Web Search (Smart Router)",
      description:
        "Search the web using smart routing: tries SearXNG (fast, local) first, then DuckDuckGo via browser fallback. Returns titles, URLs, and snippets. Zero API cost.",
      parameters: Type.Object(
        {
          query: Type.String({ description: "Search query string." }),
          count: Type.Optional(
            Type.Number({
              description: "Number of results (1-10).",
              minimum: 1,
              maximum: 10,
            })
          ),
          categories: Type.Optional(
            Type.String({
              description:
                "Search categories: general, news, it, science, files, images, music, videos.",
            })
          ),
          language: Type.Optional(
            Type.String({
              description: "Language code for results (e.g., en, ja, de).",
            })
          ),
        },
        { additionalProperties: false }
      ),
      async execute(_id: string, args: Record<string, unknown>) {
        const runtimeConfig = loadConfig();
        const result = await routeSearch(runtimeConfig, {
          query: args.query as string,
          count: args.count as number | undefined,
          categories: args.categories as string | undefined,
          language: args.language as string | undefined,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {
            query: result.query,
            provider: result.provider,
            count: result.count,
            tookMs: result.tookMs,
            escalated: result.escalated,
            escalationChain: result.escalationChain,
            results: result.results,
          },
        };
      },
    });

    api.logger.info("web-intel: registered web_search tool override + web_intel_fetch tool");
  },
});
