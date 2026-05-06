import { Platform } from "react-native";
import { File as ExpoFile, Paths } from "expo-file-system";
import {
  FEED_LAYOUT_MODES,
  LINK_OPEN_MODES,
  THEME_MODES,
  type FeedLayoutMode,
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
