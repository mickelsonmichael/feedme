import { Feed } from "./types";
import type { RateLimitHeaders } from "./feedParser";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;
const SIX_MONTHS_MS = 6 * MS_PER_MONTH;

/** Window for the "adaptive" frequency calculation. We prefer the last
 *  90 days when there are enough samples in that window; otherwise we fall
 *  back to the full lifetime of the feed so brand-new or low-volume feeds
 *  still get a frequency estimate. */
const FREQUENCY_WINDOW_MS = 90 * MS_PER_DAY;
const MIN_SAMPLES_FOR_WINDOW = 3;

/** Stability thresholds. Matches the requirement spec:
 *   - 0 % success  → "Invalid"
 *   - < 80 %       → "Unstable"
 *   - otherwise     no badge
 * Below this many total attempts we don't badge at all so that a single
 * unlucky failure on a brand-new feed doesn't immediately label it. */
const MIN_ATTEMPTS_FOR_STABILITY_BADGE = 4;

export type FeedBadge =
  | "Invalid"
  | "Dead"
  | "Unstable"
  | "Spammy"
  | "FrequentlySkipped";

export type FrequencyStat = {
  /** Posts per day averaged across the selected window. `null` when there
   *  aren't enough samples to compute anything meaningful. */
  postsPerDay: number | null;
  /** Human-readable rendering like "4 per year" or "1 per day". */
  label: string;
  /** Window used to produce the figure, for the UI footnote. */
  window: "90d" | "lifetime" | "insufficient";
};

export type StabilityStat = {
  /** 0..1 success rate, or `null` when no attempts have been recorded yet. */
  rate: number | null;
  successCount: number;
  failureCount: number;
  totalCount: number;
  /** Rendering like "8 / 10 (80%)" or "no attempts yet". */
  label: string;
};

export type LastFetchStatus = {
  /** True when the most recent attempt succeeded and no error is currently
   *  stored. False when an error string is present. `null` when the feed
   *  has never been fetched. */
  ok: boolean | null;
  label: string;
  error: string | null;
};

export type PostingWindow = {
  /** Human-readable summary like "mostly Tuesday mornings" or `null` when
   *  there aren't enough samples (or distribution is too uniform to make
   *  a meaningful claim). */
  label: string | null;
};

export type FeedStats = {
  frequency: FrequencyStat;
  stability: StabilityStat;
  lastFetch: LastFetchStatus;
  totalPosts: number;
  /** Age (in ms) of the newest post, or `null` if the feed has no items. */
  newestPostAgeMs: number | null;
  newestPostAgeLabel: string | null;
  postingWindow: PostingWindow;
  /** Current consecutive failure streak, copied from the feed row for
   *  convenient access alongside the other stats. */
  consecutiveFailures: number;
  /** Human-readable label for the adaptive scheduler's next planned fetch
   *  (e.g. "in 2 hours"), or `null` when none is scheduled / the feed is
   *  already due. */
  nextFetchLabel: string | null;
  /** The single, highest-priority badge currently earned by the feed.
   *  `null` when none apply. */
  badge: FeedBadge | null;
  /** Average time (ms) the user spends on posts from this feed before
   *  pressing Next in single-layout mode. `null` when no completed sessions
   *  have been recorded yet. */
  avgReadTimeMs: number | null;
  /** Human-readable label for `avgReadTimeMs`, e.g. "3s" or "1m 20s". */
  avgReadTimeLabel: string | null;
  /** Human-readable summary of the last-recorded rate-limit response from
   *  this feed's server (e.g. "Limit: 100/hr · last hit 2 days ago").
   *  `null` when no 429 has ever been received for this feed. */
  rateLimitInfo: string | null;
};

