/**
 * Fetches and parses an RSS/Atom feed URL.
 * Returns an array of { title, url, content, publishedAt } items.
 */
export async function fetchFeed(feedUrl) {
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
export function parseFeed(xml) {
  const isAtom = /<feed[^>]*xmlns[^>]*>/i.test(xml);
  if (isAtom) {
    return parseAtom(xml);
  }
  return parseRss(xml);
}

/**
 * Extracts the channel/feed title from XML.
 */
export function extractFeedTitle(xml) {
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

function parseRss(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractCData(block, "title") ?? "Untitled";
    const link = extractTagText(block, "link") ?? extractTagText(block, "guid");
    const description = extractCData(block, "description");
    const pubDate = extractTagText(block, "pubDate");
    items.push({
      title,
      url: link ?? null,
      content: description ?? null,
      publishedAt: pubDate ? new Date(pubDate).getTime() : null,
    });
  }
  return items;
}

// ── Atom ───────────────────────────────────────────────────────────────────

function parseAtom(xml) {
  const items = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
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
      publishedAt: published ? new Date(published).getTime() : null,
    });
  }
  return items;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagText(xml, tag) {
  const re = new RegExp(
    `<${escapeRegex(tag)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return undefined;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() || undefined;
}

function extractCData(xml, tag) {
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

function extractAtomLink(block) {
  // Prefer <link href="..."> (alternate)
  const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (hrefMatch) return hrefMatch[1];
  return extractTagText(block, "link");
}
