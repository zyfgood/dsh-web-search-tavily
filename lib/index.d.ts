/**
 * Tavily-backed `WebSearchProvider` plugin. It contributes to the `ctx.web`
 * registry without owning the service: registers a `tavily` search provider
 * so `web_search` stops costing a DeepSeek cloud model call per query.
 *
 * Mount in the profile (see cordis.patch.yml in this package, or the README):
 *
 * ```yaml
 * - insert:
 *     - id: web-search-tavily
 *       name: '@zyfgood/dsh-web-search-tavily'
 *       config:
 *         apiKey: 'env:TAVILY_API_KEY'
 * - id: web
 *   name: '@deepseek-ai/dsh-web'
 *   config:
 *     searchProvider: tavily
 *     fetchProvider: http
 * ```
 *
 * @module @zyfgood/dsh-web-search-tavily
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { TAVILY_DEFAULT_BASE_URL, TAVILY_DEFAULT_SEARCH_DEPTH, TAVILY_PROVIDER_ID, TavilySearchProvider, } from './provider.ts';
export { mapTavilyResponse, mapTavilyResult } from './provider.ts';
export type { TavilySearchProviderOptions } from './provider.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "web-search-tavily";
/** The web seam this provider registers into. */
export declare const inject: string[];
/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
    /** Tavily API key. Falls back to `$TAVILY_API_KEY`. Empty → provider unavailable. */
    apiKey?: string;
    /** Endpoint base; `/search` is appended. Defaults to the public API. */
    baseURL?: string;
    /** `basic` (default) or `advanced` (re-ranking, 2 credits per query). */
    searchDepth?: 'basic' | 'advanced';
    /** Default result count when a request carries no `maxResults`. Omitted = Tavily default. */
    maxResults?: number;
    /** Whether to request Tavily's generated `answer` (mapped to result `content`). Default false. */
    includeAnswer?: boolean;
}
export declare const Config: z<Config>;
/** `env:VAR` support, mirroring dsh-feishu-bot's secret convention. */
export declare function resolveSecret(raw: string | undefined): string;
/** Register the Tavily search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map