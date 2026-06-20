import { ParsedFeedItem } from "./types";
import { buildProxyRequestUrl, isLikelyCorsBlockedError } from "./proxyFetch";

export type FetchFeedResult = {
  items: ParsedFeedItem[];
  usedProxy: boolean;
  /** True when the upstream returned 304 Not Modified. The caller should
   *  retain its existing items and only bump the last-fetched timestamp. */
  notModified?: boolean;
  /** Latest `ETag` response header from a 200 response, if any. */
  etag?: string | null;
  /** Latest `Last-Modified` response header from a 200 response, if any. */
  lastModified?: string | null;
  /** Rate-limit headers captured from a 429 response encountered during this
   *  fetch cycle (even if we eventually succeeded after retrying). Present
   *  whenever at least one 429 was received; `null` otherwise. */
  rateLimitHeaders?: RateLimitHeaders | null;
};

/** Rate-limiting metadata extracted from a 429 response. */
export type RateLimitHeaders = {
  /** `Retry-After` header value (seconds or HTTP date string), if present. */
  retryAfter: string | null;
  /** `X-RateLimit-Limit` / `RateLimit-Limit`: the server's request quota. */
  limit: string | null;
  /** `X-RateLimit-Remaining` / `RateLimit-Remaining`: remaining quota at the
   *  time of the 429. */
  remaining: string | null;
  /** `X-RateLimit-Reset` / `RateLimit-Reset`: Unix timestamp (s) when the
   *  quota resets, if present. */
  reset: string | null;
  /** `Date.now()` timestamp (ms) when the 429 was received. */
  capturedAt: number;
};

/** Thrown when a feed URL responds with HTTP 429 Too Many Requests and all
 *  retry attempts have been exhausted. */
export class RateLimitError extends Error {
  constructor(public readonly rateLimitHeaders: RateLimitHeaders) {
    super("Rate limited (429 Too Many Requests)");
    this.name = "RateLimitError";
  }
}

export type FetchFeedOptions = {
  /** Last seen `ETag` to send as `If-None-Match`. */
  etag?: string | null;
  /** Last seen `Last-Modified` to send as `If-Modified-Since`. */
  lastModified?: string | null;
  /** When true, omit both validator headers so the caller always receives
   *  a fresh body. */
  force?: boolean;
};

const FETCH_TIMEOUT_MS = 10_000;
/** Maximum number of times to retry a 429 response before giving up. */
const MAX_RATE_LIMIT_RETRIES = 2;
/** Hard cap on how long (ms) we will wait before a single retry when the user
 *  is actively waiting for the refresh to complete. */
const MAX_RETRY_DELAY_MS = 8_000;
/** Maximum number of automatic retries for transient network errors (timeouts
 *  and connection failures), which are common on mobile radios. */
const MAX_TRANSIENT_RETRIES = 1;
/** Brief pause before a transient retry to let the radio stabilise. */
const TRANSIENT_RETRY_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Returns true for transient network errors that are safe to retry once. */
function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.startsWith("Request timed out") || msg === "Network request failed"
  );
}

/**
 * Returns the delay in ms to wait before the next retry after a 429.
 * Honors `Retry-After` (capped at MAX_RETRY_DELAY_MS) when present;
 * otherwise applies exponential backoff: 1 s, 2 s, 4 s, …
 */
