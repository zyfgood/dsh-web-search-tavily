/**
 * `TavilySearchProvider`: a `WebSearchProvider` backed by the Tavily Search API
 * (`POST /search`). It maps Tavily's `results[]` to normalized sources — `content`
 * becomes `snippet` (Tavily returns a content extract per result), `published_date`
 * becomes `publishedAt`, `score` is not portable and is dropped. The optional
 * `answer` field (Tavily's generated answer, opt-in via `includeAnswer`) maps to
 * the seam's `content`.
 * @module dsh-web-search-tavily/provider
 */
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { TavilyResult, TavilySearchResponse } from './types.ts';
/** Stable id this provider registers under. */
export declare const TAVILY_PROVIDER_ID = "tavily";
/** Default Tavily endpoint; `/search` is the operation. */
export declare const TAVILY_DEFAULT_BASE_URL = "https://api.tavily.com";
/** Default search depth: 'basic' is faster/cheaper, 'advanced' re-ranks. */
export declare const TAVILY_DEFAULT_SEARCH_DEPTH = "basic";
/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface TavilySearchProviderOptions {
    /** Tavily API key, or comma-separated keys for rotation. Empty → unavailable. */
    apiKey: string;
    /** Endpoint base; `/search` is appended. */
    baseURL: string;
    /** `basic` (default) or `advanced` (re-ranking, more credits). */
    searchDepth: 'basic' | 'advanced';
    /** Default result count when a request carries no `maxResults`. Omitted = Tavily default (5). */
    maxResults?: number;
    /** Whether to request Tavily's generated `answer` (maps to result `content`). */
    includeAnswer: boolean;
}
/**
 * Map one Tavily result to a normalized source, or `undefined` when it carries no
 * portable content (an entry with no extract and no title can only be a bare URL;
 * keep it only when even a title exists to display).
 *
 * @param result - one entry of Tavily's `results[]`.
 * @returns the normalized source, or `undefined` when the entry is unusable.
 */
export declare function mapTavilyResult(result: TavilyResult): WebSearchSource | undefined;
/**
 * Map a Tavily response envelope to a normalized search result.
 *
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result; URL/content-less entries are dropped
 *   ({@link mapTavilyResult}).
 */
export declare function mapTavilyResponse(response: TavilySearchResponse): WebSearchResult;
/** Parse comma-separated keys from the raw apiKey config value. */
export declare function parseTavilyKeys(raw: string): string[];
/**
 * The Tavily-backed search provider with multi-key rotation (Hermes-compatible:
 * `apiKey` may be comma-separated). A sticky index keeps using the last key that
 * worked; on 401/429/5xx the next key is tried within the same call. HTTP
 * redirects fail as `WEB_PROVIDER_ERROR`.
 */
export declare class TavilySearchProvider implements WebSearchProvider {
    private readonly options;
    readonly id = "tavily";
    /** Sticky index into {@link keys}: the last key that worked, tried first. */
    private stickyIndex;
    constructor(options: TavilySearchProviderOptions);
    /** All configured keys (split from `apiKey` on commas). */
    get keys(): readonly string[];
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    /** One search attempt with a single key. Throws WebError with a rotatable code on failure. */
    private searchWithKey;
}
//# sourceMappingURL=provider.d.ts.map