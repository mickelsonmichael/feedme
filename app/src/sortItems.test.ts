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
  // A fixed "now" so tests are deterministic.
  const NOW = Date.UTC(2026, 9, 30, 12);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const now = () => NOW;

  let nextId = 1;
  beforeEach(() => {
    nextId = 1;
  });

  /** `count` posts from one feed, the first `start` old, then `gap` apart. */
  function posts(
    feedId: number,
    count: number,
    start: number,
    gap: number,
    at = NOW
  ): FeedItemWithFeed[] {
    return Array.from({ length: count }, (_, i) =>
      makeItem(nextId++, feedId, at - start - i * gap)
    );
  }

  const isOlder = (item: FeedItemWithFeed, at = NOW) =>
    at - (item.published_at ?? at) > 30 * DAY;

  const olderPositions = (sorted: FeedItemWithFeed[], at = NOW) =>
    sorted.flatMap((item, i) => (isOlder(item, at) ? [i] : []));

  it("returns every item exactly once", () => {
    // Arrange
    const items = [
      ...posts(1, 20, HOUR, 2 * HOUR),
      ...posts(2, 20, 40 * DAY, 9 * DAY),
      makeItem(nextId++, 3, null),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result.map((i) => i.id).sort((a, b) => a - b)).toEqual(
      items.map((i) => i.id).sort((a, b) => a - b)
    );
  });

  it("returns empty array for empty input", () => {
    expect(sortStacked([], now)).toEqual([]);
  });

  it("returns a single feed's recent posts newest first", () => {
    // Arrange
    const items = posts(1, 5, HOUR, 6 * HOUR).reverse();

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("doesn't let a burst from one feed bury other feeds' recent posts", () => {
    // Arrange — thirty posts in the last few hours from one feed, and one
    // post apiece from feeds that posted three and six days ago.
    const burst = posts(1, 30, 5 * MINUTE, 10 * MINUTE);
    const [threeDaysAgo] = posts(2, 1, 3 * DAY, 0);
    const [sixDaysAgo] = posts(3, 1, 6 * DAY, 0);

    // Act
    const result = sortStacked([...burst, threeDaysAgo, sixDaysAgo], now);

    // Assert — each lands within a few posts of the top, in age order.
    const ids = result.map((i) => i.id);
    expect(ids.indexOf(threeDaysAgo.id)).toBeLessThan(4);
    expect(ids.indexOf(sixDaysAgo.id)).toBeLessThan(7);
    expect(ids.indexOf(threeDaysAgo.id)).toBeLessThan(
      ids.indexOf(sixDaysAgo.id)
    );
  });

  it("leads with recent posts and sprinkles older ones in about one slot in ten", () => {
    // Arrange — 60 posts from the last fortnight across three feeds, and 60
    // posts between six weeks and a year old.
    const items = [
      ...posts(1, 30, HOUR, 10 * HOUR),
      ...posts(2, 20, 2 * HOUR, 15 * HOUR),
      ...posts(3, 10, 3 * HOUR, DAY),
      ...posts(4, 30, 40 * DAY, 10 * DAY),
      ...posts(5, 30, 45 * DAY, 3 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — never straight away, never back to back, never a long drought.
    const older = olderPositions(result).filter((i) => i < 60);
    expect(older.length).toBeGreaterThanOrEqual(4);
    expect(older.length).toBeLessThanOrEqual(7);
    expect(older[0]).toBeGreaterThanOrEqual(6);
    older.slice(1).forEach((position, i) => {
      expect(position - older[i]).toBeGreaterThanOrEqual(4);
      expect(position - older[i]).toBeLessThanOrEqual(16);
    });
  });

  it("follows the recent posts with the remaining older ones", () => {
    // Arrange
    const recent = posts(1, 20, HOUR, 5 * HOUR);
    const older = posts(2, 25, 60 * DAY, 7 * DAY);

    // Act
    const result = sortStacked([...older, ...recent], now);

    // Assert — every recent post comes before the run of older posts that
    // ends the list.
    const lastRecent = Math.max(...recent.map((r) => result.indexOf(r)));
    expect(lastRecent).toBeLessThan(25);
    expect(result.slice(25).every((item) => isOlder(item))).toBe(true);
  });

  it("keeps a feed's newest post up to 30 days old among the recent posts", () => {
    // On every day of a three-week sweep, a monthly feed's newest post is 25
    // days old while a busy feed and plenty of older posts compete.
    for (let day = 0; day < 21; day++) {
      // Arrange
      const at = NOW + day * DAY;
      nextId = 1;
      const [monthlyNewest, ...monthlyOlder] = posts(
        1,
        6,
        25 * DAY,
        30 * DAY,
        at
      );
      const items = [
        monthlyNewest,
        ...monthlyOlder,
        ...posts(2, 40, HOUR, HOUR, at),
        ...posts(3, 40, 300 * DAY, 20 * DAY, at),
      ];

      // Act
      const result = sortStacked(items, () => at);

      // Assert — about 12 busy posts ahead of it, plus a throwback or two.
      expect(result.indexOf(monthlyNewest)).toBeLessThan(17);
    }
  });

  it("favours throwbacks a few weeks old, but lets much older posts through", () => {
    // Arrange — older posts spread evenly from one month to two years old.
    const firstThrowbackAges: number[] = [];
    for (let day = 0; day < 60; day++) {
      const at = NOW + day * DAY;
      nextId = 1;
      const items = [
        ...posts(1, 40, HOUR, 6 * HOUR, at),
        ...posts(2, 40, 31 * DAY, 17 * DAY, at),
        ...posts(3, 40, 33 * DAY, 18 * DAY, at),
      ];

      // Act
      const result = sortStacked(items, () => at);

      olderPositions(result, at)
        .slice(0, 3)
        .forEach((i) =>
          firstThrowbackAges.push((at - result[i].published_at!) / DAY)
        );
    }

    // Assert — the pool's median age is about a year; early throwbacks skew
    // well younger, yet some are more than a year old.
    const sorted = [...firstThrowbackAges].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(180);
    expect(sorted.some((age) => age > 365)).toBe(true);
  });

  it("spreads throwbacks across feeds", () => {
    // Arrange — two feeds with identical back catalogues.
    const items = [
      ...posts(1, 100, HOUR, 3 * HOUR),
      ...posts(2, 30, 40 * DAY, 5 * DAY),
      ...posts(3, 30, 40 * DAY, 5 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    const firstTen = olderPositions(result)
      .slice(0, 10)
      .map((i) => result[i].feed_id);
    expect(firstTen.filter((feedId) => feedId === 2).length).toBeGreaterThan(2);
    expect(firstTen.filter((feedId) => feedId === 3).length).toBeGreaterThan(2);
  });

  it("picks different throwbacks on different days", () => {
    // Arrange
    const firstThrowbackIds = new Set<number>();
    for (let day = 0; day < 10; day++) {
      const at = NOW + day * DAY;
      nextId = 1;
      const items = [
        ...posts(1, 30, HOUR, 6 * HOUR, at),
        ...posts(2, 30, 40 * DAY, 5 * DAY, at),
      ];

      // Act
      const result = sortStacked(items, () => at);

      firstThrowbackIds.add(result[olderPositions(result, at)[0]].id);
    }

    // Assert
    expect(firstThrowbackIds.size).toBeGreaterThan(3);
  });

  it("is deterministic and independent of input order", () => {
    // Arrange
    const items = [
      ...posts(1, 15, HOUR, 9 * HOUR),
      ...posts(2, 15, 2 * HOUR, DAY),
      ...posts(3, 15, 50 * DAY, 11 * DAY),
    ];

    // Act
    const a = sortStacked(items, now);
    const b = sortStacked(items, now);
    const c = sortStacked([...items].reverse(), now);

    // Assert
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(c.map((i) => i.id)).toEqual(a.map((i) => i.id));
  });

  it("puts posts with no published date last", () => {
    // Arrange
    const undated = makeItem(nextId++, 1, null);
    const items = [
      undated,
      ...posts(1, 3, HOUR, HOUR),
      ...posts(2, 3, 400 * DAY, 30 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result[result.length - 1]).toBe(undated);
  });

  it("treats a future-dated post as published now", () => {
    // Arrange — the future post must not count as stale, and must not take
    // more than its feed's first slot either.
    const future = makeItem(1, 1, NOW + DAY);
    const sameFeed = makeItem(2, 1, NOW - HOUR);
    const otherFeed = makeItem(3, 2, NOW - HOUR);

    // Act
    const result = sortStacked([sameFeed, otherFeed, future], now);

    // Assert
    expect(
      result
        .slice(0, 2)
        .map((i) => i.id)
        .sort()
    ).toEqual([1, 3]);
    expect(result[2]).toBe(sameFeed);
  });

  it("keeps the order the database paged items in", () => {
    // Arrange — keys from a stacked page query outrank anything the loaded
    // window alone would suggest.
    const items = [
      { ...makeItem(1, 1, NOW - HOUR), stack_key: 2 },
      { ...makeItem(2, 1, NOW - 400 * DAY), stack_key: 0.5 },
      { ...makeItem(3, 2, NOW - 2 * HOUR), stack_key: 1 },
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = posts(1, 3, HOUR, HOUR).concat(posts(2, 2, 90 * DAY, DAY));
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
    // Arrange — two feeds, one recent item each.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
    ];

    // Act
    const result = applySortMode(items, "stacked", now);

    // Assert
    expect(result).toHaveLength(2);
    expect(new Set(result.map((i) => i.feed_id)).size).toBe(2);
  });

  it("passes the custom now function through to sortStacked", () => {
    // Arrange — items 1 and 3 are each the newest from their own feed, items
    // 2 and 4 the second-newest. Measured against `now` they're all hours
    // old, so each feed's newest comes first.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 3 * HOUR),
      makeItem(3, 2, NOW - 1 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const result = applySortMode(items, "stacked", now);

    // Assert
    const top2 = result
      .slice(0, 2)
      .map((i) => i.id)
      .sort((a, b) => a - b);
    expect(top2).toEqual([1, 3]);
  });
});
