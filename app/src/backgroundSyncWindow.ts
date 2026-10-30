import type { WebConfig } from "./storage";
import {
  DEFAULT_BACKGROUND_SYNC_FREQUENCY,
  backgroundSyncFrequencyToMinutes,
} from "./types";

/**
 * Whether the scheduled background sync finished within the last sync
 * interval (the user's background-sync frequency), so the posts it fetched
 * are as fresh as the schedule promises and opening the app doesn't need to
 * start another refresh. Always false with background sync off, before the
 * first background sync, or when the stamp is in the future (clock change).
 */
export function backgroundSyncedRecently(
  config: WebConfig,
  now: number
): boolean {
  const lastAt = config.lastBackgroundSyncAt;
  if (lastAt === undefined || lastAt > now) return false;
  const intervalMinutes = backgroundSyncFrequencyToMinutes(
    config.backgroundSyncFrequency ?? DEFAULT_BACKGROUND_SYNC_FREQUENCY
  );
  if (intervalMinutes === null) return false;
  return now - lastAt < intervalMinutes * 60_000;
}
