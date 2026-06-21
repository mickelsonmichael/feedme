import { FeedItemWithFeed } from "./types";

export type SortMode = "newest" | "stacked";

/**
 * Sort items in reverse chronological order (newest first).
 */
export function sortNewest(items: FeedItemWithFeed[]): FeedItemWithFeed[] {
  return [...items].sort(
    (a, b) => (b.published_at ?? 0) - (a.published_at ?? 0)
  );
}

/**
 * Number of "posting cycles" a post can age through before it starts
 * accumulating a staleness penalty in the stacked sort.
 *
 * One cycle = one median inter-post gap for that feed.  A post from a feed
 * that publishes weekly has a per-cycle length of 7 days, so its staleness
 * horizon is 30 × 7 = 210 days.  A post from a feed that publishes hourly
 * has a per-cycle length of ~60 min, so its horizon is 30 hours.
 *
 * This replaces the old fixed 30-day `STALENESS_HORIZON_MS` constant.
 */
const STALENESS_HORIZON_CYCLES = 30;

/**
 * Bounds on the per-feed posting interval used for the staleness horizon.
 *
 * - `MIN`: 15 minutes — prevents absurd penalties on burst feeds (e.g. a
 *   liveblog).  A 15-minute interval gives a ~7.5-hour horizon, which is
 *   still generous enough to show recent news.
 * - `MAX`: 365 days — prevents an effectively immortal horizon on dormant
 *   feeds with only a handful of archived posts spaced years apart.
 */
const MIN_POSTING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_POSTING_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

/**
 * Fallback posting interval used when a feed has fewer than 2 timestamped
 * items and no interval can be derived.  One day gives the same staleness
 * horizon as the old fixed 30-day constant, preserving backwards-compatible
 * behaviour for new or near-empty feeds.
 */
const DEFAULT_POSTING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Derive a feed's posting cadence as the median gap between its items'
 * `published_at` timestamps.  Returns {@link DEFAULT_POSTING_INTERVAL_MS}
 * when fewer than 2 usable timestamps are available, and clamps the result
 * to `[MIN_POSTING_INTERVAL_MS, MAX_POSTING_INTERVAL_MS]`.
 *
 * Unlike `computeBaseInterval` in feedSchedule.ts, this function does NOT
 * apply a 24-hour polling cap — we want the actual editorial cadence, not a
 * fetch-scheduling interval.
 */
export function computeFeedPostingInterval(publishedAts: number[]): number {
  if (publishedAts.length < 2) return DEFAULT_POSTING_INTERVAL_MS;

  const sorted = [...publishedAts].sort((a, b) => b - a); // newest first
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i] - sorted[i + 1];
    if (gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return DEFAULT_POSTING_INTERVAL_MS;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];

  return Math.max(
    MIN_POSTING_INTERVAL_MS,
    Math.min(MAX_POSTING_INTERVAL_MS, median)
  );
}

