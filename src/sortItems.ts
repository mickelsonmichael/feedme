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
 * Sort items using the "stacked" algorithm, which distributes items from
 * different feeds pseudo-randomly to prevent noisy feeds from overwhelming
 * quieter ones.
 *
 * Algorithm:
 * 1. Group items by feed, sorted newest-first within each group.
 * 2. Repeatedly pick a random feed and take its newest item.
 * 3. When only one feed remains, append all its remaining items in newest-first order.
 *
 * @param items - The items to sort.
 * @param random - Optional random function (defaults to Math.random) to allow
 *   deterministic testing.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  random: () => number = Math.random
): FeedItemWithFeed[] {
  // Group items by feed_id
  const feedMap = new Map<number, FeedItemWithFeed[]>();
  for (const item of items) {
    if (!feedMap.has(item.feed_id)) {
      feedMap.set(item.feed_id, []);
    }
    feedMap.get(item.feed_id)!.push(item);
  }

  // Sort each feed's items newest-first
  for (const feedItems of feedMap.values()) {
    feedItems.sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0));
  }

  const result: FeedItemWithFeed[] = [];
  const feeds = Array.from(feedMap.values());

  while (feeds.length > 1) {
    const idx = Math.floor(random() * feeds.length);
    const feedItems = feeds[idx];
    result.push(feedItems.shift()!);
    if (feedItems.length === 0) {
      feeds.splice(idx, 1);
    }
  }

  // Append all remaining items from the last feed (already sorted newest-first)
  if (feeds.length === 1) {
    result.push(...feeds[0]);
  }

  return result;
}

/**
 * Apply the given sort mode to the items array.
 */
export function applySortMode(
  items: FeedItemWithFeed[],
  mode: SortMode,
  random?: () => number
): FeedItemWithFeed[] {
  switch (mode) {
    case "newest":
      return sortNewest(items);
    case "stacked":
      return sortStacked(items, random);
  }
}
