import {
  applyCollapsedRuns,
  COLLAPSE_RUN_COMPRESS_THRESHOLD,
  isCollapsedItemRow,
  isCollapsedRunRow,
  makeRunKey,
} from "./collapseRepeated";
import { FeedItemWithFeed } from "./types";
import { FeedListRow } from "./groupItems";

function makeItem(
  id: number,
  feedId: number,
  overrides: Partial<FeedItemWithFeed> = {}
): FeedItemWithFeed {
  return {
    id,
    feed_id: feedId,
    feed_title: `Feed ${feedId}`,
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    content: null,
    image_url: null,
    raw_xml: null,
    published_at: 1_000 - id,
    read: 0,
    ...overrides,
  };
}

describe("applyCollapsedRuns", () => {
  it("returns rows unchanged when no feed has collapse enabled", () => {
    const rows: FeedListRow[] = [
      makeItem(1, 1),
      makeItem(2, 1),
      makeItem(3, 2),
    ];
    const result = applyCollapsedRuns(rows, new Set(), new Set());
    expect(result).toEqual(rows);
  });

  it("keeps the first item of a same-feed spammy run expanded and collapses the rest", () => {
    const a = makeItem(1, 1);
    const b = makeItem(2, 1);
    const c = makeItem(3, 1);
    const d = makeItem(4, 2);

    const result = applyCollapsedRuns([a, b, c, d], new Set([1]), new Set());

    expect(result).toHaveLength(4);
    expect(result[0]).toBe(a);
    expect(isCollapsedItemRow(result[1])).toBe(true);
    expect(isCollapsedItemRow(result[2])).toBe(true);
    expect(result[3]).toBe(d);
  });

  it("does not collapse when the feed is not in the collapse set", () => {
    const a = makeItem(1, 1);
    const b = makeItem(2, 1);
    const result = applyCollapsedRuns([a, b], new Set([2]), new Set());
    expect(result).toEqual([a, b]);
  });

  it("uncollapses individually whitelisted item ids", () => {
    // a is the leader (first feed-1 item in the run) so it's already
    // expanded; b is whitelisted so it's expanded too; c collapses
    // because feed 1 has already been seen in the run.
    const a = makeItem(1, 1);
    const b = makeItem(2, 1);
    const c = makeItem(3, 1);
    const result = applyCollapsedRuns([a, b, c], new Set([1]), new Set([2]));
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
    expect(isCollapsedItemRow(result[2])).toBe(true);
  });

  it("treats group dividers as run boundaries", () => {
    const a = makeItem(1, 1);
    const divider: FeedListRow = {
      type: "group-divider",
      label: "Today",
      key: "divider-today",
    };
    const b = makeItem(2, 1);
    const result = applyCollapsedRuns([a, divider, b], new Set([1]), new Set());
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(divider);
    expect(result[2]).toBe(b);
  });

  it("does not collapse an isolated spammy item between non-spammy items", () => {
    // Feed 1 is spammy but item 1 has no spammy neighbour.
    const a = makeItem(1, 1);
    const b = makeItem(2, 2);
    const c = makeItem(3, 1);
    const result = applyCollapsedRuns([a, b, c], new Set([1]), new Set());
    expect(result).toEqual([a, b, c]);
  });

  it("keeps the leader plus first N collapsed items and compresses the rest into a stub", () => {
    // Run of 10 same-feed items → item 1 stays expanded as the leader,
    // items 2-10 collapse (9 collapsed). The 9-item collapsed segment
    // exceeds the threshold of 4, so the first 4 collapsed rows are kept
    // and the remaining 5 are replaced by a stub.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(2 + COLLAPSE_RUN_COMPRESS_THRESHOLD);
    expect(result[0]).toBe(items[0]);
    for (let i = 1; i <= COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      expect(stub.count).toBe(
        items.length - 1 - COLLAPSE_RUN_COMPRESS_THRESHOLD
      );
      expect(stub.feedId).toBe(1);
      // Stub key comes from the first item of the collapsed segment
      // (item 2), not the leader.
      expect(stub.runKey).toBe(makeRunKey(1, 2));
    }
  });

  it("does not compress when the collapsed segment is exactly at the threshold", () => {
    // Run of 5 spammy items → leader + 4 collapsed = threshold, no stub.
    const items = [1, 2, 3, 4, 5].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(1 + COLLAPSE_RUN_COMPRESS_THRESHOLD);
    expect(result[0]).toBe(items[0]);
    for (let i = 1; i <= COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
  });

  it("compresses a collapsed segment one larger than the threshold into N collapsed + stub(1)", () => {
    // Run of 6 spammy items → leader + 5 collapsed; 5 > threshold so
    // 4 collapsed + stub(1) is produced after the leader.
    const items = [1, 2, 3, 4, 5, 6].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(2 + COLLAPSE_RUN_COMPRESS_THRESHOLD);
    expect(result[0]).toBe(items[0]);
    for (let i = 1; i <= COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      expect(stub.count).toBe(1);
    }
  });

  it("reveals a previously compressed run when its run key is in revealedRunIds", () => {
    // 10 items → leader + 9 collapsed. Without reveal we'd see
    // leader + 4 collapsed + stub(5). With reveal, the leader plus all 9
    // individual collapsed rows are emitted.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => makeItem(id, 1));
    const runKey = makeRunKey(1, 2);
    const result = applyCollapsedRuns(
      items,
      new Set([1]),
      new Set(),
      new Set([runKey])
    );

    expect(result).toHaveLength(10);
    expect(result[0]).toBe(items[0]);
    for (let i = 1; i < 10; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
  });

  it("uncollapsed items inside a long run break it into shorter segments that may avoid compression", () => {
    // 7 same-feed items: item 1 is the leader (expanded), item 4 is
    // individually uncollapsed (also expanded). Collapsed segments are
    // [2,3] (2 items, below threshold) and [5,6,7] (3 items, below
    // threshold), so nothing is compressed into a stub.
    const items = [1, 2, 3, 4, 5, 6, 7].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set([4]));

    expect(result).toHaveLength(7);
    expect(result[0]).toBe(items[0]);
    expect(isCollapsedItemRow(result[1])).toBe(true);
    expect(isCollapsedItemRow(result[2])).toBe(true);
    expect(result[3]).toBe(items[3]);
    expect(isCollapsedItemRow(result[4])).toBe(true);
    expect(isCollapsedItemRow(result[5])).toBe(true);
    expect(isCollapsedItemRow(result[6])).toBe(true);
  });

  it("treats interleaved collapse-enabled feeds as a single run with one leader per feed", () => {
    // Two spammy feeds (1 and 2) interleaving. The first item from each
    // feed (items 1 and 2) stays expanded as a leader; the remaining 8
    // items collapse and the tail is compressed into a stub.
    const items = [
      makeItem(1, 1),
      makeItem(2, 2),
      makeItem(3, 1),
      makeItem(4, 2),
      makeItem(5, 1),
      makeItem(6, 2),
      makeItem(7, 1),
      makeItem(8, 2),
      makeItem(9, 1),
      makeItem(10, 2),
    ];
    const result = applyCollapsedRuns(items, new Set([1, 2]), new Set());

    expect(result).toHaveLength(2 + COLLAPSE_RUN_COMPRESS_THRESHOLD + 1);
    expect(result[0]).toBe(items[0]);
    expect(result[1]).toBe(items[1]);
    for (let i = 2; i < 2 + COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      // 10 items - 2 leaders - 4 kept collapsed = 4 in the stub.
      expect(stub.count).toBe(
        items.length - 2 - COLLAPSE_RUN_COMPRESS_THRESHOLD
      );
    }
  });

  it("ends a cross-feed spammy run when a non-collapse-enabled item appears and starts a fresh run after", () => {
    // Spammy feeds 1 and 2 interleave (first run): items 1 (feed 1) and
    // 2 (feed 2) are leaders, item 3 (feed 1 again) collapses. The
    // non-spammy feed-3 item ends the run. The second run starts fresh:
    // items 5 (feed 2) and 6 (feed 1) are both leaders again.
    const items = [
      makeItem(1, 1),
      makeItem(2, 2),
      makeItem(3, 1),
      makeItem(4, 3),
      makeItem(5, 2),
      makeItem(6, 1),
    ];
    const result = applyCollapsedRuns(items, new Set([1, 2]), new Set());

    expect(result).toHaveLength(6);
    expect(result[0]).toBe(items[0]);
    expect(result[1]).toBe(items[1]);
    expect(isCollapsedItemRow(result[2])).toBe(true);
    expect(result[3]).toBe(items[3]);
    expect(result[4]).toBe(items[4]);
    expect(result[5]).toBe(items[5]);
  });
});
