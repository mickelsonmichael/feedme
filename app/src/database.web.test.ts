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
  addTag,
  addToReadLater,
  deleteFeed,
  deleteTag,
  getAllItems,
  getFeeds,
  getFeedTagMap,
  getFeedsForTag,
  getMaxItemIdForFeed,
  getUnseenItemsForFeed,
  getItemCountForFeed,
  getItemsForFeed,
  getItemsPage,
  getOrCreateTag,
  getReadLaterItemIds,
  getReadLaterPosts,
  getSavedItemIds,
  getSavedItemIdsForFeed,
  getSavedPosts,
  getTags,
  getTagsForFeed,
  getTagsWithFeedCounts,
  getUnreadCount,
  markItemRead,
  markItemUnread,
  removeFromReadLater,
  savePost,
  setFeedError,
  setFeedNotificationCheckpoint,
  setFeedNotificationSettings,
  setFeedTags,
  setTagNotificationEnabled,
  setTagFeeds,
  setFeedDailyNotificationSentAt,
  unsavePost,
  updateFeed,
  updateFeedLastFetched,
  updateTag,
  upsertItems,
  addCustomFeed,
  updateCustomFeed,
  deleteCustomFeed,
  getCustomFeeds,
  getCustomFeedsWithMemberCounts,
  getCustomFeedById,
  getCustomFeedMembers,
  setCustomFeedMembers,
  addCustomFeedMember,
  removeCustomFeedMember,
  getFeedsForCustomFeed,
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
      nsfw: 0,
    });

    await updateFeed(id, {
      title: "Renamed",
      url: "https://example.com/v2",
      nsfw: 1,
    });
    await updateFeedLastFetched(id);
    await setFeedError(id, "boom");

    const updated = (await getFeeds())[0];
    expect(updated.title).toBe("Renamed");
    expect(updated.url).toBe("https://example.com/v2");
    expect(updated.nsfw).toBe(1);
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

  it("upserts items and updates duplicates by (feed_id, url)", async () => {
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

    // Re-running with one duplicate URL should update existing cached fields.
    await upsertItems(feedId, [
      {
        title: "One again",
        url: "https://x/1",
        content: "updated body",
        imageUrl: "https://example.com/updated.jpg",
        publishedAt: 3333,
      },
      { title: "Three", url: "https://x/3", content: null, publishedAt: 3000 },
    ]);

    const items = await getItemsForFeed(feedId);
    // After update, item at https://x/1 has published_at=3333 (highest),
    // so it sorts first in descending order.
    expect(items.map((i) => i.url)).toEqual([
      "https://x/1",
      "https://x/3",
      "https://x/2",
    ]);
    const updated = items.find((i) => i.url === "https://x/1");
    expect(updated?.title).toBe("One again");
    expect(updated?.content).toBe("updated body");
    expect(updated?.image_url).toBe("https://example.com/updated.jpg");
    expect(updated?.published_at).toBe(3333);
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

  it("marks items back to unread", async () => {
    await upsertItems(feedId, [
      { title: "1", url: "https://x/1", content: null, publishedAt: 1 },
    ]);

    const items = await getItemsForFeed(feedId);
    await markItemRead(items[0].id);
    expect(await getUnreadCount(feedId)).toBe(0);

    await markItemUnread(items[0].id);
    expect(await getUnreadCount(feedId)).toBe(1);
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

describe("database.web — getItemsPage", () => {
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

  it("orders by published_at desc with id desc as a tiebreak, honoring limit/offset", async () => {
    // Arrange: items 1-3 share published_at=100 (tiebreak by id desc),
    // item 4 is newer.
    await upsertItems(feedId, [
      { title: "A", url: "https://x/a", content: null, publishedAt: 100 }, // id 1
      { title: "B", url: "https://x/b", content: null, publishedAt: 100 }, // id 2
      { title: "C", url: "https://x/c", content: null, publishedAt: 100 }, // id 3
      { title: "D", url: "https://x/d", content: null, publishedAt: 200 }, // id 4
    ]);

    // Act
    const page1 = await getItemsPage({ offset: 0, limit: 2 });
    const page2 = await getItemsPage({ offset: 2, limit: 2 });

    // Assert: newest published_at first, then id desc among ties
    expect(page1.map((i) => i.title)).toEqual(["D", "C"]);
    expect(page2.map((i) => i.title)).toEqual(["B", "A"]);
  });

  it("restricts to the given feedIds, and an empty array returns no items", async () => {
    await upsertItems(feedId, [
      { title: "Mine", url: "https://x/1", content: null, publishedAt: 100 },
    ]);
    await upsertItems(otherFeedId, [
      { title: "Theirs", url: "https://y/1", content: null, publishedAt: 200 },
    ]);

    const scoped = await getItemsPage({
      feedIds: [feedId],
      offset: 0,
      limit: 10,
    });
    expect(scoped.map((i) => i.title)).toEqual(["Mine"]);

    const empty = await getItemsPage({ feedIds: [], offset: 0, limit: 10 });
    expect(empty).toEqual([]);
  });

  it("excludes the given feedIds, and an empty array is a no-op", async () => {
    await upsertItems(feedId, [
      { title: "Mine", url: "https://x/1", content: null, publishedAt: 100 },
    ]);
    await upsertItems(otherFeedId, [
      { title: "Theirs", url: "https://y/1", content: null, publishedAt: 200 },
    ]);

    const excluded = await getItemsPage({
      excludeFeedIds: [otherFeedId],
      offset: 0,
      limit: 10,
    });
    expect(excluded.map((i) => i.title)).toEqual(["Mine"]);

    const noOp = await getItemsPage({
      excludeFeedIds: [],
      offset: 0,
      limit: 10,
    });
    expect(noOp.map((i) => i.title).sort()).toEqual(["Mine", "Theirs"]);
  });

  it("paginates sequentially across the full set without gaps or overlap", async () => {
    await upsertItems(feedId, [
      { title: "1", url: "https://x/1", content: null, publishedAt: 100 },
      { title: "2", url: "https://x/2", content: null, publishedAt: 200 },
      { title: "3", url: "https://x/3", content: null, publishedAt: 300 },
      { title: "4", url: "https://x/4", content: null, publishedAt: 400 },
      { title: "5", url: "https://x/5", content: null, publishedAt: 500 },
    ]);

    const page1 = await getItemsPage({ offset: 0, limit: 2 });
    const page2 = await getItemsPage({ offset: 2, limit: 2 });
    const page3 = await getItemsPage({ offset: 4, limit: 2 });

    expect(page1.map((i) => i.title)).toEqual(["5", "4"]);
    expect(page2.map((i) => i.title)).toEqual(["3", "2"]);
    expect(page3.map((i) => i.title)).toEqual(["1"]);

    const all = [...page1, ...page2, ...page3];
    expect(all.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
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

  it("getSavedItemIdsForFeed returns only saved IDs belonging to the given feed", async () => {
    // Arrange: two feeds, each with one item
    const feedId2 = await addFeed({
      title: "Feed 2",
      url: "https://example.com/feed2",
      description: null,
    });
    await upsertItems(feedId, [
      {
        title: "Feed1 Post",
        url: "https://x/f1",
        content: null,
        publishedAt: 1,
      },
    ]);
    await upsertItems(feedId2, [
      {
        title: "Feed2 Post",
        url: "https://x/f2",
        content: null,
        publishedAt: 2,
      },
    ]);
    const [feed1Item] = await getItemsForFeed(feedId);
    const [feed2Item] = await getItemsForFeed(feedId2);
    await savePost(feed1Item, "Feed 1");
    await savePost(feed2Item, "Feed 2");

    // Act
    const idsForFeed1 = await getSavedItemIdsForFeed(feedId);
    const idsForFeed2 = await getSavedItemIdsForFeed(feedId2);

    // Assert: each set contains only its own feed's saved item
    expect(idsForFeed1.has(feed1Item.id)).toBe(true);
    expect(idsForFeed1.has(feed2Item.id)).toBe(false);
    expect(idsForFeed2.has(feed2Item.id)).toBe(true);
    expect(idsForFeed2.has(feed1Item.id)).toBe(false);
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

describe("database.web — read later posts", () => {
  let feedId: number;

  beforeEach(async () => {
    feedId = await addFeed({
      title: "My Feed",
      url: "https://example.com/feed",
      description: null,
    });
  });

  it("starts with no read later posts", async () => {
    // Arrange & Act
    const posts = await getReadLaterPosts();

    // Assert
    expect(posts).toEqual([]);
  });

  it("adds a post and retrieves it", async () => {
    // Arrange
    await upsertItems(feedId, [
      {
        title: "Hello World",
        url: "https://example.com/1",
        content: "<p>Content</p>",
        imageUrl: "https://example.com/img.png",
        publishedAt: 1000,
      },
    ]);
    const item = (await getItemsForFeed(feedId))[0];

    // Act
    await addToReadLater(item, "My Feed");
    const posts = await getReadLaterPosts();

    // Assert
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      item_id: item.id,
      feed_title: "My Feed",
      title: "Hello World",
      url: "https://example.com/1",
      content: "<p>Content</p>",
      image_url: "https://example.com/img.png",
      published_at: 1000,
    });
    expect(typeof posts[0].added_at).toBe("number");
    expect(posts[0].added_at).toBeGreaterThan(0);
  });

  it("does not duplicate a read later post (idempotent add)", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "P", url: "https://x/p", content: null, publishedAt: 1 },
    ]);
    const item = (await getItemsForFeed(feedId))[0];

    // Act
    await addToReadLater(item, "My Feed");
    await addToReadLater(item, "My Feed");

    // Assert
    expect(await getReadLaterPosts()).toHaveLength(1);
  });

  it("removes a post by item_id", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "P", url: "https://x/p", content: null, publishedAt: 1 },
    ]);
    const item = (await getItemsForFeed(feedId))[0];
    await addToReadLater(item, "My Feed");

    // Act
    await removeFromReadLater(item.id);

    // Assert
    expect(await getReadLaterPosts()).toEqual([]);
  });

  it("getReadLaterItemIds returns a set of item IDs", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "A", url: "https://x/a", content: null, publishedAt: 1 },
      { title: "B", url: "https://x/b", content: null, publishedAt: 2 },
    ]);
    const items = await getItemsForFeed(feedId);
    await addToReadLater(items[0], "My Feed");

    // Act
    const ids = await getReadLaterItemIds();

    // Assert
    expect(ids.has(items[0].id)).toBe(true);
    expect(ids.has(items[1].id)).toBe(false);
  });

  it("auto-removes from read later when the item is marked read", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "P", url: "https://x/p", content: null, publishedAt: 1 },
    ]);
    const item = (await getItemsForFeed(feedId))[0];
    await addToReadLater(item, "My Feed");
    expect(await getReadLaterPosts()).toHaveLength(1);

    // Act
    await markItemRead(item.id);

    // Assert
    expect(await getReadLaterPosts()).toEqual([]);
  });

  it("marking an item unread does NOT re-add it to read later", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "P", url: "https://x/p", content: null, publishedAt: 1 },
    ]);
    const item = (await getItemsForFeed(feedId))[0];
    await addToReadLater(item, "My Feed");
    await markItemRead(item.id);

    // Act
    await markItemUnread(item.id);

    // Assert
    expect(await getReadLaterPosts()).toEqual([]);
  });

  it("returns posts sorted by added_at descending", async () => {
    // Arrange
    await upsertItems(feedId, [
      { title: "Older", url: "https://x/old", content: null, publishedAt: 1 },
      { title: "Newer", url: "https://x/new", content: null, publishedAt: 2 },
    ]);
    const items = await getItemsForFeed(feedId);
    const olderItem = items.find((i) => i.title === "Older")!;
    const newerItem = items.find((i) => i.title === "Newer")!;

    const dateSpy = jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000);
    await addToReadLater(olderItem, "My Feed");
    await addToReadLater(newerItem, "My Feed");
    dateSpy.mockRestore();

    // Act
    const posts = await getReadLaterPosts();

    // Assert
    expect(posts[0].title).toBe("Newer");
    expect(posts[1].title).toBe("Older");
  });
});

