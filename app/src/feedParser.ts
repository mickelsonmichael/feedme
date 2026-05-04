import { ParsedFeedItem } from "./types";
import { buildProxyRequestUrl, isLikelyCorsBlockedError } from "./proxyFetch";

export type FetchFeedResult = {
  items: ParsedFeedItem[];
  usedProxy: boolean;
};

const FETCH_TIMEOUT_MS = 10_000;

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

export async function fetchFeedWithMeta(
  feedUrl: string,
  forceProxy?: boolean,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<FetchFeedResult> {
  // Use XMLHttpRequest so that `xhr.timeout` is enforced at the native
  // (OkHttp / NSURLSession) level. This fires independently of the JS event
  // loop, unlike setTimeout-based AbortController which can be starved when
  // the network layer is streaming a large body.
  const proxyUrl = buildProxyRequestUrl(feedUrl);

  const xhrFetch = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = timeoutMs;
      xhr.ontimeout = () => reject(new Error("Request timed out"));
      xhr.onerror = () => reject(new Error("Network request failed"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(
            new Error(`Failed to fetch feed: ${xhr.status} ${xhr.statusText}`)
          );
        }
      };
      xhr.open("GET", url);
      xhr.send();
    });

  if (forceProxy && proxyUrl) {
    return { items: parseFeed(await xhrFetch(proxyUrl)), usedProxy: true };
  }

  try {
    return { items: parseFeed(await xhrFetch(feedUrl)), usedProxy: false };
  } catch (error) {
    if (proxyUrl && isLikelyCorsBlockedError(error)) {
      return { items: parseFeed(await xhrFetch(proxyUrl)), usedProxy: true };
    }
    throw error;
  }
}

/**
 * Parses RSS 2.0 or Atom feed XML and extracts title and feed entries.
 */
export function parseFeed(xml: string, maxItems = 100): ParsedFeedItem[] {
  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml);
  if (isAtom) {
    return parseAtom(xml, maxItems);
  }
  return parseRss(xml, maxItems);
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

function parseRss(xml: string, maxItems = 100): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const rawXml = match[0];
    const title = extractCData(block, "title") ?? "Untitled";
    const link = extractTagText(block, "link") ?? extractTagText(block, "guid");
    const description = extractCData(block, "description");
    const pubDate = extractTagText(block, "pubDate");
    items.push({
      title,
      url: link ?? null,
      content: description ?? null,
      imageUrl: extractImageUrl(block, description) ?? null,
      rawXml,
      publishedAt: pubDate ? new Date(pubDate).getTime() : null,
    });
  }
  return items;
}

// ── Atom ───────────────────────────────────────────────────────────────────

function parseAtom(xml: string, maxItems = 100): ParsedFeedItem[] {
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
    items.push({
      title,
      url: link ?? null,
      content: content ?? null,
      imageUrl: extractImageUrl(block, content) ?? null,
      rawXml,
      publishedAt: published ? new Date(published).getTime() : null,
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
