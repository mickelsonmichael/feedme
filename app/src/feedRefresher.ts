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
  /** Maximum number of feeds fetched concurrently. Defaults to 6. */
  concurrency?: number;
};

const DEFAULT_CONCURRENCY = 6;

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
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

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

  const refreshOne = async (feed: Feed): Promise<void> => {
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
    } finally {
      completed += 1;
      emitProgress();
    }
  };

  // Bounded-concurrency worker pool: avoid saturating the radio / DB on
  // accounts with many subscriptions.
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, feeds.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(
      (async () => {
        while (true) {
          const index = cursor++;
          if (index >= feeds.length) return;
          await refreshOne(feeds[index]);
        }
      })()
    );
  }
  await Promise.all(workers);
  return failed;
}
