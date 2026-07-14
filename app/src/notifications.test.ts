import {
  runBackgroundNotificationSync,
  updateBackgroundSyncSchedule,
} from "./notifications";
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

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock("expo-network", () => ({
  NetworkStateType: {
    WIFI: "WIFI",
    CELLULAR: "CELLULAR",
    ETHERNET: "ETHERNET",
    VPN: "VPN",
    UNKNOWN: "UNKNOWN",
    NONE: "NONE",
  },
  getNetworkStateAsync: jest
    .fn()
    .mockResolvedValue({ isConnected: true, type: "WIFI" }),
}));

jest.mock("./feedRefresher", () => ({ refreshFeeds: jest.fn() }));

jest.mock("./storage", () => ({
  loadConfig: jest.fn().mockReturnValue({}),
  saveConfig: jest.fn(),
}));

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
import * as Network from "expo-network";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as storage from "./storage";
const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;
const mockGetNetworkState = Network.getNetworkStateAsync as jest.MockedFunction<
  typeof Network.getNetworkStateAsync
>;
const mockLoadConfig = storage.loadConfig as jest.MockedFunction<
  typeof storage.loadConfig
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
  mockGetNetworkState.mockResolvedValue({
    isConnected: true,
    type: "WIFI" as unknown as Network.NetworkStateType,
    isInternetReachable: true,
  });
  mockLoadConfig.mockReturnValue({});
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

describe("runBackgroundNotificationSync — wifi-only", () => {
  it("calls refreshFeeds when wifi-only is disabled regardless of network type", async () => {
    // Arrange — wifi-only off, on cellular
    mockLoadConfig.mockReturnValue({ backgroundSyncWifiOnly: false });
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      type: "CELLULAR" as unknown as Network.NetworkStateType,
      isInternetReachable: true,
    });
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);

    // Act
    await runBackgroundNotificationSync();

    // Assert
    expect(mockRefreshFeeds).toHaveBeenCalledTimes(1);
  });

  it("skips refreshFeeds when wifi-only is enabled and on cellular", async () => {
    // Arrange — wifi-only on, on cellular
    mockLoadConfig.mockReturnValue({ backgroundSyncWifiOnly: true });
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      type: "CELLULAR" as unknown as Network.NetworkStateType,
      isInternetReachable: true,
    });
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);

    // Act
    await runBackgroundNotificationSync();

    // Assert — network refresh suppressed, but the rest of the pipeline runs
    expect(mockRefreshFeeds).not.toHaveBeenCalled();
  });

  it("calls refreshFeeds when wifi-only is enabled and on wifi", async () => {
    // Arrange
    mockLoadConfig.mockReturnValue({ backgroundSyncWifiOnly: true });
    mockGetNetworkState.mockResolvedValue({
      isConnected: true,
      type: "WIFI" as unknown as Network.NetworkStateType,
      isInternetReachable: true,
    });
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);

    // Act
    await runBackgroundNotificationSync();

    // Assert
    expect(mockRefreshFeeds).toHaveBeenCalledTimes(1);
  });

  it("calls refreshFeeds when wifi-only is enabled but network state lookup fails", async () => {
    // Arrange — fail-open: do not punish the user for an unknown network
    mockLoadConfig.mockReturnValue({ backgroundSyncWifiOnly: true });
    mockGetNetworkState.mockRejectedValue(new Error("boom"));
    const feed = makeFeed({ notify_last_seen_item_id: 10 });
    mockGetFeeds.mockResolvedValue([feed]);

    // Act
    await runBackgroundNotificationSync();

    // Assert
    expect(mockRefreshFeeds).toHaveBeenCalledTimes(1);
  });
});

// NOTE: these tests share the notifications module's in-memory record of the
// currently-registered interval, so they are order-sensitive by design: each
// test documents the module state it expects to inherit.
describe("updateBackgroundSyncSchedule", () => {
  const mockIsTaskRegistered =
    TaskManager.isTaskRegisteredAsync as jest.MockedFunction<
      typeof TaskManager.isTaskRegisteredAsync
    >;
  const mockRegisterTask =
    BackgroundTask.registerTaskAsync as jest.MockedFunction<
      typeof BackgroundTask.registerTaskAsync
    >;
  const mockUnregisterTask =
    BackgroundTask.unregisterTaskAsync as jest.MockedFunction<
      typeof BackgroundTask.unregisterTaskAsync
    >;
  const mockSaveConfig = storage.saveConfig as jest.MockedFunction<
    typeof storage.saveConfig
  >;

  it("leaves an already-registered task alone when the persisted interval matches", async () => {
    // Arrange — cold start: no in-memory record yet, but the task is
    // registered and the persisted interval matches the user's setting.
    mockLoadConfig.mockReturnValue({
      backgroundSyncFrequency: "30m",
      backgroundSyncRegisteredIntervalMinutes: 30,
    });
    mockIsTaskRegistered.mockResolvedValue(true);

    // Act
    await updateBackgroundSyncSchedule();

    // Assert — re-registering would reset the OS scheduler's timer, so
    // neither register nor unregister may be called.
    expect(mockRegisterTask).not.toHaveBeenCalled();
    expect(mockUnregisterTask).not.toHaveBeenCalled();
  });

  it("re-registers and persists the interval when the setting changed", async () => {
    // Arrange — user switched from 30m to 1h (in-memory record is 30 from the
    // previous test's early-return path).
    mockLoadConfig.mockReturnValue({
      backgroundSyncFrequency: "1h",
      backgroundSyncRegisteredIntervalMinutes: 30,
    });
    mockIsTaskRegistered.mockResolvedValue(true);

    // Act
    await updateBackgroundSyncSchedule();

    // Assert
    expect(mockUnregisterTask).toHaveBeenCalledTimes(1);
    expect(mockRegisterTask).toHaveBeenCalledWith(expect.any(String), {
      minimumInterval: 60,
    });
    expect(mockSaveConfig).toHaveBeenCalledWith({
      backgroundSyncRegisteredIntervalMinutes: 60,
    });
  });

  it("registers when the task is not registered yet", async () => {
    // Arrange — fresh install: nothing registered, nothing persisted.
    mockLoadConfig.mockReturnValue({ backgroundSyncFrequency: "15m" });
    mockIsTaskRegistered.mockResolvedValue(false);

    // Act
    await updateBackgroundSyncSchedule();

    // Assert
    expect(mockRegisterTask).toHaveBeenCalledWith(expect.any(String), {
      minimumInterval: 15,
    });
    expect(mockSaveConfig).toHaveBeenCalledWith({
      backgroundSyncRegisteredIntervalMinutes: 15,
    });
  });

  it("unregisters and clears the persisted interval when sync is off", async () => {
    // Arrange
    mockLoadConfig.mockReturnValue({ backgroundSyncFrequency: "off" });
    mockIsTaskRegistered.mockResolvedValue(true);

    // Act
    await updateBackgroundSyncSchedule();

    // Assert
    expect(mockUnregisterTask).toHaveBeenCalledTimes(1);
    expect(mockRegisterTask).not.toHaveBeenCalled();
    expect(mockSaveConfig).toHaveBeenCalledWith({
      backgroundSyncRegisteredIntervalMinutes: undefined,
    });
  });
});
