import { Feed } from "./types";
import { fetchFeed } from "./feedParser";
import {
  getItemCountForFeed,
  setFeedError,
  upsertItems,
  updateFeedLastFetched,
} from "./database";

export type FeedRefreshProgress = {
  total: number;
  completed: number;
  loading: number;
  succeeded: number;
  failed: number;
};

type RefreshFeedsOptions = {
  onProgress?: (progress: FeedRefreshProgress) => void;
};

/**
 * Fetches the latest items from each feed's RSS URL and persists them to the
 * local database. Errors for individual feeds are swallowed so a single
 * unreachable feed doesn't abort the whole refresh.
 *
 * @returns the number of feeds that failed to refresh
 */
export async function refreshFeeds(
  feeds: Feed[],
  options: RefreshFeedsOptions = {}
): Promise<number> {
  let completed = 0;
  let failed = 0;
  let succeeded = 0;
  const total = feeds.length;

  const emitProgress = () => {
    options.onProgress?.({
      total,
      completed,
      loading: Math.max(total - completed, 0),
      succeeded,
      failed,
    });
  };

  emitProgress();

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const fetched = await fetchFeed(feed.url, feed.use_proxy === 1);
        await upsertItems(feed.id, fetched);
        await updateFeedLastFetched(feed.id);
        await setFeedError(feed.id, null);
        succeeded += 1;
      } catch (error) {
        const cachedItemCount = await getItemCountForFeed(feed.id);
        const fallbackSuffix =
          cachedItemCount > 0 ? " Showing cached posts." : "";
        await setFeedError(
          feed.id,
          `${(error as Error).message}${fallbackSuffix}`
        );
        failed += 1;
        throw error;
      } finally {
        completed += 1;
        emitProgress();
      }
    })
  );
  return results.filter((r) => r.status === "rejected").length;
}
