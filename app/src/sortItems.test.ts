import { sortNewest, sortStacked, applySortMode } from "./sortItems";
import { FeedItemWithFeed } from "./types";

function makeItem(
  id: number,
  feedId: number,
  publishedAt: number | null,
  feedTitle = `Feed ${feedId}`
): FeedItemWithFeed {
  return {
    id,
    feed_id: feedId,
    title: `Item ${id}`,
    url: `https://example.com/item/${id}`,
    content: null,
    image_url: null,
    raw_xml: null,
    published_at: publishedAt,
    read: 0,
    feed_title: feedTitle,
  };
}

describe("sortNewest", () => {
  it("returns items sorted by published_at descending", () => {
    // Arrange
    const items = [
      makeItem(1, 1, 100),
      makeItem(2, 1, 300),
      makeItem(3, 1, 200),
    ];

    // Act
    const result = sortNewest(items);

    // Assert
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("treats null published_at as 0 (sorts to end)", () => {
    // Arrange
    const items = [makeItem(1, 1, null), makeItem(2, 1, 100)];

    // Act
    const result = sortNewest(items);

    // Assert
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = [makeItem(1, 1, 200), makeItem(2, 1, 100)];
    const originalOrder = items.map((i) => i.id);

    // Act
    sortNewest(items);

    // Assert
    expect(items.map((i) => i.id)).toEqual(originalOrder);
  });

  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = sortNewest([]);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("sortStacked", () => {
  // Helper: a fixed "now" so tests are deterministic. Use a large value so all
  // ages are positive.
  const NOW = 1_000_000_000_000; // ms
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const MONTH = 30 * DAY;
  const now = () => NOW;

  it("returns all items without duplicates", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = sortStacked([], now);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns single-feed items in newest-first order", () => {
    // Arrange — single feed, three items at varying ages
    const items = [
      makeItem(1, 1, NOW - 3 * HOUR),
      makeItem(2, 1, NOW - 1 * HOUR),
      makeItem(3, 1, NOW - 2 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — within a single feed all items share the same avg_interval, so
    // the score reduces to age and items come out newest-first.
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("places the infrequent feed's newest item at the very top when it is the most recent item overall", () => {
    // Arrange — a monthly feed whose newest item is only 1 minute old, while
    // the hourly feed's most recent item is 5 hours old. Both items have
    // feed_rank = 0, so they compete purely on recency — the 1-minute-old
    // monthly item must win.
    const items = [
      // Hourly feed (id 1): items 5h, 6h, 7h, 8h, 9h ago
      makeItem(1, 1, NOW - 5 * HOUR),
      makeItem(2, 1, NOW - 6 * HOUR),
      makeItem(3, 1, NOW - 7 * HOUR),
      makeItem(4, 1, NOW - 8 * HOUR),
      makeItem(5, 1, NOW - 9 * HOUR),
      // Monthly feed (id 2): newest is 1 minute old
      makeItem(10, 2, NOW - 60 * 1000),
      makeItem(11, 2, NOW - 1 * MONTH),
      makeItem(12, 2, NOW - 2 * MONTH),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — monthly newest (id 10) is the freshest item overall and must
    // be first, proving the infrequent feed is not drowned out.
    expect(result[0].id).toBe(10);
  });

  it("pushes very old items from stale (infrequent) feeds to the bottom", () => {
    // Arrange — an active hourly feed and a stale monthly feed whose newest
    // item is many months old.
    const items = [
      // Hourly feed: items at 1h, 2h, 3h, 4h, 5h ago
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 1, NOW - 4 * HOUR),
      makeItem(5, 1, NOW - 5 * HOUR),
      // Stale monthly feed: items at 6, 7, 8 months ago (very old)
      makeItem(10, 2, NOW - 6 * MONTH),
      makeItem(11, 2, NOW - 7 * MONTH),
      makeItem(12, 2, NOW - 8 * MONTH),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — every fresh hourly item should rank ahead of every stale
    // monthly item. The old monthly items must occupy the bottom slots.
    const hourlyIds = [1, 2, 3, 4, 5];
    const monthlyIds = [10, 11, 12];
    expect(
      result
        .slice(0, 5)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual(hourlyIds);
    expect(
      result
        .slice(5)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual(monthlyIds);
  });

  it("interleaves feeds equitably: top N results contain one item from each of the N feeds", () => {
    // Arrange — two feeds with multiple recent items each. With rank-based
    // scoring every feed's rank-0 item competes on equal footing, so the top
    // two slots must each hold one item from a different feed.
    const items = [
      // Hourly feed (avg interval ≈ 1h): items at 1..6 hours ago
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 1, NOW - 4 * HOUR),
      makeItem(5, 1, NOW - 5 * HOUR),
      makeItem(6, 1, NOW - 6 * HOUR),
      // Daily feed (avg interval ≈ 1d): items at 1..3 days ago
      makeItem(10, 2, NOW - 1 * DAY),
      makeItem(11, 2, NOW - 2 * DAY),
      makeItem(12, 2, NOW - 3 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — the top 2 results (one per feed) must come from different feeds.
    const top2FeedIds = result.slice(0, 2).map((i) => i.feed_id);
    expect(new Set(top2FeedIds).size).toBe(2);
  });

  it("does not let a burst of items from one feed push another feed's newest item out of top N", () => {
    // Arrange — feed 1 has 10 very recent items; feed 2 has only 1 item from
    // an hour ago. Feed 2's item must still appear in the top 2 (one per feed).
    const items = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeItem(i + 1, 1, NOW - (i + 1) * 60 * 1000)
      ),
      makeItem(100, 2, NOW - 1 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — feed 2's item must be within the top 2 positions.
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(100);
  });

  it("treats items with null published_at as the bottom of the list", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, null),
      makeItem(3, 2, NOW - 2 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — the null-published item must be last.
    expect(result[result.length - 1].id).toBe(2);
  });

  it("is deterministic: identical inputs produce identical outputs", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const a = sortStacked(items, now);
    const b = sortStacked(items, now);

    // Assert
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
    ];
    const snapshot = JSON.stringify(items);

    // Act
    sortStacked(items, now);

    // Assert
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});

describe("applySortMode", () => {
  const NOW = 1_000_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const now = () => NOW;

  it("delegates to sortNewest when mode is 'newest'", () => {
    // Arrange
    const items = [makeItem(1, 1, 100), makeItem(2, 1, 300)];

    // Act
    const result = applySortMode(items, "newest");

    // Assert
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it("delegates to sortStacked when mode is 'stacked'", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
    ];

    // Act
    const result = applySortMode(items, "stacked", now);

    // Assert
    expect(result).toHaveLength(2);
  });

  it("passes the custom now function through to sortStacked", () => {
    // Arrange — with this `now`, item 3 is the newest from feed 2 and item 1
    // from feed 1. Both feeds have small intervals, so the two newest items
    // come first, then the older two follow in newest-first order.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 3 * HOUR),
      makeItem(3, 2, NOW - 1 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const result = applySortMode(items, "stacked", now);

    // Assert — items 1 and 3 (both 1h old) lead, then 2 (3h), then 4 (4h).
    const top2 = result
      .slice(0, 2)
      .map((i) => i.id)
      .sort((a, b) => a - b);
    expect(top2).toEqual([1, 3]);
    expect(result[2].id).toBe(2);
    expect(result[3].id).toBe(4);
  });
});
