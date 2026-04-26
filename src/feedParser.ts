import { ParsedFeedItem } from "./types";

/**
 * Fetches and parses an RSS/Atom feed URL.
 * Returns an array of { title, url, content, publishedAt } items.
 */
export async function fetchFeed(feedUrl: string): Promise<ParsedFeedItem[]> {
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch feed: ${response.status} ${response.statusText}`
    );
  }
  const text = await response.text();
  return parseFeed(text);
}

/**
 * Parses RSS 2.0 or Atom feed XML and extracts title and feed entries.
 */
export function parseFeed(xml: string): ParsedFeedItem[] {
  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml);
  if (isAtom) {
    return parseAtom(xml);
  }
  return parseRss(xml);
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

function parseRss(xml: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
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

function parseAtom(xml: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
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
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || undefined;
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
  return (cdata ? cdata[1] : inner).trim() || undefined;
}

function extractAtomLink(block: string): string | undefined {
  // Prefer <link href="..."> (alternate)
  const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return hrefMatch[1];
  return extractTagText(block, "link");
}

// ── Image extraction patterns ──────────────────────────────────────────────

const MEDIA_CONTENT_RE = /<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/i;
const MEDIA_THUMBNAIL_RE =
  /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/i;
const ENCLOSURE_URL_FIRST_RE =
  /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["'][^>]*\/?>/i;
const ENCLOSURE_TYPE_FIRST_RE =
  /<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["'][^>]*\/?>/i;
const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["'][^>]*\/?>/i;

/**
 * Extracts a thumbnail/image URL from a feed item block.
 * Checks (in order): media:content, media:thumbnail, enclosure (image types),
 * then falls back to the first <img src="..."> found in the HTML content.
 */
export function extractImageUrl(
  block: string,
  htmlContent?: string | null
): string | undefined {
  const mediaContent = block.match(MEDIA_CONTENT_RE);
  if (mediaContent) return mediaContent[1];

  const mediaThumbnail = block.match(MEDIA_THUMBNAIL_RE);
  if (mediaThumbnail) return mediaThumbnail[1];

  // <enclosure> with an image MIME type (url may appear before or after type)
  const enclosure1 = block.match(ENCLOSURE_URL_FIRST_RE);
  if (enclosure1) return enclosure1[1];

  const enclosure2 = block.match(ENCLOSURE_TYPE_FIRST_RE);
  if (enclosure2) return enclosure2[1];

  // Fall back to the first <img src="..."> in the HTML content
  if (htmlContent) {
    const imgTag = htmlContent.match(IMG_SRC_RE);
    if (imgTag) return imgTag[1];
  }

  return undefined;
}
