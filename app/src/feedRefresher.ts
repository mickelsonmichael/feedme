import { Feed } from "./types";
import {
  fetchFeedWithMeta,
  RateLimitError,
  RateLimitHeaders,
} from "./feedParser";
import {
  computeBackoffDelay,
  computeBaseInterval,
  DEFAULT_FETCH_INTERVAL_MS,
  PUBLISHED_AT_SAMPLE_SIZE,
} from "./feedSchedule";
import {
  deleteRedditCommentItems,
  getItemCountForFeed,
  getRecentPublishedAtForFeed,
  recordFeedFetchOutcome,
  setFeedError,
  setFeedRefreshFailure,
  setFeedRefreshSuccess,
  upsertItems,
  updateFeedCacheValidators,
  updateFeedLastFetched,
  updateFeedRateLimitInfo,
} from "./database";
import {
  filterExcludedRedditComments,
  shouldExcludeRedditComments,
} from "./redditUtils";

/**
 * Parses a `Retry-After` header value to a delay in milliseconds.
 * Supports both the integer-seconds form ("60") and the RFC1123 HTTP-date
 * form ("Wed, 25 Jun 2026 12:00:00 GMT"). Returns a 60-second fallback when
 * the value is absent or cannot be parsed.
 */
export function parseRetryAfterMs(retryAfter: string | null): number {
  const FALLBACK_MS = 60_000;
  if (!retryAfter) return FALLBACK_MS;

  // Integer-seconds form: "60"
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0) {
    return secs * 1000;
  }

  // RFC1123 HTTP-date form: "Wed, 25 Jun 2026 12:00:00 GMT"
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : FALLBACK_MS;
  }

  return FALLBACK_MS;
}

/** Extracts the hostname from a URL string. Returns null if the URL cannot be
 *  parsed (e.g. relative URLs or malformed strings). */
function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

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
  /** Called for each feed that fails to refresh, with the feed and the error
   *  that caused the failure. Useful for surfacing per-feed diagnostics to the
   *  UI without requiring a follow-up DB query. */
  onFeedFailure?: (feed: Feed, error: Error) => void;
};

const DEFAULT_CONCURRENCY = 6;
/** Maximum items stored per feed refresh. Prevents huge podcast feeds (2000+
 *  episodes) from causing hundreds of sequential native DB round-trips that
 *  block the JS event loop for tens of seconds. */
const MAX_ITEMS_PER_FEED = 100;
/** Maximum concurrent requests to a single host. Even with a global
 *  concurrency of 6, firing several requests at once to the same origin is
 *  what triggered Reddit's 429s — most rate limiters count a burst, not an
 *  average. */
const MAX_PER_HOST_CONCURRENCY = 2;
/** Per-host concurrency for hosts with a recorded 429 history. Once a host
 *  has ever rate-limited us we never send it more than one request at a
 *  time. */
const STRICT_HOST_CONCURRENCY = 1;

/**
 * Host-level rate-limit state that persists across refresh runs for the
 * lifetime of the app session. Keyed by hostname; the value is the epoch-ms
 * timestamp after which the host may be contacted again. Without this, two
 * pull-to-refreshes in quick succession would re-hammer a host that told us
 * to back off on the first pass.
 */
const hostRateLimits = new Map<string, number>();
/** Hosts that have returned a 429 at any point this session. These are
 *  permanently demoted to serialized (one-at-a-time) fetching. */
const strictHosts = new Set<string>();

/** Test-only: clears the module-level host rate-limit state so tests are
 *  order-independent. */
