/**
 * Pure helpers for the batched item insert used by `upsertItems`.
 *
 * Every `executeAsync` is a round-trip to the native SQLite layer, and on a
 * refresh of many feeds that per-statement cost — not the SQL itself —
 * dominates the write. Inserting a feed's items one statement at a time meant
 * up to 100 round-trips per feed, all serialised behind the global write lock
 * while the feed's worker slot stayed occupied. Batching folds those into a
 * handful of multi-row statements.
 *
 * Extracted from `database.ts` so the SQL shape and the value ordering — the
 * parts a type checker cannot verify, since bind values are a flat array —
 * can be tested without a live database.
 */
import { ParsedFeedItem } from "./types";
import { isRedditCommentRawXml } from "./redditUtils";

/** Columns written per row, in bind order. */
export const ITEM_INSERT_COLUMNS = [
  "feed_id",
  "title",
  "url",
  "content",
  "image_url",
  "is_reddit_comment",
  "published_at",
] as const;

/**
 * Rows per INSERT statement. SQLite's default bind-variable limit is 999, so
 * with 7 columns per row the ceiling is 142 — 25 leaves generous headroom
 * while still cutting a 100-item feed from 100 statements down to 4.
 */
export const ITEM_INSERT_BATCH_SIZE = 25;

/** Splits `items` into consecutive batches of at most `size`. */
export function chunkForInsert<T>(
  items: readonly T[],
  size: number = ITEM_INSERT_BATCH_SIZE
): T[][] {
  if (size < 1) throw new Error("Batch size must be at least 1");
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Builds the multi-row upsert for `rowCount` items. The conflict target
 * matches the `UNIQUE (feed_id, url)` constraint, so a re-fetched item
 * updates in place rather than duplicating — note that SQLite treats NULL
 * urls as distinct, so those always insert, exactly as before batching.
 *
 * `published_at` is included in the update set: feeds do revise timestamps,
 * and the scheduler learns each feed's cadence from these values.
 */
export function buildItemInsertSql(rowCount: number): string {
  if (rowCount < 1) throw new Error("Row count must be at least 1");
  const row = `(${ITEM_INSERT_COLUMNS.map(() => "?").join(", ")})`;
  const values = Array.from({ length: rowCount }, () => row).join(", ");
  return (
    `INSERT INTO items (${ITEM_INSERT_COLUMNS.join(", ")}) VALUES ${values} ` +
    `ON CONFLICT (feed_id, url) DO UPDATE SET ` +
    `title = excluded.title, ` +
    `content = excluded.content, ` +
    `image_url = excluded.image_url, ` +
    `is_reddit_comment = excluded.is_reddit_comment, ` +
    `published_at = excluded.published_at`
  );
}

/**
 * Flattens a batch into the bind array for {@link buildItemInsertSql}, in
 * `ITEM_INSERT_COLUMNS` order.
 */
export function buildItemInsertValues(
  feedId: number,
  batch: readonly ParsedFeedItem[]
): (string | number | null)[] {
  const values: (string | number | null)[] = [];
  for (const item of batch) {
    values.push(
      feedId,
      item.title,
      item.url ?? null,
      item.content ?? null,
      item.imageUrl ?? null,
      isRedditCommentRawXml(item.rawXml) ? 1 : 0,
      item.publishedAt ?? null
    );
  }
  return values;
}
