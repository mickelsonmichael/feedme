/**
 * Pure helpers for the per-feed adaptive refresh scheduler.
 *
 * The scheduler uses two values stored on each feed row:
 *   - `fetch_interval_ms`: the "base" expected gap between updates, learned
 *     from the median spacing of recent `published_at` timestamps.
 *   - `consecutive_failures`: how many refresh attempts in a row have failed.
 *     Used to grow `next_fetch_at` exponentially on persistent errors so a
 *     dead feed does not burn its concurrency slot every pull-to-refresh.
 */

/** Default base interval when a feed has too few timestamped items to learn
 *  from. One hour matches the cadence of most news feeds and is short enough
 *  that the user gets fresh content without hammering the origin. */
export const DEFAULT_FETCH_INTERVAL_MS = 60 * 60 * 1000;
/** Lower clamp on the learned interval. Anything tighter than 15 minutes is
 *  almost certainly a parsing artefact (duplicate timestamps, second-resolution
 *  liveblog updates) rather than a real publishing cadence we want to poll at. */
export const MIN_FETCH_INTERVAL_MS = 15 * 60 * 1000;
/** Upper clamp on the learned interval and the absolute ceiling on the
 *  exponential backoff schedule. A feed will be retried at least once a day. */
export const MAX_FETCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Maximum number of recent timestamps used for the median-gap calculation.
 *  Bounded so a 2000-episode podcast back-catalog doesn't dominate the
 *  estimate with years-old gaps. */
export const PUBLISHED_AT_SAMPLE_SIZE = 20;
/** Cap on the exponent so persistent failures don't overflow before the
 *  24h ceiling clamps them. 2^6 = 64 — combined with a 1h base that's
 *  already well past the 24h cap. */
export const MAX_BACKOFF_EXPONENT = 6;

/** Response headers the freshness floor is derived from. */
export type FreshnessHeaders = {
  /** `Cache-Control` response header value, if any. */
  cacheControl?: string | null;
  /** `Expires` response header value, if any. */
  expires?: string | null;
  /** `Date` response header value. Used as the origin for `Expires` so a
   *  device with a skewed clock doesn't mis-measure the lifetime. */
  date?: string | null;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Estimate a feed's natural publishing cadence as the median gap between
 * its most recent `published_at` values. Returns the {@link DEFAULT_FETCH_INTERVAL_MS}
 * default when fewer than 3 timestamps are available, and clamps the result
 * to `[MIN_FETCH_INTERVAL_MS, MAX_FETCH_INTERVAL_MS]`.
 *
 * @param publishedAt Timestamps in arbitrary order. Null/undefined values
 *   are filtered out. Only the {@link PUBLISHED_AT_SAMPLE_SIZE} most recent
 *   are considered.
 */
export function computeBaseInterval(
  publishedAt: ReadonlyArray<number | null | undefined>
): number {
  const cleaned = publishedAt
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t))
    .sort((a, b) => b - a) // newest first
    .slice(0, PUBLISHED_AT_SAMPLE_SIZE);

  if (cleaned.length < 3) return DEFAULT_FETCH_INTERVAL_MS;

  const gaps: number[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    const gap = cleaned[i] - cleaned[i + 1];
    if (gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return DEFAULT_FETCH_INTERVAL_MS;

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];

  return clamp(median, MIN_FETCH_INTERVAL_MS, MAX_FETCH_INTERVAL_MS);
}

/**
 * Compute the wait-from-now for the next scheduled refresh of a feed that
 * just failed. Doubles the base interval per consecutive failure
 * (`interval × 2^min(failures, 6)`) and caps the total delay at
 * {@link MAX_FETCH_INTERVAL_MS}. A null `intervalMs` is treated as the
 * {@link DEFAULT_FETCH_INTERVAL_MS} default.
 *
 * @param consecutiveFailures Number of failures *including* the one that
 *   just happened. Caller should pass the post-increment value.
 */
export function computeBackoffDelay(
  intervalMs: number | null | undefined,
  consecutiveFailures: number
): number {
  const base =
    typeof intervalMs === "number" && intervalMs > 0
      ? intervalMs
      : DEFAULT_FETCH_INTERVAL_MS;
  const exponent = Math.max(
    0,
    Math.min(consecutiveFailures, MAX_BACKOFF_EXPONENT)
  );
  const delay = base * Math.pow(2, exponent);
  return Math.min(delay, MAX_FETCH_INTERVAL_MS);
}

/**
 * Computes how long a response stays fresh according to the server, in ms,
 * or null when the server said nothing usable.
 *
 * The learned interval only models how often a feed *publishes*; it says
 * nothing about how often the origin wants to be asked. A feed serving
 * `Cache-Control: max-age=3600` is telling us plainly that a request inside
 * the next hour is wasted work — for us and for them. Treating that as a
 * floor on `next_fetch_at` is the cheapest rate-limit protection available,
 * and it is what a real HTTP cache would do for free.
 *
 * Follows RFC 9111 §4.2.1 for the parts that apply to a private cache:
 * `max-age` wins over `Expires`; `no-store`/`no-cache` mean "always
 * revalidate", so they yield no floor at all; `s-maxage` is ignored, being
 * directed at shared caches. The result is clamped to
 * {@link MAX_FETCH_INTERVAL_MS} so a server cannot park a feed indefinitely.
 *
 * @param now Injectable clock, for deterministic tests.
 */
export function computeFreshnessLifetimeMs(
  headers: FreshnessHeaders,
  now: () => number = Date.now
): number | null {
  const cacheControl = headers.cacheControl?.toLowerCase() ?? "";

  if (/(^|[\s,])(no-store|no-cache)([\s,;]|$)/.test(cacheControl)) {
    return null;
  }

  const maxAge = cacheControl.match(/(?:^|[\s,])max-age\s*=\s*"?(\d+)"?/);
  if (maxAge) {
    const seconds = Number(maxAge[1]);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.min(seconds * 1000, MAX_FETCH_INTERVAL_MS);
  }

  if (headers.expires) {
    const expiresAt = new Date(headers.expires).getTime();
    if (Number.isNaN(expiresAt)) return null;
    // Measure against the server's own clock when it gave us one — the
    // device clock can be minutes off, which would otherwise turn a short
    // lifetime into a long one or vice versa.
    const origin = headers.date ? new Date(headers.date).getTime() : NaN;
    const lifetime = expiresAt - (Number.isNaN(origin) ? now() : origin);
    if (lifetime <= 0) return null;
    return Math.min(lifetime, MAX_FETCH_INTERVAL_MS);
  }

  return null;
}

/**
 * Combines the learned publishing cadence with the server's declared
 * freshness. Whichever asks us to wait longer wins: the feed is never
 * contacted sooner than the origin said it should be, and a slow-publishing
 * feed is not polled more eagerly just because the server allows it.
 */
export function computeNextFetchDelay(
  learnedIntervalMs: number,
  freshnessLifetimeMs: number | null
): number {
  if (freshnessLifetimeMs === null) return learnedIntervalMs;
  return Math.max(learnedIntervalMs, freshnessLifetimeMs);
}