function computeRetryDelay(headers: RateLimitHeaders, attempt: number): number {
  if (headers.retryAfter !== null) {
    const secs = Number(headers.retryAfter);
    if (Number.isFinite(secs) && secs > 0) {
      return Math.min(secs * 1000, MAX_RETRY_DELAY_MS);
    }
    // HTTP-date form of Retry-After: fall through to backoff
  }
  return Math.min(1000 * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
}

/**
 * Fetches and parses an RSS/Atom feed URL.
 * Returns an array of { title, url, content, publishedAt } items.
 */
export async function fetchFeed(
  feedUrl: string,
  forceProxy?: boolean
): Promise<ParsedFeedItem[]> {
  const { items } = await fetchFeedWithMeta(feedUrl, forceProxy);
  return items;
}

type XhrResult = {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
};

export async function fetchFeedWithMeta(
  feedUrl: string,
  forceProxy?: boolean,
  timeoutMs = FETCH_TIMEOUT_MS,
  options: FetchFeedOptions = {}
): Promise<FetchFeedResult> {
  // Use XMLHttpRequest so that `xhr.timeout` is enforced at the native
  // (OkHttp / NSURLSession) level. This fires independently of the JS event
  // loop, unlike setTimeout-based AbortController which can be starved when
  // the network layer is streaming a large body.
  //
  // React Native's XHR (built on OkHttp/NSURLSession) does not enable the
  // shared HTTP cache by default, so a `304 Not Modified` from upstream
  // surfaces directly as `xhr.status === 304` instead of being silently
  // promoted to a 200 with a cached body. Browsers behave the same way for
  // requests carrying a manually-set `If-None-Match` / `If-Modified-Since`.
  const proxyUrl = buildProxyRequestUrl(feedUrl);
  const sendValidators = !options.force;
  const ifNoneMatch = sendValidators ? options.etag : null;
  const ifModifiedSince = sendValidators ? options.lastModified : null;

  const xhrFetch = (url: string): Promise<XhrResult> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = timeoutMs;
      xhr.ontimeout = () =>
        reject(new Error(`Request timed out after ${timeoutMs / 1000}s`));
      xhr.onerror = () => reject(new Error("Network request failed"));
      xhr.onload = () => {
        const etag = xhr.getResponseHeader?.("ETag") ?? null;
        const lastModified = xhr.getResponseHeader?.("Last-Modified") ?? null;
        if (xhr.status === 304) {
          resolve({ status: 304, body: "", etag, lastModified });
          return;
        }
        if (xhr.status === 429) {
          const headers: RateLimitHeaders = {
            retryAfter:
              xhr.getResponseHeader?.("Retry-After") ??
              xhr.getResponseHeader?.("retry-after") ??
              null,
            limit:
              xhr.getResponseHeader?.("X-RateLimit-Limit") ??
              xhr.getResponseHeader?.("RateLimit-Limit") ??
              null,
            remaining:
              xhr.getResponseHeader?.("X-RateLimit-Remaining") ??
              xhr.getResponseHeader?.("RateLimit-Remaining") ??
              null,
            reset:
              xhr.getResponseHeader?.("X-RateLimit-Reset") ??
              xhr.getResponseHeader?.("RateLimit-Reset") ??
              null,
            capturedAt: Date.now(),
          };
          reject(new RateLimitError(headers));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            status: xhr.status,
            body: xhr.responseText,
            etag,
            lastModified,
          });
        } else {
          reject(
            new Error(`Failed to fetch feed: ${xhr.status} ${xhr.statusText}`)
          );
        }
      };
      xhr.open("GET", url);
      if (ifNoneMatch) {
        xhr.setRequestHeader("If-None-Match", ifNoneMatch);
      }
      if (ifModifiedSince) {
        xhr.setRequestHeader("If-Modified-Since", ifModifiedSince);
      }
      xhr.send();
    });

  const toResult = (
    xhr: XhrResult,
    usedProxy: boolean,
    rateLimitHeaders?: RateLimitHeaders | null
  ): FetchFeedResult => {
    if (xhr.status === 304) {
      return {
        items: [],
        usedProxy,
        notModified: true,
        // Preserve the validators we already had so the caller can leave them
        // in place. Some servers also re-send ETag/Last-Modified on 304s.
        etag: xhr.etag ?? options.etag ?? null,
        lastModified: xhr.lastModified ?? options.lastModified ?? null,
        rateLimitHeaders: rateLimitHeaders ?? null,
      };
    }
    return {
      items: parseFeed(xhr.body),
      usedProxy,
      notModified: false,
      etag: xhr.etag,
      lastModified: xhr.lastModified,
      rateLimitHeaders: rateLimitHeaders ?? null,
    };
  };

  /** Retry a fetch call handling both 429 rate-limit and transient network
   *  errors.  Rate-limit retries are capped at MAX_RATE_LIMIT_RETRIES;
   *  transient retries (timeout / connection failure) are capped at
   *  MAX_TRANSIENT_RETRIES. Returns the successful result along with the last
   *  seen rate-limit headers (so the caller can persist them even on success). */
  const fetchWithRetry = async (
    fetchFn: () => Promise<XhrResult>
  ): Promise<{
    result: XhrResult;
    rateLimitHeaders: RateLimitHeaders | null;
  }> => {
    let lastHeaders: RateLimitHeaders | null = null;
    let rateLimitAttempt = 0;
    let transientAttempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await fetchFn();
        return { result, rateLimitHeaders: lastHeaders };
      } catch (err) {
        if (
          err instanceof RateLimitError &&
          rateLimitAttempt < MAX_RATE_LIMIT_RETRIES
        ) {
          lastHeaders = err.rateLimitHeaders;
          const delay = computeRetryDelay(
            err.rateLimitHeaders,
            rateLimitAttempt
          );
          rateLimitAttempt++;
          await sleep(delay);
          continue;
        }
        if (
          isTransientNetworkError(err) &&
          transientAttempt < MAX_TRANSIENT_RETRIES
        ) {
          transientAttempt++;
          await sleep(TRANSIENT_RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
  };

  if (forceProxy && proxyUrl) {
    const { result, rateLimitHeaders } = await fetchWithRetry(() =>
      xhrFetch(proxyUrl)
    );
    return toResult(result, true, rateLimitHeaders);
  }

  try {
    const { result, rateLimitHeaders } = await fetchWithRetry(() =>
      xhrFetch(feedUrl)
    );
    return toResult(result, false, rateLimitHeaders);
  } catch (error) {
    if (proxyUrl && isLikelyCorsBlockedError(error)) {
      const { result, rateLimitHeaders } = await fetchWithRetry(() =>
        xhrFetch(proxyUrl)
      );
      return toResult(result, true, rateLimitHeaders);
    }
    throw error;
  }
}

/**
 * Parses RSS 2.0 or Atom feed XML and extracts title and feed entries.
 *
 * @param now - Optional clock function (defaults to Date.now) used to cap
 *   future-dated timestamps to the current time. Inject a deterministic
 *   function in tests.
 */
export function parseFeed(
  xml: string,
  maxItems = 100,
  now: () => number = Date.now
): ParsedFeedItem[] {
  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml);
  if (isAtom) {
    return parseAtom(xml, maxItems, now);
  }
  return parseRss(xml, maxItems, now);
}

