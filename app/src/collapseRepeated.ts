import { FeedItemWithFeed } from "./types";
import { FeedListRow, isGroupDivider } from "./groupItems";

/**
 * A placeholder row that stands in for an item from a "collapse repeated
 * entries" feed when that item appears immediately after another item from
 * the same feed in the Newest sort. Rendered as a single muted line that the
 * user can tap to reveal the underlying item individually.
 */
export type CollapsedItemRow = {
  type: "collapsed-item";
  item: FeedItemWithFeed;
};

/**
 * A placeholder that compresses the *tail* of a long run of collapsed items
 * into a single "and X more posts" stub. When a contiguous segment of
 * collapsed items exceeds {@link COLLAPSE_RUN_COMPRESS_THRESHOLD}, the
 * first `COLLAPSE_RUN_COMPRESS_THRESHOLD` items are shown as individual
 * collapsed rows and the remaining items are replaced with this stub.
 * Tapping it adds the run to the revealed-runs set so the next render shows
 * every collapsed item in the segment individually (each still needing a
 * separate tap to expand fully).
 */
export type CollapsedRunRow = {
  type: "collapsed-run";
  runKey: string;
  feedId: number;
  count: number;
};

export type CollapsedFeedListRow =
  | FeedListRow
  | CollapsedItemRow
  | CollapsedRunRow;

/**
 * Maximum number of individual collapsed rows shown in a single contiguous
 * segment before the remainder of the segment is compressed into a single
 * "and X more posts" stub.
 */
export const COLLAPSE_RUN_COMPRESS_THRESHOLD = 4;

export function isCollapsedItemRow(
  row: CollapsedFeedListRow
): row is CollapsedItemRow {
  return (row as CollapsedItemRow).type === "collapsed-item";
}

export function isCollapsedRunRow(
  row: CollapsedFeedListRow
): row is CollapsedRunRow {
  return (row as CollapsedRunRow).type === "collapsed-run";
}

/**
 * Builds a stable key for a "collapsed run" (consecutive collapsed items
 * from the same feed). Keyed by feed id and the id of the first item in the
 * run, which is stable across renders as long as the feed data is unchanged.
 */
export function makeRunKey(feedId: number, firstItemId: number): string {
  return `run-${feedId}-${firstItemId}`;
}

/**
 * Walks a sorted list of rows (newest-first, optionally containing group
 * dividers) and replaces every item belonging to a feed with the
 * `collapse_repeated` flag set with `CollapsedItemRow` placeholders, as
 * long as that item is part of a run of 2+ consecutive collapse-enabled
 * items (possibly from different collapse-enabled feeds — two noisy feeds
 * interleaving each other still count as a single spammy run). An isolated
 * spammy item between two non-spammy items is shown expanded as normal.
 *
 * Items whose id is in `uncollapsedIds` are always shown expanded, even
 * inside a run.
 *
 * After the initial pass, any contiguous segment of more than
 * {@link COLLAPSE_RUN_COMPRESS_THRESHOLD} `CollapsedItemRow`s is further
 * compressed: the first `COLLAPSE_RUN_COMPRESS_THRESHOLD` collapsed rows
 * are kept and the remainder is replaced with a single `CollapsedRunRow`
 * stub. If the segment's run key is in `revealedRunIds`, the full set of
 * individual collapsed rows is emitted instead.
 */
export function applyCollapsedRuns(
  rows: CollapsedFeedListRow[],
  collapseRepeatedFeedIds: ReadonlySet<number>,
  uncollapsedIds: ReadonlySet<number>,
  revealedRunIds: ReadonlySet<string> = new Set()
): CollapsedFeedListRow[] {
  if (collapseRepeatedFeedIds.size === 0) return rows;

  // Helper: is the row at `idx` a non-divider item belonging to a
  // collapse-enabled feed?
  const isSpammyAt = (idx: number): boolean => {
    if (idx < 0 || idx >= rows.length) return false;
    const r = rows[idx];
    if (isGroupDivider(r) || isCollapsedItemRow(r) || isCollapsedRunRow(r)) {
      return false;
    }
    return collapseRepeatedFeedIds.has(r.feed_id);
  };

  // First pass: replace eligible items with CollapsedItemRow placeholders.
  // An item collapses iff it is spammy AND has a spammy neighbour on
  // either side (so isolated spammy items between non-spammy items stay
  // expanded). Group dividers are treated as hard boundaries.
  const stage: CollapsedFeedListRow[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (
      isGroupDivider(row) ||
      isCollapsedItemRow(row) ||
      isCollapsedRunRow(row)
    ) {
      stage.push(row);
      continue;
    }
    const item = row;
    const itemIsSpammy = collapseRepeatedFeedIds.has(item.feed_id);
    const hasSpammyNeighbour = isSpammyAt(idx - 1) || isSpammyAt(idx + 1);
    const shouldCollapse =
      itemIsSpammy && hasSpammyNeighbour && !uncollapsedIds.has(item.id);

    if (shouldCollapse) {
      stage.push({ type: "collapsed-item", item });
    } else {
      stage.push(item);
    }
  }

  // Second pass: compress contiguous segments of more than
  // COLLAPSE_RUN_COMPRESS_THRESHOLD collapsed items into a single
  // CollapsedRunRow stub (unless the run has been revealed).
  const result: CollapsedFeedListRow[] = [];
  let i = 0;
  while (i < stage.length) {
    const row = stage[i];
    if (!isCollapsedItemRow(row)) {
      result.push(row);
      i++;
      continue;
    }
    const segment: CollapsedItemRow[] = [];
    let j = i;
    while (j < stage.length) {
      const next = stage[j];
      if (!isCollapsedItemRow(next)) break;
      segment.push(next);
      j++;
    }

    const runKey = makeRunKey(segment[0].item.feed_id, segment[0].item.id);
    if (
      segment.length > COLLAPSE_RUN_COMPRESS_THRESHOLD &&
      !revealedRunIds.has(runKey)
    ) {
      for (let k = 0; k < COLLAPSE_RUN_COMPRESS_THRESHOLD; k++) {
        result.push(segment[k]);
      }
      result.push({
        type: "collapsed-run",
        runKey,
        feedId: segment[0].item.feed_id,
        count: segment.length - COLLAPSE_RUN_COMPRESS_THRESHOLD,
      });
    } else {
      for (const s of segment) result.push(s);
    }
    i = j;
  }

  return result;
}
