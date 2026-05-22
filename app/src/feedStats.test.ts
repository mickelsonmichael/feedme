import {
  computeFeedStats,
  computeFrequency,
  computePostingWindow,
  computeStability,
  selectBadge,
  _internal,
} from "./feedStats";
import { Feed } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-05-22T12:00:00Z").getTime();

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 1,
    title: "Test",
    url: "https://example.com/feed.xml",
    description: null,
    last_fetched: NOW - 5 * 60 * 1000,
    error: null,
    fetch_success_count: 0,
    fetch_failure_count: 0,
    ...overrides,
  };
}

describe("computeFrequency", () => {
  it("returns insufficient label when there are no posts", () => {
    // Arrange
    const stamps: number[] = [];
    // Act
    const result = computeFrequency(stamps, NOW);
    // Assert
    expect(result.postsPerDay).toBeNull();
    expect(result.window).toBe("insufficient");
    expect(result.label).toMatch(/no posts/);
  });

  it("uses the 90-day window when enough samples land inside it", () => {
    // Arrange: 30 posts evenly spread across the last 60 days → 0.5 / day
    const stamps = Array.from({ length: 30 }, (_, i) => NOW - i * 2 * DAY);
    // Act
    const result = computeFrequency(stamps, NOW);
    // Assert
    expect(result.window).toBe("90d");
    expect(result.postsPerDay).toBeCloseTo(30 / 90, 5);
    // 30 / 90 ≈ 0.33 per day → "2 per week" (0.33 * 7 = 2.33)
    expect(result.label).toBe("2 per week");
  });

  it("falls back to lifetime when there aren't enough recent samples", () => {
    // Arrange: 2 posts, both > 90d old → falls back to lifetime
    const stamps = [NOW - 200 * DAY, NOW - 400 * DAY];
    // Act
    const result = computeFrequency(stamps, NOW);
    // Assert
    expect(result.window).toBe("lifetime");
    expect(result.postsPerDay).toBeGreaterThan(0);
  });

  it("renders 'N per day' for high-volume feeds", () => {
    // Arrange: 200 posts over the last 90 days → ~2.2/day
    const stamps = Array.from(
      { length: 200 },
      (_, i) => NOW - (i * 90 * DAY) / 200
    );
    // Act
    const result = computeFrequency(stamps, NOW);
    // Assert
    expect(result.label).toBe("2 per day");
  });

  it("renders 'N per year' for very low-volume feeds", () => {
    // Arrange: 3 posts over the last 3 years
    const stamps = [NOW - 100 * DAY, NOW - 400 * DAY, NOW - 800 * DAY];
    // Act
    const result = computeFrequency(stamps, NOW);
    // Assert
    expect(result.label).toMatch(/per year/);
  });
});

describe("computeStability", () => {
  it("returns no-attempts label when counters are zero", () => {
    // Arrange
    const feed = makeFeed();
    // Act
    const result = computeStability(feed);
    // Assert
    expect(result.rate).toBeNull();
    expect(result.label).toMatch(/no attempts/);
  });

  it("computes the success rate with rounded percentage", () => {
    // Arrange
    const feed = makeFeed({
      fetch_success_count: 8,
      fetch_failure_count: 2,
    });
    // Act
    const result = computeStability(feed);
    // Assert
    expect(result.rate).toBe(0.8);
    expect(result.label).toBe("8 / 10 (80%)");
  });
});

