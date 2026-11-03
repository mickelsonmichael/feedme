import { addFeed, deleteFeed, getFeedByUrl } from "./database";
import { buildRedditFeedUrl } from "./redditUtils";

/** The feed URL a follow of `author` subscribes to (their posts, no comments). */
export function redditAuthorFeedUrl(author: string): string {
  return buildRedditFeedUrl(`u/${author}`);
}

/**
 * Subscribes to a Reddit user's posts. A follow inherits the NSFW flag of the
 * feed the author was found in, so following someone from an NSFW subreddit
 * doesn't put their posts unblurred into the main feed.
 */
export function followRedditAuthor(
  author: string,
  nsfw: boolean
): Promise<number> {
  return addFeed({
    title: `Reddit - u/${author}`,
    url: redditAuthorFeedUrl(author),
    description: null,
    use_proxy: 0,
    nsfw: nsfw ? 1 : 0,
    show_only_in_tag: 0,
    show_only_in_custom_feed: 0,
    collapse_repeated: 0,
    reddit_include_comments: 0,
  });
}

/** Unfollows `author` if already followed, otherwise follows them. */
export async function toggleRedditAuthorFollow(
  author: string,
  nsfw: boolean
): Promise<void> {
  const existing = await getFeedByUrl(redditAuthorFeedUrl(author));
  if (existing) {
    await deleteFeed(existing.id);
  } else {
    await followRedditAuthor(author, nsfw);
  }
}