/**
 * Sort items using the "stacked" algorithm, which interleaves feeds equitably
 * so that no single high-volume feed can bury the newest content from quieter
 * feeds.
 *
 * Score formula (lower score → higher in the list):
 *
 *     score = feed_rank + feed_offset + staleness_penalty
 *
 * Where:
 * - `feed_rank` is the 0-based position of the item within its own feed when
 *   that feed's items are sorted newest-first (0 = newest from this feed,
 *   1 = second-newest, …).
 * - `feed_offset` is a random value in `[0, 1)` assigned once per feed per
 *   sort call. It is strictly less than 1, so a rank-0 item always outranks
 *   any rank-1 item. Within the same rank, though, feeds are randomly ordered
 *   on every call — ensuring no single feed consistently appears first.
 * - `staleness_penalty` — zero for items younger than the feed's staleness
 *   horizon, then growing quadratically:
 *
 *       effective_age   = max(0, lastSessionAt - published_at)
 *                         [if lastSessionAt provided; else currentTime - published_at]
 *       feed_horizon    = STALENESS_HORIZON_CYCLES × feed_posting_interval
 *       overHorizon     = max(0, effective_age - feed_horizon)
 *       penalty         = (overHorizon / feed_horizon)²
 *
 * **Velocity-normalised horizon**: `feed_posting_interval` is the median
 * inter-post gap for that feed.  A once-weekly blog therefore has a staleness
 * horizon of 30 weeks, while an hourly news feed has a ~30-hour horizon.
 * This prevents quiet feeds from being penalised just because they publish
 * infrequently.
 *
 * **Session-relative effective age**: When `lastSessionAt` is supplied it
 * is used as the reference point instead of the current clock.  Items
 * published *after* the previous session have `effective_age = 0` (brand new
 * to the user), while items that were already visible in the prior session
 * carry their age forward.  Items with no `published_at` receive `Infinity`
 * and sink to the very end.
 *
 * Ties (same feed, same score) are broken by `published_at` (newer first);
 * nulls are always last.
 *
 * @param items - The items to sort.
 * @param now - Optional clock function (defaults to Date.now) to allow
 *   deterministic testing.
 * @param rng - Optional random-number function returning a value in [0, 1)
 *   (defaults to Math.random). Inject a deterministic function in tests.
 * @param lastSessionAt - Optional Unix timestamp (ms) of the previous session
 *   start.  When provided, effective item age is measured relative to this
 *   point rather than the current clock, making the sort session-aware.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  now: () => number = Date.now,
  rng: () => number = Math.random,
  lastSessionAt?: number
): FeedItemWithFeed[] {
  const currentTime = now();

  // Pre-compute the capped timestamp for every item once. Future timestamps
  // are clamped to currentTime so that posts erroneously dated in the future
  // are treated as if published right now — preventing them from receiving
  // outsized weight in within-feed ranking and final tie-breaking.
  const cappedAt = new Map<number, number>();
  for (const item of items) {
    if (item.published_at != null) {
      cappedAt.set(item.id, Math.min(item.published_at, currentTime));
    }
  }

  // Step 1: assign each item its within-feed rank (0 = newest from that feed)
  // and collect the per-feed published_at arrays needed for interval estimation.
  const rankById = new Map<number, number>();
  const byFeed = new Map<number, FeedItemWithFeed[]>();

  for (const item of items) {
    let list = byFeed.get(item.feed_id);
    if (!list) {
      list = [];
      byFeed.set(item.feed_id, list);
    }
    list.push(item);
  }

  for (const feedItems of byFeed.values()) {
    // Sort newest-first within each feed using the pre-computed capped
    // timestamps (items without a timestamp go last).
    feedItems.sort(
      (a, b) =>
        (cappedAt.get(b.id) ?? -Infinity) - (cappedAt.get(a.id) ?? -Infinity)
    );
    feedItems.forEach((item, i) => rankById.set(item.id, i));
  }

  // Step 1b: compute a velocity-normalised staleness horizon for every feed.
  // The horizon is STALENESS_HORIZON_CYCLES × (median inter-post gap), so
  // a slow-publishing feed ages out much later than a high-frequency feed.
  const feedHorizon = new Map<number, number>();
  for (const [feedId, feedItems] of byFeed) {
    const publishedAts = feedItems
      .map((i) => cappedAt.get(i.id))
      .filter((t): t is number => t !== undefined);
    const interval = computeFeedPostingInterval(publishedAts);
    feedHorizon.set(feedId, STALENESS_HORIZON_CYCLES * interval);
  }

  // Assign each feed a random offset in [0, 1). Because the offset is strictly
  // less than 1, a rank-0 item always outranks any rank-1 item. Within the
  // same rank, however, feeds are randomly ordered on every call, preventing
  // any single feed from consistently appearing first.
  const feedOffset = new Map<number, number>();
  for (const feedId of byFeed.keys()) {
    feedOffset.set(feedId, rng());
  }

  // Step 2: compute a composite score for every item.
  //
  // When lastSessionAt is provided, use it as the reference point for
  // effective_age: items published after the previous session have age 0
  // (they are brand new to the user), while items that were already in the
  // feed last session carry their age.  When lastSessionAt is absent we fall
  // back to the current clock (original behaviour).
  const ageReference = lastSessionAt ?? currentTime;

  const scored = items.map((item) => {
    if (item.published_at == null) {
      return { item, score: Infinity };
    }

    const rank = rankById.get(item.id) ?? 0;
    const horizon =
      feedHorizon.get(item.feed_id) ??
      STALENESS_HORIZON_CYCLES * DEFAULT_POSTING_INTERVAL_MS;

    // effective_age: how long ago was this item "available" to the user?
    // Capped at zero so future-dated items don't get a negative age.
    const effective_age = Math.max(0, ageReference - item.published_at);
    const overHorizon = Math.max(0, effective_age - horizon);
    const penalty = (overHorizon / horizon) ** 2;
    const offset = feedOffset.get(item.feed_id) ?? 0;

    return { item, score: rank + offset + penalty };
  });

  // Step 3: sort by score ascending; break ties by recency (newer first),
  // using the pre-computed capped timestamps so that future-dated items
  // cannot win tie-breaks solely because their raw timestamp is in the future.
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (
      (cappedAt.get(b.item.id) ?? -Infinity) -
      (cappedAt.get(a.item.id) ?? -Infinity)
    );
  });

  return scored.map((s) => s.item);
}

/**
 * Apply the given sort mode to the items array.
 *
 * @param items - The items to sort.
 * @param mode - The sort mode.
 * @param now - Optional clock function passed through to {@link sortStacked}.
 * @param rng - Optional random-number function passed through to
 *   {@link sortStacked}.
 * @param lastSessionAt - Optional Unix timestamp (ms) of the previous session
 *   start, passed through to {@link sortStacked} to enable session-aware
 *   staleness scoring.
 */
export function applySortMode(
  items: FeedItemWithFeed[],
  mode: SortMode,
  now?: () => number,
  rng?: () => number,
  lastSessionAt?: number
): FeedItemWithFeed[] {
  switch (mode) {
    case "newest":
      return sortNewest(items);
    case "stacked":
      return sortStacked(items, now, rng, lastSessionAt);
  }
}
