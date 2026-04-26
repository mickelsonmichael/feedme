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
  getSavedItemIds,
  getSavedPosts,
  getUnreadCount,
  markItemRead,
  savePost,
  setFeedError,
  unsavePost,
  updateFeed,
  updateFeedLastFetched,
  upsertItems,
} from "./database.web";

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
    // Re-import via Jest's isolateModules to get a fresh module-level cache,
    // proving the data was actually persisted to localStorage rather than
    // just held in memory.
    let reloaded: typeof import("./database.web");
    jest.isolateModules(() => {
      reloaded = require("./database.web");
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

  it("stores and retrieves image_url from feed items", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Post with image",
        url: "https://x/img",
        content: null,
        imageUrl: "https://example.com/thumb.jpg",
        publishedAt: 1000,
      },
      {
        title: "Post without image",
        url: "https://x/no-img",
        content: null,
        imageUrl: null,
        publishedAt: 2000,
      },
    ]);

    // Act
    const items = await getItemsForFeed(feedId);

    // Assert
    const withImage = items.find((i) => i.title === "Post with image")!;
    const withoutImage = items.find((i) => i.title === "Post without image")!;
    expect(withImage.image_url).toBe("https://example.com/thumb.jpg");
    expect(withoutImage.image_url).toBeNull();
  });

  it("upserts items and skips duplicates by (feed_id, url)", async () => {
    await upsertItems(feedId, [
      {
        title: "One",
        url: "https://x/1",
        content: null,
        imageUrl: null,
        publishedAt: 1000,
      },
      {
        title: "Two",
        url: "https://x/2",
        content: "body",
        imageUrl: null,
        publishedAt: 2000,
      },
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

  it("only removes items belonging to the deleted feed, leaving other feeds' items intact", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "a", url: "https://x/a", content: null, publishedAt: 1 },
      { title: "b", url: "https://x/b", content: null, publishedAt: 2 },
    ]);
    await upsertItems(otherFeedId, [
      { title: "c", url: "https://y/c", content: null, publishedAt: 3 },
    ]);

    // Act
    await deleteFeed(feedId);

    // Assert: deleted feed and its items are gone
    const remainingFeeds = await getFeeds();
    expect(remainingFeeds.map((f) => f.id)).not.toContain(feedId);
    expect(await getItemsForFeed(feedId)).toEqual([]);

    // Assert: the other feed and its items are untouched
    expect(remainingFeeds.map((f) => f.id)).toContain(otherFeedId);
    const otherItems = await getItemsForFeed(otherFeedId);
    expect(otherItems).toHaveLength(1);
    expect(otherItems[0].title).toBe("c");
  });
});

describe("database.web — saved posts", () => {
  let feedId: number;

  beforeEach(async () => {
    feedId = await addFeed({
      title: "My Feed",
      url: "https://example.com/feed",
      description: null,
    });
  });

  it("starts with no saved posts", async () => {
    // Arrange & Act
    const posts = await getSavedPosts();

    // Assert
    expect(posts).toEqual([]);
  });

  it("saves a post and retrieves it", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Hello World",
        url: "https://example.com/1",
        content: "<p>Content</p>",
        publishedAt: 1000,
      },
    ]);
    const items = await getItemsForFeed(feedId);
    const item = items[0];

    // Act
    await savePost(item, "My Feed");
    const posts = await getSavedPosts();

    // Assert
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      item_id: item.id,
      feed_title: "My Feed",
      title: "Hello World",
      url: "https://example.com/1",
      content: "<p>Content</p>",
      published_at: 1000,
    });
    expect(typeof posts[0].saved_at).toBe("number");
    expect(posts[0].saved_at).toBeGreaterThan(0);
  });

  it("does not duplicate a saved post (idempotent save)", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Post",
        url: "https://example.com/1",
        content: null,
        publishedAt: 1,
      },
    ]);
    const item = (await getItemsForFeed(feedId))[0];

    // Act
    await savePost(item, "My Feed");
    await savePost(item, "My Feed");

    // Assert
    expect(await getSavedPosts()).toHaveLength(1);
  });

  it("unsaves a post by item_id", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Post",
        url: "https://example.com/1",
        content: null,
        publishedAt: 1,
      },
    ]);
    const item = (await getItemsForFeed(feedId))[0];
    await savePost(item, "My Feed");

    // Act
    await unsavePost(item.id);

    // Assert
    expect(await getSavedPosts()).toEqual([]);
  });

  it("getSavedItemIds returns a set of item IDs", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "A", url: "https://x/a", content: null, publishedAt: 1 },
      { title: "B", url: "https://x/b", content: null, publishedAt: 2 },
    ]);
    const items = await getItemsForFeed(feedId);
    await savePost(items[0], "My Feed");

    // Act
    const ids = await getSavedItemIds();

    // Assert
    expect(ids.has(items[0].id)).toBe(true);
    expect(ids.has(items[1].id)).toBe(false);
  });

  it("getSavedPosts returns posts sorted by saved_at descending", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "Older", url: "https://x/old", content: null, publishedAt: 100 },
      { title: "Newer", url: "https://x/new", content: null, publishedAt: 200 },
    ]);
    const items = await getItemsForFeed(feedId);
    const olderItem = items.find((i) => i.title === "Older")!;
    const newerItem = items.find((i) => i.title === "Newer")!;

    // Act: save older item first (earlier timestamp), then newer item (later timestamp)
    const dateSpy = jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000);
    await savePost(olderItem, "My Feed");
    await savePost(newerItem, "My Feed");
    dateSpy.mockRestore();

    const posts = await getSavedPosts();

    // Assert: most recently saved appears first
    expect(posts[0].title).toBe("Newer");
    expect(posts[1].title).toBe("Older");
  });

  it("saved posts are independent of feed deletion", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Precious Post",
        url: "https://x/p",
        content: "body",
        publishedAt: 1,
      },
    ]);
    const item = (await getItemsForFeed(feedId))[0];
    await savePost(item, "My Feed");

    // Act: delete the feed (cascades to items)
    await deleteFeed(feedId);

    // Assert: saved post still exists
    const posts = await getSavedPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("Precious Post");
    expect(posts[0].content).toBe("body");
  });
});
