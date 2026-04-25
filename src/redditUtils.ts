/**
 * Extracts the subreddit name from a raw user-supplied value.
 * Accepts any of:
 *   - A plain name:                  "pics"
 *   - A prefixed name:               "r/pics"
 *   - A full reddit.com URL:         "https://reddit.com/r/pics"
 *   - A full www.reddit.com URL:     "https://www.reddit.com/r/pics"
 *   - An old.reddit.com URL:         "https://old.reddit.com/r/pics"
 * Whitespace is trimmed automatically.
 *
 * Example: getSubreddit("https://old.reddit.com/r/pics/") → "pics"
 */
export function getSubreddit(rawValue: string): string {
  const trimmed = rawValue.trim();
  // Strip full Reddit URL patterns (www, old, or bare reddit.com)
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:(?:www|old)\.)?reddit\.com\/r\/([^/?#\s]+)/i
  );
  if (urlMatch) {
    return urlMatch[1];
  }
  // Strip leading "r/" prefix
  return trimmed.replace(/^r\//, "");
}

/**
 * Constructs the RSS feed URL for a given Reddit subreddit.
 * Accepts a plain subreddit name, an "r/<name>" prefix, or a full Reddit URL.
 * Whitespace is trimmed automatically.
 *
 * Example: buildRedditFeedUrl("pics") → "https://www.reddit.com/r/pics.rss"
 */
export function buildRedditFeedUrl(subreddit: string): string {
  const cleaned = getSubreddit(subreddit);
  return `https://www.reddit.com/r/${cleaned}.rss`;
}
