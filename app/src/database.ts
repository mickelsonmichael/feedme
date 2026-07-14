import * as SQLite from "expo-sqlite";
import {
  CustomFeed,
  CustomFeedWithMemberCount,
  Feed,
  FeedItem,
  FeedItemWithFeed,
  ItemsPageOptions,
  ParsedFeedItem,
  ReadLaterPost,
  SavedPost,
  Tag,
  TagWithFeedCount,
} from "./types";

// Serialises all write operations on the shared SQLite connection.
// Prevents concurrent writes from racing and leaving the DB in an
// inconsistent state.
let dbWriteLock: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = dbWriteLock.then(fn);
  // swallow errors on the lock chain so a failure doesn't stall future writers
  dbWriteLock = next.then(
    () => {},
    () => {}
  );
  return next;
}

// A single Promise that resolves to the fully-initialised database.
// Using a promise (rather than a plain nullable variable) prevents a race
// condition where multiple concurrent callers each see db===null, call
// openDatabaseAsync in parallel, and then run initializeSchema concurrently
// on the same connection — which causes NullPointerException in the native
// SQLite layer.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Native (iOS / Android) implementation of the database module.
//
// The web build uses `database.web.ts`, which is backed by `localStorage`
// because the wa-sqlite/OPFS backend that `expo-sqlite` relies on for the web
// is not reliably available in browsers (especially when the page is not
// Cross-Origin-Isolated, e.g. on GitHub Pages). On native we always have a
// real SQLite engine, so no fallback is needed here.
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const attempt = (async () => {
      const database = await SQLite.openDatabaseAsync("feedme.db");
      await initializeSchema(database);
      return database;
    })();
    dbPromise = attempt;
    // If initialisation fails (e.g. due to a transient native NPE on first
    // boot or after a Fast Refresh reload that races with a background task),
    // reset the promise so the next caller can retry rather than getting the
    // cached rejection forever.
    attempt.catch(() => {
      if (dbPromise === attempt) {
        dbPromise = null;
      }
    });
  }
  return dbPromise;
}

