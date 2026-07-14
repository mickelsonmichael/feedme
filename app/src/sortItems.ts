import { FeedItemWithFeed } from "./types";

export type SortMode = "newest" | "stacked";

/**
 * Sort items in reverse chronological order (newest first).
 */
export function sortNewest(items: FeedItemWithFeed[]): FeedItemWithFeed[] {
  return [...items].sort(
    (a, b) => (b.published_at ?? 0) - (a.published_at ?? 0)
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bounds on a feed's "freshness unit" — the yardstick used to measure how
 * stale an item is *relative to its own feed's cadence*.
 *
 * - `MIN` (1 day): a feed that posts every few minutes still measures
 *   staleness in days, so its newest post doesn't decay within the day.
 * - `MAX` (90 days): a feed that posts yearly still ages out eventually;
 *   without this cap its posts would sit in the top band for years, which
 *   is how "ancient posts from dead feeds" end up pinned to the top.
 */
const FRESHNESS_UNIT_MIN_MS = 1 * DAY_MS;
const FRESHNESS_UNIT_MAX_MS = 90 * DAY_MS;

/**
 * Freshness unit for feeds whose cadence cannot be derived (fewer than 2
 * timestamped items). One week: generous enough that a just-subscribed
 * feed's only post isn't instantly buried, short enough that it doesn't
 * camp in the top band.
 */
const UNKNOWN_CADENCE_UNIT_MS = 7 * DAY_MS;

/**
 * Number of freshness units an item may age through before it starts being
 * demoted one rank band per unit. With a grace of 2, an item is demoted for
 * the first time when it is 3+ units old:
 *
 * - a feed posting many times a day (unit = 1 day floor) keeps its newest
 *   post in the top band for 3 days before it slides;
 * - a weekly feed keeps its newest post up top for ~3 weeks;
 * - a quarterly/yearly feed (unit capped at 90 days) for ~9 months.
 */
const GRACE_CYCLES = 2;

/**
 * Bounds on the raw derived posting interval. The 15-minute floor guards
 * against burst feeds (e.g. a liveblog) producing a near-zero cadence; the
 * 365-day ceiling keeps dormant archives from reporting a multi-year one.
 */
const MIN_POSTING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_POSTING_INTERVAL_MS = 365 * DAY_MS;
const DEFAULT_POSTING_INTERVAL_MS = 1 * DAY_MS;

/**
 * Derive a feed's posting cadence as the median gap between its items'
 * `published_at` timestamps. Returns the 1-day default when fewer than 2
 * usable timestamps are available, and clamps the result to
 * [15 minutes, 365 days].
 *
 * Unlike `computeBaseInterval` in feedSchedule.ts, this function does NOT
 * apply a 24-hour polling cap — we want the actual editorial cadence, not a
 * fetch-scheduling interval.
 */
export function computeFeedPostingInterval(publishedAts: number[]): number {
  if (publishedAts.length < 2) return DEFAULT_POSTING_INTERVAL_MS;

  const sorted = [...publishedAts].sort((a, b) => b - a); // newest first
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i] - sorted[i + 1];
    if (gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return DEFAULT_POSTING_INTERVAL_MS;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];

  return Math.max(
    MIN_POSTING_INTERVAL_MS,
    Math.min(MAX_POSTING_INTERVAL_MS, median)
  );
}

/**
 * Deterministic hash of (feedId, dayNumber) mapped to [0, 1).
 *
 * Used as the within-band ordering key so that the feed order inside each
 * rank band reshuffles once per calendar day — never mid-session, never on
 * refresh — and every feed gets its turn near the top over the course of a
 * week. Standard 32-bit avalanche mix (murmur3 finalizer constants).
 */
export function feedDayShuffle(feedId: number, dayNumber: number): number {
  let h = Math.imul(feedId, 0x9e3779b1) ^ Math.imul(dayNumber, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** Local-time day number for a Unix-ms timestamp (days since epoch, shifted
 *  so the shuffle rotates at local midnight rather than UTC midnight). */
function localDayNumber(t: number): number {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY_MS);
}

/**
 * Sort items using the "stacked" algorithm: a rank-major interleave across
 * feeds, so the list reads as "everyone's newest post, then everyone's
 * second-newest post, …" — no high-volume feed can bury quieter feeds.
 *
 * Score formula (lower score → higher in the list):
 *
 *     score = feed_rank + staleness_demotion + daily_shuffle
 *
 * Where:
 *
 * - `feed_rank` — the item's 0-based position within its own feed, newest
 *   first. This is the major term: rank bands are only crossed via demotion.
 *
 * - `staleness_demotion` — an integer number of bands the item slides down
 *   as it ages *relative to its feed's cadence*:
 *
 *       unit     = clamp(median inter-post gap, 1 day, 90 days)
 *                  (7 days when the cadence is unknown)
 *       demotion = max(0, floor(age / unit) - GRACE_CYCLES)
 *
 *   A quarterly blog's 2-day-old post has age ≈ 0.02 units → no demotion:
 *   old-but-newest posts from quiet feeds stay in the top band. A dead
 *   feed's 2-year-old post is dozens of units old → demoted far down the
 *   list. Because demotion is measured in whole bands, it composes cleanly
 *   with rank: one missed posting cycle ≈ one extra post ahead of you.
 *
 * - `daily_shuffle` — a deterministic per-feed value in [0, 1) keyed on the
 *   local calendar day. Within a band, feeds appear in an order that is
 *   stable for the whole day (re-renders, refreshes, and pagination never
 *   reshuffle it) but rotates overnight, so no single feed monopolises the
 *   first slot. Strictly less than 1, so it can never cross band boundaries.
 *
 * Future-dated timestamps are capped to `now` for ranking and tie-breaking,
 * so a mis-dated post can't outrank genuinely new content. Items with no
 * `published_at` sink to the very end. Ties break by recency (newer first),
 * then by id (higher first) for full determinism.
 *
 * @param items - The items to sort.
 * @param now - Optional clock function (defaults to Date.now) to allow
 *   deterministic testing. Also determines the shuffle's calendar day.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  now: () => number = Date.now
): FeedItemWithFeed[] {
  const currentTime = now();
  const dayNumber = localDayNumber(currentTime);

  // Cap future timestamps to currentTime once, up front.
  const cappedAt = new Map<number, number>();
  for (const item of items) {
    if (item.published_at != null) {
      cappedAt.set(item.id, Math.min(item.published_at, currentTime));
    }
  }

  // Step 1: group by feed and assign each item its within-feed rank
  // (0 = newest from that feed; untimestamped items last).
  const rankById = new Map<number, number>();
  const byFeed = new Map<number, FeedItemWithFeed[]>();

  for (const item of items) {
    let list = byFeed.get(item.feed_id);
    if (!list) {
      list = [];
      byFeed.set(item.feed_id, list);
    }
    list.push(item);
  }

  for (const feedItems of byFeed.values()) {
    // Tie-break identical timestamps by id descending so ranks (and thus the
    // final order) never depend on input order. Matches the SQL rank-major
    // paging order in database.ts.
    feedItems.sort(
      (a, b) =>
        (cappedAt.get(b.id) ?? -Infinity) - (cappedAt.get(a.id) ?? -Infinity) ||
        b.id - a.id
    );
    feedItems.forEach((item, i) => rankById.set(item.id, i));
  }

  // Step 2: per-feed freshness unit (cadence yardstick) and daily shuffle.
  const feedUnit = new Map<number, number>();
  const feedShuffle = new Map<number, number>();
  for (const [feedId, feedItems] of byFeed) {
    const publishedAts = feedItems
      .map((i) => cappedAt.get(i.id))
      .filter((t): t is number => t !== undefined);
    const unit =
      publishedAts.length < 2
        ? UNKNOWN_CADENCE_UNIT_MS
        : Math.max(
            FRESHNESS_UNIT_MIN_MS,
            Math.min(
              FRESHNESS_UNIT_MAX_MS,
              computeFeedPostingInterval(publishedAts)
            )
          );
    feedUnit.set(feedId, unit);
    feedShuffle.set(feedId, feedDayShuffle(feedId, dayNumber));
  }

  // Step 3: score every item.
  const scored = items.map((item) => {
    const capped = cappedAt.get(item.id);
    if (capped == null) {
      return { item, score: Infinity };
    }

    const rank = rankById.get(item.id) ?? 0;
    const unit = feedUnit.get(item.feed_id) ?? UNKNOWN_CADENCE_UNIT_MS;
    const age = Math.max(0, currentTime - capped);
    const demotion = Math.max(0, Math.floor(age / unit) - GRACE_CYCLES);
    const shuffle = feedShuffle.get(item.feed_id) ?? 0;

    return { item, score: rank + demotion + shuffle };
  });

  // Step 4: sort by score ascending; ties break by capped recency (newer
  // first), then id descending, so the order is fully deterministic.
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const recency =
      (cappedAt.get(b.item.id) ?? -Infinity) -
      (cappedAt.get(a.item.id) ?? -Infinity);
    if (recency !== 0) return recency;
    return b.item.id - a.item.id;
  });

  return scored.map((s) => s.item);
}

/**
 * Apply the given sort mode to the items array.
 *
 * @param items - The items to sort.
 * @param mode - The sort mode.
 * @param now - Optional clock function passed through to {@link sortStacked}.
 */
export function applySortMode(
  items: FeedItemWithFeed[],
  mode: SortMode,
  now?: () => number
): FeedItemWithFeed[] {
  switch (mode) {
    case "newest":
      return sortNewest(items);
    case "stacked":
      return sortStacked(items, now);
  }
}
