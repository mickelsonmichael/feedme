import { computeFeedFlags, buildFeedsWithHealth } from "./feedHealth";
import { Feed } from "./types";

const BASE_FEED: Feed = {
  id: 1,
  title: "Test Feed",
  url: "https://example.com/feed",
  description: null,
  last_fetched: null,
  error: null,
  use_proxy: 0,
  nsfw: 0,
  show_only_in_tag: 0,
  etag: null,
  last_modified: null,
  next_fetch_at: 0,
  consecutive_failures: 0,
  fetch_interval_ms: null,
  notify_enabled: 0,
  notify_frequency: "off",
  notify_last_seen_item_id: null,
  notify_daily_last_sent_at: null,
};

const BASE_STATS = { feedId: 1, totalItems: 5, itemsLast30Days: 2 };

describe("computeFeedFlags", () => {
  const NOW = 1_700_000_000_000; // fixed timestamp for determinism

  describe("dead flag", () => {
    it("flags a feed as dead when last_fetched is null", () => {
      // Arrange
      const feed = { ...BASE_FEED, last_fetched: null };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).toContain("dead");
    });

    it("flags a feed as dead when last_fetched is more than 60 days ago", () => {
      // Arrange
      const sixtyOneDaysAgo = NOW - 61 * 24 * 60 * 60 * 1000;
      const feed = { ...BASE_FEED, last_fetched: sixtyOneDaysAgo };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).toContain("dead");
    });

    it("does not flag a feed as dead when last_fetched is recent", () => {
      // Arrange
      const oneDayAgo = NOW - 24 * 60 * 60 * 1000;
      const feed = { ...BASE_FEED, last_fetched: oneDayAgo };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).not.toContain("dead");
    });

    it("does not flag as dead when exactly 60 days ago", () => {
      // Arrange — boundary: exactly 60 days ago is NOT yet dead
      const sixtyDaysAgo = NOW - 60 * 24 * 60 * 60 * 1000;
      const feed = { ...BASE_FEED, last_fetched: sixtyDaysAgo };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).not.toContain("dead");
    });

    it("respects a custom deadThresholdDays option", () => {
      // Arrange — last fetched 10 days ago, custom threshold 7 days
      const tenDaysAgo = NOW - 10 * 24 * 60 * 60 * 1000;
      const feed = { ...BASE_FEED, last_fetched: tenDaysAgo };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, {
        now: NOW,
        deadThresholdDays: 7,
      });

      // Assert
      expect(flags).toContain("dead");
    });
  });

  describe("spammy flag", () => {
    it("flags a feed as spammy when average posts/day > 20", () => {
      // Arrange — 630 posts in 30 days = 21 posts/day
      const stats = { ...BASE_STATS, itemsLast30Days: 630 };

      // Act
      const flags = computeFeedFlags(
        { ...BASE_FEED, last_fetched: NOW },
        stats,
        { now: NOW }
      );

      // Assert
      expect(flags).toContain("spammy");
    });

    it("does not flag a feed as spammy when average posts/day <= 20", () => {
      // Arrange — exactly 600 posts in 30 days = 20 posts/day (not over)
      const stats = { ...BASE_STATS, itemsLast30Days: 600 };

      // Act
      const flags = computeFeedFlags(
        { ...BASE_FEED, last_fetched: NOW },
        stats,
        { now: NOW }
      );

      // Assert
      expect(flags).not.toContain("spammy");
    });

    it("respects a custom spammyThreshold option", () => {
      // Arrange — 5 posts in 30 days ≈ 0.16 posts/day; custom threshold 0.1
      const stats = { ...BASE_STATS, itemsLast30Days: 5 };

      // Act
      const flags = computeFeedFlags(
        { ...BASE_FEED, last_fetched: NOW },
        stats,
        { now: NOW, spammyThreshold: 0.1 }
      );

      // Assert
      expect(flags).toContain("spammy");
    });
  });

  describe("erroring flag", () => {
    it("flags a feed as erroring when consecutive_failures >= 3", () => {
      // Arrange
      const feed = { ...BASE_FEED, last_fetched: NOW, consecutive_failures: 3 };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).toContain("erroring");
    });

    it("does not flag as erroring when consecutive_failures < 3", () => {
      // Arrange
      const feed = { ...BASE_FEED, last_fetched: NOW, consecutive_failures: 2 };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, { now: NOW });

      // Assert
      expect(flags).not.toContain("erroring");
    });

    it("respects a custom errorThreshold option", () => {
      // Arrange — 1 failure, threshold set to 1
      const feed = { ...BASE_FEED, last_fetched: NOW, consecutive_failures: 1 };

      // Act
      const flags = computeFeedFlags(feed, BASE_STATS, {
        now: NOW,
        errorThreshold: 1,
      });

      // Assert
      expect(flags).toContain("erroring");
    });
  });

  it("can return multiple flags for a single feed", () => {
    // Arrange — dead (null last_fetched) + erroring
    const feed = { ...BASE_FEED, last_fetched: null, consecutive_failures: 5 };
    const stats = { ...BASE_STATS, itemsLast30Days: 900 }; // spammy too

    // Act
    const flags = computeFeedFlags(feed, stats, { now: NOW });

    // Assert
    expect(flags).toContain("dead");
    expect(flags).toContain("spammy");
    expect(flags).toContain("erroring");
  });

  it("returns an empty array for a healthy feed", () => {
    // Arrange
    const oneDayAgo = NOW - 24 * 60 * 60 * 1000;
    const feed = {
      ...BASE_FEED,
      last_fetched: oneDayAgo,
      consecutive_failures: 0,
    };
    const stats = { ...BASE_STATS, itemsLast30Days: 10 };

    // Act
    const flags = computeFeedFlags(feed, stats, { now: NOW });

    // Assert
    expect(flags).toHaveLength(0);
  });
});

describe("buildFeedsWithHealth", () => {
  const NOW = 1_700_000_000_000;

  it("annotates each feed with flags, totalItems, and avgPostsPerDay", () => {
    // Arrange
    const feed: Feed = {
      ...BASE_FEED,
      id: 1,
      last_fetched: NOW,
      consecutive_failures: 0,
    };
    const statsMap = new Map([
      [1, { feedId: 1, totalItems: 150, itemsLast30Days: 90 }],
    ]);

    // Act
    const result = buildFeedsWithHealth([feed], statsMap, { now: NOW });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].totalItems).toBe(150);
    expect(result[0].avgPostsPerDay).toBeCloseTo(3);
    expect(result[0].flags).toHaveLength(0);
  });

  it("uses zero-item defaults for feeds with no stats entry", () => {
    // Arrange — statsMap is empty, feed has no items yet
    const feed: Feed = { ...BASE_FEED, id: 2, last_fetched: NOW };

    // Act
    const result = buildFeedsWithHealth([feed], new Map(), { now: NOW });

    // Assert
    expect(result[0].totalItems).toBe(0);
    expect(result[0].avgPostsPerDay).toBe(0);
  });
});