describe("database.web — tags", () => {
  it("creates and lists tags", async () => {
    // Arrange & Act
    const id = await addTag("News");

    // Assert
    const tags = await getTags();
    expect(tags).toEqual([{ id, name: "News", notify_enabled: 0 }]);
  });

  it("getOrCreateTag returns existing id (case-insensitive)", async () => {
    // Arrange
    const id = await addTag("News");

    // Act
    const sameId = await getOrCreateTag("news");

    // Assert
    expect(sameId.id).toBe(id);
    expect(await getTags()).toHaveLength(1);
  });

  it("rejects duplicate tag names case-insensitively", async () => {
    // Arrange
    await addTag("News");

    // Act + Assert
    await expect(addTag("news")).rejects.toThrow();
  });

  it("updates and deletes tags", async () => {
    // Arrange
    const id = await addTag("Old");

    // Act
    await updateTag(id, "Renamed");

    // Assert
    expect((await getTags())[0].name).toBe("Renamed");

    // Act
    await deleteTag(id);

    // Assert
    expect(await getTags()).toEqual([]);
  });

  it("links feeds to tags via setFeedTags and reads them back", async () => {
    // Arrange
    const feedId = await addFeed({
      title: "F",
      url: "https://example.com/f",
      description: null,
    });
    const tagA = await addTag("A");
    const tagB = await addTag("B");

    // Act
    await setFeedTags(feedId, [tagA, tagB]);

    // Assert
    const tagsForFeed = await getTagsForFeed(feedId);
    expect(tagsForFeed.map((t) => t.id).sort()).toEqual([tagA, tagB].sort());

    const map = await getFeedTagMap();
    expect(map.get(feedId)?.sort()).toEqual([tagA, tagB].sort());

    const feedsForTag = await getFeedsForTag(tagA);
    expect(feedsForTag.map((f) => f.id)).toEqual([feedId]);
  });

  it("setTagFeeds replaces a tag's feed associations", async () => {
    // Arrange
    const f1 = await addFeed({
      title: "F1",
      url: "https://example.com/f1",
      description: null,
    });
    const f2 = await addFeed({
      title: "F2",
      url: "https://example.com/f2",
      description: null,
    });
    const tagId = await addTag("T");
    await setFeedTags(f1, [tagId]);

    // Act
    await setTagFeeds(tagId, [f2]);

    // Assert
    const feedsForTag = await getFeedsForTag(tagId);
    expect(feedsForTag.map((f) => f.id)).toEqual([f2]);
  });

  it("getTagsWithFeedCounts reports number of feeds per tag", async () => {
    // Arrange
    const f1 = await addFeed({
      title: "F1",
      url: "https://example.com/f1",
      description: null,
    });
    const f2 = await addFeed({
      title: "F2",
      url: "https://example.com/f2",
      description: null,
    });
    const tagId = await addTag("News");
    await setFeedTags(f1, [tagId]);
    await setFeedTags(f2, [tagId]);

    // Act
    const result = await getTagsWithFeedCounts();

    // Assert
    expect(result).toEqual([
      { id: tagId, name: "News", notify_enabled: 0, feed_count: 2 },
    ]);
  });

  it("deleting a feed removes its tag associations", async () => {
    // Arrange
    const feedId = await addFeed({
      title: "F",
      url: "https://example.com/f",
      description: null,
    });
    const tagId = await addTag("T");
    await setFeedTags(feedId, [tagId]);

    // Act
    await deleteFeed(feedId);

    // Assert
    expect(await getFeedsForTag(tagId)).toEqual([]);
  });

  it("deleting a tag unlinks it from feeds", async () => {
    // Arrange
    const feedId = await addFeed({
      title: "F",
      url: "https://example.com/f",
      description: null,
    });
    const tagId = await addTag("T");
    await setFeedTags(feedId, [tagId]);

    // Act
    await deleteTag(tagId);

    // Assert
    expect(await getTagsForFeed(feedId)).toEqual([]);
  });

  it("persists show_only_in_tag flag on feeds", async () => {
    // Arrange & Act
    const feedId = await addFeed({
      title: "F",
      url: "https://example.com/f",
      description: null,
      show_only_in_tag: 1,
    });

    // Assert
    expect((await getFeeds())[0].show_only_in_tag).toBe(1);

    // Act
    await updateFeed(feedId, {
      title: "F",
      url: "https://example.com/f",
      use_proxy: 0,
      nsfw: 0,
      show_only_in_tag: 0,
    });

    // Assert
    expect((await getFeeds())[0].show_only_in_tag).toBe(0);
  });

  it("persists show_only_in_custom_feed flag on feeds", async () => {
    // Arrange & Act
    const feedId = await addFeed({
      title: "G",
      url: "https://example.com/g",
      description: null,
      show_only_in_custom_feed: 1,
    });

    // Assert
    expect((await getFeeds())[0].show_only_in_custom_feed).toBe(1);

    // Act
    await updateFeed(feedId, {
      title: "G",
      url: "https://example.com/g",
      use_proxy: 0,
      nsfw: 0,
      show_only_in_tag: 0,
      show_only_in_custom_feed: 0,
    });

    // Assert
    expect((await getFeeds())[0].show_only_in_custom_feed).toBe(0);
  });

  it("persists feed notification settings and unseen-item checkpoint", async () => {
    // Arrange
    const feedId = await addFeed({
      title: "Notify feed",
      url: "https://example.com/notify",
      description: null,
    });
    await upsertItems(feedId, [
      { title: "A", url: "https://x/a", content: null, publishedAt: 1 },
      { title: "B", url: "https://x/b", content: null, publishedAt: 2 },
      { title: "C", url: "https://x/c", content: null, publishedAt: 3 },
    ]);

    // Act
    await setFeedNotificationSettings(feedId, {
      enabled: true,
      frequency: "daily",
    });
    await setFeedNotificationCheckpoint(feedId, 1);
    await setFeedDailyNotificationSentAt(feedId, 1234);

    // Assert
    const feed = (await getFeeds())[0];
    expect(feed.notify_enabled).toBe(1);
    expect(feed.notify_frequency).toBe("daily");
    expect(feed.notify_last_seen_item_id).toBe(1);
    expect(feed.notify_daily_last_sent_at).toBe(1234);
    expect(await getMaxItemIdForFeed(feedId)).toBe(3);

    const unseen = await getUnseenItemsForFeed(feedId, 1, 2);
    expect(unseen.map((item) => item.id)).toEqual([3, 2]);
  });

  it("persists tag notification toggle", async () => {
    // Arrange
    const tagId = await addTag("Alerts");

    // Act
    await setTagNotificationEnabled(tagId, true);

    // Assert
    const tags = await getTags();
    expect(tags[0].notify_enabled).toBe(1);
  });
});