describe("selectBadge", () => {
  const oneAYearStamps = [NOW - 30 * DAY];

  it("returns null when the feed has nothing notable", () => {
    // Arrange
    const feed = makeFeed({
      fetch_success_count: 10,
      fetch_failure_count: 0,
    });
    const freq = computeFrequency(oneAYearStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oneAYearStamps, NOW);
    // Assert
    expect(badge).toBeNull();
  });

  it("returns 'Invalid' when every fetch attempt has failed", () => {
    // Arrange
    const feed = makeFeed({
      fetch_success_count: 0,
      fetch_failure_count: 5,
    });
    const freq = computeFrequency(oneAYearStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oneAYearStamps, NOW);
    // Assert
    expect(badge).toBe("Invalid");
  });

  it("does NOT badge 'Invalid' below the minimum attempt threshold", () => {
    // Arrange: 1 failure shouldn't permanently mark a feed invalid
    const feed = makeFeed({
      fetch_success_count: 0,
      fetch_failure_count: 1,
    });
    const freq = computeFrequency(oneAYearStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oneAYearStamps, NOW);
    // Assert
    expect(badge).toBeNull();
  });

  it("returns 'Dead' when newest post is older than 6 months", () => {
    // Arrange
    const oldStamps = [NOW - 200 * DAY];
    const feed = makeFeed({
      fetch_success_count: 5,
      fetch_failure_count: 0,
    });
    const freq = computeFrequency(oldStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oldStamps, NOW);
    // Assert
    expect(badge).toBe("Dead");
  });

  it("returns 'Unstable' when success rate drops below 80%", () => {
    // Arrange
    const feed = makeFeed({
      fetch_success_count: 6,
      fetch_failure_count: 4,
    });
    const freq = computeFrequency(oneAYearStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oneAYearStamps, NOW);
    // Assert
    expect(badge).toBe("Unstable");
  });

  it("returns 'Spammy' when avg post rate exceeds 1 per day", () => {
    // Arrange: 200 posts over the last 90 days ≈ 2.2/day
    const spammyStamps = Array.from(
      { length: 200 },
      (_, i) => NOW - (i * 90 * DAY) / 200
    );
    const feed = makeFeed({
      fetch_success_count: 10,
      fetch_failure_count: 0,
    });
    const freq = computeFrequency(spammyStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, spammyStamps, NOW);
    // Assert
    expect(badge).toBe("Spammy");
  });

  it("prefers 'Invalid' over 'Dead' when both apply", () => {
    // Arrange: never succeeded, also no recent posts
    const oldStamps = [NOW - 400 * DAY];
    const feed = makeFeed({
      fetch_success_count: 0,
      fetch_failure_count: 10,
    });
    const freq = computeFrequency(oldStamps, NOW);
    const stab = computeStability(feed);
    // Act
    const badge = selectBadge(feed, freq, stab, oldStamps, NOW);
    // Assert
    expect(badge).toBe("Invalid");
  });
});

describe("computeFeedStats", () => {
  it("surfaces lifecycle metadata in a single roll-up", () => {
    // Arrange
    const stamps = [NOW - DAY, NOW - 3 * DAY, NOW - 7 * DAY];
    const feed = makeFeed({
      fetch_success_count: 10,
      fetch_failure_count: 1,
      last_fetched: NOW - 5 * 60 * 1000,
      error: null,
    });
    // Act
    const stats = computeFeedStats(feed, stamps, NOW);
    // Assert
    expect(stats.totalPosts).toBe(3);
    expect(stats.newestPostAgeMs).toBe(DAY);
    expect(stats.newestPostAgeLabel).toMatch(/day/);
    expect(stats.lastFetch.ok).toBe(true);
    expect(stats.stability.rate).toBeCloseTo(10 / 11, 5);
    expect(stats.badge).toBeNull();
  });

  it("propagates feed error to lastFetch.error", () => {
    // Arrange
    const feed = makeFeed({
      last_fetched: NOW - 60 * 1000,
      error: "HTTP 500",
    });
    // Act
    const stats = computeFeedStats(feed, [], NOW);
    // Assert
    expect(stats.lastFetch.ok).toBe(false);
    expect(stats.lastFetch.error).toBe("HTTP 500");
  });
});

describe("computePostingWindow", () => {
  it("returns null when there are too few samples to be meaningful", () => {
    // Arrange — fewer than 8 samples
    const stamps = [NOW, NOW - DAY, NOW - 2 * DAY];
    // Act
    const result = computePostingWindow(stamps);
    // Assert
    expect(result.label).toBeNull();
  });

  it("returns a label when a clear day-of-week peak exists", () => {
    // Arrange: 10 posts, all on Tuesdays at 10am local
    const tuesday = new Date("2026-05-19T10:00:00").getTime(); // Tue
    const stamps = Array.from({ length: 10 }, (_, i) => tuesday - i * 7 * DAY);
    // Act
    const result = computePostingWindow(stamps);
    // Assert
    expect(result.label).not.toBeNull();
    expect(result.label!.toLowerCase()).toContain("tuesday");
  });
});

it("exposes internal constants for visibility in other tests", () => {
  expect(_internal.SIX_MONTHS_MS).toBeGreaterThan(0);
});
