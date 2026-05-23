import { runBackgroundNotificationSync } from "./notifications";
import * as database from "./database";
import * as feedRefresher from "./feedRefresher";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

jest.mock("expo-constants", () => ({
  default: { executionEnvironment: "storeClient" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { DEFAULT: 2 },
}));

jest.mock("expo-background-fetch", () => ({
  BackgroundFetchResult: { NewData: "newData", Failed: "failed" },
  registerTaskAsync: jest.fn(),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock("./feedRefresher", () => ({ refreshFeeds: jest.fn() }));

jest.mock("./database", () => ({
  getFeeds: jest.fn(),
  getTags: jest.fn(),
  getFeedTagMap: jest.fn(),
  getUnseenItemsForFeed: jest.fn(),
  getMaxItemIdForFeed: jest.fn(),
  setFeedNotificationCheckpoint: jest.fn(),
  setFeedDailyNotificationSentAt: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockGetFeeds = database.getFeeds as jest.MockedFunction<
  typeof database.getFeeds
>;
const mockGetTags = database.getTags as jest.MockedFunction<
  typeof database.getTags
>;
const mockGetFeedTagMap = database.getFeedTagMap as jest.MockedFunction<
  typeof database.getFeedTagMap
>;
const mockGetUnseenItemsForFeed =
  database.getUnseenItemsForFeed as jest.MockedFunction<
    typeof database.getUnseenItemsForFeed
  >;
const mockGetMaxItemIdForFeed =
  database.getMaxItemIdForFeed as jest.MockedFunction<
    typeof database.getMaxItemIdForFeed
  >;
const mockSetFeedNotificationCheckpoint =
  database.setFeedNotificationCheckpoint as jest.MockedFunction<
    typeof database.setFeedNotificationCheckpoint
  >;
const mockRefreshFeeds = feedRefresher.refreshFeeds as jest.MockedFunction<
  typeof feedRefresher.refreshFeeds
>;
import * as Notifications from "expo-notifications";
const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;

import type { Feed, FeedItem, Tag } from "./types";

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 1,
    title: "Test Feed",
    url: "https://example.com/feed",
    description: null,
    last_fetched: null,
    error: null,
    notify_enabled: 1,
    notify_frequency: "immediate",
    notify_last_seen_item_id: null,
    notify_daily_last_sent_at: null,
    ...overrides,
  } as Feed;
}

function makeItem(id: number): FeedItem {
  return {
    id,
    feed_id: 1,
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    content: null,
    image_url: null,
    raw_xml: null,
    published_at: id * 1000,
    read: 0,
  } as FeedItem;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshFeeds.mockResolvedValue(0);
  mockGetTags.mockResolvedValue([] as Tag[]);
  mockGetFeedTagMap.mockResolvedValue(new Map());
  mockSetFeedNotificationCheckpoint.mockResolvedValue(undefined);
  mockGetMaxItemIdForFeed.mockResolvedValue(null);
  mockGetUnseenItemsForFeed.mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runBackgroundNotificationSync — null checkpoint", () => {
  it("silently initialises the checkpoint and sends no notifications when notify_last_seen_item_id is null", async () => {
    // Arrange — feed has never had its checkpoint set
    const feed = makeFeed({ notify_last_seen_item_id: null });
    mockGetFeeds.mockResolvedValue([feed]);
    mockGetMaxItemIdForFeed.mockResolvedValue(42);

    // Act
    await runBackgroundNotificationSync();

    // Assert — checkpoint seeded to current max, no notification fired
    expect(mockSetFeedNotificationCheckpoint).toHaveBeenCalledWith(1, 42);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("sends notifications for items newer than an existing checkpoint", async () => {
    // Arrange — checkpoint already set; one new item exists
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);
    mockGetMaxItemIdForFeed.mockResolvedValue(11);
    mockGetUnseenItemsForFeed.mockResolvedValue([makeItem(11)]);

    // Act
    await runBackgroundNotificationSync();

    // Assert — notification fired, checkpoint advanced
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSetFeedNotificationCheckpoint).toHaveBeenCalledWith(1, 11);
  });

  it("does not send notifications when no new items exist", async () => {
    // Arrange — checkpoint up to date
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);
    mockGetMaxItemIdForFeed.mockResolvedValue(10);
    mockGetUnseenItemsForFeed.mockResolvedValue([]);

    // Act
    await runBackgroundNotificationSync();

    // Assert
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockSetFeedNotificationCheckpoint).not.toHaveBeenCalled();
  });
});
