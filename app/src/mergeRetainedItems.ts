import { FeedItemWithFeed } from "./types";

/**
 * Fold the items the feed list is deliberately holding on screen back into a
 * freshly queried unread-only page.
 *
 * When the unread filter is active the page query itself is unread-only, so a
 * re-query drops every post the user has just read — including the ones
 * `retainedUnreadIds` exists to keep in place, so that a row does not evaporate
 * from under the user's thumb the moment mark-as-read-on-scroll fires. Those
 * posts are no longer in the query's result set, so they have to be carried
 * over from the previously committed list.
 *
 * Retained items are appended rather than spliced into position: the caller
 * re-sorts the whole list (`applySortMode`) before rendering, so order here is
 * irrelevant beyond being deterministic. Items already present in `page` are
 * never duplicated, and a retained id with no corresponding item in `previous`
 * is simply dropped.
 *
 * @param page - The freshly queried unread-only page.
 * @param previous - The list currently committed to the screen.
 * @param retainedIds - Ids being held on screen despite having been read.
 */
export function mergeRetainedItems(
  page: FeedItemWithFeed[],
  previous: FeedItemWithFeed[],
  retainedIds: Set<number>
): FeedItemWithFeed[] {
  if (retainedIds.size === 0) return page;

  const pageIds = new Set(page.map((item) => item.id));
  const carried = previous.filter(
    (item) => retainedIds.has(item.id) && !pageIds.has(item.id)
  );

  return carried.length > 0 ? [...page, ...carried] : page;
}
