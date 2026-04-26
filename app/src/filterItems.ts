import { FeedItemWithFeed } from "./types";

export type FilterMode = "all" | "unread" | "starred";

/**
 * Filters a list of feed items according to the selected filter mode.
 *
 * - "all"     → returns all items unchanged
 * - "unread"  → returns only items that have not been read (read === 0 / falsy)
 * - "starred" → returns only items whose id is in the savedIds set
 */
export function applyFilter(
  items: FeedItemWithFeed[],
  filter: FilterMode,
  savedIds: Set<number>
): FeedItemWithFeed[] {
  if (filter === "unread") return items.filter((i) => !i.read);
  if (filter === "starred") return items.filter((i) => savedIds.has(i.id));
  return items;
}
