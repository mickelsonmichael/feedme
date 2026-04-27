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
 * Items older than this horizon start accumulating a staleness penalty in the
 * stacked sort, causing them to sink below fresher items even when they hold a
 * low within-feed rank (e.g. a feed that hasn't posted in months).
 */
const STALENESS_HORIZON_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sort items using the "stacked" algorithm, which interleaves feeds equitably
 * so that no single high-volume feed can bury the newest content from quieter
 * feeds.
 *
 * Score formula (lower score → higher in the list):
 *
 *     score = feed_rank + staleness_penalty
 *
 * Where:
 * - `feed_rank` is the 0-based position of the item within its own feed when
 *   that feed's items are sorted newest-first (0 = newest from this feed,
 *   1 = second-newest, …).
 * - `staleness_penalty = max(0, (age - HORIZON) / HORIZON)²` — zero for items
 *   younger than {@link STALENESS_HORIZON_MS}, then growing quadratically for
 *   older items.
 *
 * Intuitions:
 * - Every feed's newest item gets `feed_rank = 0`. Ties are broken by
 *   `published_at` (most recent first), so the overall top of the list shows
 *   one item from each feed in chronological order — chatty feeds can no longer
 *   bury a quiet feed's freshest post.
 * - Within each "rank round" (rank 0, rank 1, …) items from different feeds
 *   are interleaved purely by recency, giving a natural round-robin feel.
 * - A feed that hasn't posted in months has `feed_rank = 0` for its newest
 *   item, but the staleness penalty inflates its score above the penalty-free
 *   scores of active feeds, pushing stale content toward the bottom.
 * - Items with no `published_at` receive `Infinity` and sink to the very end.
 *
 * Ties are broken by `published_at` (newer first); nulls are always last.
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

  // Step 1: assign each item its within-feed rank (0 = newest from that feed).
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
    // Sort newest-first within each feed (items without a timestamp go last).
    feedItems.sort(
      (a, b) =>
        (b.published_at ?? -Infinity) - (a.published_at ?? -Infinity)
    );
    feedItems.forEach((item, i) => rankById.set(item.id, i));
  }

  // Step 2: compute a composite score for every item.
  const scored = items.map((item) => {
    if (item.published_at == null) {
      return { item, score: Infinity };
    }

    const rank = rankById.get(item.id) ?? 0;
    const age = Math.max(0, currentTime - item.published_at);
    const overHorizon = Math.max(0, age - STALENESS_HORIZON_MS);
    const penalty = (overHorizon / STALENESS_HORIZON_MS) ** 2;

    return { item, score: rank + penalty };
  });

  // Step 3: sort by score ascending; break ties by recency (newer first).
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
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