function formatRelativeAge(ms: number): string {
  if (ms < 60 * 1000) return "just now";
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function formatReadTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatRelativeFuture(ms: number): string {
  if (ms <= 0) return "due now";
  if (ms < 60 * 1000) return "in less than a minute";
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function computeFrequency(
  publishedAts: number[],
  now: number
): FrequencyStat {
  if (publishedAts.length === 0) {
    return { postsPerDay: null, label: "no posts yet", window: "insufficient" };
  }

  const sorted = [...publishedAts].sort((a, b) => b - a);
  const windowStart = now - FREQUENCY_WINDOW_MS;
  const inWindow = sorted.filter((t) => t >= windowStart);

  let postsPerDay: number;
  let window: FrequencyStat["window"];

  if (inWindow.length >= MIN_SAMPLES_FOR_WINDOW) {
    // Divide by the actual observed span within the window, not the full
    // 90-day constant.  RSS feeds cap their item count (often 10–75 items),
    // so a high-volume feed may only have a few days of history stored even
    // though items fall within the 90-day window.  Using a fixed 90-day
    // denominator would massively underestimate the true posting rate.
    const oldestInWindow = inWindow[inWindow.length - 1];
    const spanMs = Math.max(now - oldestInWindow, MS_PER_DAY);
    postsPerDay = inWindow.length / (spanMs / MS_PER_DAY);
    window = "90d";
  } else {
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    // Span from oldest post to "now" — using `now` (not newest) gives a
    // more honest rate when a feed has gone quiet recently.
    const spanMs = Math.max(now - oldest, MS_PER_DAY);
    postsPerDay = sorted.length / (spanMs / MS_PER_DAY);
    window = "lifetime";
    // Reference `newest` so future changes to the branch are easier to
    // reason about (e.g. mixing the newest gap into the estimate).
    void newest;
  }

  return {
    postsPerDay,
    label: renderFrequencyLabel(postsPerDay),
    window,
  };
}

function renderFrequencyLabel(postsPerDay: number): string {
  if (postsPerDay <= 0) return "no posts yet";
  // Pick the largest unit where the rounded count is at least 1, so we
  // always render a "1 per X" or larger figure rather than "0 per day".
  const perYear = postsPerDay * 365;
  const perMonth = postsPerDay * 30;
  const perWeek = postsPerDay * 7;

  if (postsPerDay >= 1) {
    const n = Math.round(postsPerDay);
    return `${n} per day`;
  }
  if (perWeek >= 1) {
    const n = Math.round(perWeek);
    return `${n} per week`;
  }
  if (perMonth >= 1) {
    const n = Math.round(perMonth);
    return `${n} per month`;
  }
  const n = Math.max(1, Math.round(perYear));
  return `${n} per year`;
}

export function computeStability(feed: Feed): StabilityStat {
  const successCount = feed.fetch_success_count ?? 0;
  const failureCount = feed.fetch_failure_count ?? 0;
  const totalCount = successCount + failureCount;

  if (totalCount === 0) {
    return {
      rate: null,
      successCount,
      failureCount,
      totalCount,
      label: "no attempts yet",
    };
  }
  const rate = successCount / totalCount;
  const pct = Math.round(rate * 100);
  return {
    rate,
    successCount,
    failureCount,
    totalCount,
    label: `${successCount} / ${totalCount} (${pct}%)`,
  };
}

export function computeLastFetchStatus(feed: Feed): LastFetchStatus {
  if (feed.last_fetched == null) {
    return { ok: null, label: "never fetched", error: null };
  }
  if (feed.error) {
    return {
      ok: false,
      label: `failed ${formatRelativeAge(Date.now() - feed.last_fetched)}`,
      error: feed.error,
    };
  }
  return {
    ok: true,
    label: `ok — ${formatRelativeAge(Date.now() - feed.last_fetched)}`,
    error: null,
  };
}

export function computeNewestPostAge(
  publishedAts: number[],
  now: number
): { ms: number | null; label: string | null } {
  if (publishedAts.length === 0) return { ms: null, label: null };
  const newest = Math.max(...publishedAts);
  const ms = Math.max(0, now - newest);
  return { ms, label: formatRelativeAge(ms) };
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function computePostingWindow(publishedAts: number[]): PostingWindow {
  // Need at least 8 samples to make any defensible claim about a
  // "typical" window. Below that, the noise dominates.
  if (publishedAts.length < 8) return { label: null };

  const dayBuckets = new Array(7).fill(0) as number[];
  const hourBuckets = new Array(4).fill(0) as number[]; // 0=night, 1=morning, 2=afternoon, 3=evening
  for (const t of publishedAts) {
    const d = new Date(t);
    dayBuckets[d.getDay()] += 1;
    const h = d.getHours();
    if (h < 6) hourBuckets[0] += 1;
    else if (h < 12) hourBuckets[1] += 1;
    else if (h < 18) hourBuckets[2] += 1;
    else hourBuckets[3] += 1;
  }

  const total = publishedAts.length;
  const dayPeak = dayBuckets.indexOf(Math.max(...dayBuckets));
  const dayShare = dayBuckets[dayPeak] / total;
  const hourPeak = hourBuckets.indexOf(Math.max(...hourBuckets));
  const hourShare = hourBuckets[hourPeak] / total;

  const hourLabels = ["nights", "mornings", "afternoons", "evenings"];

  // Only call out a day if it noticeably exceeds the uniform 1/7 share.
  const dayMeaningful = dayShare >= 0.22;
  // Only call out a time-of-day if it noticeably exceeds 1/4.
  const hourMeaningful = hourShare >= 0.4;

  if (dayMeaningful && hourMeaningful) {
    return {
      label: `mostly ${DAY_NAMES[dayPeak]} ${hourLabels[hourPeak]}`,
    };
  }
  if (dayMeaningful) {
    return { label: `mostly ${DAY_NAMES[dayPeak]}s` };
  }
  if (hourMeaningful) {
    return { label: `mostly ${hourLabels[hourPeak]}` };
  }
  return { label: null };
}

export function selectBadge(
  feed: Feed,
  frequency: FrequencyStat,
  stability: StabilityStat,
  publishedAts: number[],
  now: number,
  avgReadTimeMs: number | null = null
): FeedBadge | null {
  // Priority order: Invalid > Dead > Unstable > Spammy > FrequentlySkipped.
  if (
    stability.totalCount >= MIN_ATTEMPTS_FOR_STABILITY_BADGE &&
    stability.rate === 0
  ) {
    return "Invalid";
  }

  // Dead: no posts in the last 6 months. We also require that the feed has
  // at least one stored item — feeds we've never managed to fetch are
  // covered by the "Invalid" path above, not "Dead".
  if (publishedAts.length > 0) {
    const newest = Math.max(...publishedAts);
    if (now - newest > SIX_MONTHS_MS) {
      return "Dead";
    }
  }

  if (
    stability.totalCount >= MIN_ATTEMPTS_FOR_STABILITY_BADGE &&
    stability.rate !== null &&
    stability.rate < 0.8
  ) {
    return "Unstable";
  }

  if (frequency.postsPerDay !== null && frequency.postsPerDay > 1) {
    return "Spammy";
  }

  if (avgReadTimeMs !== null && avgReadTimeMs < 5000) {
    return "FrequentlySkipped";
  }

  // Suppress unused-warning for `feed` — kept in the signature so callers
  // don't have to refactor when we add feed-driven badges (e.g. NSFW).
  void feed;
  return null;
}

export function computeFeedStats(
  feed: Feed,
  publishedAts: number[],
  now: number = Date.now(),
  avgReadTimeMs: number | null = null
): FeedStats {
  const frequency = computeFrequency(publishedAts, now);
  const stability = computeStability(feed);
  const lastFetch = computeLastFetchStatus(feed);
  const newest = computeNewestPostAge(publishedAts, now);
  const postingWindow = computePostingWindow(publishedAts);
  const badge = selectBadge(
    feed,
    frequency,
    stability,
    publishedAts,
    now,
    avgReadTimeMs
  );

  const nextFetchAt = feed.next_fetch_at ?? 0;
  const nextFetchLabel =
    nextFetchAt > now ? formatRelativeFuture(nextFetchAt - now) : null;

  return {
    frequency,
    stability,
    lastFetch,
    totalPosts: publishedAts.length,
    newestPostAgeMs: newest.ms,
    newestPostAgeLabel: newest.label,
    postingWindow,
    consecutiveFailures: feed.consecutive_failures ?? 0,
    nextFetchLabel,
    badge,
    avgReadTimeMs,
    avgReadTimeLabel:
      avgReadTimeMs !== null ? formatReadTime(avgReadTimeMs) : null,
    rateLimitInfo: parseRateLimitInfo(feed.rate_limit_info ?? null, now),
  };
}

/** Parse the JSON stored in `feed.rate_limit_info` and return a short
 *  human-readable string for display in the stats panel, or `null` when
 *  no rate-limit data is available. */
export function parseRateLimitInfo(
  raw: string | null,
  now: number = Date.now()
): string | null {
  if (!raw) return null;
  let headers: RateLimitHeaders;
  try {
    headers = JSON.parse(raw) as RateLimitHeaders;
  } catch {
    return null;
  }

  const parts: string[] = [];
  if (headers.limit) {
    parts.push(`Limit: ${headers.limit}`);
  }
  if (headers.remaining !== null && headers.remaining !== undefined) {
    parts.push(`Remaining: ${headers.remaining}`);
  }
  if (headers.retryAfter) {
    parts.push(`Retry-After: ${headers.retryAfter}s`);
  }
  if (headers.capturedAt) {
    const age = Math.max(0, now - headers.capturedAt);
    parts.push(`last hit ${formatRelativeAge(age)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Rate limited (429)";
}

// Exports for tests that want to reach in for individual unit helpers.
export const _internal = {
  MS_PER_DAY,
  MS_PER_WEEK,
  MS_PER_MONTH,
  MS_PER_YEAR,
  SIX_MONTHS_MS,
  FREQUENCY_WINDOW_MS,
  MIN_ATTEMPTS_FOR_STABILITY_BADGE,
};
