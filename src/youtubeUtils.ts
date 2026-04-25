/**
 * Converts a raw user-supplied value into a full YouTube channel URL.
 * Accepts any of:
 *   - A plain channel handle:          "atrioc"
 *   - An @-prefixed handle:            "@atrioc"
 *   - A channel ID:                    "UCgv4dPk_qZNAbUW9WkuLPSA"
 *   - A full youtube.com channel URL:  "https://www.youtube.com/@atrioc"
 *   - A full youtube.com /c/ URL:      "https://www.youtube.com/c/atrioc"
 *   - A full youtube.com /channel/ URL:"https://www.youtube.com/channel/UCgv4dPk_qZNAbUW9WkuLPSA"
 * Whitespace is trimmed automatically.
 *
 * Example: getYouTubeChannelUrl("atrioc") → "https://www.youtube.com/@atrioc"
 * Example: getYouTubeChannelUrl("UCgv4dPk_qZNAbUW9WkuLPSA") → "https://www.youtube.com/channel/UCgv4dPk_qZNAbUW9WkuLPSA"
 */
export function getYouTubeChannelUrl(rawValue: string): string {
  const trimmed = rawValue.trim();

  // Already a full URL — pass through as-is
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Looks like a channel ID (starts with "UC" and is 24 chars)
  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }

  // @-prefixed handle
  if (trimmed.startsWith("@")) {
    return `https://www.youtube.com/${trimmed}`;
  }

  // Plain handle — prepend @
  return `https://www.youtube.com/@${trimmed}`;
}

/**
 * Parses the raw HTML of a YouTube channel page and extracts the RSS feed URL
 * from the embedded <link rel="alternate" type="application/rss+xml"> element.
 *
 * Returns the feed URL string, or null if no such link is found.
 *
 * Example return value:
 *   "https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA"
 */
export function extractYouTubeRssFeedUrl(html: string): string | null {
  const match = html.match(
    /<link[^>]+type="application\/rss\+xml"[^>]+href="([^"]+)"/i
  );
  if (match) return match[1];

  // Also try with href before type
  const matchAlt = html.match(
    /<link[^>]+href="([^"]+)"[^>]+type="application\/rss\+xml"/i
  );
  if (matchAlt) return matchAlt[1];

  return null;
}
