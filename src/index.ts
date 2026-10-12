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
 *       name: dsh-web-search-tavily
 *       config:
 *         apiKey: 'env:TAVILY_API_KEY'
 * - id: web
 *   name: '@deepseek-ai/dsh-web'
 *   config:
 *     searchProvider: tavily
 *     fetchProvider: http
 * ```
 *
 * @module dsh-web-search-tavily
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  TavilySearchProvider,
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_SEARCH_DEPTH,
} from './provider.ts'

export {
  TAVILY_DEFAULT_BASE_URL,
  TAVILY_DEFAULT_SEARCH_DEPTH,
  TAVILY_PROVIDER_ID,
  TavilySearchProvider,
} from './provider.ts'
export { mapTavilyResponse, mapTavilyResult } from './provider.ts'
export type { TavilySearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-tavily'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Tavily API key. Falls back to `$TAVILY_API_KEY`. Empty → provider unavailable. */
  apiKey?: string
  /** Endpoint base; `/search` is appended. Defaults to the public API. */
  baseURL?: string
  /** `basic` (default) or `advanced` (re-ranking, 2 credits per query). */
  searchDepth?: 'basic' | 'advanced'
  /** Default result count when a request carries no `maxResults`. Omitted = Tavily default. */
  maxResults?: number
  /** Whether to request Tavily's generated `answer` (mapped to result `content`). Default false. */
  includeAnswer?: boolean
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  searchDepth: z.union(['basic', 'advanced'] as const),
  maxResults: z.number().step(1).min(1),
  includeAnswer: z.boolean(),
})

/** `env:VAR` support, mirroring dsh-feishu-bot's secret convention. */
export function resolveSecret(raw: string | undefined): string {
  if (raw === undefined) return ''
  if (raw.startsWith('env:')) {
    const name = raw.slice(4)
    const value = process.env[name]
    if (value === undefined) {
      throw new Error(`web-search-tavily: 环境变量 ${name} 未设置（配置项使用了 env: 引用）`)
    }
    return value
  }
  return raw
}

/** Register the Tavily search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const apiKey = resolveSecret(config.apiKey)
    || launchEnvironmentOf(ctx).get('TAVILY_API_KEY')?.value
    || ''
  ctx.web.registerSearchProvider(new TavilySearchProvider({
    apiKey,
    baseURL: config.baseURL ?? TAVILY_DEFAULT_BASE_URL,
    searchDepth: config.searchDepth ?? TAVILY_DEFAULT_SEARCH_DEPTH,
    includeAnswer: config.includeAnswer ?? false,
    ...config.maxResults !== undefined ? { maxResults: config.maxResults } : {},
  }))
}
