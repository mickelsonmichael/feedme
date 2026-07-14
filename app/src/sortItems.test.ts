import {
  sortNewest,
  sortStacked,
  applySortMode,
  computeFeedPostingInterval,
  feedDayShuffle,
} from "./sortItems";
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
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
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

    // Assert — within a single feed the score reduces to rank (demotion grows
    // with age, so it can never invert the order), and rank mirrors
    // newest-first order.
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("interleaves feeds equitably: top N results contain one item from each of the N feeds", () => {
    // Arrange — three feeds with multiple fresh items each. Every feed's
    // rank-0 item lands in band 0 (no demotion), so the top 3 slots must each
    // hold one item from a different feed regardless of shuffle order.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(10, 2, NOW - 30 * MINUTE),
      makeItem(11, 2, NOW - 90 * MINUTE),
      makeItem(20, 3, NOW - 4 * HOUR),
      makeItem(21, 3, NOW - 8 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    const top3FeedIds = result.slice(0, 3).map((i) => i.feed_id);
    expect(new Set(top3FeedIds).size).toBe(3);
  });

  it("does not let a burst of items from one feed push another feed's newest item out of top N", () => {
    // Arrange — feed 1 has 10 very recent items; feed 2 has only 1 item from
    // an hour ago. Feed 2's item must still appear in the top 2 (one per feed).
    const items = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeItem(i + 1, 1, NOW - (i + 1) * MINUTE)
      ),
      makeItem(100, 2, NOW - 1 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — feed 2's item must be within the top 2 positions.
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(100);
  });

  it("keeps a quiet feed's newest post in the top band when it is fresh for that feed's cadence", () => {
    // Arrange — a quarterly blog whose newest post is 2 days old (0.02 of its
    // 90-day cadence) alongside a feed posting every few minutes. The blog's
    // post must share band 0 with the busy feed's newest item: in the top 2,
    // and ahead of the busy feed's SECOND item.
    const items = [
      // Busy feed: posts minutes apart
      makeItem(1, 1, NOW - 2 * MINUTE),
      makeItem(2, 1, NOW - 20 * MINUTE),
      makeItem(3, 1, NOW - 40 * MINUTE),
      // Quarterly blog: newest is 2 days old, prior posts ~90 days apart
      makeItem(10, 2, NOW - 2 * DAY),
      makeItem(11, 2, NOW - 92 * DAY),
      makeItem(12, 2, NOW - 182 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(1);
    expect(top2Ids).toContain(10);
    const blogPos = result.findIndex((i) => i.id === 10);
    const busySecondPos = result.findIndex((i) => i.id === 2);
    expect(blogPos).toBeLessThan(busySecondPos);
  });

  it("does not demote items younger than the grace window (3 cadence units)", () => {
    // Arrange — a daily-cadence feed whose newest post is 2.5 days old: 2.5
    // units → floor 2 → within the 2-cycle grace → no demotion, so it stays
    // in band 0 alongside the hourly feed's newest item.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      // Daily feed, slightly stale but within grace
      makeItem(10, 2, NOW - 2.5 * DAY),
      makeItem(11, 2, NOW - 3.5 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — both rank-0 items occupy the top 2 slots.
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(1);
    expect(top2Ids).toContain(10);
  });

  it("demotes a feed's newest post one band per cadence unit beyond the grace window", () => {
    // Arrange — feed 2 posts daily but its newest item is 3.2 days old:
    // floor(3.2) - 2 = 1 band of demotion → it lands in band 1, below feed
    // 1's newest but alongside feed 1's second item.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      // Daily feed, one missed cycle beyond grace
      makeItem(10, 2, NOW - 3.2 * DAY),
      makeItem(11, 2, NOW - 4.2 * DAY),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — feed 1's newest is alone in band 0; feed 2's newest has been
    // demoted out of the top band but still precedes feed 1's THIRD item.
    expect(result[0].id).toBe(1);
    const demotedPos = result.findIndex((i) => i.id === 10);
    const feed1ThirdPos = result.findIndex((i) => i.id === 3);
    expect(demotedPos).toBeGreaterThan(0);
    expect(demotedPos).toBeLessThan(feed1ThirdPos);
  });

  it("sinks ancient posts from dead feeds below every active feed's items", () => {
    // Arrange — an active feed and a weekly feed that died ~2 years ago
    // (newest post is ~100 cadence units old → demoted ~98 bands).
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 1, NOW - 4 * HOUR),
      makeItem(5, 1, NOW - 5 * HOUR),
      // Dead weekly feed
      makeItem(10, 2, NOW - 100 * WEEK),
      makeItem(11, 2, NOW - 101 * WEEK),
      makeItem(12, 2, NOW - 102 * WEEK),
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — every active item ranks ahead of every dead-feed item.
    expect(
      result
        .slice(0, 5)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      result
        .slice(5)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual([10, 11, 12]);
  });

  it("uses a 7-day freshness unit for feeds whose cadence is unknown (single item)", () => {
    // Arrange — two single-item feeds: one posted 2 weeks ago (2 units →
    // within grace, band 0), one posted 6 weeks ago (6 units → demoted 3
    // bands). The active feed anchors the band structure.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(10, 2, NOW - 2 * WEEK), // unknown cadence, within grace
      makeItem(20, 3, NOW - 6 * WEEK), // unknown cadence, stale
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — the 2-week-old solo post shares band 0 (top 2); the 6-week-old
    // solo post is demoted below everything else.
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(1);
    expect(top2Ids).toContain(10);
    expect(result[result.length - 1].id).toBe(20);
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

  it("is fully deterministic: identical calls produce identical order", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
      makeItem(5, 3, NOW - 5 * HOUR),
    ];

    // Act
    const a = sortStacked(items, now);
    const b = sortStacked(items, now);
    // Input order must not matter either.
    const c = sortStacked([...items].reverse(), now);

    // Assert
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a.map((i) => i.id)).toEqual(c.map((i) => i.id));
  });

  it("rotates the within-band feed order across days but keeps it stable within a day", () => {
    // Arrange — five feeds, each with one fresh item (all band 0), so the
    // visible order is purely the daily shuffle.
    const feedIds = [1, 2, 3, 4, 5];
    const makeDayItems = () =>
      feedIds.map((feedId) => makeItem(feedId * 100, feedId, NOW - 1 * HOUR));

    // Act — the same day sorted twice, then a sweep across 10 distinct days.
    // Items stay a fixed 1h old relative to each day's clock so demotion
    // never kicks in and only the shuffle varies.
    const sameDayA = sortStacked(makeDayItems(), now).map((i) => i.feed_id);
    const sameDayB = sortStacked(makeDayItems(), now).map((i) => i.feed_id);
    const leadersByDay = Array.from({ length: 10 }, (_, d) => {
      const dayNow = () => NOW + d * DAY;
      const items = feedIds.map((feedId) =>
        makeItem(feedId * 100, feedId, dayNow() - 1 * HOUR)
      );
      return sortStacked(items, dayNow)[0].feed_id;
    });

    // Assert — stable within the day, but more than one feed leads across the
    // 10-day sweep (deterministic: the shuffle hash is fixed, so this cannot
    // flake).
    expect(sameDayA).toEqual(sameDayB);
    expect(new Set(leadersByDay).size).toBeGreaterThan(1);
  });

  it("caps future timestamps in within-feed ranking so they do not displace past-dated items beyond their natural rank", () => {
    // Arrange — feed 1 has a far-future item and a genuinely recent item.
    // Feed 2 has a genuinely recent item.
    // The future item still sorts as "rank 0" within its feed (capped to NOW,
    // which is newer than NOW-1h), so the genuinely-recent co-feed item stays
    // at rank 1. Both rank-0 items (ids 1 and 3) must appear before the
    // rank-1 item (id 2), and the future timestamp must not create a
    // staleness demotion or negative age.
    const items = [
      makeItem(1, 1, NOW + 1 * DAY), // future-dated — rank 0 within feed 1
      makeItem(2, 1, NOW - 1 * HOUR), // genuinely recent — rank 1 within feed 1
      makeItem(3, 2, NOW - 1 * HOUR), // feed 2 rank-0 item
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert
    expect(result[result.length - 1].id).toBe(2);
    expect(
      result
        .slice(0, 2)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual([1, 3]);
  });

  it("ranks identical timestamps within a feed by id, independent of input order", () => {
    // Arrange — two items from one feed with the exact same published_at
    // (common for batch-imported archives). Within-feed ranking tie-breaks by
    // id descending, so the higher id (later insert) takes rank 0.
    const items = [
      makeItem(10, 1, NOW - 1 * HOUR),
      makeItem(11, 1, NOW - 1 * HOUR), // identical timestamp, higher id
    ];

    // Act
    const result = sortStacked(items, now);

    // Assert — identical timestamps: higher id (newer insert) ranks first,
    // and the order is stable regardless of input order.
    expect(result.map((i) => i.id)).toEqual([11, 10]);
    const reversed = sortStacked([...items].reverse(), now);
    expect(reversed.map((i) => i.id)).toEqual([11, 10]);
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

describe("feedDayShuffle", () => {
  it("is deterministic and bounded to [0, 1)", () => {
    for (const feedId of [0, 1, 7, 123, 99999]) {
      for (const day of [0, 1, 20000, 20641]) {
        const v = feedDayShuffle(feedId, day);
        expect(v).toBe(feedDayShuffle(feedId, day));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("varies across days for a fixed feed and across feeds on a fixed day", () => {
    const acrossDays = new Set(
      Array.from({ length: 14 }, (_, d) => feedDayShuffle(42, 20000 + d))
    );
    const acrossFeeds = new Set(
      Array.from({ length: 14 }, (_, f) => feedDayShuffle(f + 1, 20000))
    );
    expect(acrossDays.size).toBeGreaterThan(1);
    expect(acrossFeeds.size).toBeGreaterThan(1);
  });
});

describe("computeFeedPostingInterval", () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MIN_POSTING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes (from module)
  const DEFAULT_POSTING_INTERVAL_MS = DAY; // 1 day (from module)

  it("returns the default interval when fewer than 2 timestamps are provided", () => {
    expect(computeFeedPostingInterval([])).toBe(DEFAULT_POSTING_INTERVAL_MS);
    expect(computeFeedPostingInterval([Date.now()])).toBe(
      DEFAULT_POSTING_INTERVAL_MS
    );
  });

  it("returns the median gap for a regular posting cadence", () => {
    // Items posted every hour: gaps all = 1h, median = 1h.
    const NOW = 1_000_000_000_000;
    const timestamps = [NOW, NOW - HOUR, NOW - 2 * HOUR, NOW - 3 * HOUR];
    const result = computeFeedPostingInterval(timestamps);
    expect(result).toBe(HOUR);
  });

  it("returns the median gap for a weekly cadence", () => {
    const NOW = 1_000_000_000_000;
    const timestamps = [
      NOW,
      NOW - WEEK,
      NOW - 2 * WEEK,
      NOW - 3 * WEEK,
      NOW - 4 * WEEK,
    ];
    const result = computeFeedPostingInterval(timestamps);
    expect(result).toBe(WEEK);
  });

  it("clamps very small gaps to the minimum posting interval", () => {
    // Sub-15-minute gaps (e.g. a liveblog with burst posts) are clamped.
    const NOW = 1_000_000_000_000;
    const timestamps = [NOW, NOW - 60_000, NOW - 120_000]; // 1-minute gaps
    const result = computeFeedPostingInterval(timestamps);
    expect(result).toBe(MIN_POSTING_INTERVAL_MS);
  });

  it("clamps very large gaps to the maximum posting interval (365 days)", () => {
    const MAX = 365 * DAY;
    const NOW = 1_000_000_000_000;
    // Two items spaced 2 years apart.
    const timestamps = [NOW, NOW - 2 * 365 * DAY];
    const result = computeFeedPostingInterval(timestamps);
    expect(result).toBe(MAX);
  });

  it("uses the median, ignoring outlier gaps", () => {
    // 4 gaps: 1h, 1h, 1h, 100h. Sorted: [1h, 1h, 1h, 100h]. Median = 1h.
    const NOW = 1_000_000_000_000;
    const timestamps = [
      NOW,
      NOW - HOUR,
      NOW - 2 * HOUR,
      NOW - 3 * HOUR,
      NOW - 103 * HOUR,
    ];
    const result = computeFeedPostingInterval(timestamps);
    expect(result).toBe(HOUR);
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
    // Arrange — two feeds, one fresh item each: both band 0, so the result
    // must contain both items with one item per feed in the top 2.
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
    // Arrange — items 1 and 3 are each the newest from their own feed
    // (rank 0), items 2 and 4 are second-newest (rank 1). Rank-major scoring
    // puts both rank-0 items ahead of both rank-1 items.
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
