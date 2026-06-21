import {
  sortNewest,
  sortStacked,
  applySortMode,
  computeFeedPostingInterval,
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
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const now = () => NOW;
  // A fixed rng that returns the same offset (0.5) for every feed, making the
  // offset component uniform across feeds. Within the same rank, ties are then
  // resolved by published_at, matching the original algorithm's tie-breaking
  // behaviour and allowing all existing assertions to hold. Tests that
  // specifically exercise the randomisation behaviour pass their own rng.
  const rng = () => 0.5;

  it("returns all items without duplicates", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const result = sortStacked(items, now, rng);

    // Assert
    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = sortStacked([], now, rng);

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
    const result = sortStacked(items, now, rng);

    // Assert — within a single feed the score reduces to rank, and rank mirrors
    // newest-first order, so items come out newest-first.
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("places the infrequent feed's newest item in the top N results (one slot per feed)", () => {
    // Arrange — a monthly feed whose newest item is only 1 minute old, while
    // the hourly feed's most recent item is 5 hours old. Both items have
    // feed_rank = 0 and must appear in the top 2 positions (one per feed).
    // We use a fixed rng that gives feed 2 a lower offset than feed 1,
    // confirming the infrequent feed rises to the top when favoured.
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
    const result = sortStacked(items, now, rng);

    // Assert — both rank-0 items (id 1 and id 10) must occupy the top 2 slots;
    // the infrequent feed is not drowned out regardless of its rng offset.
    const top2Ids = result.slice(0, 2).map((i) => i.id);
    expect(top2Ids).toContain(1);
    expect(top2Ids).toContain(10);
  });

  it("velocity-normalised horizon: quiet feed items within their cadence are not penalised", () => {
    // Arrange — a hourly active feed and a weekly quiet feed. The weekly
    // feed's items are up to 5 weeks old — comfortably within its 30-week
    // staleness horizon — so they must NOT be penalised.
    const items = [
      // Hourly feed: items at 1h, 2h, 3h, 4h, 5h ago
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 1, NOW - 4 * HOUR),
      makeItem(5, 1, NOW - 5 * HOUR),
      // Weekly feed: items at 1w, 2w, 3w, 4w, 5w ago (within 30-week horizon)
      makeItem(10, 2, NOW - 1 * WEEK),
      makeItem(11, 2, NOW - 2 * WEEK),
      makeItem(12, 2, NOW - 3 * WEEK),
      makeItem(13, 2, NOW - 4 * WEEK),
      makeItem(14, 2, NOW - 5 * WEEK),
    ];

    // Act
    const result = sortStacked(items, now, rng);

    // Assert — each feed's rank-0 item must be in the top-2 results (no
    // penalty on either side, so interleaving is purely rank-based).
    const top2FeedIds = result.slice(0, 2).map((i) => i.feed_id);
    expect(new Set(top2FeedIds).size).toBe(2);

    // The weekly rank-0 item (10) must appear before any rank-1 item from
    // the hourly feed (since both are rank-0 and the weekly item has no
    // staleness penalty despite being a week old).
    const weeklyRank0Pos = result.findIndex((i) => i.id === 10);
    const hourlyRank1Pos = result.findIndex((i) => i.id === 2);
    expect(weeklyRank0Pos).toBeLessThan(hourlyRank1Pos);
  });

  it("velocity-normalised horizon: items many cycles beyond their feed's horizon are penalised", () => {
    // Arrange — an active hourly feed and a stale weekly feed whose newest
    // item is 100 weeks old (well beyond the 30-week staleness horizon for
    // a once-weekly feed).
    const items = [
      // Hourly feed: items at 1h, 2h, 3h, 4h, 5h ago (no penalty)
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 1, NOW - 4 * HOUR),
      makeItem(5, 1, NOW - 5 * HOUR),
      // Very stale weekly feed: items at 100w, 101w, 102w ago
      // (100 > 30 weekly-cycles → large staleness penalty)
      makeItem(10, 2, NOW - 100 * WEEK),
      makeItem(11, 2, NOW - 101 * WEEK),
      makeItem(12, 2, NOW - 102 * WEEK),
    ];

    // Act
    const result = sortStacked(items, now, rng);

    // Assert — every fresh hourly item should rank ahead of every stale
    // weekly item. The stale items must occupy the bottom slots.
    const hourlyIds = [1, 2, 3, 4, 5];
    const staleIds = [10, 11, 12];
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
    ).toEqual(staleIds);
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
    const result = sortStacked(items, now, rng);

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
    const result = sortStacked(items, now, rng);

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
    const result = sortStacked(items, now, rng);

    // Assert — the null-published item must be last.
    expect(result[result.length - 1].id).toBe(2);
  });

  it("produces stable results within one call when given a fixed rng", () => {
    // Arrange — a fixed rng makes the sort fully deterministic.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
      makeItem(3, 1, NOW - 3 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const a = sortStacked(items, now, rng);
    const b = sortStacked(items, now, rng);

    // Assert — same fixed rng ⟹ identical ordering both times.
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it("randomises feed ordering across calls: different rng values yield different top positions", () => {
    // Arrange — two feeds with items of similar age (both rank-0).
    // By controlling the rng we can force either feed to the top.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 3 * HOUR),
      makeItem(10, 2, NOW - 2 * HOUR),
      makeItem(11, 2, NOW - 4 * HOUR),
    ];

    // Act — rng that gives feed 1 a lower offset places feed 1 first; the
    // second rng gives feed 2 the lower offset, placing feed 2 first.
    let callCount = 0;
    const rngFavourFeed1 = () => (callCount++ === 0 ? 0.1 : 0.9);
    const resultA = sortStacked(items, now, rngFavourFeed1);

    callCount = 0;
    const rngFavourFeed2 = () => (callCount++ === 0 ? 0.9 : 0.1);
    const resultB = sortStacked(items, now, rngFavourFeed2);

    // Assert — different rng values must produce different feeds at position 0.
    expect(resultA[0].feed_id).not.toBe(resultB[0].feed_id);
  });

  it("caps future timestamps in within-feed ranking so they do not displace past-dated items beyond their natural rank", () => {
    // Arrange — feed 1 has a far-future item and a genuinely recent item.
    // Feed 2 has a genuinely recent item.
    // The future item still sorts as "rank 0" within its feed (capToNow = NOW,
    // which is newer than NOW-1H), so the genuinely-recent co-feed item stays
    // at rank 1. Both rank-0 items (ids 1 and 3) must appear before the
    // rank-1 item (id 2).
    const items = [
      makeItem(1, 1, NOW + 1 * DAY), // future-dated — rank 0 within feed 1
      makeItem(2, 1, NOW - 1 * HOUR), // genuinely recent — rank 1 within feed 1
      makeItem(3, 2, NOW - 1 * HOUR), // feed 2 rank-0 item
    ];

    // Act
    const result = sortStacked(items, now, rng);

    // Assert — item 2 (rank-1, score ≈ 1.5) must be last; the rank-0 items
    // (score ≈ 0.5 each) occupy the first two positions.
    expect(result[result.length - 1].id).toBe(2);
    expect(
      result
        .slice(0, 2)
        .map((i) => i.id)
        .sort((a, b) => a - b)
    ).toEqual([1, 3]);
  });

  it("caps future timestamps in tie-breaking so a far-future item does not automatically beat an item at exactly now", () => {
    // Arrange — item 2 (exactly now) is first in the input array; item 1
    // (far future) is second. With equal offsets (rng = 0.5) both score 0.5.
    // The tie-break uses capToNow: capToNow(NOW+365d) = NOW = capToNow(NOW),
    // leaving the scores identical and the stable-sort input order intact
    // (item 2 first). Without the cap, item 1's raw future timestamp would win
    // the tie unconditionally.
    const items = [
      makeItem(2, 2, NOW), // exactly now — appears first in input
      makeItem(1, 1, NOW + 365 * DAY), // far future  — appears second
    ];

    // Act
    const result = sortStacked(items, now, rng);

    // Assert — item 2 must come first because the cap makes both timestamps
    // equal (NOW) and stable sort preserves the input order.
    expect(result[0].id).toBe(2);
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 2, NOW - 2 * HOUR),
    ];
    const snapshot = JSON.stringify(items);

    // Act
    sortStacked(items, now, rng);

    // Assert
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  describe("session-relative effective age (lastSessionAt)", () => {
    it("items published after lastSessionAt have zero effective age", () => {
      // Arrange — lastSessionAt = 1 day ago. Feed 1 has two items:
      // item 1 (12h ago, published AFTER last session) and item 2 (2d ago,
      // published BEFORE last session). Both are in the same feed, so their
      // rank is determined by publication order.
      // The key behaviour: item 1's effective_age = 0 (brand new to the user),
      // item 2's effective_age = 1 day (was already in the feed last session).
      const lastSessionAt = NOW - DAY;
      const items = [
        makeItem(1, 1, NOW - 12 * HOUR), // after last session → effective_age = 0
        makeItem(2, 1, NOW - 2 * DAY), // before last session → effective_age = 1d
      ];

      // Act — with a single feed the ranking is purely by rank (rank 0, rank 1)
      const result = sortStacked(items, now, rng, lastSessionAt);

      // Assert — item 1 (newer, rank 0) must come first.
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it("reduces staleness for an item that was recently introduced at the last session", () => {
      // Arrange — two feeds, each with two items.
      //
      // Feed 1 (hourly): items at 60h and 61h ago.
      //   interval ≈ 1h → horizon = 30h.
      //   Without lastSessionAt: rank-0 (60h) has age=60h, penalty=(30/30)²=1.0.
      //   With lastSessionAt=50h ago: effective_age = max(0, 50h-60h) = 0 → no penalty.
      //
      // Feed 2 (hourly): items at 5h and 10h ago.
      //   interval ≈ 5h → horizon = 150h.
      //   Rank-0 (5h) and rank-1 (10h): no penalty either way.
      const lastSessionAt = NOW - 50 * HOUR;
      const items = [
        makeItem(1, 1, NOW - 60 * HOUR), // feed 1 rank-0 — penalised without session
        makeItem(2, 1, NOW - 61 * HOUR), // feed 1 rank-1
        makeItem(3, 2, NOW - 5 * HOUR), // feed 2 rank-0
        makeItem(4, 2, NOW - 10 * HOUR), // feed 2 rank-1
      ];

      // Without lastSessionAt: feed 1 rank-0 (score ≈ 0.5 + 1.0 = 1.5) ties
      // with feed 2 rank-1 (score = 1.5). Tie broken by recency → feed 2 rank-1
      // (10h) appears before feed 1 rank-0 (60h).
      const resultWithout = sortStacked(items, now, rng);
      const withoutOrder = resultWithout.map((i) => i.id);
      // feed 2 rank-0 first (score 0.5), then feed 2 rank-1 (score 1.5) before
      // feed 1 rank-0 (also 1.5 but older in tie-break).
      expect(withoutOrder[0]).toBe(3); // feed 2 rank-0
      expect(withoutOrder[1]).toBe(4); // feed 2 rank-1 (beats feed 1 rank-0 in tie)
      expect(withoutOrder[2]).toBe(1); // feed 1 rank-0 (penalised without session)

      // With lastSessionAt = 50h ago: feed 1 rank-0 effective_age = 10h → no
      // penalty. Score = 0.5. Ties with feed 2 rank-0 (score 0.5); feed 2 rank-0
      // (5h) is newer → feed 2 rank-0 still first. Feed 1 rank-0 (0.5) now
      // appears before feed 2 rank-1 (score 1.5).
      const resultWith = sortStacked(items, now, rng, lastSessionAt);
      const withOrder = resultWith.map((i) => i.id);
      expect(withOrder[0]).toBe(3); // feed 2 rank-0
      expect(withOrder[1]).toBe(1); // feed 1 rank-0 now penalty-free — moved up
      expect(withOrder[2]).toBe(4); // feed 2 rank-1
    });
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
  // Fixed rng so sortStacked results are deterministic in these tests.
  const rng = () => 0.5;

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
    const result = applySortMode(items, "stacked", now, rng);

    // Assert
    expect(result).toHaveLength(2);
  });

  it("passes the custom now and rng functions through to sortStacked", () => {
    // Arrange — items 1 and 3 are each the newest from their own feed (rank 0),
    // items 2 and 4 are the second newest (rank 1). With equal rng offsets,
    // rank-0 items lead and rank-1 items follow, ordered by recency.
    const items = [
      makeItem(1, 1, NOW - 1 * HOUR),
      makeItem(2, 1, NOW - 3 * HOUR),
      makeItem(3, 2, NOW - 1 * HOUR),
      makeItem(4, 2, NOW - 4 * HOUR),
    ];

    // Act
    const result = applySortMode(items, "stacked", now, rng);

    // Assert — items 1 and 3 (both rank-0) lead; item 2 (3h, rank-1) beats
    // item 4 (4h, rank-1) on recency.
    const top2 = result
      .slice(0, 2)
      .map((i) => i.id)
      .sort((a, b) => a - b);
    expect(top2).toEqual([1, 3]);
    expect(result[2].id).toBe(2);
    expect(result[3].id).toBe(4);
  });

  it("passes lastSessionAt through to sortStacked", () => {
    // Arrange — the same setup as the session-relative test above.
    // Feed 1 rank-0 is 60h old with a 1h feed interval, so without a session
    // context it carries a staleness penalty. With lastSessionAt=50h ago its
    // effective_age drops to 10h — penalty-free.
    const HOUR = 60 * 60 * 1000;
    const items = [
      makeItem(1, 1, NOW - 60 * HOUR), // feed 1 rank-0 — penalised without session
      makeItem(2, 1, NOW - 61 * HOUR), // feed 1 rank-1
      makeItem(3, 2, NOW - 5 * HOUR), // feed 2 rank-0
      makeItem(4, 2, NOW - 10 * HOUR), // feed 2 rank-1
    ];

    // Act
    const result = applySortMode(
      items,
      "stacked",
      now,
      rng,
      NOW - 50 * HOUR // lastSessionAt
    );

    // Assert — feed 1 rank-0 (now penalty-free) appears before feed 2 rank-1.
    const id1Pos = result.findIndex((i) => i.id === 1);
    const id4Pos = result.findIndex((i) => i.id === 4);
    expect(id1Pos).toBeLessThan(id4Pos);
  });
});
