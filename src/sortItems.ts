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

/** Default interval used when a feed has fewer than two timestamped items. */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Minimum interval used to prevent feeds with bursts of identically-timestamped
 * items from collapsing to a zero score (which would cause them to dominate
 * the top of the list).
 */
const MIN_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Compute the average interval (in ms) between consecutive items for each feed
 * in the input. Feeds with fewer than two timestamped items use
 * {@link DEFAULT_INTERVAL_MS}. The computed interval is clamped to at least
 * {@link MIN_INTERVAL_MS}.
 */
function computeAverageIntervals(
  items: FeedItemWithFeed[]
): Map<number, number> {
  const timestampsByFeed = new Map<number, number[]>();
  for (const item of items) {
    if (item.published_at == null) continue;
    let list = timestampsByFeed.get(item.feed_id);
    if (!list) {
      list = [];
      timestampsByFeed.set(item.feed_id, list);
    }
    list.push(item.published_at);
  }

  const intervalByFeed = new Map<number, number>();
  for (const [feedId, ts] of timestampsByFeed) {
    if (ts.length < 2) {
      intervalByFeed.set(feedId, DEFAULT_INTERVAL_MS);
      continue;
    }
    let min = ts[0];
    let max = ts[0];
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] < min) min = ts[i];
      if (ts[i] > max) max = ts[i];
    }
    const interval = (max - min) / (ts.length - 1);
    intervalByFeed.set(feedId, Math.max(interval, MIN_INTERVAL_MS));
  }
  return intervalByFeed;
}

/**
 * Sort items using the "stacked" algorithm, which scores every item by how
 * old it is relative to its feed's typical posting cadence so that newer items
 * surface to the top while still giving infrequent feeds representation —
 * without resurrecting very old items from stale feeds.
 *
 * Score formula (lower is higher in the resulting list):
 *
 *     score = age² / avg_interval_of_feed
 *
 * Where `age = now - published_at` and `avg_interval_of_feed` is the mean time
 * between posts in that feed (computed from the items present). Intuitions:
 *
 * - Newest item from any feed has `age ≈ 0`, so every feed gets a top spot —
 *   infrequent feeds are not drowned out by chatty ones.
 * - For an hourly feed, `avg_interval` is small (1h), so an item only a few
 *   hours old still scores low and many of its items remain near the top.
 * - For a monthly feed, `avg_interval` is large (~720h), so a fresh post
 *   scores near zero, but as soon as a post is months old its `age²` term
 *   dominates and the item gets pushed far down — matching "don't show very
 *   old posts from infrequent feeds".
 * - Items with no `published_at` get `Infinity` and sink to the bottom.
 *
 * Ties are broken by `published_at` (newer first).
 *
 * @param items - The items to sort.
 * @param now - Optional clock function (defaults to Date.now) to allow
 *   deterministic testing.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  now: () => number = Date.now
): FeedItemWithFeed[] {
  const currentTime = now();
  const intervalByFeed = computeAverageIntervals(items);

  const scored = items.map((item) => {
    const interval = intervalByFeed.get(item.feed_id) ?? DEFAULT_INTERVAL_MS;
    if (item.published_at == null) {
      return { item, score: Infinity };
    }
    const age = Math.max(0, currentTime - item.published_at);
    return { item, score: (age * age) / interval };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    // Tie-break: newer published_at first; nulls last.
    return (
      (b.item.published_at ?? -Infinity) - (a.item.published_at ?? -Infinity)
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
 */
export function applySortMode(
  items: FeedItemWithFeed[],
  mode: SortMode,
  now?: () => number
): FeedItemWithFeed[] {
  switch (mode) {
    case "newest":
      return sortNewest(items);
    case "stacked":
      return sortStacked(items, now);
  }
}
