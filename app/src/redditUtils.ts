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
 * Returns an empty string when the input is a Reddit user or invalid/empty.
 */
export function getSubreddit(rawValue: string): string {
  const target = getRedditFeedTarget(rawValue);
  if (!target || target.type !== "subreddit") {
    return "";
  }
  return target.name;
}

/**
 * Extracts the Reddit username from a feed item's HTML content.
 * Matches the standard Reddit RSS pattern where the author is linked as
 * `href="https://www.reddit.com/user/USERNAME"`.
 * Returns null if no Reddit author link is found.
 */
export function extractRedditAuthor(content: string | null): string | null {
  if (!content) return null;
  const match = content.match(/reddit\.com\/user\/([^"/?#\s]+)/i);
  return match ? match[1] : null;
}

/**
 * Constructs the RSS feed URL for a Reddit subreddit or user.
 * Subreddit is assumed when no prefix is provided.
 * Whitespace is trimmed automatically.
 *
 * For user feeds, `includeComments` controls whether the feed pulls the
 * user's overview (posts + comments) or just their submitted posts.
 * Defaults to posts-only, since most followers only want to see what
 * someone posted, not every comment they left across Reddit.
 */
export function buildRedditFeedUrl(
  rawValue: string,
  options?: { includeComments?: boolean }
): string {
  const target = getRedditFeedTarget(rawValue);
  if (!target) {
    return "";
  }
  if (target.type === "subreddit") {
    return `https://www.reddit.com/r/${target.name}.rss`;
  }
  const path = options?.includeComments ? "" : "/submitted";
  return `https://www.reddit.com/user/${target.name}${path}.rss`;
}

/**
 * Returns true when `url` points at a Reddit user feed (overview or
 * submitted-only), i.e. a feed the "include comments" toggle applies to.
 */
export function isRedditUserFeedUrl(url: string): boolean {
  return /^https?:\/\/(?:(?:www|old)\.)?reddit\.com\/user\/[^/?#\s]+/i.test(
    url
  );
}

/**
 * Rewrites a Reddit user feed URL to match the given `includeComments`
 * setting, preserving the username. Returns `url` unchanged if it isn't a
 * Reddit user feed URL.
 */
export function setRedditIncludeComments(
  url: string,
  includeComments: boolean
): string {
  const match = url.match(
    /^https?:\/\/(?:(?:www|old)\.)?reddit\.com\/user\/([^/?#.\s]+)/i
  );
  if (!match) {
    return url;
  }
  return buildRedditFeedUrl(`u/${match[1]}`, { includeComments });
}
