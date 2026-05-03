import * as SQLite from "expo-sqlite";
import {
  Feed,
  FeedItem,
  FeedItemWithFeed,
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
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync("feedme.db");
      await initializeSchema(database);
      return database;
    })();
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
      nsfw INTEGER NOT NULL DEFAULT 0
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
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS feed_tags (
      feed_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (feed_id, tag_id),
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
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

  // Indexes: ensure efficient sort/filter for the list screens.
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_items_published_at ON items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_items_feed_id ON items(feed_id);
    CREATE INDEX IF NOT EXISTS idx_items_read ON items(read);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_item_id ON saved_posts(item_id);
    CREATE INDEX IF NOT EXISTS idx_read_later_posts_item_id ON read_later_posts(item_id);
    CREATE INDEX IF NOT EXISTS idx_feed_tags_tag_id ON feed_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_feed_tags_feed_id ON feed_tags(feed_id);
  `);
}

// ── Feeds ──────────────────────────────────────────────────────────────────

export async function getFeeds(): Promise<Feed[]> {
  const database = await getDatabase();
  return database.getAllAsync<Feed>("SELECT * FROM feeds ORDER BY title ASC");
}

export async function addFeed({
  title,
  url,
  description,
  use_proxy,
  nsfw,
  show_only_in_tag,
}: Pick<
  Feed,
  | "title"
  | "url"
  | "description"
  | "use_proxy"
  | "nsfw"
  | "show_only_in_tag"
>): Promise<number> {
  const database = await getDatabase();
  const result = await withWriteLock(() =>
    database.runAsync(
      "INSERT INTO feeds (title, url, description, use_proxy, nsfw, show_only_in_tag) VALUES (?, ?, ?, ?, ?, ?)",
      [
        title,
        url,
        description ?? null,
        use_proxy ?? 0,
        nsfw ?? 0,
        show_only_in_tag ?? 0,
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
  fields: Pick<Feed, "title" | "url" | "use_proxy" | "nsfw" | "show_only_in_tag">
): Promise<void> {
  const database = await getDatabase();
  await withWriteLock(() =>
    database.runAsync(
      "UPDATE feeds SET title = ?, url = ?, use_proxy = ?, nsfw = ?, show_only_in_tag = ? WHERE id = ?",
      [
        fields.title,
        fields.url,
        fields.use_proxy ?? 0,
        fields.nsfw ?? 0,
        fields.show_only_in_tag ?? 0,
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

export async function getItemCountForFeed(feedId: number): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM items WHERE feed_id = ?",
    [feedId]
  );
  return row?.count ?? 0;
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

export async function upsertItems(
  feedId: number,
  items: ParsedFeedItem[]
): Promise<void> {
  if (items.length === 0) return;
  const database = await getDatabase();
  const statement = await database.prepareAsync(
    `INSERT INTO items (feed_id, title, url, content, image_url, raw_xml, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (feed_id, url) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       image_url = excluded.image_url,
       raw_xml = excluded.raw_xml,
       published_at = excluded.published_at`
  );
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
    await statement.finalizeAsync();
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
    await database.runAsync("UPDATE items SET read = 1 WHERE id = ?", [
      itemId,
    ]);
    // Read Later items are auto-removed once they've been read.
    await database.runAsync(
      "DELETE FROM read_later_posts WHERE item_id = ?",
      [itemId]
    );
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
    "SELECT id, name FROM tags ORDER BY name COLLATE NOCASE ASC"
  );
}

export async function getTagsWithFeedCounts(): Promise<TagWithFeedCount[]> {
  const database = await getDatabase();
  return database.getAllAsync<TagWithFeedCount>(
    `SELECT tags.id, tags.name, COUNT(feed_tags.feed_id) AS feed_count
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
    "SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE",
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

export async function getTagsForFeed(feedId: number): Promise<Tag[]> {
  const database = await getDatabase();
  return database.getAllAsync<Tag>(
    `SELECT tags.id, tags.name
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
    for (const tagId of unique) {
      await database.runAsync(
        "INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES (?, ?)",
        [feedId, tagId]
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
    for (const feedId of unique) {
      await database.runAsync(
        "INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES (?, ?)",
        [feedId, tagId]
      );
    }
  });
}
