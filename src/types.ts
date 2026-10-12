/**
 * Tavily wire types for `POST /search`. Minimal: only fields this provider reads.
 * @module dsh-web-search-tavily/types
 */

/** One Tavily search result entry. */
export interface TavilyResult {
  readonly url?: string
  readonly title?: string
  /** Content extract for the query. */
  readonly content?: string
  /** Relevance score 0..1 — not portable, dropped. */
  readonly score?: number
  /** ISO-8601 publication date, present when Tavily can attribute one. */
  readonly published_date?: string
}

/** Error envelope: Tavily uses `detail`, some gateways use `message`. */
export interface TavilyError {
  readonly detail?: string
  readonly message?: string
}

/** `POST /search` response envelope. */
export interface TavilySearchResponse {
  /** The query as Tavily understood it. */
  readonly query?: string
  /** Generated answer — only present when `include_answer: true` was sent. */
  readonly answer?: string
  readonly results?: readonly TavilyResult[]
}
