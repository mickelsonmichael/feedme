import { Linking, Platform } from "react-native";
import { File as ExpoFile, Paths } from "expo-file-system";

const CRASH_FILE_NAME = "feedme-crash.json";
const GITHUB_REPO_URL = "https://github.com/mickelsonmichael/feedme";

// ErrorUtils is a global object provided by React Native's JavaScript runtime.
declare const ErrorUtils: {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
};

export type CrashReport = {
  error: string;
  stack: string;
  timestamp: string;
};

function getCrashFile(): ExpoFile | null {
  try {
    return new ExpoFile(Paths.cache, CRASH_FILE_NAME);
  } catch {
    return null;
  }
}

/**
 * Installs a global JS error handler that persists a crash report to disk
 * before the app terminates. Android-only — no-op on other platforms.
 */
export function installCrashHandler(): void {
  if (Platform.OS !== "android") return;

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    if (isFatal) {
      try {
        const crashFile = getCrashFile();
        if (crashFile) {
          const report: CrashReport = {
            error: error.message ?? "Unknown error",
            // Truncate long stack traces to avoid excessively large files.
            stack: (error.stack ?? "").substring(0, 5000),
            timestamp: new Date().toISOString(),
          };
          crashFile.write(JSON.stringify(report));
        }
      } catch {
        // Best effort — never block the original crash handler.
      }
    }
    previousHandler(error, isFatal);
  });
}

/**
 * Reads the crash report written by the error handler.
 * Returns null if no crash report exists or if it cannot be read.
 */
export async function checkForCrashReport(): Promise<CrashReport | null> {
  if (Platform.OS !== "android") return null;

  try {
    const crashFile = getCrashFile();
    if (!crashFile) return null;
    const text = await crashFile.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).error === "string" &&
      typeof (parsed as Record<string, unknown>).stack === "string" &&
      typeof (parsed as Record<string, unknown>).timestamp === "string"
    ) {
      return parsed as CrashReport;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Deletes the saved crash report file from disk.
 */
export async function clearCrashReport(): Promise<void> {
  try {
    const crashFile = getCrashFile();
    if (crashFile) {
      crashFile.delete();
    }
  } catch {
    // Best effort.
  }
}

/**
 * Builds a pre-filled GitHub new-issue URL from a crash report.
 */
export function buildGitHubIssueUrl(crash: CrashReport): string {
  const shortError = crash.error.substring(0, 100);
  const title = `[Crash] ${shortError}`;
  const body =
    `## Crash Report\n\n` +
    `**Date:** ${crash.timestamp}\n\n` +
    `**Error:** ${crash.error}\n\n` +
    `## Stack Trace\n\n` +
    `\`\`\`\n${crash.stack}\n\`\`\``;

  return (
    `${GITHUB_REPO_URL}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(body)}`
  );
}

/**
 * Opens the GitHub new-issue creation page pre-filled with crash report details.
 */
export async function openCrashIssueOnGitHub(
  crash: CrashReport
): Promise<void> {
  const url = buildGitHubIssueUrl(crash);
  await Linking.openURL(url);
}
