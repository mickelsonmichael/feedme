/**
 * Extracts a Reddit feed target from a raw user-supplied value.
 * Accepts subreddit inputs:
 *   - A plain name:                  "pics"
 *   - A prefixed name:               "r/pics"
 *   - A full reddit.com URL:         "https://reddit.com/r/pics"
 * Accepts user inputs:
 *   - A prefixed name:               "u/spez" or "user/spez"
 *   - A full reddit.com URL:         "https://reddit.com/user/spez"
 * Whitespace is trimmed automatically.
 */
export type RedditFeedTarget = { type: "subreddit" | "user"; name: string };

export function getRedditFeedTarget(rawValue: string): RedditFeedTarget | null {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  const urlMatch = trimmed.match(
    /^https?:\/\/(?:(?:www|old)\.)?reddit\.com\/(r|u|user)\/([^/?#\s]+)/i
  );
  if (urlMatch) {
    return {
      type: urlMatch[1].toLowerCase() === "r" ? "subreddit" : "user",
      name: urlMatch[2],
    };
  }

  const userPrefixMatch = trimmed.match(/^(?:u|user)\/([^/?#\s]+)/i);
  if (userPrefixMatch) {
    return { type: "user", name: userPrefixMatch[1] };
  }

  const subredditPrefixMatch = trimmed.match(/^r\/([^/?#\s]+)/i);
  if (subredditPrefixMatch) {
    return { type: "subreddit", name: subredditPrefixMatch[1] };
  }

  return { type: "subreddit", name: trimmed };
}

/**
 * Extracts the subreddit name from a raw user-supplied value.
 * Returns an empty string when the input is a Reddit user.
 */
export function getSubreddit(rawValue: string): string {
  const target = getRedditFeedTarget(rawValue);
  if (!target || target.type !== "subreddit") {
    return "";
  }
  return target.name;
}

/**
 * Constructs the RSS feed URL for a Reddit subreddit or user.
 * Subreddit is assumed when no prefix is provided.
 * Whitespace is trimmed automatically.
 */
export function buildRedditFeedUrl(rawValue: string): string {
  const target = getRedditFeedTarget(rawValue);
  if (!target) {
    return "";
  }
  return `https://www.reddit.com/${target.type === "user" ? "user" : "r"}/${target.name}.rss`;
}