async function initializeSchema(
  database: SQLite.SQLiteDatabase
): Promise<void> {
  // Run connection-level PRAGMAs individually before any schema work.
  // journal_mode must be the very first statement on a fresh connection —
  // batching it with DDL can silently prevent it from taking effect.
  // busy_timeout makes SQLite wait and retry on SQLITE_BUSY instead of
  // immediately throwing "database is locked", which happens when expo-sqlite's
  // internal read and write connections briefly overlap.
  await database.execAsync("PRAGMA journal_mode = WAL");
  await database.execAsync("PRAGMA busy_timeout = 5000");
  await database.execAsync("PRAGMA foreign_keys = ON");

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      description TEXT,
      last_fetched INTEGER,
      error TEXT,
      use_proxy INTEGER NOT NULL DEFAULT 0,
      nsfw INTEGER NOT NULL DEFAULT 0,
      next_fetch_at INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      fetch_interval_ms INTEGER,
      fetch_success_count INTEGER NOT NULL DEFAULT 0,
      fetch_failure_count INTEGER NOT NULL DEFAULT 0,
      notify_enabled INTEGER NOT NULL DEFAULT 0,
      notify_frequency TEXT NOT NULL DEFAULT 'off' CHECK (notify_frequency IN ('immediate', 'daily', 'off')),
      notify_last_seen_item_id INTEGER,
      notify_daily_last_sent_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      image_url TEXT,
      published_at INTEGER,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      UNIQUE (feed_id, url)
    );

    CREATE TABLE IF NOT EXISTS saved_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      feed_title TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      published_at INTEGER,
      saved_at INTEGER NOT NULL,
      UNIQUE (item_id)
    );

    CREATE TABLE IF NOT EXISTS read_later_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      feed_title TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      image_url TEXT,
      published_at INTEGER,
      added_at INTEGER NOT NULL,
      UNIQUE (item_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      notify_enabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feed_tags (
      feed_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (feed_id, tag_id),
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS custom_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'list',
      nsfw INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custom_feed_members (
      custom_feed_id INTEGER NOT NULL,
      feed_id INTEGER NOT NULL,
      PRIMARY KEY (custom_feed_id, feed_id),
      FOREIGN KEY (custom_feed_id) REFERENCES custom_feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
    );
  `);

  // Migration: add error column to feeds if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE feeds ADD COLUMN error TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Migration: add image_url column to items if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE items ADD COLUMN image_url TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Migration: add raw_xml column to items if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE items ADD COLUMN raw_xml TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Migration: add use_proxy column to feeds if it doesn't exist yet
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN use_proxy INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add nsfw column to feeds if it doesn't exist yet
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add show_only_in_tag column to feeds if it doesn't exist yet
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN show_only_in_tag INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add show_only_in_custom_feed column to feeds. Feeds with
  // this flag are hidden from the main "All Feeds" view and from the FEEDS
  // list on the Feeds screen — they only surface inside custom feeds that
  // contain them. Default 0 preserves existing behaviour for old rows.
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN show_only_in_custom_feed INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add collapse_repeated column to feeds. When 1, the main
  // feed view collapses consecutive items from this feed in the Newest
  // sort down to the most recent. Default 0 preserves existing behaviour.
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN collapse_repeated INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add etag column to feeds if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE feeds ADD COLUMN etag TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Migration: add last_modified column to feeds if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE feeds ADD COLUMN last_modified TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Migration: add adaptive-refresh scheduling columns to feeds.
  // For pre-existing rows, leave next_fetch_at = 0 so the very next refresh
  // behaves exactly as it did before the upgrade — only after the first
  // post-migration successful fetch will we start enforcing per-feed cadence.
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN next_fetch_at INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN fetch_interval_ms INTEGER"
    );
  } catch {
    // Column already exists — ignore
  }
  // Migration: add cumulative fetch outcome counters. Used by the feed
  // detail stats panel to compute a stability percentage. Existing rows
  // start at 0 — the counters only reflect activity after this migration.
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN fetch_success_count INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN fetch_failure_count INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN notify_frequency TEXT NOT NULL DEFAULT 'off' CHECK (notify_frequency IN ('immediate', 'daily', 'off'))"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN notify_last_seen_item_id INTEGER"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN notify_daily_last_sent_at INTEGER"
    );
  } catch {
    // Column already exists — ignore
  }
  try {
    await database.execAsync(
      "ALTER TABLE tags ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // Column already exists — ignore
  }

  // Migration: add item_view_times table for tracking how long users view
  // each post in single-layout mode. view_end_at is NULL until the user
  // presses Next; rows with a NULL end are cleaned up on startup.
  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS item_view_times (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        feed_id INTEGER NOT NULL,
        view_start_at INTEGER NOT NULL,
        view_end_at INTEGER
      )
    `);
  } catch {
    // Table already exists — ignore
  }

  // Migration: add rate_limit_info column to feeds. Stores a JSON-encoded
  // snapshot of the rate-limit headers received on the most recent 429
  // response. NULL when the feed has never been rate-limited.
  try {
    await database.execAsync(
      "ALTER TABLE feeds ADD COLUMN rate_limit_info TEXT"
    );
  } catch {
    // Column already exists — ignore
  }

  // On every startup, discard any in-progress view sessions that were
  // interrupted by a crash or force-quit. Without this, a post left "open"
  // overnight would contribute a multi-hour view time to the average.
  try {
    await database.execAsync(
      "DELETE FROM item_view_times WHERE view_end_at IS NULL"
    );
  } catch {
    // Non-critical — silently ignore if the table doesn't exist yet.
  }

  // Indexes: ensure efficient sort/filter for the list screens.
  // These are optional for correctness — wrap in try/catch so a transient
  // failure here doesn't permanently poison dbPromise.
  try {
    await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_items_published_at ON items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_feed_id ON items(feed_id);
    CREATE INDEX IF NOT EXISTS idx_items_read ON items(read);
    CREATE INDEX IF NOT EXISTS idx_items_feed_id_read ON items(feed_id, read);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_item_id ON saved_posts(item_id);
    CREATE INDEX IF NOT EXISTS idx_read_later_posts_item_id ON read_later_posts(item_id);
    CREATE INDEX IF NOT EXISTS idx_feed_tags_tag_id ON feed_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_feed_tags_feed_id ON feed_tags(feed_id);
    CREATE INDEX IF NOT EXISTS idx_custom_feed_members_feed_id ON custom_feed_members(feed_id);
    CREATE INDEX IF NOT EXISTS idx_custom_feed_members_custom_feed_id ON custom_feed_members(custom_feed_id);
    CREATE INDEX IF NOT EXISTS idx_item_view_times_feed_id ON item_view_times(feed_id);
  `);
  } catch {
    // Indexes are non-critical — if creation fails the app still functions.
  }
}

// ── Feeds ──────────────────────────────────────────────────────────────────

export async function getFeeds(): Promise<Feed[]> {
  const database = await getDatabase();
  return database.getAllAsync<Feed>("SELECT * FROM feeds ORDER BY title ASC");
}

export async function getFeedById(feedId: number): Promise<Feed | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<Feed>(
    "SELECT * FROM feeds WHERE id = ?",
    [feedId]
  );
  return row ?? null;
}

export async function getFeedByUrl(url: string): Promise<Feed | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<Feed>(
    "SELECT * FROM feeds WHERE url = ?",
    [url]
  );
  return row ?? null;
}

export async function addFeed({
  title,
  url,
  description,
  use_proxy,
  nsfw,
  show_only_in_tag,
  show_only_in_custom_feed,
  collapse_repeated,
}: Pick<
  Feed,
  | "title"
  | "url"
  | "description"
  | "use_proxy"
  | "nsfw"
  | "show_only_in_tag"
  | "show_only_in_custom_feed"
  | "collapse_repeated"
>): Promise<number> {
  const database = await getDatabase();
  const result = await withWriteLock(() =>
    database.runAsync(
      "INSERT INTO feeds (title, url, description, use_proxy, nsfw, show_only_in_tag, show_only_in_custom_feed, collapse_repeated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        title,
        url,
        description ?? null,
        use_proxy ?? 0,
        nsfw ?? 0,
        show_only_in_tag ?? 0,
        show_only_in_custom_feed ?? 0,
        collapse_repeated ?? 0,
      ]
    )
  );
  return result.lastInsertRowId;
}

export async function deleteFeed(feedId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("DELETE FROM feeds WHERE id = ?", [feedId])
  );
}

export async function updateFeedLastFetched(feedId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE feeds SET last_fetched = ? WHERE id = ?", [
      Date.now(),
      feedId,
    ])
  );
}

export async function updateFeed(
  feedId: number,
  fields: Pick<
    Feed,
    | "title"
    | "url"
    | "use_proxy"
    | "nsfw"
    | "show_only_in_tag"
    | "show_only_in_custom_feed"
    | "collapse_repeated"
  >
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET title = ?, url = ?, use_proxy = ?, nsfw = ?, show_only_in_tag = ?, show_only_in_custom_feed = ?, collapse_repeated = ? WHERE id = ?",
      [
        fields.title,
        fields.url,
        fields.use_proxy ?? 0,
        fields.nsfw ?? 0,
        fields.show_only_in_tag ?? 0,
        fields.show_only_in_custom_feed ?? 0,
        fields.collapse_repeated ?? 0,
        feedId,
      ]
    )
  );
}

export async function setFeedError(
  feedId: number,
  error: string | null
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE feeds SET error = ? WHERE id = ?", [
      error,
      feedId,
    ])
  );
}

export async function updateFeedCacheValidators(
  feedId: number,
  etag: string | null,
  lastModified: string | null
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET etag = ?, last_modified = ? WHERE id = ?",
      [etag, lastModified, feedId]
    )
  );
}

/** Persist the most recent rate-limit headers for a feed.  Pass `null` to
 *  clear the stored info (e.g. on a clean success after a previous 429). */
export async function updateFeedRateLimitInfo(
  feedId: number,
  info: string | null
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE feeds SET rate_limit_info = ? WHERE id = ?", [
      info,
      feedId,
    ])
  );
}

/**
 * Persist the post-success state for a feed: clear the failure counter,
 * remember the learned base interval, and schedule the next eligible
 * refresh. Called from `refreshFeeds` for both 200 and 304 outcomes.
 */
export async function setFeedRefreshSuccess(
  feedId: number,
  fetchIntervalMs: number,
  nextFetchAt: number
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET fetch_interval_ms = ?, consecutive_failures = 0, next_fetch_at = ? WHERE id = ?",
      [fetchIntervalMs, nextFetchAt, feedId]
    )
  );
}

/**
 * Persist the post-failure state for a feed: bump `consecutive_failures`
 * and push out `next_fetch_at` according to the caller's already-computed
 * exponential backoff.
 */
export async function setFeedRefreshFailure(
  feedId: number,
  consecutiveFailures: number,
  nextFetchAt: number
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET consecutive_failures = ?, next_fetch_at = ? WHERE id = ?",
      [consecutiveFailures, nextFetchAt, feedId]
    )
  );
}

/**
 * Record a fetch outcome on the cumulative success/failure counters used by
 * the feed detail stats panel. Counts every attempt — refresher loop,
 * manual single-feed refresh, save-then-refetch in the edit screen.
 */
export async function recordFeedFetchOutcome(
  feedId: number,
  success: boolean
): Promise<void> {
  const database = await getDatabase();
  const column = success ? "fetch_success_count" : "fetch_failure_count";
  await withWriteLock(() =>
    database.runAsync(
      `UPDATE feeds SET ${column} = ${column} + 1 WHERE id = ?`,
      [feedId]
    )
  );
}

export async function setFeedNotificationSettings(
  feedId: number,
  settings: {
    enabled: boolean;
    frequency: "immediate" | "daily" | "off";
  }
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET notify_enabled = ?, notify_frequency = ? WHERE id = ?",
      [settings.enabled ? 1 : 0, settings.frequency, feedId]
    )
  );
}

export async function setFeedNotificationCheckpoint(
  feedId: number,
  lastSeenItemId: number | null
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET notify_last_seen_item_id = ? WHERE id = ?",
      [lastSeenItemId, feedId]
    )
  );
}

export async function setFeedDailyNotificationSentAt(
  feedId: number,
  sentAt: number | null
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET notify_daily_last_sent_at = ? WHERE id = ?",
      [sentAt, feedId]
    )
  );
}

export async function getMaxItemIdForFeed(
  feedId: number
): Promise<number | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: number }>(
    "SELECT id FROM items WHERE feed_id = ? ORDER BY id DESC LIMIT 1",
    [feedId]
  );
  return row?.id ?? null;
}

export async function getUnseenItemsForFeed(
  feedId: number,
  sinceItemIdExclusive: number,
  limit: number
): Promise<FeedItem[]> {
  const database = await getDatabase();
  return database.getAllAsync<FeedItem>(
    "SELECT * FROM items WHERE feed_id = ? AND id > ? ORDER BY id DESC LIMIT ?",
    [feedId, sinceItemIdExclusive, limit]
  );
}

export async function getFeedItemWithFeedById(
  itemId: number
): Promise<FeedItemWithFeed | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<FeedItemWithFeed>(
    `SELECT items.id, items.feed_id, items.title, items.url, items.content,
            items.image_url, items.raw_xml, items.published_at, items.read,
            feeds.title AS feed_title
     FROM items
     JOIN feeds ON feeds.id = items.feed_id
     WHERE items.id = ?`,
    [itemId]
  );
  return row ?? null;
}

/**
 * Returns the most recent `published_at` timestamps for a feed (newest
 * first), used by the scheduler to learn that feed's natural cadence.
 * Bounded by `limit` to keep the query cheap on large podcast back-catalogs.
 */
export async function getRecentPublishedAtForFeed(
  feedId: number,
  limit: number
): Promise<number[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ published_at: number | null }>(
    "SELECT published_at FROM items WHERE feed_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?",
    [feedId, limit]
  );
  return rows
    .map((r) => r.published_at)
    .filter((t): t is number => typeof t === "number");
}

export async function getItemCountForFeed(feedId: number): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM items WHERE feed_id = ?",
    [feedId]
  );
  return row?.count ?? 0;
}

/**
 * Returns every `published_at` timestamp for a feed. Used by the stats
 * panel to compute posting frequency and the typical posting window.
 * Capped by `limit` (default 500) so heavy podcast archives don't blow
 * up the query.
 */
export async function getAllPublishedAtForFeed(
  feedId: number,
  limit: number = 500
): Promise<number[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ published_at: number | null }>(
    "SELECT published_at FROM items WHERE feed_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT ?",
    [feedId, limit]
  );
  return rows
    .map((r) => r.published_at)
    .filter((t): t is number => typeof t === "number");
}

// ── Item view times ────────────────────────────────────────────────────────

/**
 * Record that the user has started viewing an item. Returns the row ID of the
 * newly-created record so the caller can later close it with `endItemViewTime`.
 */
export async function startItemViewTime(
  itemId: number,
  feedId: number
): Promise<number> {
  const database = await getDatabase();
  const result = await withWriteLock(() =>
    database.runAsync(
      "INSERT INTO item_view_times (item_id, feed_id, view_start_at) VALUES (?, ?, ?)",
      [itemId, feedId, Date.now()]
    )
  );
  return result.lastInsertRowId;
}

/** Maximum view session duration (30 minutes). Anything longer is capped. */
const MAX_VIEW_TIME_MS = 30 * 60 * 1000;

/**
 * Record that the user has finished viewing an item by pressing Next.
 * Only the specific row identified by `rowId` is updated so concurrent or
 * overlapping sessions do not interfere with each other.
 * The session is capped at MAX_VIEW_TIME_MS to exclude idle/background time.
 */
export async function endItemViewTime(rowId: number): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ view_start_at: number }>(
    "SELECT view_start_at FROM item_view_times WHERE id = ? AND view_end_at IS NULL",
    [rowId]
  );
  if (!row) return;
  const viewEndAt = Math.min(Date.now(), row.view_start_at + MAX_VIEW_TIME_MS);
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE item_view_times SET view_end_at = ? WHERE id = ? AND view_end_at IS NULL",
      [viewEndAt, rowId]
    )
  );
}

/**
 * Returns the average view duration (in ms) for all completed view sessions
 * belonging to a feed, or `null` when no completed sessions exist yet.
 */
export async function getAverageViewTimeForFeed(
  feedId: number
): Promise<number | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ avg_ms: number | null }>(
    "SELECT AVG(view_end_at - view_start_at) AS avg_ms FROM item_view_times WHERE feed_id = ? AND view_end_at IS NOT NULL",
    [feedId]
  );
  return row?.avg_ms ?? null;
}

// ── Items ──────────────────────────────────────────────────────────────────

export async function getAllItems(): Promise<FeedItemWithFeed[]> {
  const database = await getDatabase();
  // Skip raw_xml in the global list view: it can be tens of KB per row and is
  // only needed by the per-feed raw XML modal, which loads it on demand.
  const rows = await database.getAllAsync<Omit<FeedItemWithFeed, "raw_xml">>(
    `SELECT items.id, items.feed_id, items.title, items.url, items.content,
            items.image_url, items.published_at, items.read,
            feeds.title AS feed_title
     FROM items
     JOIN feeds ON items.feed_id = feeds.id
     ORDER BY items.published_at DESC`
  );
  return rows.map((row) => ({ ...row, raw_xml: null }));
}

export async function getItemsForFeed(feedId: number): Promise<FeedItem[]> {
  const database = await getDatabase();
  return database.getAllAsync<FeedItem>(
    "SELECT * FROM items WHERE feed_id = ? ORDER BY published_at DESC",
    [feedId]
  );
}

export async function getItemsPage(
  options: ItemsPageOptions
): Promise<FeedItemWithFeed[]> {
  const { feedIds, excludeFeedIds, offset, limit, order = "newest" } = options;

  // Empty feedIds means the scope contains zero feeds (e.g. a tag with no
  // tagged feeds, or a custom feed with no members) -> no items, no query.
  if (feedIds != null && feedIds.length === 0) {
    return [];
  }

  const database = await getDatabase();
  const conditions: string[] = [];
  const params: number[] = [];

  if (feedIds != null && feedIds.length > 0) {
    conditions.push(`items.feed_id IN (${feedIds.map(() => "?").join(", ")})`);
    params.push(...feedIds);
  }
  if (excludeFeedIds != null && excludeFeedIds.length > 0) {
    conditions.push(
      `items.feed_id NOT IN (${excludeFeedIds.map(() => "?").join(", ")})`
    );
    params.push(...excludeFeedIds);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // "stacked" pages rank-major: all rank-0 items (each feed's newest), then
  // all rank-1 items, etc. — so page 1 contains every feed's newest content
  // regardless of how prolific other feeds are. The client-side stacked sort
  // then reorders the loaded window (staleness demotion, daily shuffle); those
  // adjustments only ever push items later, so rank-major paging never leaves
  // an item unloaded that should have displayed earlier.
  // Note: SQLite sorts NULLs last under DESC, matching the client sort.
  const rows = await database.getAllAsync<Omit<FeedItemWithFeed, "raw_xml">>(
    order === "stacked"
      ? `SELECT id, feed_id, title, url, content, image_url, published_at,
                read, feed_title
         FROM (
           SELECT items.id, items.feed_id, items.title, items.url,
                  items.content, items.image_url, items.published_at,
                  items.read, feeds.title AS feed_title,
                  ROW_NUMBER() OVER (
                    PARTITION BY items.feed_id
                    ORDER BY items.published_at DESC, items.id DESC
                  ) AS feed_rank
           FROM items
           JOIN feeds ON items.feed_id = feeds.id
           ${whereClause}
         )
         ORDER BY feed_rank ASC, published_at DESC, id DESC
         LIMIT ? OFFSET ?`
      : `SELECT items.id, items.feed_id, items.title, items.url, items.content,
                items.image_url, items.published_at, items.read,
                feeds.title AS feed_title
         FROM items
         JOIN feeds ON items.feed_id = feeds.id
         ${whereClause}
         ORDER BY items.published_at DESC, items.id DESC
         LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows.map((row) => ({ ...row, raw_xml: null }));
}