describe("custom feeds", () => {
  async function makeFeed(title: string, url: string) {
    return addFeed({
      title,
      url,
      description: null,
      use_proxy: 0,
      nsfw: 0,
      show_only_in_tag: 0,
    });
  }

  it("creates, lists, and counts members", async () => {
    const f1 = await makeFeed("A", "https://a.example/feed");
    const f2 = await makeFeed("B", "https://b.example/feed");
    const cfId = await addCustomFeed({
      name: "Morning",
      icon: "coffee",
      nsfw: 0,
    });
    await setCustomFeedMembers(cfId, [f1, f2]);

    const list = await getCustomFeeds();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Morning", icon: "coffee", nsfw: 0 });

    const counts = await getCustomFeedsWithMemberCounts();
    expect(counts[0].member_count).toBe(2);

    const members = await getCustomFeedMembers(cfId);
    expect(new Set(members)).toEqual(new Set([f1, f2]));

    const feeds = await getFeedsForCustomFeed(cfId);
    expect(feeds.map((f) => f.id).sort()).toEqual([f1, f2].sort());
  });

  it("setCustomFeedMembers is idempotent and de-duplicates", async () => {
    const f1 = await makeFeed("A", "https://a.example/feed");
    const cfId = await addCustomFeed({ name: "X", icon: "list", nsfw: 0 });
    await setCustomFeedMembers(cfId, [f1, f1, f1]);
    expect(await getCustomFeedMembers(cfId)).toEqual([f1]);
    await setCustomFeedMembers(cfId, [f1, f1]);
    expect(await getCustomFeedMembers(cfId)).toEqual([f1]);
  });

  it("updateCustomFeed changes name/icon/nsfw", async () => {
    const cfId = await addCustomFeed({ name: "Old", icon: "list", nsfw: 0 });
    await updateCustomFeed(cfId, { name: "New", icon: "star", nsfw: 1 });
    const cf = await getCustomFeedById(cfId);
    expect(cf).toMatchObject({ name: "New", icon: "star", nsfw: 1 });
  });

  it("deleteCustomFeed cascades members", async () => {
    const f1 = await makeFeed("A", "https://a.example/feed");
    const cfId = await addCustomFeed({ name: "X", icon: "list", nsfw: 0 });
    await setCustomFeedMembers(cfId, [f1]);
    await deleteCustomFeed(cfId);
    expect(await getCustomFeeds()).toEqual([]);
    expect(await getCustomFeedMembers(cfId)).toEqual([]);
  });

  it("deleting a feed removes it from any custom feed", async () => {
    const f1 = await makeFeed("A", "https://a.example/feed");
    const f2 = await makeFeed("B", "https://b.example/feed");
    const cfId = await addCustomFeed({ name: "X", icon: "list", nsfw: 0 });
    await setCustomFeedMembers(cfId, [f1, f2]);
    await deleteFeed(f1);
    const members = await getCustomFeedMembers(cfId);
    expect(members).toEqual([f2]);
  });

  it("rejects empty names", async () => {
    await expect(
      addCustomFeed({ name: "  ", icon: "list", nsfw: 0 })
    ).rejects.toThrow(/empty/i);
  });

  it("addCustomFeedMember adds a single feed idempotently", async () => {
    // Arrange
    const f1 = await makeFeed("A", "https://a.example/feed");
    const cfId = await addCustomFeed({ name: "X", icon: "list", nsfw: 0 });

    // Act
    await addCustomFeedMember(cfId, f1);
    await addCustomFeedMember(cfId, f1);

    // Assert
    expect(await getCustomFeedMembers(cfId)).toEqual([f1]);
  });

  it("removeCustomFeedMember removes only the given feed and keeps the feed itself", async () => {
    // Arrange
    const f1 = await makeFeed("A", "https://a.example/feed");
    const f2 = await makeFeed("B", "https://b.example/feed");
    const cfId = await addCustomFeed({ name: "X", icon: "list", nsfw: 0 });
    await setCustomFeedMembers(cfId, [f1, f2]);

    // Act
    await removeCustomFeedMember(cfId, f1);

    // Assert
    expect(await getCustomFeedMembers(cfId)).toEqual([f2]);
    expect((await getFeeds()).map((f) => f.id).sort()).toEqual([f1, f2].sort());
  });
});
