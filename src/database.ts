import * as SQLite from "expo-sqlite";
import { Feed, FeedItem, FeedItemWithFeed, ParsedFeedItem } from "./types";

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
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      published_at INTEGER,
      read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      UNIQUE (feed_id, url)
    );
  `);

  // Migration: add error column to feeds if it doesn't exist yet
  try {
    await database.execAsync("ALTER TABLE feeds ADD COLUMN error TEXT");
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
}: Pick<Feed, "title" | "url" | "description">): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO feeds (title, url, description) VALUES (?, ?, ?)",
    [title, url, description ?? null]
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
  fields: Pick<Feed, "title" | "url">
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE feeds SET title = ?, url = ? WHERE id = ?", [
    fields.title,
    fields.url,
    feedId,
  ]);
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
      `INSERT INTO items (feed_id, title, url, content, published_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (feed_id, url) DO NOTHING`,
      [
        feedId,
        item.title,
        item.url ?? null,
        item.content ?? null,
        item.publishedAt ?? null,
      ]
    );
  }
}

export async function markItemRead(itemId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE items SET read = 1 WHERE id = ?", [itemId]);
}

export async function getUnreadCount(feedId: number): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM items WHERE feed_id = ? AND read = 0",
    [feedId]
  );
  return row?.count ?? 0;
}
