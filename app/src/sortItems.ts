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
 * Tuning for the "stacked" order. The database's page query
 * (`getItemsPage` in database.ts) implements the same algorithm in SQL, so a
 * change here must be made there too — database.stacked.test.ts checks the
 * two agree.
 *
 * A post is *recent* when it is at most `RECENT_DAYS` old, or when it is its
 * feed's newest post and at most `NEWEST_RECENT_DAYS` old (so a feed posting
 * every few weeks still gets its latest post into the main stream). Every
 * other dated post is *older*.
 */
export const STACKED_RECENT_DAYS = 14;
export const STACKED_NEWEST_RECENT_DAYS = 30;
/** Days of age that weigh the same as one more post ahead in the same feed. */
export const STACKED_DAYS_PER_RANK = 2;
/** On average one older post ("throwback") per this many slots. */
export const STACKED_THROWBACK_EVERY = 10;
/** Each throwback lands up to this many slots either side of its even
 *  spacing, so they don't arrive like clockwork. */
export const STACKED_THROWBACK_JITTER = 2.5;
/** Added to an older post's age when weighting it, so posts a few weeks old
 *  are favoured over ancient ones without crowding them out entirely. */
export const STACKED_THROWBACK_AGE_OFFSET_DAYS = 30;
/** Untimestamped posts go after every dated one. */
export const STACKED_UNDATED_BASE = 1e15;

export const HASH_MASK = 0xffffffff;
// Both < 2^28, so SQLite's products with a 32-bit value stay below 2^63.
export const HASH_ID_MULTIPLIER = 0x9e3779b;
export const HASH_MIX = 0x45d9f3b;
const HASH_DAY_MULTIPLIER = 0x7f4a7c15;

/** Local-time day number for a Unix-ms timestamp (days since epoch, shifted
 *  so the shuffle rotates at local midnight rather than UTC midnight). */
export function localDayNumber(t: number): number {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY_MS);
}

/** Per-day salt for {@link stackHash}; passed to the SQL query as-is. */
export function stackDaySalt(dayNumber: number): number {
  return (dayNumber * HASH_DAY_MULTIPLIER) % 0x100000000;
}

/**
 * Deterministic 32-bit hash of (item id, day). Written with operations SQLite
 * can reproduce exactly (it has no XOR, so the SQL spells `a ^ b` as
 * `(a | b) - (a & b)`), so the native query and this function agree bit for
 * bit. Reshuffles once per local calendar day — never mid-session, never on
 * refresh.
 */
export function stackHash(id: number, daySalt: number): number {
  let x = ((Math.imul(id, HASH_ID_MULTIPLIER) >>> 0) + daySalt) % 0x100000000;
  x = Math.imul((x >>> 16) ^ x, HASH_MIX) >>> 0;
  x = Math.imul((x >>> 16) ^ x, HASH_MIX) >>> 0;
  return ((x >>> 16) ^ x) >>> 0;
}

type Stream = "recent" | "older" | "undated";
type StackInput = Pick<FeedItemWithFeed, "id" | "feed_id" | "published_at">;

/**
 * Compute every item's position key for the "stacked" order (lower = earlier).
 *
 * The list reads as recent posts first, interleaved across feeds, with an
 * older post sprinkled in roughly every {@link STACKED_THROWBACK_EVERY} slots
 * as a throwback; once the recent posts run out the older ones follow, and
 * undated posts come last.
 *
 * - **Recent stream.** Score = the post's position among its feed's recent
 *   posts (0 = newest) + age / {@link STACKED_DAYS_PER_RANK} days + a
 *   per-post jitter in [0, 1). The position term interleaves feeds — a feed
 *   posting fifty times a day can't bury a feed that posted once this week —
 *   and the age term keeps it roughly chronological. The jitter varies which
 *   feed leads from day to day.
 * - **Older stream.** Score = u × (age + {@link STACKED_THROWBACK_AGE_OFFSET_DAYS})
 *   × (position among the feed's older posts + 1), with u a per-post value in
 *   (0, 1) that changes daily. Lower scores surface first, so a feed's
 *   most recent older posts are favoured and every feed gets a turn, but the
 *   wide random factor lets a months-old post turn up now and then.
 * - **Merge.** The i-th recent post takes key i. The j-th older post takes
 *   key (j + 1) × EVERY − 0.5, shifted by up to ± JITTER slots.
 *
 * Future-dated timestamps count as published `now`. Ties break by id, higher
 * first, so the result never depends on input order.
 */