export async function upsertItems(
  feedId: number,
  items: ParsedFeedItem[]
): Promise<void> {
  if (items.length === 0) return;
  const database = await getDatabase();
  let statement: SQLite.SQLiteStatement;
  try {
    statement = await database.prepareAsync(
      `INSERT INTO items (feed_id, title, url, content, image_url, raw_xml, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (feed_id, url) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       image_url = excluded.image_url,
       raw_xml = excluded.raw_xml,
       published_at = excluded.published_at`
    );
  } catch (err) {
    // If preparing the statement fails (e.g. a transient native NPE from
    // expo-sqlite after Fast Refresh or a stale handle), drop the cached
    // connection so the next caller re-opens the DB cleanly.
    if (dbPromise) dbPromise = null;
    throw err;
  }
  try {
    await withWriteLock(() =>
      database.withTransactionAsync(async () => {
        for (const item of items) {
          await statement.executeAsync([
            feedId,
            item.title,
            item.url ?? null,
            item.content ?? null,
            item.imageUrl ?? null,
            item.rawXml ?? null,
            item.publishedAt ?? null,
          ]);
        }
      })
    );
  } finally {
    try {
      await statement.finalizeAsync();
    } catch {
      // Finalising a statement on a broken connection can itself throw —
      // swallow so we don't mask the original error.
    }
  }
}

