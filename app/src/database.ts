import * as SQLite from "expo-sqlite";
import {
  Feed,
  FeedItem,
  FeedItemWithFeed,
  ParsedFeedItem,
  SavedPost,
} from "./types";

let db: SQLite.SQLiteDatabase | null = null;

// Native (iOS / Android) implementation of the database module.
//
// The web build uses `database.web.ts`, which is backed by `localStorage`
// because the wa-sqlite/OPFS backend that `expo-sqlite` relies on for the web
// is not reliably available in browsers (especially when the page is not
// Cross-Origin-Isolated, e.g. on GitHub Pages). On native we always have a
// real SQLite engine, so no fallback is needed here.
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("feedme.db");
    await initializeSchema(db);
  }
  return db;
}

async function initializeSchema(
  database: SQLite.SQLiteDatabase
): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
}: Pick<
  Feed,
  "title" | "url" | "description" | "use_proxy" | "nsfw"
>): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO feeds (title, url, description, use_proxy, nsfw) VALUES (?, ?, ?, ?, ?)",
    [title, url, description ?? null, use_proxy ?? 0, nsfw ?? 0]
  );
  return result.lastInsertRowId;
}

export async function deleteFeed(feedId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM feeds WHERE id = ?", [feedId]);
}

export async function updateFeedLastFetched(feedId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE feeds SET last_fetched = ? WHERE id = ?", [
    Date.now(),
    feedId,
  ]);
}

export async function updateFeed(
  feedId: number,
  fields: Pick<Feed, "title" | "url" | "use_proxy" | "nsfw">
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE feeds SET title = ?, url = ?, use_proxy = ?, nsfw = ? WHERE id = ?",
    [fields.title, fields.url, fields.use_proxy ?? 0, fields.nsfw ?? 0, feedId]
  );
}

export async function setFeedError(
  feedId: number,
  error: string | null
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE feeds SET error = ? WHERE id = ?", [
    error,
    feedId,
  ]);
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
  return database.getAllAsync<FeedItemWithFeed>(
    `SELECT items.*, feeds.title AS feed_title
     FROM items
     JOIN feeds ON items.feed_id = feeds.id
     ORDER BY items.published_at DESC`
  );
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
  const database = await getDatabase();
  for (const item of items) {
    await database.runAsync(
      `INSERT INTO items (feed_id, title, url, content, image_url, raw_xml, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (feed_id, url) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         image_url = excluded.image_url,
         raw_xml = excluded.raw_xml,
         published_at = excluded.published_at`,
      [
        feedId,
        item.title,
        item.url ?? null,
        item.content ?? null,
        item.imageUrl ?? null,
        item.rawXml ?? null,
        item.publishedAt ?? null,
      ]
    );
  }
}

export async function markItemRead(itemId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE items SET read = 1 WHERE id = ?", [itemId]);
}

export async function markItemUnread(itemId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE items SET read = 0 WHERE id = ?", [itemId]);
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
  await database.runAsync(
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
  );
}

export async function unsavePost(itemId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM saved_posts WHERE item_id = ?", [
    itemId,
  ]);
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
