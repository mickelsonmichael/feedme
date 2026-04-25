/**
 * Tests for the web (`localStorage`-backed) database implementation.
 *
 * These tests run under Node via the `jest-expo` preset. We import the web
 * module explicitly (rather than relying on Metro's platform extension
 * resolution) so the implementation is exercised regardless of the test
 * environment's `Platform.OS`.
 */

import {
  __resetForTests,
  addFeed,
  deleteFeed,
  getAllItems,
  getFeeds,
  getItemCountForFeed,
  getItemsForFeed,
  getUnreadCount,
  markItemRead,
  setFeedError,
  updateFeed,
  updateFeedLastFetched,
  upsertItems,
} from "../database.web";

// jsdom provides `localStorage`; jest-expo's default environment is node, so
// install a minimal in-memory shim if it isn't already present.
beforeAll(() => {
  if (
    typeof (globalThis as { localStorage?: Storage }).localStorage ===
    "undefined"
  ) {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
    };
  }
});

beforeEach(() => {
  __resetForTests();
});

describe("database.web — feeds", () => {
  it("starts empty", async () => {
    expect(await getFeeds()).toEqual([]);
  });

  it("adds, lists, updates and deletes feeds", async () => {
    const id = await addFeed({
      title: "Example",
      url: "https://example.com/feed",
      description: "desc",
    });
    expect(typeof id).toBe("number");

    const feeds = await getFeeds();
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      id,
      title: "Example",
      url: "https://example.com/feed",
      description: "desc",
      last_fetched: null,
      error: null,
    });

    await updateFeed(id, { title: "Renamed", url: "https://example.com/v2" });
    await updateFeedLastFetched(id);
    await setFeedError(id, "boom");

    const updated = (await getFeeds())[0];
    expect(updated.title).toBe("Renamed");
    expect(updated.url).toBe("https://example.com/v2");
    expect(typeof updated.last_fetched).toBe("number");
    expect(updated.error).toBe("boom");

    await setFeedError(id, null);
    expect((await getFeeds())[0].error).toBeNull();

    await deleteFeed(id);
    expect(await getFeeds()).toEqual([]);
  });

  it("orders feeds by title (case-insensitive)", async () => {
    await addFeed({ title: "banana", url: "u1", description: null });
    await addFeed({ title: "Apple", url: "u2", description: null });
    await addFeed({ title: "cherry", url: "u3", description: null });
    expect((await getFeeds()).map((f) => f.title)).toEqual([
      "Apple",
      "banana",
      "cherry",
    ]);
  });

  it("rejects duplicate URLs (UNIQUE constraint)", async () => {
    await addFeed({ title: "A", url: "https://x", description: null });
    await expect(
      addFeed({ title: "B", url: "https://x", description: null })
    ).rejects.toThrow();
  });

  it("persists data across module-cache reloads via localStorage", async () => {
    await addFeed({ title: "Persistent", url: "p", description: null });
    // Drop the in-memory cache — the next read must repopulate from
    // localStorage to prove persistence works.
    __resetForTests.toString(); // referenced to silence lints
    // Re-import via Jest's isolateModules to get a fresh module-level cache.
    let reloaded: typeof import("../database.web");
    jest.isolateModules(() => {
      reloaded = require("../database.web");
    });
    const feeds = await reloaded!.getFeeds();
    expect(feeds.map((f) => f.title)).toEqual(["Persistent"]);
    // Clean up so subsequent tests start empty.
    reloaded!.__resetForTests();
  });
});

describe("database.web — items", () => {
  let feedId: number;
  let otherFeedId: number;

  beforeEach(async () => {
    feedId = await addFeed({
      title: "Feed",
      url: "https://example.com/a",
      description: null,
    });
    otherFeedId = await addFeed({
      title: "Other",
      url: "https://example.com/b",
      description: null,
    });
  });

  it("upserts items and skips duplicates by (feed_id, url)", async () => {
    await upsertItems(feedId, [
      { title: "One", url: "https://x/1", content: null, publishedAt: 1000 },
      { title: "Two", url: "https://x/2", content: "body", publishedAt: 2000 },
    ]);

    // Re-running with one duplicate URL should not create a duplicate row.
    await upsertItems(feedId, [
      {
        title: "One again",
        url: "https://x/1",
        content: null,
        publishedAt: 1000,
      },
      { title: "Three", url: "https://x/3", content: null, publishedAt: 3000 },
    ]);

    const items = await getItemsForFeed(feedId);
    expect(items.map((i) => i.url)).toEqual([
      "https://x/3",
      "https://x/2",
      "https://x/1",
    ]);
    expect(await getItemCountForFeed(feedId)).toBe(3);
  });

  it("does not deduplicate items with null URLs", async () => {
    await upsertItems(feedId, [
      { title: "A", url: null, content: null, publishedAt: 1 },
      { title: "B", url: null, content: null, publishedAt: 2 },
    ]);
    expect(await getItemCountForFeed(feedId)).toBe(2);
  });

  it("getAllItems joins items to feeds and sorts by published_at desc", async () => {
    await upsertItems(feedId, [
      { title: "Old", url: "https://x/old", content: null, publishedAt: 100 },
    ]);
    await upsertItems(otherFeedId, [
      { title: "New", url: "https://y/new", content: null, publishedAt: 500 },
    ]);

    const all = await getAllItems();
    expect(all).toHaveLength(2);
    expect(all[0].title).toBe("New");
    expect(all[0].feed_title).toBe("Other");
    expect(all[1].title).toBe("Old");
    expect(all[1].feed_title).toBe("Feed");
  });

  it("marks items as read and tracks the unread count", async () => {
    await upsertItems(feedId, [
      { title: "1", url: "https://x/1", content: null, publishedAt: 1 },
      { title: "2", url: "https://x/2", content: null, publishedAt: 2 },
      { title: "3", url: "https://x/3", content: null, publishedAt: 3 },
    ]);
    expect(await getUnreadCount(feedId)).toBe(3);

    const items = await getItemsForFeed(feedId);
    await markItemRead(items[0].id);
    expect(await getUnreadCount(feedId)).toBe(2);
  });

  it("cascades deletes from feed to items", async () => {
    await upsertItems(feedId, [
      { title: "x", url: "https://x/1", content: null, publishedAt: 1 },
    ]);
    await deleteFeed(feedId);
    expect(await getItemsForFeed(feedId)).toEqual([]);
    expect(await getAllItems()).toEqual([]);
  });
});