export async function getItemRawXml(itemId: number): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ raw_xml: string | null }>(
    "SELECT raw_xml FROM items WHERE id = ?",
    [itemId]
  );
  return row?.raw_xml ?? null;
}

export async function markItemRead(itemId: number): Promise<void> {
  const database = await getDatabase();
  // Run both writes sequentially under the write lock.
  // Avoid withTransactionAsync here: wrapping a non-exclusive transaction
  // inside withWriteLock can leave the connection in a bad state when the
  // task throws (e.g. ROLLBACK failing on an interrupted transaction).
  await withWriteLock(async () => {
    await database.runAsync("UPDATE items SET read = 1 WHERE id = ?", [itemId]);
    // Read Later items are auto-removed once they've been read.
    await database.runAsync("DELETE FROM read_later_posts WHERE item_id = ?", [
      itemId,
    ]);
  });
}

export async function markItemUnread(itemId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE items SET read = 0 WHERE id = ?", [itemId])
  );
}

export async function getUnreadCount(feedId: number): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM items WHERE feed_id = ? AND read = 0",
    [feedId]
  );
  return row?.count ?? 0;
}

// ── Saved Posts ────────────────────────────────────────────────────────────

export async function savePost(
  item: FeedItem,
  feedTitle: string
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      `INSERT INTO saved_posts (item_id, feed_title, title, url, content, published_at, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (item_id) DO NOTHING`,
      [
        item.id,
        feedTitle,
        item.title,
        item.url ?? null,
        item.content ?? null,
        item.published_at ?? null,
        Date.now(),
      ]
    )
  );
}