/**
 * Extracts the channel/feed title from XML.
 */
export function extractFeedTitle(xml: string): string {
  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml);
  if (isAtom) {
    return extractTagText(xml, "title") ?? "Untitled";
  }
  // RSS: title is the first <title> inside <channel>
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  if (channelMatch) {
    return extractTagText(channelMatch[1], "title") ?? "Untitled";
  }
  return "Untitled";
}

// ── RSS 2.0 ────────────────────────────────────────────────────────────────

function parseRss(
  xml: string,
  maxItems = 100,
  now: () => number = Date.now
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const rawXml = match[0];
    const title = extractCData(block, "title") ?? "Untitled";
    const link = extractTagText(block, "link") ?? extractTagText(block, "guid");
    const encodedContent = extractCData(block, "content:encoded");
    const description = extractCData(block, "description");
    const content = encodedContent ?? description;
    const pubDate = extractTagText(block, "pubDate");
    const parsedTs = pubDate ? new Date(pubDate).getTime() : null;
    items.push({
      title,
      url: link ?? null,
      content: content ?? null,
      imageUrl: extractImageUrl(block, content) ?? null,
      rawXml,
      publishedAt: parsedTs !== null ? Math.min(parsedTs, now()) : null,
    });
  }
  return items;
}

// ── Atom ───────────────────────────────────────────────────────────────────

