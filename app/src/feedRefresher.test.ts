import { refreshFeeds } from "./feedRefresher";
import { fetchFeed } from "./feedParser";
import * as database from "./database";
import { Feed, ParsedFeedItem } from "./types";

// Mock network and database calls so tests run offline and touch no real storage
jest.mock("./feedParser", () => ({
  fetchFeed: jest.fn(),
}));

jest.mock("./database", () => ({
  upsertItems: jest.fn(),
  updateFeedLastFetched: jest.fn(),
  setFeedError: jest.fn(),
  getItemCountForFeed: jest.fn(),
}));

const mockFetchFeed = fetchFeed as jest.MockedFunction<typeof fetchFeed>;
const mockUpsertItems = database.upsertItems as jest.MockedFunction<
  typeof database.upsertItems
>;
const mockUpdateFeedLastFetched =
  database.updateFeedLastFetched as jest.MockedFunction<
    typeof database.updateFeedLastFetched
  >;
const mockSetFeedError = database.setFeedError as jest.MockedFunction<
  typeof database.setFeedError
>;
const mockGetItemCountForFeed =
  database.getItemCountForFeed as jest.MockedFunction<
    typeof database.getItemCountForFeed
  >;

const makeFeed = (id: number): Feed => ({
  id,
  title: `Feed ${id}`,
  url: `https://example.com/feed${id}`,
  description: null,
  last_fetched: null,
  error: null,
});

const parsedItem: ParsedFeedItem = {
  title: "Article",
  url: "https://example.com/article",
  content: "Body text",
  publishedAt: 1_700_000_000_000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchFeed.mockResolvedValue([parsedItem]);
  mockUpsertItems.mockResolvedValue(undefined);
  mockUpdateFeedLastFetched.mockResolvedValue(undefined);
  mockSetFeedError.mockResolvedValue(undefined);
  mockGetItemCountForFeed.mockResolvedValue(0);
});

describe("refreshFeeds", () => {
  it("returns 0 when the feeds list is empty", async () => {
    // Arrange — no feeds

    // Act
    const errors = await refreshFeeds([]);

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeed).not.toHaveBeenCalled();
    expect(mockUpsertItems).not.toHaveBeenCalled();
  });

  it("fetches, upserts and marks last_fetched for every feed", async () => {
    // Arrange
    const feeds = [makeFeed(1), makeFeed(2)];

    // Act
    const errors = await refreshFeeds(feeds);

    // Assert
    expect(errors).toBe(0);
    expect(mockFetchFeed).toHaveBeenCalledTimes(2);
    expect(mockFetchFeed).toHaveBeenCalledWith(
      "https://example.com/feed1",
      false
    );
    expect(mockFetchFeed).toHaveBeenCalledWith(
      "https://example.com/feed2",
      false
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
    mockFetchFeed
      .mockResolvedValueOnce([parsedItem]) // feed 1 succeeds
      .mockRejectedValueOnce(new Error("Network error")) // feed 2 fails
      .mockResolvedValueOnce([parsedItem]); // feed 3 succeeds

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
    mockFetchFeed.mockRejectedValue(new Error("Offline"));

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
    });
    expect(onProgress).toHaveBeenCalledWith({
      total: 2,
      completed: 2,
      loading: 0,
      succeeded: 2,
      failed: 0,
    });
  });

  it("keeps failed feed errors but notes cached fallback when available", async () => {
    // Arrange
    const feeds = [makeFeed(1)];
    mockFetchFeed.mockRejectedValue(new Error("Offline"));
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
});