export async function unsavePost(itemId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("DELETE FROM saved_posts WHERE item_id = ?", [itemId])
  );
}

export async function getSavedPosts(): Promise<SavedPost[]> {
  const database = await getDatabase();
  return database.getAllAsync<SavedPost>(
    "SELECT * FROM saved_posts ORDER BY saved_at DESC"
  );
}

export async function getSavedItemIds(): Promise<Set<number>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ item_id: number }>(
    "SELECT item_id FROM saved_posts WHERE item_id IS NOT NULL"
  );
  return new Set(rows.map((r) => r.item_id));
}

export async function getSavedItemIdsForFeed(
  feedId: number
): Promise<Set<number>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ item_id: number }>(
    `SELECT sp.item_id FROM saved_posts sp
     JOIN items ON items.id = sp.item_id
     WHERE items.feed_id = ? AND sp.item_id IS NOT NULL`,
    [feedId]
  );
  return new Set(rows.map((r) => r.item_id));
}

// ── Read Later Posts ───────────────────────────────────────────────────────

export async function addToReadLater(
  item: FeedItem,
  feedTitle: string
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      `INSERT INTO read_later_posts (item_id, feed_title, title, url, content, image_url, published_at, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (item_id) DO NOTHING`,
      [
        item.id,
        feedTitle,
        item.title,
        item.url ?? null,
        item.content ?? null,
        item.image_url ?? null,
        item.published_at ?? null,
        Date.now(),
      ]
    )
  );
}

