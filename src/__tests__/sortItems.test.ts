import { sortNewest, sortStacked, applySortMode } from "../sortItems";
import { FeedItemWithFeed } from "../types";

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

  it("gives an infrequent feed top representation when its newest item is fresh relative to its cadence", () => {
    // Arrange — a monthly feed whose newest item is fresher (relative to its
    // own cadence) than the hourly feed's freshest is to its cadence. With
    // the `age² / avg_interval` formula the monthly newest (age 1min,
    // interval 1 month) scores ≈ 0, while older monthly items get crushed by
    // the squared-age term and rank well below recent hourly items.
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

    // Assert — monthly newest (id 10) must appear in the top half of results,
    // proving infrequent feeds aren't drowned out, while older monthly items
    // (11, 12) are not surfaced near the top.
    const top4Ids = result.slice(0, 4).map((i) => i.id);
    expect(top4Ids).toContain(10);
    expect(top4Ids).not.toContain(11);
    expect(top4Ids).not.toContain(12);
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

  it("shows more items from a high-cadence feed than from a low-cadence feed near the top", () => {
    // Arrange — both feeds have several items, but the hourly feed has a much
    // smaller average interval than the daily feed.
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

    // Assert — among the top 4 results we expect more hourly items than daily
    // items, because the hourly feed's score grows much more slowly with age.
    const top4 = result.slice(0, 4);
    const hourlyCount = top4.filter((i) => i.feed_id === 1).length;
    const dailyCount = top4.filter((i) => i.feed_id === 2).length;
    expect(hourlyCount).toBeGreaterThan(dailyCount);
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
