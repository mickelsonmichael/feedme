/**
 * Extracts the Substack publication name from a raw user-supplied value.
 * Accepts any of:
 *   - A plain name:                         "natesilver"
 *   - An @-prefixed name:                   "@natesilver"
 *   - A substack.com profile URL:           "https://substack.com/@natesilver"
 *   - A publication subdomain URL:          "https://natesilver.substack.com"
 *   - A publication feed URL:               "https://natesilver.substack.com/feed"
 * Whitespace is trimmed automatically.
 *
 * Returns the publication name (without @) or null if it cannot be parsed.
 *
 * Example: getSubstackName("https://substack.com/@natesilver") → "natesilver"
 * Example: getSubstackName("@natesilver") → "natesilver"
 */
export function getSubstackName(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Match https://substack.com/@name (with optional www.)
  const profileMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?substack\.com\/@([^/?#\s]+)/i
  );
  if (profileMatch) return profileMatch[1];

  // Match https://name.substack.com (with optional path)
  const subdomainMatch = trimmed.match(
    /^https?:\/\/([^.]+)\.substack\.com(?:\/.*)?$/i
  );
  if (subdomainMatch) return subdomainMatch[1];

  // Match @name — strip the leading @
  if (trimmed.startsWith("@")) {
    const name = trimmed.slice(1);
    return name || null;
  }

  // Match a plain name (letters, digits, hyphens, underscores only)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Constructs the Substack RSS feed URL from a raw user-supplied value.
 * Accepts the same input formats as getSubstackName.
 *
 * Returns the feed URL string, or null if the input cannot be parsed.
 *
 * Example: buildSubstackFeedUrl("natesilver")
 *       → "https://natesilver.substack.com/feed"
 */
export function buildSubstackFeedUrl(rawValue: string): string | null {
  const name = getSubstackName(rawValue);
  if (!name) return null;
  return `https://${name}.substack.com/feed`;
}
