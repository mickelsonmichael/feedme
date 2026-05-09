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
 * - `staleness_penalty = max(0, (age - HORIZON) / HORIZON)²` — zero for items
 *   younger than {@link STALENESS_HORIZON_MS}, then growing quadratically for
 *   older items.
 *
 * Intuitions:
 * - Every feed's newest item gets `feed_rank = 0`. The per-feed random offset
 *   shuffles which feed's newest item appears first, so the top of the list
 *   rotates across feeds on every refresh instead of always favouring the most
 *   recently-publishing feed.
 * - Within each "rank round" (rank 0, rank 1, …) items from different feeds
 *   are interleaved in a random but stable order for that sort call.
 * - A feed that hasn't posted in months has `feed_rank = 0` for its newest
 *   item, but the staleness penalty inflates its score above the penalty-free
 *   scores of active feeds, pushing stale content toward the bottom.
 * - Items with no `published_at` receive `Infinity` and sink to the very end.
 *
 * Ties (same feed, same score) are broken by `published_at` (newer first);
 * nulls are always last.
 *
 * @param items - The items to sort.
 * @param now - Optional clock function (defaults to Date.now) to allow
 *   deterministic testing.
 * @param rng - Optional random-number function returning a value in [0, 1)
 *   (defaults to Math.random). Inject a deterministic function in tests.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  now: () => number = Date.now,
  rng: () => number = Math.random
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
      (a, b) => (b.published_at ?? -Infinity) - (a.published_at ?? -Infinity)
    );
    feedItems.forEach((item, i) => rankById.set(item.id, i));
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
  const scored = items.map((item) => {
    if (item.published_at == null) {
      return { item, score: Infinity };
    }

    const rank = rankById.get(item.id) ?? 0;
    const age = Math.max(0, currentTime - item.published_at);
    const overHorizon = Math.max(0, age - STALENESS_HORIZON_MS);
    const penalty = (overHorizon / STALENESS_HORIZON_MS) ** 2;
    const offset = feedOffset.get(item.feed_id) ?? 0;

    return { item, score: rank + offset + penalty };
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
 * @param rng - Optional random-number function passed through to
 *   {@link sortStacked}.
 */
export function applySortMode(
  items: FeedItemWithFeed[],
  mode: SortMode,
  now?: () => number,
  rng?: () => number
): FeedItemWithFeed[] {
  switch (mode) {
    case "newest":
      return sortNewest(items);
    case "stacked":
      return sortStacked(items, now, rng);
  }
}
