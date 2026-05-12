import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

const CRASH_FILE =
  Platform.OS !== "web"
    ? (FileSystem.cacheDirectory ?? "") + "crash_report.json"
    : "";

const CRASH_STORAGE_KEY = "crash_report";

export type CrashReport = {
  message: string;
  stack: string;
  platform: string;
  platformVersion: string | number;
  timestamp: string;
};

function isCrashReport(value: unknown): value is CrashReport {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).message === "string" &&
    typeof (value as Record<string, unknown>).stack === "string" &&
    typeof (value as Record<string, unknown>).platform === "string" &&
    typeof (value as Record<string, unknown>).timestamp === "string"
  );
}

export async function persistCrash(
  error: unknown,
  stack?: string
): Promise<void> {
  const report: CrashReport = {
    message: error instanceof Error ? error.message : String(error),
    stack: (error instanceof Error ? error.stack ?? stack ?? "" : stack ?? "")
      .slice(0, 20000)
      .trim(),
    platform: Platform.OS,
    platformVersion: Platform.Version,
    timestamp: new Date().toISOString(),
  };
  const json = JSON.stringify(report);
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(CRASH_STORAGE_KEY, json);
    } else {
      await FileSystem.writeAsStringAsync(CRASH_FILE, json);
    }
  } catch {
    // nothing we can do if the write fails during a crash
  }
}

export function installCrashHandler(): void {
  if (Platform.OS === "web") {
    const prev = window.onerror;
    window.onerror = (message, _source, _line, _col, error) => {
      persistCrash(error ?? String(message));
      return typeof prev === "function"
        ? prev(message, _source, _line, _col, error)
        : false;
    };

    const prevUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = (event) => {
      persistCrash(event.reason);
      if (typeof prevUnhandled === "function") prevUnhandled.call(window, event);
    };
  } else {
    // ErrorUtils is a React Native global available on Android
    const prev = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      if (isFatal) {
        persistCrash(error);
      }
      prev(error, isFatal);
    });
  }
}

export async function checkForCrashReport(): Promise<CrashReport | null> {
  try {
    let json: string | null = null;
    if (Platform.OS === "web") {
      json = localStorage.getItem(CRASH_STORAGE_KEY);
    } else {
      const info = await FileSystem.getInfoAsync(CRASH_FILE);
      if (!info.exists) return null;
      json = await FileSystem.readAsStringAsync(CRASH_FILE);
    }
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    return isCrashReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearCrashReport(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(CRASH_STORAGE_KEY);
    } else {
      await FileSystem.deleteAsync(CRASH_FILE, { idempotent: true });
    }
  } catch {
    // ignore
  }
}

export function buildGitHubIssueUrl(crash: CrashReport): string {
  const title = encodeURIComponent(`[crash] ${crash.message}`.slice(0, 200));
  const body = encodeURIComponent(
    [
      `**Platform**: ${crash.platform} ${crash.platformVersion}`,
      `**Time**: ${crash.timestamp}`,
      "",
      "**Stack trace**",
      "```",
      crash.stack || "(no stack)",
      "```",
    ].join("\n")
  );
  return `https://github.com/mickelsonmichael/feedme/issues/new?title=${title}&body=${body}`;
}
