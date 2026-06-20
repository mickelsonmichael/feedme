import { refreshFeeds, parseRetryAfterMs } from "./feedRefresher";
import { fetchFeedWithMeta, RateLimitError } from "./feedParser";
import * as database from "./database";
import { Feed, ParsedFeedItem } from "./types";

// Mock network and database calls so tests run offline and touch no real storage
jest.mock("./feedParser", () => {
  const actual = jest.requireActual(
    "./feedParser"
  ) as typeof import("./feedParser");
  return {
    fetchFeedWithMeta: jest.fn(),
    RateLimitError: actual.RateLimitError,
  };
});

jest.mock("./database", () => ({
  upsertItems: jest.fn(),
  updateFeedLastFetched: jest.fn(),
  updateFeedCacheValidators: jest.fn(),
  setFeedError: jest.fn(),
  getItemCountForFeed: jest.fn(),
  setFeedRefreshSuccess: jest.fn(),
  setFeedRefreshFailure: jest.fn(),
  getRecentPublishedAtForFeed: jest.fn(),
  recordFeedFetchOutcome: jest.fn(),
  updateFeedRateLimitInfo: jest.fn(),
}));

const mockFetchFeedWithMeta = fetchFeedWithMeta as jest.MockedFunction<
  typeof fetchFeedWithMeta
>;
const mockUpsertItems = database.upsertItems as jest.MockedFunction<
  typeof database.upsertItems
>;
const mockUpdateFeedLastFetched =
  database.updateFeedLastFetched as jest.MockedFunction<
    typeof database.updateFeedLastFetched
  >;
const mockUpdateFeedCacheValidators =
  database.updateFeedCacheValidators as jest.MockedFunction<
    typeof database.updateFeedCacheValidators
  >;
const mockSetFeedError = database.setFeedError as jest.MockedFunction<
  typeof database.setFeedError
>;
const mockGetItemCountForFeed =
  database.getItemCountForFeed as jest.MockedFunction<
    typeof database.getItemCountForFeed
  >;
const mockSetFeedRefreshSuccess =
  database.setFeedRefreshSuccess as jest.MockedFunction<
    typeof database.setFeedRefreshSuccess
  >;
const mockSetFeedRefreshFailure =
  database.setFeedRefreshFailure as jest.MockedFunction<
    typeof database.setFeedRefreshFailure
  >;
const mockGetRecentPublishedAtForFeed =
  database.getRecentPublishedAtForFeed as jest.MockedFunction<
    typeof database.getRecentPublishedAtForFeed
  >;
const mockUpdateFeedRateLimitInfo =
  database.updateFeedRateLimitInfo as jest.MockedFunction<
    typeof database.updateFeedRateLimitInfo
  >;

const makeFeed = (id: number, overrides: Partial<Feed> = {}): Feed => ({
  id,
  title: `Feed ${id}`,
  url: `https://example.com/feed${id}`,
  description: null,
  last_fetched: null,
  error: null,
  ...overrides,
});

const parsedItem: ParsedFeedItem = {
  title: "Article",
  url: "https://example.com/article",
  content: "Body text",
  publishedAt: 1_700_000_000_000,
};

beforeEach(() => {
  // resetAllMocks clears both call records AND the once-value queue so
  // unconsumed mockResolvedValueOnce / mockRejectedValueOnce values from
  // one test can't contaminate the next.
  jest.resetAllMocks();
  mockFetchFeedWithMeta.mockResolvedValue({
    items: [parsedItem],
    usedProxy: false,
    notModified: false,
    etag: null,
    lastModified: null,
    rateLimitHeaders: null,
  });
  mockUpsertItems.mockResolvedValue(undefined);
  mockUpdateFeedLastFetched.mockResolvedValue(undefined);
  mockUpdateFeedCacheValidators.mockResolvedValue(undefined);
  mockSetFeedError.mockResolvedValue(undefined);
  mockGetItemCountForFeed.mockResolvedValue(0);
  mockSetFeedRefreshSuccess.mockResolvedValue(undefined);
  mockSetFeedRefreshFailure.mockResolvedValue(undefined);
  mockGetRecentPublishedAtForFeed.mockResolvedValue([]);
  mockUpdateFeedRateLimitInfo.mockResolvedValue(undefined);
});

