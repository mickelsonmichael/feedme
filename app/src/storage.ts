import { Platform } from "react-native";
import { THEME_MODES, type ThemeMode } from "./types";

const STORAGE_KEY = "feedme_config";

export type WebConfig = {
  themeMode?: ThemeMode;
};

let cachedConfig: WebConfig | null = null;

function isWebStorageAvailable(): boolean {
  return Platform.OS === "web" && typeof localStorage !== "undefined";
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
  if (!isWebStorageAvailable()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedConfig = validateConfig(JSON.parse(raw));
      return { ...cachedConfig };
    }
  } catch (e) {
    console.warn("[feedme] Failed to parse config from localStorage:", e);
  }
  return {};
}

export function saveConfig(patch: Partial<WebConfig>): void {
  if (!isWebStorageAvailable()) return;
  const updated = { ...(cachedConfig ?? loadConfig()), ...patch };
  cachedConfig = updated;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