export async function removeFromReadLater(itemId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("DELETE FROM read_later_posts WHERE item_id = ?", [
      itemId,
    ])
  );
}

export async function getReadLaterPosts(): Promise<ReadLaterPost[]> {
  const database = await getDatabase();
  return database.getAllAsync<ReadLaterPost>(
    "SELECT * FROM read_later_posts ORDER BY added_at DESC"
  );
}

export async function getReadLaterItemIds(): Promise<Set<number>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ item_id: number }>(
    "SELECT item_id FROM read_later_posts WHERE item_id IS NOT NULL"
  );
  return new Set(rows.map((r) => r.item_id));
}

// ── Tags ───────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const database = await getDatabase();
  return database.getAllAsync<Tag>(
    "SELECT id, name, notify_enabled FROM tags ORDER BY name COLLATE NOCASE ASC"
  );
}

export async function getTagById(tagId: number): Promise<Tag | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<Tag>(
    "SELECT id, name, notify_enabled FROM tags WHERE id = ?",
    [tagId]
  );
  return row ?? null;
}

export async function getTagsWithFeedCounts(): Promise<TagWithFeedCount[]> {
  const database = await getDatabase();
  return database.getAllAsync<TagWithFeedCount>(
    `SELECT tags.id, tags.name, tags.notify_enabled, COUNT(feed_tags.feed_id) AS feed_count
     FROM tags
     LEFT JOIN feed_tags ON feed_tags.tag_id = tags.id
     GROUP BY tags.id
     ORDER BY tags.name COLLATE NOCASE ASC`
  );
}