describe("refreshFeeds", () => {
  it("returns 0 when the feeds list is empty", async () => {
    // Arrange — no feeds

    // Act
    const errors = await refreshFeeds([]);

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeedWithMeta).not.toHaveBeenCalled();
    expect(mockUpsertItems).not.toHaveBeenCalled();
  });

  it("fetches, upserts and marks last_fetched for every feed", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2)];

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(2);
    expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
      "https://example.com/feed1",
      false,
      undefined,
      { etag: null, lastModified: null }
    );
    expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
      "https://example.com/feed2",
      false,
      undefined,
      { etag: null, lastModified: null }
    );
    expect(mockUpsertItems).toHaveBeenCalledTimes(2);
    expect(mockUpsertItems).toHaveBeenCalledWith(1, [parsedItem]);
    expect(mockUpsertItems).toHaveBeenCalledWith(2, [parsedItem]);
    expect(mockUpdateFeedLastFetched).toHaveBeenCalledTimes(2);
    expect(mockUpdateFeedLastFetched).toHaveBeenCalledWith(1);
    expect(mockUpdateFeedLastFetched).toHaveBeenCalledWith(2);
    expect(mockSetFeedError).toHaveBeenCalledTimes(2);
    expect(mockSetFeedError).toHaveBeenCalledWith(1, null);
    expect(mockSetFeedError).toHaveBeenCalledWith(2, null);
  });

  it("counts individual feed failures without throwing", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2), makeFeed(3)];
    mockFetchFeedWithMeta
      .mockResolvedValueOnce({
        items: [parsedItem],
        usedProxy: false,
        notModified: false,
        etag: null,
        lastModified: null,
      }) // feed 1 succeeds
      .mockRejectedValueOnce(new Error("Network error")) // feed 2 fails
      .mockResolvedValueOnce({
        items: [parsedItem],
        usedProxy: false,
        notModified: false,
        etag: null,
        lastModified: null,
      }); // feed 3 succeeds

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(1);
    expect(mockUpsertItems).toHaveBeenCalledTimes(2); // feeds 1 and 3
    expect(mockSetFeedError).toHaveBeenCalledWith(1, null);
    expect(mockSetFeedError).toHaveBeenCalledWith(2, "Network error");
    expect(mockSetFeedError).toHaveBeenCalledWith(3, null);
  });

  it("returns the total error count when all feeds fail", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2)];
    mockFetchFeedWithMeta.mockRejectedValue(new Error("Offline"));

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(2);
    expect(mockUpsertItems).not.toHaveBeenCalled();
    expect(mockSetFeedError).toHaveBeenCalledWith(1, "Offline");
    expect(mockSetFeedError).toHaveBeenCalledWith(2, "Offline");
  });

  it("reports progress counts while refreshing feeds", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2)];
    const onProgress = jest.fn();

    // Act
    const errors = await refreshFeeds(feeds, { onProgress });

    // Assert
    expect(errors).toBe(0);
    expect(onProgress).toHaveBeenCalledWith({
      total: 2,
      completed: 0,
      loading: 2,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });
    expect(onProgress).toHaveBeenCalledWith({
      total: 2,
      completed: 2,
      loading: 0,
      succeeded: 2,
      failed: 0,
      skipped: 0,
    });
  });

  it("keeps failed feed errors but notes cached fallback when available", async () => {
    // Arrange
    const feeds = [makeFeed(1)];
    mockFetchFeedWithMeta.mockRejectedValue(new Error("Offline"));
    mockGetItemCountForFeed.mockResolvedValue(3);

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(1);
    expect(mockSetFeedError).toHaveBeenCalledWith(
      1,
      "Offline Showing cached posts."
    );
  });

  it("completes all feeds when one upsert fails mid-concurrent-refresh", async () => {
    // Arrange — simulate the DB throwing on one upsert (like a transaction
    // conflict) while sibling feeds are still in-flight.
    const feeds = [makeFeed(1), makeFeed(2), makeFeed(3)];
    mockUpsertItems
      .mockResolvedValueOnce(undefined) // feed 1 ok
      .mockRejectedValueOnce(
        new Error("cannot rollback - no transaction is active")
      ) // feed 2 DB error
      .mockResolvedValueOnce(undefined); // feed 3 ok

    // Act
    const errors = await refreshFeeds(feeds, { concurrency: 3 });

    // Assert — only the one broken feed counts as an error; the others succeed
    expect(errors).toBe(1);
    expect(mockSetFeedError).toHaveBeenCalledWith(1, null);
    expect(mockSetFeedError).toHaveBeenCalledWith(
      2,
      "cannot rollback - no transaction is active"
    );
    expect(mockSetFeedError).toHaveBeenCalledWith(3, null);
  });

  it("truncates items to MAX_ITEMS_PER_FEED before upserting", async () => {
    // Arrange — return more items than the per-feed cap
    const lotsOfItems: (typeof parsedItem)[] = Array.from(
      { length: 200 },
      (_, i) => ({ ...parsedItem, url: `https://example.com/article${i}` })
    );
    mockFetchFeedWithMeta.mockResolvedValue({
      items: lotsOfItems,
      usedProxy: false,
      notModified: false,
      etag: null,
      lastModified: null,
    });
    const feeds = [makeFeed(1)];

    // Act
    await refreshFeeds(feeds);

    // Assert — upsertItems should receive at most 100 items
    expect(mockUpsertItems).toHaveBeenCalledTimes(1);
    const upsertedItems = mockUpsertItems.mock
      .calls[0][1] as (typeof parsedItem)[];
    expect(upsertedItems.length).toBeLessThanOrEqual(100);
    expect(upsertedItems[0]).toEqual(lotsOfItems[0]);
  });

  it("marks a feed as failed and advances progress when refresh exceeds REFRESH_ONE_TIMEOUT_MS", async () => {
    // Arrange — fetchFeed never resolves (simulates a hung network request)
    jest.useFakeTimers();
    mockFetchFeedWithMeta.mockImplementation(() => new Promise(() => {}));
    const feeds = [makeFeed(1)];
    const onProgress = jest.fn();

    // Act
    const promise = refreshFeeds(feeds, { onProgress });
    jest.advanceTimersByTime(60_001);

    // Assert
    const errors = await promise;
    expect(errors).toBe(1); // timed-out feed counted as failure
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ completed: 1, loading: 0 })
    );
    jest.useRealTimers();
  });

  it("forwards stored etag/last_modified to fetchFeedWithMeta", async () => {
    // Arrange
    const feeds = [
      makeFeed(1, {
        etag: '"abc123"',
        last_modified: "Wed, 01 Jan 2025 00:00:00 GMT",
      }),
    ];

    // Act
    await refreshFeeds(feeds);

    // Assert
    expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
      "https://example.com/feed1",
      false,
      undefined,
      {
        etag: '"abc123"',
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
      }
    );
  });

  it("persists ETag and Last-Modified after a successful 200 refresh", async () => {
    // Arrange
    mockFetchFeedWithMeta.mockResolvedValue({
      items: [parsedItem],
      usedProxy: false,
      notModified: false,
      etag: '"newtag"',
      lastModified: "Thu, 02 Jan 2025 00:00:00 GMT",
    });
    const feeds = [makeFeed(1)];

    // Act
    await refreshFeeds(feeds);

    // Assert
    expect(mockUpdateFeedCacheValidators).toHaveBeenCalledWith(
      1,
      '"newtag"',
      "Thu, 02 Jan 2025 00:00:00 GMT"
    );
  });

  it("counts a 304 Not Modified result as success without upserting items", async () => {
    // Arrange
    mockFetchFeedWithMeta.mockResolvedValue({
      items: [],
      usedProxy: false,
      notModified: true,
      etag: '"abc123"',
      lastModified: null,
    });
    const feeds = [makeFeed(1, { etag: '"abc123"', last_modified: null })];
    const onProgress = jest.fn();

    // Act
    const errors = await refreshFeeds(feeds, { onProgress });

    // Assert
    expect(errors).toBe(0);
    expect(mockUpsertItems).not.toHaveBeenCalled();
    expect(mockUpdateFeedCacheValidators).not.toHaveBeenCalled();
    expect(mockUpdateFeedLastFetched).toHaveBeenCalledWith(1);
    expect(mockSetFeedError).toHaveBeenCalledWith(1, null);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ succeeded: 1, failed: 0, completed: 1 })
    );
  });

  it("resets consecutive_failures to 0 on a successful 304 response", async () => {
    // Arrange — feed has a non-zero failure history.
    mockFetchFeedWithMeta.mockResolvedValue({
      items: [],
      usedProxy: false,
      notModified: true,
      etag: '"abc123"',
      lastModified: null,
    });
    const feeds = [
      makeFeed(1, {
        etag: '"abc123"',
        consecutive_failures: 3,
        fetch_interval_ms: 60 * 60 * 1000,
      }),
    ];

    // Act
    await refreshFeeds(feeds);

    // Assert — success path must call setFeedRefreshSuccess (which resets
    // consecutive_failures to 0) and not the failure helper.
    expect(mockSetFeedRefreshSuccess).toHaveBeenCalledTimes(1);
    expect(mockSetFeedRefreshSuccess).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      expect.any(Number)
    );
    expect(mockSetFeedRefreshFailure).not.toHaveBeenCalled();
  });

  it("skips feeds whose next_fetch_at is in the future and reports them as skipped", async () => {
    // Arrange — one feed eligible now, one scheduled an hour from now.
    const now = Date.now();
    const feeds = [
      makeFeed(1, { next_fetch_at: 0 }),
      makeFeed(2, { next_fetch_at: now + 60 * 60 * 1000 }),
    ];
    const onProgress = jest.fn();

    // Act
    const errors = await refreshFeeds(feeds, { onProgress });

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(1);
    expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
      "https://example.com/feed1",
      false,
      undefined,
      expect.any(Object)
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        total: 2,
        completed: 2,
        loading: 0,
        succeeded: 1,
        skipped: 1,
        failed: 0,
      })
    );
  });

  it("force: true refreshes every feed regardless of next_fetch_at", async () => {
    // Arrange — both feeds are scheduled far into the future.
    const now = Date.now();
    const feeds = [
      makeFeed(1, { next_fetch_at: now + 24 * 60 * 60 * 1000 }),
      makeFeed(2, { next_fetch_at: now + 24 * 60 * 60 * 1000 }),
    ];
    const onProgress = jest.fn();

    // Act
    const errors = await refreshFeeds(feeds, { onProgress, force: true });

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        total: 2,
        completed: 2,
        succeeded: 2,
        skipped: 0,
        failed: 0,
      })
    );
  });

  it("on failure increments consecutive_failures and reschedules with backoff", async () => {
    // Arrange — feed has 2 prior failures and a known interval.
    mockFetchFeedWithMeta.mockRejectedValue(new Error("boom"));
    const feeds = [
      makeFeed(1, {
        consecutive_failures: 2,
        fetch_interval_ms: 60 * 60 * 1000, // 1h
      }),
    ];

    // Act
    await refreshFeeds(feeds);

    // Assert — third failure → 1h * 2^3 = 8h backoff
    expect(mockSetFeedRefreshFailure).toHaveBeenCalledTimes(1);
    const [feedId, failures, nextFetchAt] =
      mockSetFeedRefreshFailure.mock.calls[0];
    expect(feedId).toBe(1);
    expect(failures).toBe(3);
    const delay = nextFetchAt - Date.now();
    // Allow some slack for clock drift between the call and the assertion.
    expect(delay).toBeGreaterThan(8 * 60 * 60 * 1000 - 5_000);
    expect(delay).toBeLessThanOrEqual(8 * 60 * 60 * 1000);
  });

  it("persists rate-limit headers when fetch succeeds after a 429 retry", async () => {
    // Arrange — fetchFeedWithMeta resolved successfully but encountered a 429
    // during retries (rateLimitHeaders is populated).
    const rateLimitHeaders = {
      retryAfter: "5",
      limit: "100",
      remaining: "0",
      reset: null,
      capturedAt: Date.now(),
    };
    mockFetchFeedWithMeta.mockResolvedValue({
      items: [parsedItem],
      usedProxy: false,
      notModified: false,
      etag: null,
      lastModified: null,
      rateLimitHeaders,
    });
    const feeds = [makeFeed(1)];

    // Act
    await refreshFeeds(feeds);

    // Assert — rate limit info should be persisted
    expect(mockUpdateFeedRateLimitInfo).toHaveBeenCalledTimes(1);
    expect(mockUpdateFeedRateLimitInfo).toHaveBeenCalledWith(
      1,
      JSON.stringify(rateLimitHeaders)
    );
  });

  it("persists rate-limit headers when fetch fails with RateLimitError", async () => {
    // Arrange — all retries exhausted; fetchFeedWithMeta throws RateLimitError
    const rateLimitHeaders = {
      retryAfter: "60",
      limit: "50",
      remaining: "0",
      reset: null,
      capturedAt: Date.now(),
    };
    mockFetchFeedWithMeta.mockRejectedValue(
      new RateLimitError(rateLimitHeaders)
    );
    mockGetItemCountForFeed.mockResolvedValue(0);
    const feeds = [makeFeed(1)];

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(1);
    expect(mockUpdateFeedRateLimitInfo).toHaveBeenCalledWith(
      1,
      JSON.stringify(rateLimitHeaders)
    );
  });

  it("calls onFeedFailure for each failed feed with the error", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2)];
    mockFetchFeedWithMeta
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({
        items: [parsedItem],
        usedProxy: false,
        notModified: false,
        etag: null,
        lastModified: null,
        rateLimitHeaders: null,
      });
    const failures: Array<{ id: number; message: string }> = [];

    // Act
    const errors = await refreshFeeds(feeds, {
      onFeedFailure: (feed, error) => {
        failures.push({ id: feed.id, message: error.message });
      },
    });

    // Assert
    expect(errors).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      id: 1,
      message: "Network request failed",
    });
  });

  it("does not call onFeedFailure when all feeds succeed", async () => {
    // Arrange
    const feeds = [makeFeed(1)];
    const onFeedFailure = jest.fn();

    // Act
    await refreshFeeds(feeds, { onFeedFailure });

    // Assert
    expect(onFeedFailure).not.toHaveBeenCalled();
  });

  describe("host-wide rate limiting", () => {
    it("skips feeds from the same host after a sibling receives a 429", async () => {
      // Arrange — two reddit feeds; the first returns a 429, the second should
      // be skipped rather than fired.
      const feeds = [
        makeFeed(1, { url: "https://www.reddit.com/r/programming.rss" }),
        makeFeed(2, { url: "https://www.reddit.com/r/typescript.rss" }),
      ];
      const rateLimitHeaders = {
        retryAfter: "60",
        limit: null,
        remaining: "0",
        reset: null,
        capturedAt: Date.now(),
      };
      mockFetchFeedWithMeta
        .mockRejectedValueOnce(new RateLimitError(rateLimitHeaders))
        .mockResolvedValueOnce({
          items: [parsedItem],
          usedProxy: false,
          notModified: false,
          etag: null,
          lastModified: null,
          rateLimitHeaders: null,
        });
      const onProgress = jest.fn();

      // Act — run with concurrency 1 so feed 1 finishes (and updates the host
      // map) before feed 2 is attempted.
      const errors = await refreshFeeds(feeds, {
        concurrency: 1,
        onProgress,
      });

      // Assert — only feed 1 was fetched; feed 2 was skipped due to host limit
      expect(errors).toBe(1); // feed 1 failed
      expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(1);
      expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
        "https://www.reddit.com/r/programming.rss",
        false,
        undefined,
        expect.any(Object)
      );
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ failed: 1, skipped: 1, completed: 2 })
      );
    });

    it("does not skip feeds from a different host after a 429", async () => {
      // Arrange — one reddit feed fails with 429; an unrelated feed should
      // still be fetched.
      const feeds = [
        makeFeed(1, { url: "https://www.reddit.com/r/programming.rss" }),
        makeFeed(2, { url: "https://example.com/feed.xml" }),
      ];
      const rateLimitHeaders = {
        retryAfter: "60",
        limit: null,
        remaining: "0",
        reset: null,
        capturedAt: Date.now(),
      };
      mockFetchFeedWithMeta
        .mockRejectedValueOnce(new RateLimitError(rateLimitHeaders))
        .mockResolvedValueOnce({
          items: [parsedItem],
          usedProxy: false,
          notModified: false,
          etag: null,
          lastModified: null,
          rateLimitHeaders: null,
        });

      // Act
      const errors = await refreshFeeds(feeds, { concurrency: 1 });

      // Assert — only feed 1 failed; feed 2 was fetched normally
      expect(errors).toBe(1);
      expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(2);
      expect(mockFetchFeedWithMeta).toHaveBeenCalledWith(
        "https://example.com/feed.xml",
        false,
        undefined,
        expect.any(Object)
      );
    });

    it("skips remaining same-host feeds when Retry-After is long", async () => {
      // Arrange — 429 with a 2-minute Retry-After; feeds 2 and 3 should be
      // skipped, not attempted. Use mockRejectedValueOnce so the default mock
      // (success) would kick in for any unexpected extra calls, making an
      // incorrect non-skip detectable via the skipped/failed counts.
      const now = Date.now();
      const feeds = [
        makeFeed(1, { url: "https://www.reddit.com/r/all.rss" }),
        makeFeed(2, { url: "https://www.reddit.com/r/popular.rss" }),
        makeFeed(3, { url: "https://www.reddit.com/r/news.rss" }),
      ];
      const rateLimitHeaders = {
        retryAfter: "120",
        limit: null,
        remaining: "0",
        reset: null,
        capturedAt: now,
      };
      mockFetchFeedWithMeta.mockRejectedValueOnce(
        new RateLimitError(rateLimitHeaders)
      );
      const onProgress = jest.fn();

      // Act
      const errors = await refreshFeeds(feeds, { concurrency: 1, onProgress });

      // Assert — feed 1 failed; feeds 2 and 3 were skipped (not attempted).
      // If host-rate-limiting were broken, feeds 2 and 3 would succeed
      // (via the default mock), giving skipped=0 and succeeded=2 instead.
      expect(errors).toBe(1);
      expect(mockFetchFeedWithMeta).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ failed: 1, skipped: 2, completed: 3 })
      );
    });
  });
});

describe("parseRetryAfterMs", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfterMs("60")).toBe(60_000);
    expect(parseRetryAfterMs("1")).toBe(1_000);
    expect(parseRetryAfterMs("3600")).toBe(3_600_000);
  });

  it("returns 60 000 ms fallback for null", () => {
    expect(parseRetryAfterMs(null)).toBe(60_000);
  });

  it("returns 60 000 ms fallback for empty string", () => {
    expect(parseRetryAfterMs("")).toBe(60_000);
  });

  it("returns 60 000 ms fallback for unparseable string", () => {
    expect(parseRetryAfterMs("not-a-date-or-number")).toBe(60_000);
  });

  it("parses an RFC1123 HTTP-date form", () => {
    // Pick a date clearly in the future relative to test execution.
    const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    const httpDate = futureDate.toUTCString(); // e.g. "Sat, 21 Jun 2026 00:00:00 GMT"
    const result = parseRetryAfterMs(httpDate);
    // Should be approximately 5 minutes (allow 1s of clock drift in tests)
    expect(result).toBeGreaterThan(4 * 60 * 1000);
    expect(result).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
  });

  it("returns fallback when RFC1123 date is in the past", () => {
    const pastDate = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfterMs(pastDate)).toBe(60_000);
  });
});
