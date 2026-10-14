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
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import z from '@deepseek-ai/schemastery';
import { TavilySearchProvider, TAVILY_DEFAULT_BASE_URL, TAVILY_DEFAULT_SEARCH_DEPTH, } from "./provider.js";
export { TAVILY_DEFAULT_BASE_URL, TAVILY_DEFAULT_SEARCH_DEPTH, TAVILY_PROVIDER_ID, TavilySearchProvider, } from "./provider.js";
export { mapTavilyResponse, mapTavilyResult } from "./provider.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-tavily';
/** The web seam this provider registers into. */
export const inject = ['web'];
export const Config = z.object({
    apiKey: z.string(),
    baseURL: z.string(),
    searchDepth: z.union(['basic', 'advanced']),
    maxResults: z.number().step(1).min(1),
    includeAnswer: z.boolean(),
});
/** `env:VAR` support, mirroring dsh-feishu-bot's secret convention. */
export function resolveSecret(raw) {
    if (raw === undefined)
        return '';
    if (raw.startsWith('env:')) {
        const name = raw.slice(4);
        const value = process.env[name];
        if (value === undefined) {
            throw new Error(`web-search-tavily: 环境变量 ${name} 未设置（配置项使用了 env: 引用）`);
        }
        return value;
    }
    return raw;
}
/** Register the Tavily search provider with `ctx.web`. */
export function apply(ctx, config) {
    const apiKey = resolveSecret(config.apiKey)
        || launchEnvironmentOf(ctx).get('TAVILY_API_KEY')?.value
        || '';
    ctx.web.registerSearchProvider(new TavilySearchProvider({
        apiKey,
        baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
        searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
        includeAnswer: config.includeAnswer ?? false,
        ...config.maxResults !== undefined ? { maxResults: config.maxResults } : {},
    }));
}
//# sourceMappingURL=index.js.map