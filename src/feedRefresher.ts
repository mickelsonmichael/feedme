import { Feed } from "./types";
import { fetchFeed } from "./feedParser";
import { upsertItems, updateFeedLastFetched } from "./database";

/**
 * Fetches the latest items from each feed's RSS URL and persists them to the
 * local database. Errors for individual feeds are swallowed so a single
 * unreachable feed doesn't abort the whole refresh.
 *
 * @returns the number of feeds that failed to refresh
 */
export async function refreshFeeds(feeds: Feed[]): Promise<number> {
  let errors = 0;
  await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const fetched = await fetchFeed(feed.url);
        await upsertItems(feed.id, fetched);
        await updateFeedLastFetched(feed.id);
      } catch {
        errors++;
      }
    })
  );
  return errors;
}
