/**
 * `TavilySearchProvider`: a `WebSearchProvider` backed by the Tavily Search API
 * (`POST /search`). It maps Tavily's `results[]` to normalized sources — `content`
 * becomes `snippet` (Tavily returns a content extract per result), `published_date`
 * becomes `publishedAt`, `score` is not portable and is dropped. The optional
 * `answer` field (Tavily's generated answer, opt-in via `includeAnswer`) maps to
 * the seam's `content`.
 * @module dsh-web-search-tavily/provider
 */
import { WebError } from '@deepseek-ai/dsh-web';
/** Stable id this provider registers under. */
export const TAVILY_PROVIDER_ID = 'tavily';
/** Default Tavily endpoint; `/search` is the operation. */
export const TAVILY_DEFAULT_BASE_URL = 'https://api.tavily.com';
/** Default search depth: 'basic' is faster/cheaper, 'advanced' re-ranks. */
export const TAVILY_DEFAULT_SEARCH_DEPTH = 'basic';
/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = '@zyfgood/dsh-web-search-tavily/0.2.0';
/**
 * Map one Tavily result to a normalized source, or `undefined` when it carries no
 * portable content (an entry with no extract and no title can only be a bare URL;
 * keep it only when even a title exists to display).
 *
 * @param result - one entry of Tavily's `results[]`.
 * @returns the normalized source, or `undefined` when the entry is unusable.
 */
export function mapTavilyResult(result) {
    const url = result.url?.trim();
    if (url === undefined || url.length === 0)
        return undefined;
    const content = result.content?.trim();
    const title = result.title?.trim();
    if ((content === undefined || content.length === 0) && (title === undefined || title.length === 0)) {
        return undefined;
    }
    return {
        url,
        ...title !== undefined && title.length > 0 ? { title } : {},
        ...content !== undefined && content.length > 0 ? { snippet: content } : {},
        ...result.published_date !== undefined && result.published_date.length > 0
            ? { publishedAt: result.published_date }
            : {},
    };
}
/**
 * Map a Tavily response envelope to a normalized search result.
 *
 * @param response - the parsed `POST /search` response body.
 * @returns the normalized result; URL/content-less entries are dropped
 *   ({@link mapTavilyResult}).
 */
export function mapTavilyResponse(response) {
    const sources = (response.results ?? [])
        .map(mapTavilyResult)
        .filter((source) => source !== undefined);
    // The web service owns the final `maxResults` truncation, so this provider
    // reports `truncated: false`. Tavily's `answer` (requested via includeAnswer)
    // is optional generated text → seam `content`.
    const answer = response.answer?.trim();
    return {
        sources,
        truncated: false,
        ...answer !== undefined && answer.length > 0 ? { content: answer } : {},
    };
}
/** Parse comma-separated keys from the raw apiKey config value. */
export function parseTavilyKeys(raw) {
    return raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
}
/**
 * The Tavily-backed search provider with multi-key rotation (Hermes-compatible:
 * `apiKey` may be comma-separated). A sticky index keeps using the last key that
 * worked; on 401/429/5xx the next key is tried within the same call. HTTP
 * redirects fail as `WEB_PROVIDER_ERROR`.
 */