export async function addTag(name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  const database = await getDatabase();
  const result = await withWriteLock(() =>
    database.runAsync("INSERT INTO tags (name) VALUES (?)", [trimmed])
  );
  return result.lastInsertRowId;
}

export async function getOrCreateTag(name: string): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  const database = await getDatabase();
  const existing = await database.getFirstAsync<Tag>(
    "SELECT id, name, notify_enabled FROM tags WHERE name = ? COLLATE NOCASE",
    [trimmed]
  );
  if (existing) return existing;
  const id = await addTag(trimmed);
  return { id, name: trimmed };
}

export async function updateTag(tagId: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE tags SET name = ? WHERE id = ?", [trimmed, tagId])
  );
}

export async function deleteTag(tagId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("DELETE FROM tags WHERE id = ?", [tagId])
  );
}

export async function setTagNotificationEnabled(
  tagId: number,
  enabled: boolean
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("UPDATE tags SET notify_enabled = ? WHERE id = ?", [
      enabled ? 1 : 0,
      tagId,
    ])
  );
}

export async function getTagsForFeed(feedId: number): Promise<Tag[]> {
  const database = await getDatabase();
  return database.getAllAsync<Tag>(
    `SELECT tags.id, tags.name, tags.notify_enabled
     FROM tags
     JOIN feed_tags ON feed_tags.tag_id = tags.id
     WHERE feed_tags.feed_id = ?
     ORDER BY tags.name COLLATE NOCASE ASC`,
    [feedId]
  );
}

export async function getFeedsForTag(tagId: number): Promise<Feed[]> {
  const database = await getDatabase();
  return database.getAllAsync<Feed>(
    `SELECT feeds.* FROM feeds
     JOIN feed_tags ON feed_tags.feed_id = feeds.id
     WHERE feed_tags.tag_id = ?
     ORDER BY feeds.title COLLATE NOCASE ASC`,
    [tagId]
  );
}

export async function getFeedTagMap(): Promise<Map<number, number[]>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    feed_id: number;
    tag_id: number;
  }>("SELECT feed_id, tag_id FROM feed_tags");
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.feed_id);
    if (list) list.push(row.tag_id);
    else map.set(row.feed_id, [row.tag_id]);
  }
  return map;
}

export async function setFeedTags(
  feedId: number,
  tagIds: number[]
): Promise<void> {
  const database = await getDatabase();
  const unique = Array.from(new Set(tagIds));
  await withWriteLock(async () => {
    await database.runAsync("DELETE FROM feed_tags WHERE feed_id = ?", [
      feedId,
    ]);
    if (unique.length > 0) {
      const placeholders = unique.map(() => "(?, ?)").join(", ");
      const values = unique.flatMap((tagId) => [feedId, tagId]);
      await database.runAsync(
        `INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES ${placeholders}`,
        values
      );
    }
  });
}

export async function setTagFeeds(
  tagId: number,
  feedIds: number[]
): Promise<void> {
  const database = await getDatabase();
  const unique = Array.from(new Set(feedIds));
  await withWriteLock(async () => {
    await database.runAsync("DELETE FROM feed_tags WHERE tag_id = ?", [tagId]);
    if (unique.length > 0) {
      const placeholders = unique.map(() => "(?, ?)").join(", ");
      const values = unique.flatMap((feedId) => [feedId, tagId]);
      await database.runAsync(
        `INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES ${placeholders}`,
        values
      );
    }
  });
}

// ── Custom Feeds ──────────────────────────────────────────────────────────

