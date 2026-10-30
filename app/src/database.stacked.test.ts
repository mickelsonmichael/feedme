// The "stacked" page query runs on a real SQLite engine (Node's built-in
// `node:sqlite`) behind a minimal expo-sqlite stand-in, and has to produce
// exactly the order and keys of the JS reference, `computeStackKeys`.

import { addFeed, getItemsPage, markItemRead, upsertItems } from "./database";
import { computeStackKeys } from "./sortItems";
import type { FeedItemWithFeed, ItemsPageOptions } from "./types";

jest.mock("expo-sqlite", () => {
  const { DatabaseSync } = require("node:sqlite");
  const bind = (params: unknown) =>
    (params === undefined ? [] : Array.isArray(params) ? params : [params]).map(
      (value: unknown) => (value === undefined ? null : value)
    );
  return {
    openDatabaseAsync: jest.fn(async () => {
      const db = new DatabaseSync(":memory:");
      return {
        execAsync: async (sql: string) => {
          db.exec(sql);
        },
        getFirstAsync: async (sql: string, params?: unknown) =>
          db.prepare(sql).get(...bind(params)) ?? null,
        getAllAsync: async (sql: string, params?: unknown) =>
          db.prepare(sql).all(...bind(params)),
        runAsync: async (sql: string, params?: unknown) => {
          const result = db.prepare(sql).run(...bind(params));
          return {
            lastInsertRowId: Number(result.lastInsertRowid),
            changes: Number(result.changes),
          };
        },
        withTransactionAsync: async (task: () => Promise<void>) => {
          db.exec("BEGIN");
          try {
            await task();
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        },
      };
    }),
  };
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 30, 12);

// Feeds of very different cadences, so every stream and edge is exercised:
// recent and older posts, a feed whose newest post is only recent by the
// newest-post allowance, a dead feed, future-dated and undated posts.
const FEEDS: { title: string; count: number; gap: number; offset: number }[] = [
  { title: "Busy", count: 120, gap: 3 * HOUR, offset: 0 },
  { title: "Daily", count: 60, gap: DAY, offset: 5 * HOUR },
  { title: "Weekly", count: 30, gap: 7 * DAY, offset: 3 * DAY },
  { title: "Monthly", count: 20, gap: 30 * DAY, offset: 22 * DAY },
  { title: "Dead", count: 15, gap: 14 * DAY, offset: 900 * DAY },
  { title: "Future", count: 3, gap: DAY, offset: -2 * DAY },
];

async function seedLibrary(): Promise<number[]> {
  const feedIds: number[] = [];
  for (const feed of FEEDS) {
    const feedId = await addFeed({
      title: feed.title,
      url: `https://${feed.title.toLowerCase()}.example/feed`,
      description: null,
    });
    feedIds.push(feedId);
    await upsertItems(
      feedId,
      Array.from({ length: feed.count }, (_, i) => ({
        title: `${feed.title} ${i}`,
        url: `https://${feed.title.toLowerCase()}.example/${i}`,
        content: null,
        // Every 17th post has no date.
        publishedAt: i % 17 === 16 ? null : NOW - feed.offset - i * feed.gap,
      }))
    );
  }
  return feedIds;
}

async function pageThrough(
  options: Omit<ItemsPageOptions, "offset" | "limit">
): Promise<FeedItemWithFeed[]> {
  const rows: FeedItemWithFeed[] = [];
  for (let offset = 0; ; offset += 37) {
    const page = await getItemsPage({ ...options, offset, limit: 37 });
    rows.push(...page);
    if (page.length < 37) return rows;
  }
}

function expectMatchesReference(rows: FeedItemWithFeed[], now: number) {
  const keys = computeStackKeys(rows, now);
  const expectedOrder = [...rows]
    .sort((a, b) => keys.get(a.id)! - keys.get(b.id)! || b.id - a.id)
    .map((row) => row.id);
  expect(rows.map((row) => row.id)).toEqual(expectedOrder);
  for (const row of rows) {
    expect(row.stack_key).toBeCloseTo(keys.get(row.id)!, 9);
  }
}

describe("getItemsPage — stacked order on SQLite", () => {
  let feedIds: number[];

  beforeAll(async () => {
    feedIds = await seedLibrary();
  });

  it("pages the whole library in the reference order, with its keys", async () => {
    // Act
    const rows = await pageThrough({ order: "stacked", now: NOW });

    // Assert
    expect(rows).toHaveLength(FEEDS.reduce((sum, f) => sum + f.count, 0));
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expectMatchesReference(rows, NOW);
  });

  it("matches the reference on another day, when the shuffle differs", async () => {
    // Arrange
    const later = NOW + 3 * DAY + 5 * HOUR;

    // Act
    const rows = await pageThrough({ order: "stacked", now: later });

    // Assert
    expectMatchesReference(rows, later);
  });

  it("matches the reference within a scope and over unread posts only", async () => {
    // Arrange — read a run of the busy feed's newest posts.
    const busy = await getItemsPage({
      feedIds: [feedIds[0]],
      offset: 0,
      limit: 10,
    });
    for (const item of busy) await markItemRead(item.id);

    // Act
    const rows = await pageThrough({
      order: "stacked",
      now: NOW,
      feedIds: feedIds.slice(0, 4),
      unreadOnly: true,
    });

    // Assert
    expect(rows.some((row) => busy.some((read) => read.id === row.id))).toBe(
      false
    );
    expectMatchesReference(rows, NOW);
  });
});
