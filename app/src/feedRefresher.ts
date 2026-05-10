import { Feed } from "./types";
import { fetchFeedWithMeta } from "./feedParser";
import {
  computeBackoffDelay,
  computeBaseInterval,
  DEFAULT_FETCH_INTERVAL_MS,
  PUBLISHED_AT_SAMPLE_SIZE,
} from "./feedSchedule";
import {
  getItemCountForFeed,
  getRecentPublishedAtForFeed,
  setFeedError,
  setFeedRefreshFailure,
  setFeedRefreshSuccess,
  upsertItems,
  updateFeedCacheValidators,
  updateFeedLastFetched,
} from "./database";

export type FeedRefreshProgress = {
  total: number;
  completed: number;
  loading: number;
  succeeded: number;
  failed: number;
  /** Feeds whose `next_fetch_at` was still in the future and which were
   *  therefore not contacted on this pass. Counted as "completed" so the
   *  total adds up. */
  skipped: number;
};

type RefreshFeedsOptions = {
  onProgress?: (progress: FeedRefreshProgress) => void;
  /** Maximum number of feeds fetched concurrently. Defaults to 6. */
  concurrency?: number;
  /** When true, refresh every feed regardless of its scheduled
   *  `next_fetch_at`. Used for explicit single-feed refresh — pull-to-refresh
   *  on the aggregated list leaves this falsy so adaptive scheduling kicks in. */
  force?: boolean;
};

const DEFAULT_CONCURRENCY = 6;
/** Maximum items stored per feed refresh. Prevents huge podcast feeds (2000+
 *  episodes) from causing hundreds of sequential native DB round-trips that
 *  block the JS event loop for tens of seconds. */
const MAX_ITEMS_PER_FEED = 100;
/**
 * Per-feed wall-clock timeout (ms). When a feed's full refresh cycle (network
 * fetch + DB write) exceeds this limit the feed is marked failed and the
 * progress counter advances so subsequent feeds are never blocked. The
 * underlying native request continues in the background and will finish
 * eventually, but the UI is no longer "stuck".
 */
const REFRESH_ONE_TIMEOUT_MS = 20_000;

/**
 * Fetches the latest items from each feed's RSS URL and persists them to the
 * local database. Errors for individual feeds are swallowed so a single
 * unreachable feed doesn't abort the whole refresh.
 *
 * Honors per-feed adaptive scheduling: feeds with `next_fetch_at` in the
 * future are skipped (and surfaced via `progress.skipped`) unless `force`
 * is set.
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
  let skipped = 0;
  const total = feeds.length;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const force = options.force === true;

  const emitProgress = () => {
    options.onProgress?.({
      total,
      completed,
      loading: Math.max(total - completed, 0),
      succeeded,
      failed,
      skipped,
    });
  };

  emitProgress();

  const refreshOne = async (feed: Feed): Promise<void> => {
    // Honor per-feed adaptive scheduling. `next_fetch_at` of 0 (or null on
    // freshly-migrated rows) always counts as "due now".
    const nextFetchAt = feed.next_fetch_at ?? 0;
    if (!force && nextFetchAt > Date.now()) {
      skipped += 1;
      completed += 1;
      emitProgress();
      return;
    }

    // work() handles all its own errors and never rejects — it resolves false
    // when complete (succeeded or failed) and the outer race resolves true when
    // the wall-clock timeout fires first.
    const work = (async (): Promise<void> => {
      try {
        const fetched = await fetchFeedWithMeta(
          feed.url,
          feed.use_proxy === 1,
          undefined,
          {
            etag: feed.etag ?? null,
            lastModified: feed.last_modified ?? null,
          }
        );
        if (fetched.notModified) {
          // Upstream confirms the feed is unchanged. Bump last_fetched and
          // clear any prior error, but leave items and validators alone.
          await updateFeedLastFetched(feed.id);
          await setFeedError(feed.id, null);
          await scheduleNextSuccess(feed);
          succeeded += 1;
          return;
        }
        await upsertItems(feed.id, fetched.items.slice(0, MAX_ITEMS_PER_FEED));
        await updateFeedCacheValidators(
          feed.id,
          fetched.etag ?? null,
          fetched.lastModified ?? null
        );
        await updateFeedLastFetched(feed.id);
        await setFeedError(feed.id, null);
        await scheduleNextSuccess(feed);
        succeeded += 1;
      } catch (error) {
        const cachedItemCount = await getItemCountForFeed(feed.id);
        const fallbackSuffix =
          cachedItemCount > 0 ? " Showing cached posts." : "";
        await setFeedError(
          feed.id,
          `${(error as Error).message}${fallbackSuffix}`
        );
        await scheduleNextFailure(feed);
        failed += 1;
      }
    })();

    let timeoutId: ReturnType<typeof setTimeout>;
    const timedOut = await Promise.race([
      work.then(() => false),
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(true), REFRESH_ONE_TIMEOUT_MS);
      }),
    ]);

    clearTimeout(timeoutId!);
    if (timedOut) {
      // Mirror the catch branch: treat the wall-clock timeout as a failure
      // for backoff purposes too. The in-flight `work` will eventually
      // finish in the background and may overwrite this scheduling — that's
      // acceptable: a slow-but-eventually-successful fetch will reset the
      // counter when it lands.
      try {
        await scheduleNextFailure(feed);
      } catch {
        // Best-effort: never let scheduling errors mask the timeout itself.
      }
      failed += 1;
    }
    completed += 1;
    emitProgress();
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

/** Recompute the learned base interval from the feed's current items and
 *  push out `next_fetch_at` accordingly. */
async function scheduleNextSuccess(feed: Feed): Promise<void> {
  let interval = DEFAULT_FETCH_INTERVAL_MS;
  try {
    const stamps = await getRecentPublishedAtForFeed(
      feed.id,
      PUBLISHED_AT_SAMPLE_SIZE
    );
    interval = computeBaseInterval(stamps);
  } catch {
    // If the items lookup fails we still want to schedule something
    // sensible — fall through with the default interval.
  }
  await setFeedRefreshSuccess(feed.id, interval, Date.now() + interval);
}

/** Bump `consecutive_failures` and apply exponential backoff to
 *  `next_fetch_at`. */
async function scheduleNextFailure(feed: Feed): Promise<void> {
  const failures = (feed.consecutive_failures ?? 0) + 1;
  const delay = computeBackoffDelay(feed.fetch_interval_ms, failures);
  await setFeedRefreshFailure(feed.id, failures, Date.now() + delay);
}