export async function getCustomFeeds(): Promise<CustomFeed[]> {
  const database = await getDatabase();
  return database.getAllAsync<CustomFeed>(
    "SELECT id, name, icon, nsfw FROM custom_feeds ORDER BY name COLLATE NOCASE ASC"
  );
}

export async function getCustomFeedsWithMemberCounts(): Promise<
  CustomFeedWithMemberCount[]
> {
  const database = await getDatabase();
  return database.getAllAsync<CustomFeedWithMemberCount>(
    `SELECT cf.id, cf.name, cf.icon, cf.nsfw,
            COUNT(cfm.feed_id) AS member_count
     FROM custom_feeds cf
     LEFT JOIN custom_feed_members cfm ON cfm.custom_feed_id = cf.id
     GROUP BY cf.id
     ORDER BY cf.name COLLATE NOCASE ASC`
  );
}

export async function getCustomFeedById(
  customFeedId: number
): Promise<CustomFeed | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CustomFeed>(
    "SELECT id, name, icon, nsfw FROM custom_feeds WHERE id = ?",
    [customFeedId]
  );
  return row ?? null;
}

export async function addCustomFeed(fields: {
  name: string;
  icon: string;
  nsfw: number;
}): Promise<number> {
  const trimmed = fields.name.trim();
  if (!trimmed) {
    throw new Error("Custom feed name cannot be empty.");
  }
  const database = await getDatabase();
  const result = await withWriteLock(() =>
    database.runAsync(
      "INSERT INTO custom_feeds (name, icon, nsfw) VALUES (?, ?, ?)",
      [trimmed, fields.icon || "list", fields.nsfw ? 1 : 0]
    )
  );
  return result.lastInsertRowId;
}

export async function updateCustomFeed(
  customFeedId: number,
  fields: { name: string; icon: string; nsfw: number }
): Promise<void> {
  const trimmed = fields.name.trim();
  if (!trimmed) {
    throw new Error("Custom feed name cannot be empty.");
  }
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE custom_feeds SET name = ?, icon = ?, nsfw = ? WHERE id = ?",
      [trimmed, fields.icon || "list", fields.nsfw ? 1 : 0, customFeedId]
    )
  );
}

export async function deleteCustomFeed(customFeedId: number): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync("DELETE FROM custom_feeds WHERE id = ?", [customFeedId])
  );
}

export async function getCustomFeedMembers(
  customFeedId: number
): Promise<number[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ feed_id: number }>(
    "SELECT feed_id FROM custom_feed_members WHERE custom_feed_id = ?",
    [customFeedId]
  );
  return rows.map((r) => r.feed_id);
}

export async function setCustomFeedMembers(
  customFeedId: number,
  feedIds: number[]
): Promise<void> {
  const database = await getDatabase();
  const unique = Array.from(new Set(feedIds));
  await withWriteLock(async () => {
    await database.runAsync(
      "DELETE FROM custom_feed_members WHERE custom_feed_id = ?",
      [customFeedId]
    );
    if (unique.length > 0) {
      const placeholders = unique.map(() => "(?, ?)").join(", ");
      const values = unique.flatMap((feedId) => [customFeedId, feedId]);
      await database.runAsync(
        `INSERT OR IGNORE INTO custom_feed_members (custom_feed_id, feed_id) VALUES ${placeholders}`,
        values
      );
    }
  });
}

/** Add a single feed to a custom feed's membership. Idempotent — does
 *  nothing if the row already exists. */
export async function addCustomFeedMember(
  customFeedId: number,
  feedId: number
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "INSERT OR IGNORE INTO custom_feed_members (custom_feed_id, feed_id) VALUES (?, ?)",
      [customFeedId, feedId]
    )
  );
}

/** Remove a single feed from a custom feed's membership. Does not delete
 *  the underlying feed; the feed itself remains in the database and any
 *  other custom-feed memberships are preserved. */
export async function removeCustomFeedMember(
  customFeedId: number,
  feedId: number
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "DELETE FROM custom_feed_members WHERE custom_feed_id = ? AND feed_id = ?",
      [customFeedId, feedId]
    )
  );
}

export async function getFeedsForCustomFeed(
  customFeedId: number
): Promise<Feed[]> {
  const database = await getDatabase();
  return database.getAllAsync<Feed>(
    `SELECT feeds.* FROM feeds
     JOIN custom_feed_members cfm ON cfm.feed_id = feeds.id
     WHERE cfm.custom_feed_id = ?
     ORDER BY feeds.title COLLATE NOCASE ASC`,
    [customFeedId]
  );
}
