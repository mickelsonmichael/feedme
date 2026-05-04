// Lightweight feed-discovery utility used by the Discover / search screens.
// Inspired by https://github.com/mratmeyer/rsslookup — looks for RSS/Atom
// feeds advertised by a URL using two strategies:
//   1. Parse HTML for <link rel="alternate" type="application/rss+xml|atom+xml">
//   2. Probe a small list of common feed paths
//
// The fetched URL itself may already be a feed, in which case it is returned
// directly.

import { fetchWithProxyFallback } from "./proxyFetch";
import { extractFeedTitle } from "./feedParser";

export type DiscoveredFeed = {
  url: string;
  title: string | null;
  /** How this feed was discovered. */
  source: "direct" | "html" | "common-path";
};

export type DiscoverFeedsResult = {
  feeds: DiscoveredFeed[];
  /** Final URL after redirects (if known). */
  finalUrl: string;
};

const COMMON_FEED_PATHS = [
  "/feed",
  "/feed/",
  "/feed.xml",
  "/rss",
  "/rss/",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feeds/posts/default",
];

const FEED_MIME_HINTS = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
];

/** Returns true if the content-type looks like an RSS or Atom feed. */
export function isFeedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return (
    lower.includes("xml") || lower.includes("rss") || lower.includes("atom")
  );
}

/** Returns true when `body` looks like RSS or Atom XML. */
export function looksLikeFeedBody(body: string): boolean {
  const trimmed = body.trim().slice(0, 2048).toLowerCase();
  return (
    trimmed.includes("<rss") ||
    /<feed[^>]+xmlns/.test(trimmed) ||
    trimmed.includes("<channel")
  );
}

/**
 * Parses an HTML document and returns the URLs of any advertised RSS/Atom
 * feeds (`<link rel="alternate" type="application/rss+xml|atom+xml" href=...>`).
 */
export function parseHtmlForFeedLinks(
  html: string,
  baseUrl: string
): { url: string; title: string | null }[] {
  const found: { url: string; title: string | null }[] = [];
  const linkRegex = /<link\b[^>]*>/gi;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const rel = matchAttribute(tag, "rel");
    const type = matchAttribute(tag, "type");
    const href = matchAttribute(tag, "href");

    if (!href) continue;
    if (!rel || !rel.toLowerCase().split(/\s+/).includes("alternate")) {
      continue;
    }
    if (
      !type ||
      !FEED_MIME_HINTS.some((mime) => type.toLowerCase().includes(mime))
    ) {
      continue;
    }

    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const title = matchAttribute(tag, "title") ?? null;
    found.push({ url: resolved, title });
  }
  return found;
}

function matchAttribute(tag: string, attr: string): string | null {
  const re = new RegExp(
    `\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const m = tag.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

/**
 * Search for RSS/Atom feeds for a given URL.
 *
 * Strategies (run in order, results merged):
 *   1. Fetch the URL. If it returns a feed body directly, use it.
 *   2. Parse the HTML for `<link rel="alternate">` feed declarations.
 *   3. Probe a small list of common feed paths in parallel.
 */
export async function discoverFeeds(
  rawUrl: string
): Promise<DiscoverFeedsResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Please enter a URL.");
  }
  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }

  const seen = new Set<string>();
  const feeds: DiscoveredFeed[] = [];
  const addFeed = (feed: DiscoveredFeed) => {
    if (seen.has(feed.url)) return;
    seen.add(feed.url);
    feeds.push(feed);
  };

  let body = "";
  const originalUrl = parsed.toString();
  let finalUrl = originalUrl;
  let isFeedBody = false;

  try {
    const { response, usedProxy } = await fetchWithProxyFallback(originalUrl);
    // Only trust response.url for redirects when we hit the origin directly.
    // The proxy worker rewrites response.url to its own host, which would
    // break relative-link resolution and common-path probing below.
    if (!usedProxy && response.url) {
      finalUrl = response.url;
    }
    body = await response.text();
    if (
      isFeedContentType(response.headers.get("content-type")) &&
      looksLikeFeedBody(body)
    ) {
      isFeedBody = true;
    } else if (looksLikeFeedBody(body)) {
      // Some servers return a non-XML content type for valid feeds.
      isFeedBody = true;
    }
  } catch (error) {
    throw new Error(
      `Could not load ${originalUrl}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }

  if (isFeedBody) {
    addFeed({
      url: finalUrl,
      title: safeExtractTitle(body),
      source: "direct",
    });
    return { feeds, finalUrl };
  }

  // 2. HTML <link> parsing
  for (const link of parseHtmlForFeedLinks(body, finalUrl)) {
    addFeed({ url: link.url, title: link.title, source: "html" });
  }

  // 3. Common-path probing
  if (feeds.length === 0) {
    const probeResults = await Promise.allSettled(
      COMMON_FEED_PATHS.map(async (path) => {
        const candidate = new URL(path, finalUrl).toString();
        if (seen.has(candidate)) return null;
        const { response } = await fetchWithProxyFallback(candidate);
        if (!response.ok) return null;
        const candidateBody = await response.text();
        const ct = response.headers.get("content-type");
        if (!isFeedContentType(ct) && !looksLikeFeedBody(candidateBody)) {
          return null;
        }
        return {
          url: response.url || candidate,
          title: safeExtractTitle(candidateBody),
        };
      })
    );
    for (const result of probeResults) {
      if (result.status === "fulfilled" && result.value) {
        addFeed({
          url: result.value.url,
          title: result.value.title,
          source: "common-path",
        });
      }
    }
  }

  return { feeds, finalUrl };
}

function safeExtractTitle(xml: string): string | null {
  try {
    const title = extractFeedTitle(xml);
    return title === "Untitled" ? null : title;
  } catch {
    return null;
  }
}
