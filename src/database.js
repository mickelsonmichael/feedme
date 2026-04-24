import * as SQLite from "expo-sqlite";

let db = null;

export async function getDatabase() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("feedme.db");
    await initializeSchema(db);
  }
  return db;
}

async function initializeSchema(database) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      description TEXT,
      last_fetched INTEGER
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
}

// ── Feeds ──────────────────────────────────────────────────────────────────

export async function getFeeds() {
  const database = await getDatabase();
  return database.getAllAsync("SELECT * FROM feeds ORDER BY title ASC");
}

export async function addFeed({ title, url, description }) {
  const database = await getDatabase();
  const result = await database.runAsync(
    "INSERT INTO feeds (title, url, description) VALUES (?, ?, ?)",
    [title, url, description ?? null]
  );
  return result.lastInsertRowId;
}

export async function deleteFeed(feedId) {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM feeds WHERE id = ?", [feedId]);
}

export async function updateFeedLastFetched(feedId) {
  const database = await getDatabase();
  await database.runAsync("UPDATE feeds SET last_fetched = ? WHERE id = ?", [
    Date.now(),
    feedId,
  ]);
}

// ── Items ──────────────────────────────────────────────────────────────────

export async function getItemsForFeed(feedId) {
  const database = await getDatabase();
  return database.getAllAsync(
    "SELECT * FROM items WHERE feed_id = ? ORDER BY published_at DESC",
    [feedId]
  );
}

export async function upsertItems(feedId, items) {
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

export async function markItemRead(itemId) {
  const database = await getDatabase();
  await database.runAsync("UPDATE items SET read = 1 WHERE id = ?", [itemId]);
}

export async function getUnreadCount(feedId) {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    "SELECT COUNT(*) as count FROM items WHERE feed_id = ? AND read = 0",
    [feedId]
  );
  return row?.count ?? 0;
}