export function computeStackKeys(
  items: readonly StackInput[],
  now: number
): Map<number, number> {
  const daySalt = stackDaySalt(localDayNumber(now));
  const byFeed = new Map<number, StackInput[]>();
  for (const item of items) {
    const list = byFeed.get(item.feed_id);
    if (list) list.push(item);
    else byFeed.set(item.feed_id, [item]);
  }
  const cappedAt = (item: StackInput) =>
    item.published_at == null ? -Infinity : Math.min(item.published_at, now);

  const scored: { id: number; stream: Stream; score: number; h: number }[] = [];
  for (const feedItems of byFeed.values()) {
    feedItems.sort((a, b) => cappedAt(b) - cappedAt(a) || b.id - a.id);
    let recentRank = 0;
    let olderRank = 0;
    feedItems.forEach((item, feedRank) => {
      const h = stackHash(item.id, daySalt);
      if (item.published_at == null) {
        scored.push({ id: item.id, stream: "undated", score: 0, h });
        return;
      }
      const ageDays = (now - cappedAt(item)) / DAY_MS;
      if (
        ageDays <= STACKED_RECENT_DAYS ||
        (feedRank === 0 && ageDays <= STACKED_NEWEST_RECENT_DAYS)
      ) {
        const jitter = (h & 2047) / 2048;
        scored.push({
          id: item.id,
          stream: "recent",
          score: recentRank + ageDays / STACKED_DAYS_PER_RANK + jitter,
          h,
        });
        recentRank++;
      } else {
        const u = (((h >>> 11) & 2047) + 0.5) / 2048;
        scored.push({
          id: item.id,
          stream: "older",
          score:
            u * (ageDays + STACKED_THROWBACK_AGE_OFFSET_DAYS) * (olderRank + 1),
          h,
        });
        olderRank++;
      }
    });
  }

  scored.sort((a, b) => a.score - b.score || b.id - a.id);
  const keys = new Map<number, number>();
  const position: Record<Stream, number> = { recent: 0, older: 0, undated: 0 };
  for (const entry of scored) {
    const pos = position[entry.stream]++;
    let key: number;
    if (entry.stream === "recent") {
      key = pos;
    } else if (entry.stream === "older") {
      const slot = (entry.h >>> 22) / 1024;
      key =
        (pos + 1) * STACKED_THROWBACK_EVERY -
        0.5 +
        (slot * 2 - 1) * STACKED_THROWBACK_JITTER;
    } else {
      key = STACKED_UNDATED_BASE + pos;
    }
    keys.set(entry.id, key);
  }
  return keys;
}

/**
 * Sort items into the "stacked" order — see {@link computeStackKeys}.
 *
 * Rows from a stacked page query already carry the database's `stack_key`,
 * computed over the whole library, so a loaded window keeps exactly the
 * order it was paged in. Items without keys (any missing) are ordered by
 * computing keys over just the given items.
 *
 * @param now - Clock used when keys have to be computed here.
 */
export function sortStacked(
  items: FeedItemWithFeed[],
  now: () => number = Date.now
): FeedItemWithFeed[] {
  const computed = items.every((item) => item.stack_key != null)
    ? null
    : computeStackKeys(items, now());
  const keyOf = (item: FeedItemWithFeed) =>
    (computed ? computed.get(item.id) : item.stack_key) ?? Infinity;
  return [...items].sort((a, b) => keyOf(a) - keyOf(b) || b.id - a.id);
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
