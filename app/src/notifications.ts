import { Platform } from "react-native";
import * as BackgroundTask from "expo-background-task";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Network from "expo-network";
import * as TaskManager from "expo-task-manager";
import type { EventSubscription } from "expo-modules-core";
import {
  getFeedTagMap,
  getFeeds,
  getMaxItemIdForFeed,
  getTags,
  getUnseenItemsForFeed,
  setFeedDailyNotificationSentAt,
  setFeedNotificationCheckpoint,
} from "./database";
import { refreshFeeds } from "./feedRefresher";
import { loadConfig } from "./storage";
import {
  DEFAULT_BACKGROUND_SYNC_FREQUENCY,
  backgroundSyncFrequencyToMinutes,
  type BackgroundSyncFrequency,
} from "./types";

const BACKGROUND_NOTIFICATION_TASK = "feedme-background-notification-sync";
const FEED_CHANNEL_ID = "feedme-feed-updates";
const TAG_CHANNEL_ID = "feedme-tag-updates";
const MAX_NOTIFICATIONS_PER_FEED = 5;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

type NotificationOpenPayload = {
  itemId: number;
  title: string;
  url: string | null;
  content: string | null;
  imageUrl: string | null;
  publishedAt: number | null;
  feedTitle: string;
  read: number;
  useProxy: boolean;
  nsfw: boolean;
};

let taskDefined = false;
let currentRegisteredIntervalMinutes: number | null = null;

function getBackgroundSyncFrequency(): BackgroundSyncFrequency {
  try {
    return (
      loadConfig().backgroundSyncFrequency ?? DEFAULT_BACKGROUND_SYNC_FREQUENCY
    );
  } catch {
    return DEFAULT_BACKGROUND_SYNC_FREQUENCY;
  }
}

function getBackgroundSyncWifiOnly(): boolean {
  try {
    return loadConfig().backgroundSyncWifiOnly ?? false;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the device is currently connected via Wi-Fi (or any
 * non-cellular link such as ethernet on a tablet dock). Returns `true` if the
 * network state cannot be determined — we'd rather sync than silently skip.
 */
async function isOnWifi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) {
      return false;
    }
    // `type` may be undefined on some platforms; treat unknown as wifi to
    // avoid surprising the user with missed syncs.
    const type = state.type;
    if (type === undefined || type === null) {
      return true;
    }
    return (
      type === Network.NetworkStateType.WIFI ||
      type === Network.NetworkStateType.ETHERNET ||
      type === Network.NetworkStateType.VPN
    );
  } catch {
    return true;
  }
}

function isNativeNotificationsSupported(): boolean {
  if (Platform.OS === "web") {
    return false;
  }
  // expo-notifications Android push notifications were removed from Expo Go in SDK 53.
  // Skip the entire notification system when running in Expo Go to avoid crashes.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return true;
}

/**
 * Lazily requires `expo-notifications`. Merely evaluating this module throws
 * on Android in Expo Go (SDK 53+) as a side effect of its own module-level
 * code, before any of its APIs are even called. Every call site below is
 * reached only after `isNativeNotificationsSupported()` has confirmed we're
 * not in that environment, so the module is never loaded there.
 */
function getNotifications() {
  return require("expo-notifications") as typeof import("expo-notifications");
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!isNativeNotificationsSupported()) {
    return false;
  }
  const Notifications = getNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function getNotificationPermissionGranted(): Promise<boolean> {
  if (!isNativeNotificationsSupported()) {
    return false;
  }
  const Notifications = getNotifications();
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

export async function initializeNotificationSystem(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  const Notifications = getNotifications();

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await Notifications.setNotificationChannelAsync(FEED_CHANNEL_ID, {
    name: "Feed updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
  });

  await Notifications.setNotificationChannelAsync(TAG_CHANNEL_ID, {
    name: "Tag updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
  });

  await updateBackgroundSyncSchedule();
}

function ensureTaskDefined(): void {
  if (taskDefined || !isNativeNotificationsSupported()) {
    return;
  }
  taskDefined = true;
  try {
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
      try {
        await runBackgroundNotificationSync();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch (error) {
    const message = (error as Error).message?.toLowerCase?.() ?? "";
    if (
      message.includes("already") ||
      message.includes("exists") ||
      message.includes("defined")
    ) {
      return;
    }
    console.warn(
      "[feedme] Notification background task definition failed:",
      error
    );
  }
}

async function registerBackgroundNotificationTask(
  intervalMinutes: number
): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }
  ensureTaskDefined();
  await BackgroundTask.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
    minimumInterval: intervalMinutes,
  });
  currentRegisteredIntervalMinutes = intervalMinutes;
}

async function unregisterBackgroundNotificationTask(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_NOTIFICATION_TASK
    );
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
  } catch (error) {
    console.warn(
      "[feedme] Failed to unregister background notification task:",
      error
    );
  }
  currentRegisteredIntervalMinutes = null;
}

/**
 * Reconciles the registered background-sync task with the user's current
 * frequency setting. Safe to call repeatedly — only re-registers when the
 * interval actually changes, and unregisters entirely when sync is `off`.
 * Call this on app start and whenever the user changes the frequency.
 */
