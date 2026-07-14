import { Platform } from "react-native";
import { File as ExpoFile, Paths } from "expo-file-system";
import {
  BACKGROUND_SYNC_FREQUENCIES,
  FEED_LAYOUT_MODES,
  GROUP_FEEDS_MODES,
  LINK_OPEN_MODES,
  THEME_MODES,
  type BackgroundSyncFrequency,
  type FeedLayoutMode,
  type GroupFeedsMode,
  type LinkOpenMode,
  type ThemeMode,
} from "./types";

const STORAGE_KEY = "feedme_config";

export type WebConfig = {
  themeMode?: ThemeMode;
  feedLayout?: FeedLayoutMode;
  linkOpenMode?: LinkOpenMode;
  markAsReadOnScroll?: boolean;
  hideReadByDefault?: boolean;
  defaultSort?: "newest" | "stacked";
  bionicReading?: boolean;
  groupFeeds?: GroupFeedsMode;
  backgroundSyncFrequency?: BackgroundSyncFrequency;
  backgroundSyncWifiOnly?: boolean;
  /** Interval (minutes) the OS background task was last registered with.
   *  Persisted so app launches can tell "already registered with the right
   *  interval" apart from "needs re-registering" — unregistering and
   *  re-registering periodic work on every launch resets the OS scheduler's
   *  timer and is exactly what made background sync fire inconsistently. */
  backgroundSyncRegisteredIntervalMinutes?: number;
  /** Item ids that the user has individually uncollapsed in the main feed
   *  for feeds marked "collapse repeated entries". Persists across
   *  navigation and app restarts. Capped to a bounded length so it cannot
   *  grow unboundedly as items age out. */
  uncollapsedItemIds?: number[];
};

let cachedConfig: WebConfig | null = null;

function isWebStorageAvailable(): boolean {
  return Platform.OS === "web" && typeof localStorage !== "undefined";
}

function getNativeConfigFile(): ExpoFile | null {
  if (Platform.OS === "web") return null;
  try {
    return new ExpoFile(Paths.document, "feedme_config.json");
  } catch {
    return null;
  }
}

function validateConfig(raw: unknown): WebConfig {
  const config: WebConfig = {};
  if (raw !== null && typeof raw === "object") {
    const themeMode = (raw as Record<string, unknown>).themeMode;
    if (
      typeof themeMode === "string" &&
      THEME_MODES.includes(themeMode as ThemeMode)
    ) {
      config.themeMode = themeMode as ThemeMode;
    }

    const feedLayout = (raw as Record<string, unknown>).feedLayout;
    if (
      typeof feedLayout === "string" &&
      FEED_LAYOUT_MODES.includes(feedLayout as FeedLayoutMode)
    ) {
      config.feedLayout = feedLayout as FeedLayoutMode;
    }

    const linkOpenMode = (raw as Record<string, unknown>).linkOpenMode;
    if (
      typeof linkOpenMode === "string" &&
      LINK_OPEN_MODES.includes(linkOpenMode as LinkOpenMode)
    ) {
      config.linkOpenMode = linkOpenMode as LinkOpenMode;
    }

    const markAsReadOnScroll = (raw as Record<string, unknown>)
      .markAsReadOnScroll;
    if (typeof markAsReadOnScroll === "boolean") {
      config.markAsReadOnScroll = markAsReadOnScroll;
    }

    const hideReadByDefault = (raw as Record<string, unknown>)
      .hideReadByDefault;
    if (typeof hideReadByDefault === "boolean") {
      config.hideReadByDefault = hideReadByDefault;
    }

    const defaultSort = (raw as Record<string, unknown>).defaultSort;
    if (defaultSort === "newest" || defaultSort === "stacked") {
      config.defaultSort = defaultSort;
    }

    const bionicReading = (raw as Record<string, unknown>).bionicReading;
    if (typeof bionicReading === "boolean") {
      config.bionicReading = bionicReading;
    }

    const groupFeeds = (raw as Record<string, unknown>).groupFeeds;
    if (
      typeof groupFeeds === "string" &&
      GROUP_FEEDS_MODES.includes(groupFeeds as GroupFeedsMode)
    ) {
      config.groupFeeds = groupFeeds as GroupFeedsMode;
    }

    const backgroundSyncFrequency = (raw as Record<string, unknown>)
      .backgroundSyncFrequency;
    if (
      typeof backgroundSyncFrequency === "string" &&
      BACKGROUND_SYNC_FREQUENCIES.includes(
        backgroundSyncFrequency as BackgroundSyncFrequency
      )
    ) {
      config.backgroundSyncFrequency =
        backgroundSyncFrequency as BackgroundSyncFrequency;
    }

    const backgroundSyncWifiOnly = (raw as Record<string, unknown>)
      .backgroundSyncWifiOnly;
    if (typeof backgroundSyncWifiOnly === "boolean") {
      config.backgroundSyncWifiOnly = backgroundSyncWifiOnly;
    }

    const backgroundSyncRegisteredIntervalMinutes = (
      raw as Record<string, unknown>
    ).backgroundSyncRegisteredIntervalMinutes;
    if (
      typeof backgroundSyncRegisteredIntervalMinutes === "number" &&
      Number.isFinite(backgroundSyncRegisteredIntervalMinutes)
    ) {
      config.backgroundSyncRegisteredIntervalMinutes =
        backgroundSyncRegisteredIntervalMinutes;
    }

    const uncollapsedItemIds = (raw as Record<string, unknown>)
      .uncollapsedItemIds;
    if (Array.isArray(uncollapsedItemIds)) {
      config.uncollapsedItemIds = uncollapsedItemIds.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n)
      );
    }
  }
  return config;
}

// Invalidate the in-memory cache when another tab modifies localStorage.
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cachedConfig = null;
    }
  });
}

export function loadConfig(): WebConfig {
  if (cachedConfig !== null) return { ...cachedConfig };

  if (isWebStorageAvailable()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cachedConfig = validateConfig(JSON.parse(raw));
        return { ...cachedConfig };
      }
    } catch (e) {
      console.warn("[feedme] Failed to parse config from localStorage:", e);
    }
    cachedConfig = {};
    return {};
  }

  // Native: read synchronously from the file system.
  try {
    const file = getNativeConfigFile();
    if (file && file.exists) {
      cachedConfig = validateConfig(JSON.parse(file.textSync()));
      return { ...cachedConfig };
    }
  } catch (e) {
    console.warn("[feedme] Failed to load config from file:", e);
  }
  cachedConfig = {};
  return {};
}

export function saveConfig(patch: Partial<WebConfig>): void {
  const updated = { ...(cachedConfig ?? loadConfig()), ...patch };
  cachedConfig = updated;

  if (isWebStorageAvailable()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return;
  }

  // Native: write synchronously to the file system.
  try {
    const file = getNativeConfigFile();
    if (file) {
      file.write(JSON.stringify(updated));
    }
  } catch (e) {
    console.warn("[feedme] Failed to persist config:", e);
  }
}

// Kept for backwards compatibility — no longer needed since loadConfig() is
// now fully synchronous on native. Safe to call but does nothing.
export async function initConfig(): Promise<void> {
  loadConfig();
}
