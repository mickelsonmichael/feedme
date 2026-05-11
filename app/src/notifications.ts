import { Platform } from "react-native";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
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

const BACKGROUND_NOTIFICATION_TASK = "feedme-background-notification-sync";
const FEED_CHANNEL_ID = "feedme-feed-updates";
const TAG_CHANNEL_ID = "feedme-tag-updates";
const MAX_NOTIFICATIONS_PER_FEED = 5;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_FETCH_INTERVAL_SECONDS = 15 * 60;

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
let taskRegistered = false;

function isNativeNotificationsSupported(): boolean {
  return Platform.OS !== "web";
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (!isNativeNotificationsSupported()) {
    return false;
  }
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
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

export async function initializeNotificationSystem(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

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

  await registerBackgroundNotificationTask();
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
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch {
    // Task may already be defined if Metro reloaded this module.
  }
}

async function registerBackgroundNotificationTask(): Promise<void> {
  if (taskRegistered || !isNativeNotificationsSupported()) {
    return;
  }
  ensureTaskDefined();
  const isRegistered = await TaskManager.isTaskRegisteredAsync(
    BACKGROUND_NOTIFICATION_TASK
  );
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
  taskRegistered = true;
}

export async function runBackgroundNotificationSync(): Promise<void> {
  if (!isNativeNotificationsSupported()) {
    return;
  }

  const feeds = await getFeeds();
  if (feeds.length === 0) {
    return;
  }
  await refreshFeeds(feeds);

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

    const dailyDue =
      now - (feed.notify_daily_last_sent_at ?? 0) >= DAILY_INTERVAL_MS;
    const shouldSendNow =
      matchedTag ||
      feedFrequency === "immediate" ||
      (feedFrequency === "daily" && dailyDue);
    if (!shouldSendNow) {
      continue;
    }

    const lastSeen = feed.notify_last_seen_item_id ?? 0;
    const unseenItems = await getUnseenItemsForFeed(
      feed.id,
      lastSeen,
      MAX_NOTIFICATIONS_PER_FEED
    );
    const maxItemId = await getMaxItemIdForFeed(feed.id);
    if (unseenItems.length === 0 || maxItemId === null) {
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
