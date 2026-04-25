/**
 * Constructs the RSS feed URL for a given Reddit subreddit.
 * Accepts a plain subreddit name (e.g. "pics") or one prefixed with "r/"
 * (e.g. "r/pics"). Whitespace is trimmed automatically.
 *
 * Example: buildRedditFeedUrl("pics") → "https://www.reddit.com/r/pics.rss"
 */
export function buildRedditFeedUrl(subreddit: string): string {
  const cleaned = subreddit.trim().replace(/^r\//, "");
  return `https://www.reddit.com/r/${cleaned}.rss`;
}