export class TavilySearchProvider {
    options;
    id = TAVILY_PROVIDER_ID;
    /** Sticky index into {@link keys}: the last key that worked, tried first. */
    stickyIndex = 0;
    constructor(options) {
        this.options = options;
    }
    /** All configured keys (split from `apiKey` on commas). */
    get keys() {
        return parseTavilyKeys(this.options.apiKey);
    }
    available() {
        return this.keys.length > 0
            && isValidBaseUrl(this.options.baseURL)
            && (this.options.maxResults === undefined || isPositiveInteger(this.options.maxResults));
    }
    async search(request, signal) {
        const keys = this.keys;
        if (keys.length === 0) {
            throw new WebError('Tavily search unavailable: no API key configured', 'WEB_PROVIDER_UNAVAILABLE');
        }
        // Sticky-first rotation order: keys[sticky], then the rest round-robin.
        const order = [keys[this.stickyIndex]];
        for (let i = 1; i < keys.length; i++)
            order.push(keys[(this.stickyIndex + i) % keys.length]);
        let lastError;
        for (const key of order) {
            try {
                const result = await this.searchWithKey(key, request, signal);
                this.stickyIndex = keys.indexOf(key); // success → stick to this key
                return result;
            }
            catch (error) {
                if (error instanceof WebError && error.code === 'WEB_ABORTED')
                    throw error;
                lastError = error instanceof WebError ? error : new WebError(String(error), 'WEB_PROVIDER_ERROR');
                // 401/429/5xx (and transport errors) rotate to the next key; other
                // provider errors (e.g. malformed request) fail fast — rotating cannot help.
                if (!(error instanceof WebError) || !isRotatableProviderError(error))
                    break;
            }
        }
        throw lastError ?? new WebError('Tavily search failed', 'WEB_PROVIDER_ERROR');
    }
    /** One search attempt with a single key. Throws WebError with a rotatable code on failure. */
    async searchWithKey(key, request, signal) {
        // A per-request bound wins over the configured default; either may be absent.
        const maxResults = request.maxResults ?? this.options.maxResults;
        let response;
        try {
            response = await fetch(`${this.options.baseURL}/search`, {
                method: 'POST',
                redirect: 'error',
                headers: {
                    'authorization': `Bearer ${key}`,
                    'content-type': 'application/json',
                    'accept': 'application/json',
                    'user-agent': USER_AGENT,
                },
                body: JSON.stringify({
                    query: request.query,
                    search_depth: this.options.searchDepth,
                    include_answer: this.options.includeAnswer,
                    ...maxResults !== undefined ? { max_results: maxResults } : {},
                }),
                ...signal !== undefined ? { signal } : {},
            });
        }
        catch (error) {
            if (isAbortError(error))
                throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error });
            // Transport-level failure (DNS, refused, reset) is rotatable: another key
            // may route through a different path, and retrying costs nothing here.
            throw new WebError(`Tavily search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: new TavilyTransportError(error) });
        }
        if (!response.ok) {
            const status = response.status;
            let message = `Tavily API error (HTTP ${status})`;
            try {
                const parsed = await response.json();
                const detail = parsed.detail ?? parsed.message;
                if (detail !== undefined && detail.length > 0)
                    message = detail;
            }
            catch (error) {
                // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
                // into a generic HTTP-error message — cancellation is not a provider
                // error (the seam's cancellation contract).
                if (isAbortError(error))
                    throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error });
                // Otherwise: the HTTP status is already captured in `message` above; a
                // malformed/non-JSON error body (normal for gateway 5xx/429s) can only
                // cost a richer provider message, never the real error.
            }
            throw new WebError(message, 'WEB_PROVIDER_ERROR', { cause: new TavilyHttpError(status) });
        }
        try {
            const payload = await response.json();
            return mapTavilyResponse(payload);
        }
        catch (error) {
            if (isAbortError(error))
                throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error });
            if (error instanceof WebError)
                throw error;
            throw new WebError(`Tavily returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR');
        }
    }
}
/** Marker carrying the HTTP status of a failed Tavily response (for rotatability). */
class TavilyHttpError extends Error {
    status;
    constructor(status) {
        super(`HTTP ${status}`);
        this.status = status;
    }
}
/** Marker for transport-level failures (DNS/refused/reset): always rotatable. */
class TavilyTransportError extends Error {
    original;
    constructor(original) {
        super('transport failure');
        this.original = original;
    }
}
/**
 * Whether a thrown provider error justifies rotating to the next key:
 * auth/rate-limit/server (401/403/429/5xx) or a transport-level failure.
 * Client errors like 400 (malformed request) fail fast instead.
 */
function isRotatableProviderError(error) {
    const cause = error.cause;
    if (cause instanceof TavilyHttpError) {
        return cause.status === 401 || cause.status === 403 || cause.status === 429 || cause.status >= 500;
    }
    return cause instanceof TavilyTransportError;
}
/** True when `baseURL` parses as an absolute URL (a cheap local config check). */
function isValidBaseUrl(baseURL) {
    return URL.canParse(baseURL);
}
/** True for a request limit that can be sent to Tavily (a positive whole number). */
function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}
/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError';
}
//# sourceMappingURL=provider.js.map