function parseAtom(
  xml: string,
  maxItems = 100,
  now: () => number = Date.now
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const rawXml = match[0];
    const title = extractCData(block, "title") ?? "Untitled";
    const link = extractAtomLink(block);
    const content =
      extractCData(block, "content") ?? extractCData(block, "summary");
    const published =
      extractTagText(block, "published") ?? extractTagText(block, "updated");
    const parsedTs = published ? new Date(published).getTime() : null;
    items.push({
      title,
      url: link ?? null,
      content: content ?? null,
      imageUrl: extractImageUrl(block, content) ?? null,
      rawXml,
      publishedAt: parsedTs !== null ? Math.min(parsedTs, now()) : null,
    });
  }
  return items;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagText(xml: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${escapeRegex(tag)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return undefined;
  const rawText =
    m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || undefined;
  if (!rawText) return undefined;
  return decodeXmlEntities(rawText);
}

function extractCData(xml: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${escapeRegex(tag)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return undefined;
  const inner = m[1];
  const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  const rawText = (cdata ? cdata[1] : inner).trim() || undefined;
  if (!rawText) return undefined;
  return decodeXmlEntities(rawText);
}

function extractAtomLink(block: string): string | undefined {
  // Prefer <link href="..."> (alternate)
  const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return decodeXmlEntities(hrefMatch[1]);
  return extractTagText(block, "link");
}

function decodeXmlEntities(value: string): string {
  const decodeCodePoint = (rawCodePoint: string, radix: 10 | 16): string => {
    const parsed = Number.parseInt(rawCodePoint, radix);
    if (Number.isNaN(parsed)) return "";

    try {
      return String.fromCodePoint(parsed);
    } catch {
      return "";
    }
  };

  const decodeOnePass = (input: string): string =>
    input
      .replace(/&#(\d+);/g, (match, codePoint) => {
        const decoded = decodeCodePoint(codePoint, 10);
        return decoded || match;
      })
      .replace(/&#x([0-9a-f]+);/gi, (match, codePoint) => {
        const decoded = decodeCodePoint(codePoint, 16);
        return decoded || match;
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  let decoded = value;
  for (let i = 0; i < 5; i += 1) {
    const next = decodeOnePass(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }

  return decoded;
}

// ── Image extraction patterns ──────────────────────────────────────────────

const MEDIA_THUMBNAIL_RE =
  /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/i;
const MEDIA_CONTENT_TAG_RE = /<media:content\b[^>]*\/?>/gi;
const ENCLOSURE_URL_FIRST_RE =
  /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["'][^>]*\/?>/i;
const ENCLOSURE_TYPE_FIRST_RE =
  /<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["'][^>]*\/?>/i;
const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["'][^>]*\/?>/i;

const IMAGE_URL_RE = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

function extractAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(
    new RegExp(`${escapeRegex(attribute)}=["']([^"']+)["']`, "i")
  );
  if (!match) return undefined;
  return decodeXmlEntities(match[1]);
}

function extractMediaContentImageUrl(block: string): string | undefined {
  const tags = block.match(MEDIA_CONTENT_TAG_RE);
  if (!tags) return undefined;

  for (const tag of tags) {
    const url = extractAttribute(tag, "url");
    if (!url) continue;

    const type = extractAttribute(tag, "type")?.toLowerCase();
    const medium = extractAttribute(tag, "medium")?.toLowerCase();
    const isImageType = Boolean(type?.startsWith("image/"));
    const isImageMedium = medium === "image";
    const isImageUrl = IMAGE_URL_RE.test(url);

    if (isImageType || isImageMedium || isImageUrl) {
      return url;
    }
  }

  return undefined;
}

/**
 * Extracts a thumbnail/image URL from a feed item block.
 * Checks (in order): media:thumbnail, media:content (image-only),
 * enclosure (image types),
 * then falls back to the first <img src="..."> found in the HTML content.
 */
export function extractImageUrl(
  block: string,
  htmlContent?: string | null
): string | undefined {
  const mediaThumbnail = block.match(MEDIA_THUMBNAIL_RE);
  if (mediaThumbnail) return decodeXmlEntities(mediaThumbnail[1]);

  const mediaContentImageUrl = extractMediaContentImageUrl(block);
  if (mediaContentImageUrl) return mediaContentImageUrl;

  // <enclosure> with an image MIME type (url may appear before or after type)
  const enclosure1 = block.match(ENCLOSURE_URL_FIRST_RE);
  if (enclosure1) return decodeXmlEntities(enclosure1[1]);

  const enclosure2 = block.match(ENCLOSURE_TYPE_FIRST_RE);
  if (enclosure2) return decodeXmlEntities(enclosure2[1]);

  // Fall back to the first <img src="..."> in the HTML content
  if (htmlContent) {
    const decodedHtml = decodeXmlEntities(htmlContent);
    const imgTag = decodedHtml.match(IMG_SRC_RE);
    if (imgTag) return decodeXmlEntities(imgTag[1]);
  }

  return undefined;
}
