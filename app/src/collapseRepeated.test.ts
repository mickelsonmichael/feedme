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

  it("collapses every item in a same-feed spammy run of 2+ items", () => {
    const a = makeItem(1, 1);
    const b = makeItem(2, 1);
    const c = makeItem(3, 1);
    const d = makeItem(4, 2);

    const result = applyCollapsedRuns([a, b, c, d], new Set([1]), new Set());

    expect(result).toHaveLength(4);
    expect(isCollapsedItemRow(result[0])).toBe(true);
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
    const a = makeItem(1, 1);
    const b = makeItem(2, 1);
    const c = makeItem(3, 1);
    const result = applyCollapsedRuns([a, b, c], new Set([1]), new Set([2]));
    expect(isCollapsedItemRow(result[0])).toBe(true);
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

  it("keeps the first N collapsed items and compresses the rest into a stub", () => {
    // Run of 10 same-feed items → all 10 collapsed in pass 1 (no leader).
    // The collapsed segment exceeds the threshold of 4, so the first 4
    // collapsed rows are kept and the remaining 6 are replaced by a stub.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(COLLAPSE_RUN_COMPRESS_THRESHOLD + 1);
    for (let i = 0; i < COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      expect(stub.count).toBe(items.length - COLLAPSE_RUN_COMPRESS_THRESHOLD);
      expect(stub.feedId).toBe(1);
      expect(stub.runKey).toBe(makeRunKey(1, 1));
    }
  });

  it("does not compress when the collapsed segment is exactly at the threshold", () => {
    // Run of 4 spammy items → all 4 collapsed = exactly threshold, no stub.
    const items = [1, 2, 3, 4].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(COLLAPSE_RUN_COMPRESS_THRESHOLD);
    for (let i = 0; i < COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
  });

  it("compresses a run one larger than the threshold into N collapsed + stub(1)", () => {
    // Run of 5 spammy items → 4 collapsed + stub(1).
    const items = [1, 2, 3, 4, 5].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set());

    expect(result).toHaveLength(COLLAPSE_RUN_COMPRESS_THRESHOLD + 1);
    for (let i = 0; i < COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      expect(stub.count).toBe(1);
    }
  });

  it("reveals a previously compressed run when its run key is in revealedRunIds", () => {
    // 10 items → all 10 collapsed. Without reveal we'd see 4 + stub(6).
    // With reveal, all 10 individual collapsed rows are emitted.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => makeItem(id, 1));
    const runKey = makeRunKey(1, 1);
    const result = applyCollapsedRuns(
      items,
      new Set([1]),
      new Set(),
      new Set([runKey])
    );

    expect(result).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
  });

  it("uncollapsed items inside a long run break it into shorter segments that may avoid compression", () => {
    // 7 same-feed items, item 4 individually uncollapsed → segments are
    // [1,2,3] (3 items, below threshold) and [5,6,7] (3 items, below threshold).
    const items = [1, 2, 3, 4, 5, 6, 7].map((id) => makeItem(id, 1));
    const result = applyCollapsedRuns(items, new Set([1]), new Set([4]));

    expect(result).toHaveLength(7);
    expect(isCollapsedItemRow(result[0])).toBe(true);
    expect(isCollapsedItemRow(result[1])).toBe(true);
    expect(isCollapsedItemRow(result[2])).toBe(true);
    expect(result[3]).toBe(items[3]);
    expect(isCollapsedItemRow(result[4])).toBe(true);
    expect(isCollapsedItemRow(result[5])).toBe(true);
    expect(isCollapsedItemRow(result[6])).toBe(true);
  });

  it("treats interleaved collapse-enabled feeds as a single run and compresses them together", () => {
    // Two spammy feeds (1 and 2) interleaving. Every item is adjacent to
    // another spammy item so all 10 collapse, and the tail is compressed
    // into a single stub.
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

    expect(result).toHaveLength(COLLAPSE_RUN_COMPRESS_THRESHOLD + 1);
    for (let i = 0; i < COLLAPSE_RUN_COMPRESS_THRESHOLD; i++) {
      expect(isCollapsedItemRow(result[i])).toBe(true);
    }
    const stub = result[result.length - 1];
    expect(isCollapsedRunRow(stub)).toBe(true);
    if (isCollapsedRunRow(stub)) {
      expect(stub.count).toBe(items.length - COLLAPSE_RUN_COMPRESS_THRESHOLD);
    }
  });

  it("ends a cross-feed spammy run when a non-collapse-enabled item appears", () => {
    // Spammy feeds 1 and 2 interleave, then non-spammy feed 3 item ends
    // the run, then more spammy items form a new (shorter) run.
    const items = [
      makeItem(1, 1),
      makeItem(2, 2),
      makeItem(3, 1),
      makeItem(4, 3), // non-spammy → ends the run
      makeItem(5, 2),
      makeItem(6, 1),
    ];
    const result = applyCollapsedRuns(items, new Set([1, 2]), new Set());

    expect(result).toHaveLength(6);
    expect(isCollapsedItemRow(result[0])).toBe(true);
    expect(isCollapsedItemRow(result[1])).toBe(true);
    expect(isCollapsedItemRow(result[2])).toBe(true);
    expect(result[3]).toBe(items[3]);
    expect(isCollapsedItemRow(result[4])).toBe(true);
    expect(isCollapsedItemRow(result[5])).toBe(true);
  });
});
