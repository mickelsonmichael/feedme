/**
 * Feed health computation utilities.
 *
 * All logic is pure (no I/O) so it can be tested cheaply and re-used in both
 * the FeedsScreen flag indicators and the FeedHealthScreen summary.
 */

import { Feed } from "./types";

// ── Thresholds ──────────────────────────────────────────────────────────────

/** A feed is considered Dead if its last successful fetch is older than this. */
export const DEAD_THRESHOLD_DAYS = 60;

/** A feed is considered Spammy if its rolling 30-day post rate exceeds this. */
export const SPAMMY_THRESHOLD_PER_DAY = 20;

/** A feed is considered Erroring if it has at least this many consecutive
 *  fetch failures. */
export const ERROR_THRESHOLD = 3;

// ── Types ───────────────────────────────────────────────────────────────────

/** Aggregated item statistics for a single feed, derived from the items table. */
export type FeedItemStats = {
  feedId: number;
  /** Total items stored for this feed. */
  totalItems: number;
  /** Items whose published_at falls within the last 30 days. */
  itemsLast30Days: number;
};

export type FeedFlag = "dead" | "spammy" | "erroring";

export type FeedWithHealth = Feed & {
  flags: FeedFlag[];
  totalItems: number;
  /** Average posts per day over the rolling 30-day window. */
  avgPostsPerDay: number;
};

// ── Computation ─────────────────────────────────────────────────────────────

export type FeedHealthOptions = {
  spammyThreshold?: number;
  errorThreshold?: number;
  deadThresholdDays?: number;
  /** Override for "now" — useful in tests. Defaults to Date.now(). */
  now?: number;
};

/**
 * Compute health flags for a single feed given its item statistics.
 *
 * @param feed - The feed metadata (last_fetched, consecutive_failures).
 * @param stats - Aggregated item counts (total + last-30-day count).
 * @param options - Optional threshold overrides.
 * @returns Array of applicable flags (may be empty).
 */
export function computeFeedFlags(
  feed: Feed,
  stats: FeedItemStats,
  options: FeedHealthOptions = {}
): FeedFlag[] {
  const flags: FeedFlag[] = [];
  const now = options.now ?? Date.now();
  const deadThresholdMs =
    (options.deadThresholdDays ?? DEAD_THRESHOLD_DAYS) * 24 * 60 * 60 * 1000;
  const spammyThreshold = options.spammyThreshold ?? SPAMMY_THRESHOLD_PER_DAY;
  const errorThreshold = options.errorThreshold ?? ERROR_THRESHOLD;

  // Dead: never fetched, or last fetch is older than the threshold.
  const lastFetched = feed.last_fetched ?? null;
  if (lastFetched === null || now - lastFetched > deadThresholdMs) {
    flags.push("dead");
  }

  // Spammy: average posts per day over the 30-day window exceeds threshold.
  const avgPostsPerDay = stats.itemsLast30Days / 30;
  if (avgPostsPerDay > spammyThreshold) {
    flags.push("spammy");
  }

  // Erroring: too many consecutive fetch failures.
  if ((feed.consecutive_failures ?? 0) >= errorThreshold) {
    flags.push("erroring");
  }

  return flags;
}

/**
 * Merge feed list with item stats into annotated FeedWithHealth objects.
 *
 * Feeds that have no items entry in `statsMap` (e.g. brand-new feeds) are
 * treated as having zero items in all buckets.
 */
export function buildFeedsWithHealth(
  feeds: Feed[],
  statsMap: Map<number, FeedItemStats>,
  options: FeedHealthOptions = {}
): FeedWithHealth[] {
  return feeds.map((feed) => {
    const stats = statsMap.get(feed.id) ?? {
      feedId: feed.id,
      totalItems: 0,
      itemsLast30Days: 0,
    };
    const flags = computeFeedFlags(feed, stats, options);
    const avgPostsPerDay = stats.itemsLast30Days / 30;
    return { ...feed, flags, totalItems: stats.totalItems, avgPostsPerDay };
  });
}