export function __resetHostRateLimitStateForTesting(): void {
  hostRateLimits.clear();
  strictHosts.clear();
}
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

  // Hosts with a persisted 429 history (from previous sessions, stored on the
  // feed row) are treated as strict from the first request of this session.
  for (const feed of feeds) {
    if (feed.rate_limit_info) {
      const host = extractHost(feed.url);
      if (host) strictHosts.add(host);
    }
  }

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

    // Honor host-wide rate limiting. If any sibling feed from this host
    // already received a 429 during this refresh run, skip this feed rather
    // than firing another request we know will be rejected.
    const host = extractHost(feed.url);
    if (host) {
      const rateLimitedUntil = hostRateLimits.get(host);
      if (rateLimitedUntil !== undefined && rateLimitedUntil > Date.now()) {
        skipped += 1;
        completed += 1;
        emitProgress();
        return;
      }
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
          if (fetched.rateLimitHeaders) {
            await updateFeedRateLimitInfo(
              feed.id,
              serializeRateLimitHeaders(fetched.rateLimitHeaders)
            );
          }
          await scheduleNextSuccess(feed);
          await recordFeedFetchOutcome(feed.id, true);
          succeeded += 1;
          return;
        }
        const includedItems = filterExcludedRedditComments(feed, fetched.items);
        await upsertItems(feed.id, includedItems.slice(0, MAX_ITEMS_PER_FEED));
        if (shouldExcludeRedditComments(feed)) {
          await deleteRedditCommentItems(feed.id);
        }
        await updateFeedCacheValidators(
          feed.id,
          fetched.etag ?? null,
          fetched.lastModified ?? null
        );
        await updateFeedLastFetched(feed.id);
        await setFeedError(feed.id, null);
        if (fetched.rateLimitHeaders) {
          await updateFeedRateLimitInfo(
            feed.id,
            serializeRateLimitHeaders(fetched.rateLimitHeaders)
          );
        }
        await scheduleNextSuccess(feed);
        await recordFeedFetchOutcome(feed.id, true);
        succeeded += 1;
      } catch (error) {
        if (error instanceof RateLimitError) {
          // Propagate the rate limit to all feeds on the same host so
          // concurrent and subsequent workers — in this run and any run
          // later in the session — don't fire requests that are guaranteed
          // to be rejected.
          if (host) {
            const delayMs = parseRetryAfterMs(
              error.rateLimitHeaders.retryAfter
            );
            hostRateLimits.set(host, Date.now() + delayMs);
            strictHosts.add(host);
          }
          await updateFeedRateLimitInfo(
            feed.id,
            serializeRateLimitHeaders(error.rateLimitHeaders)
          );
        }
        const cachedItemCount = await getItemCountForFeed(feed.id);
        const fallbackSuffix =
          cachedItemCount > 0 ? " Showing cached posts." : "";
        await setFeedError(
          feed.id,
          `${(error as Error).message}${fallbackSuffix}`
        );
        options.onFeedFailure?.(feed, error as Error);
        await scheduleNextFailure(feed);
        await recordFeedFetchOutcome(feed.id, false);
        failed += 1;
      }
    })();

    let timeoutId: ReturnType<typeof setTimeout>;
    const timedOut = await Promise.race([
      // Swallow any rejection from work (e.g. if the catch handler itself
      // threw due to a transient native DB failure) so it doesn't surface
      // as an uncaught promise after the timeout race has already settled.
      work.then(
        () => false,
        () => false
      ),
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
        await recordFeedFetchOutcome(feed.id, false);
      } catch {
        // Best-effort: never let scheduling errors mask the timeout itself.
      }
      failed += 1;
    }
    completed += 1;
    emitProgress();
  };

  // Refresh the most overdue feeds first so the content the user has waited
  // longest for lands earliest in the run. Stable sort keeps the caller's
  // order for equally-due feeds.
  const pending = [...feeds].sort(
    (a, b) => (a.next_fetch_at ?? 0) - (b.next_fetch_at ?? 0)
  );

  // Bounded-concurrency worker pool with a per-host cap: avoid saturating the
  // radio / DB on accounts with many subscriptions, and never burst multiple
  // simultaneous requests at a single origin (rate limiters count bursts).
  const hostInFlight = new Map<string, number>();
  const waiters: Array<() => void> = [];

  const hostLimit = (h: string): number =>
    strictHosts.has(h) ? STRICT_HOST_CONCURRENCY : MAX_PER_HOST_CONCURRENCY;

  /** Removes and returns the first pending feed whose host has a free slot,
   *  or null when every remaining feed's host is saturated. */
  const takeNext = (): Feed | null => {
    for (let i = 0; i < pending.length; i++) {
      const host = extractHost(pending[i].url);
      if (!host || (hostInFlight.get(host) ?? 0) < hostLimit(host)) {
        return pending.splice(i, 1)[0];
      }
    }
    return null;
  };

  const wakeWaiters = () => {
    while (waiters.length > 0) {
      waiters.shift()!();
    }
  };

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, feeds.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(
      (async () => {
        while (pending.length > 0) {
          const feed = takeNext();
          if (feed === null) {
            // Every remaining feed's host is busy. Wait for any in-flight
            // fetch to finish, then rescan. refreshOne always settles (it
            // races a wall-clock timeout), so this cannot deadlock.
            await new Promise<void>((resolve) => waiters.push(resolve));
            continue;
          }
          const host = extractHost(feed.url);
          if (host) hostInFlight.set(host, (hostInFlight.get(host) ?? 0) + 1);
          try {
            await refreshOne(feed);
          } finally {
            if (host) {
              hostInFlight.set(host, (hostInFlight.get(host) ?? 1) - 1);
            }
            wakeWaiters();
          }
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

/** Serialize rate-limit headers to the JSON string stored in `rate_limit_info`. */
function serializeRateLimitHeaders(headers: RateLimitHeaders): string {
  return JSON.stringify(headers);
}