export async function updateBackgroundSyncSchedule(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }
  const frequency = getBackgroundSyncFrequency();
  const intervalMinutes = backgroundSyncFrequencyToMinutes(frequency);

  if (intervalMinutes === null) {
    await unregisterBackgroundNotificationTask();
    return;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_NOTIFICATION_TASK
    );
    if (isRegistered && currentRegisteredIntervalMinutes === intervalMinutes) {
      return;
    }
    if (isRegistered) {
      try {
        await BackgroundTask.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      } catch {
        // ignore; re-register below
      }
    }
    await registerBackgroundNotificationTask(intervalMinutes);
  } catch (error) {
    console.warn("[feedme] Failed to update background sync schedule:", error);
  }
}

export async function runBackgroundNotificationSync(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  const Notifications = getNotifications();

  const feeds = await getFeeds();
  if (feeds.length === 0) {
    return;
  }

  // Honour the "sync only on Wi-Fi" setting. We still proceed to deliver
  // notifications for any items we already have locally — the wifi-only gate
  // only suppresses the network refresh, not the notification dispatch.
  if (!getBackgroundSyncWifiOnly() || (await isOnWifi())) {
    await refreshFeeds(feeds);
  }

  const tags = await getTags();
  const enabledTagIds = new Set(
    tags.filter((tag) => tag.notify_enabled === 1).map((tag) => tag.id)
  );
  const feedTagMap: Map<number, number[]> =
    enabledTagIds.size > 0
      ? await getFeedTagMap()
      : new Map<number, number[]>();

  const now = Date.now();
  for (const feed of feeds) {
    const feedFrequency = feed.notify_frequency ?? "off";
    const feedNotifyEnabled =
      feed.notify_enabled === 1 && feedFrequency !== "off";
    const tagIds: number[] = feedTagMap.get(feed.id) ?? [];
    const matchedTag = tagIds.some((tagId) => enabledTagIds.has(tagId));
    if (!feedNotifyEnabled && !matchedTag) {
      continue;
    }

    const lastDailySentAt = feed.notify_daily_last_sent_at;
    const dailyDue =
      lastDailySentAt === null ||
      lastDailySentAt === undefined ||
      now - lastDailySentAt >= DAILY_INTERVAL_MS;
    const shouldSendNow =
      matchedTag ||
      feedFrequency === "immediate" ||
      (feedFrequency === "daily" && dailyDue);
    if (!shouldSendNow) {
      continue;
    }

    const lastSeen = feed.notify_last_seen_item_id;
    const maxItemId = await getMaxItemIdForFeed(feed.id);
    if (maxItemId === null) {
      continue;
    }
    // Checkpoint not yet initialised — this can happen when a feed is added
    // to a tag after tag-level notifications were already enabled, so the
    // per-feed checkpoint was never seeded.  Silently advance the pointer
    // to the current latest item and skip this cycle to avoid flooding the
    // user with notifications for every existing post.
    if (lastSeen === null || lastSeen === undefined) {
      await setFeedNotificationCheckpoint(feed.id, maxItemId);
      continue;
    }
    const unseenItems = await getUnseenItemsForFeed(
      feed.id,
      lastSeen,
      MAX_NOTIFICATIONS_PER_FEED
    );
    if (unseenItems.length === 0) {
      continue;
    }

    const channelId =
      matchedTag && !feedNotifyEnabled ? TAG_CHANNEL_ID : FEED_CHANNEL_ID;
    for (const item of unseenItems) {
      const payload: NotificationOpenPayload = {
        itemId: item.id,
        title: item.title,
        url: item.url,
        content: item.content,
        imageUrl: item.image_url,
        publishedAt: item.published_at,
        feedTitle: feed.title,
        read: item.read,
        useProxy: feed.use_proxy === 1,
        nsfw: feed.nsfw === 1,
      };
      await Notifications.scheduleNotificationAsync({
        content: {
          title: feed.title,
          body: item.title,
          data: payload,
          sound: "default",
          ...(Platform.OS === "android" ? { channelId } : {}),
        },
        trigger: null,
      });
    }

    await setFeedNotificationCheckpoint(feed.id, maxItemId);
    if (feedFrequency === "daily" && !matchedTag) {
      await setFeedDailyNotificationSentAt(feed.id, now);
    }
  }
}

export function subscribeToNotificationOpens(
  onOpen: (payload: NotificationOpenPayload) => void
): EventSubscription | null {
  if (!isNativeNotificationsSupported()) {
    return null;
  }
  const Notifications = getNotifications();
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | NotificationOpenPayload
      | undefined;
    if (data && typeof data.itemId === "number") {
      onOpen({
        itemId: data.itemId,
        title: typeof data.title === "string" ? data.title : "",
        url: typeof data.url === "string" ? data.url : null,
        content: typeof data.content === "string" ? data.content : null,
        imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : null,
        publishedAt:
          typeof data.publishedAt === "number" ? data.publishedAt : null,
        feedTitle: typeof data.feedTitle === "string" ? data.feedTitle : "",
        read: typeof data.read === "number" ? data.read : 0,
        useProxy: data.useProxy === true,
        nsfw: data.nsfw === true,
      });
    }
  });
}
