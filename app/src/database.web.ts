// Web implementation of the database module.
//
// On the web we cannot rely on `expo-sqlite`'s wa-sqlite/OPFS backend: many
// hosting environments (including GitHub Pages) cannot serve the
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers required
// for OPFS, and even when a service-worker shim adds those headers the WASM
// SQLite VFS frequently fails to create files (`cannot create file`), or
// throws `NoModificationAllowedError`. Rather than fighting OPFS we persist
// the small amount of feed metadata we need to `localStorage`.
//
// Metro automatically picks this file (over `database.ts`) when bundling for
// the `web` platform thanks to the `.web.ts` extension.

import {
  CustomFeed,
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
import { isRedditCommentRawXml } from "./redditUtils";

const STORAGE_KEY = "feedme_db_v1";

type FeedTagRow = { feed_id: number; tag_id: number };
type CustomFeedMemberRow = { custom_feed_id: number; feed_id: number };

type ItemViewTimeRow = {
  id: number;
  item_id: number;
  feed_id: number;
  view_start_at: number;
  view_end_at: number | null;
};

type DbState = {
  feeds: Feed[];
  items: FeedItem[];
  savedPosts: SavedPost[];
  /** True when any entry in savedPosts was persisted by an older version that
   *  did not store feed_id.  Computed once at load time; used by
   *  getSavedItemIdsForFeed to decide whether an items-scan fallback is
   *  needed. */
  hasLegacySavedPosts: boolean;
  readLaterPosts: ReadLaterPost[];
  tags: Tag[];
  feedTags: FeedTagRow[];
  customFeeds: CustomFeed[];
  customFeedMembers: CustomFeedMemberRow[];
  itemViewTimes: ItemViewTimeRow[];
  nextFeedId: number;
  nextItemId: number;
  nextSavedPostId: number;
  nextReadLaterPostId: number;
  nextTagId: number;
  nextCustomFeedId: number;
  nextItemViewTimeId: number;
};

function normalizeFeed(raw: Feed): Feed {
  return {
    ...raw,
    use_proxy: raw.use_proxy ?? 0,
    nsfw: raw.nsfw ?? 0,
    show_only_in_tag: raw.show_only_in_tag ?? 0,
    show_only_in_custom_feed: raw.show_only_in_custom_feed ?? 0,
    collapse_repeated: raw.collapse_repeated ?? 0,
    reddit_include_comments: raw.reddit_include_comments ?? 0,
    etag: raw.etag ?? null,
    last_modified: raw.last_modified ?? null,
    // Migration: existing rows persisted before adaptive scheduling existed
    // get next_fetch_at = 0 (eligible immediately) so the first refresh
    // after the upgrade behaves exactly as it did before.
    next_fetch_at: raw.next_fetch_at ?? 0,
    consecutive_failures: raw.consecutive_failures ?? 0,
    fetch_interval_ms: raw.fetch_interval_ms ?? null,
    fetch_success_count: raw.fetch_success_count ?? 0,
    fetch_failure_count: raw.fetch_failure_count ?? 0,
    notify_enabled: raw.notify_enabled ?? 0,
    notify_frequency: raw.notify_frequency ?? "off",
    notify_last_seen_item_id: raw.notify_last_seen_item_id ?? null,
    notify_daily_last_sent_at: raw.notify_daily_last_sent_at ?? null,
    rate_limit_info: raw.rate_limit_info ?? null,
  };
}

function emptyState(): DbState {
  return {
    feeds: [],
    items: [],
    savedPosts: [],
    hasLegacySavedPosts: false,
    readLaterPosts: [],
    tags: [],
    feedTags: [],
    customFeeds: [],
    customFeedMembers: [],
    itemViewTimes: [],
    nextFeedId: 1,
    nextItemId: 1,
    nextSavedPostId: 1,
    nextReadLaterPostId: 1,
    nextTagId: 1,
    nextCustomFeedId: 1,
    nextItemViewTimeId: 1,
  };
}

function isStorageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

// In-memory cache so a single page session doesn't repeatedly parse JSON,
// and so the database still works in environments without `localStorage`
// (e.g. private mode, SSR).
let cachedState: DbState | null = null;

function loadState(): DbState {
  if (cachedState) return cachedState;
  if (!isStorageAvailable()) {
    cachedState = emptyState();
    return cachedState;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DbState> | null;
      const feeds =
        parsed && Array.isArray(parsed.feeds)
          ? (parsed.feeds as Feed[]).map(normalizeFeed)
          : [];
      const items =
        parsed && Array.isArray(parsed.items)
          ? (parsed.items as FeedItem[])
          : [];
      const savedPosts =
        parsed && Array.isArray(parsed.savedPosts)
          ? (parsed.savedPosts as SavedPost[])
          : [];
      const readLaterPosts =
        parsed && Array.isArray(parsed.readLaterPosts)
          ? (parsed.readLaterPosts as ReadLaterPost[])
          : [];
      const tags =
        parsed && Array.isArray(parsed.tags)
          ? (parsed.tags as Tag[]).map((tag) => ({
              ...tag,
              notify_enabled: tag.notify_enabled === 1 ? 1 : 0,
            }))
          : [];
      const feedTags =
        parsed && Array.isArray(parsed.feedTags)
          ? (parsed.feedTags as FeedTagRow[])
          : [];
      const customFeeds =
        parsed && Array.isArray(parsed.customFeeds)
          ? (parsed.customFeeds as CustomFeed[]).map((cf) => ({
              id: cf.id,
              name: cf.name,
              icon: cf.icon || "list",
              nsfw: cf.nsfw === 1 ? 1 : 0,
            }))
          : [];
      const customFeedMembers =
        parsed && Array.isArray(parsed.customFeedMembers)
          ? (parsed.customFeedMembers as CustomFeedMemberRow[])
          : [];
      const itemViewTimes =
        parsed && Array.isArray(parsed.itemViewTimes)
          ? (parsed.itemViewTimes as ItemViewTimeRow[]).filter(
              (r) => r.view_end_at !== null
            )
          : [];
      cachedState = {
        feeds,
        items,
        savedPosts,
        hasLegacySavedPosts: savedPosts.some(
          (p) => p.item_id !== null && p.feed_id == null
        ),
        readLaterPosts,
        tags,
        feedTags,
        customFeeds,
        customFeedMembers,
        itemViewTimes,
        nextFeedId:
          typeof parsed?.nextFeedId === "number" && parsed.nextFeedId > 0
            ? parsed.nextFeedId
            : 1,
        nextItemId:
          typeof parsed?.nextItemId === "number" && parsed.nextItemId > 0
            ? parsed.nextItemId
            : 1,
        nextSavedPostId:
          typeof parsed?.nextSavedPostId === "number" &&
          parsed.nextSavedPostId > 0
            ? parsed.nextSavedPostId
            : 1,
        nextReadLaterPostId:
          typeof parsed?.nextReadLaterPostId === "number" &&
          parsed.nextReadLaterPostId > 0
            ? parsed.nextReadLaterPostId
            : 1,
        nextTagId:
          typeof parsed?.nextTagId === "number" && parsed.nextTagId > 0
            ? parsed.nextTagId
            : Math.max(1, ...tags.map((t) => t.id + 1)),
        nextCustomFeedId:
          typeof parsed?.nextCustomFeedId === "number" &&
          parsed.nextCustomFeedId > 0
            ? parsed.nextCustomFeedId
            : Math.max(1, ...customFeeds.map((c) => c.id + 1)),
        nextItemViewTimeId:
          typeof parsed?.nextItemViewTimeId === "number" &&
          parsed.nextItemViewTimeId > 0
            ? parsed.nextItemViewTimeId
            : Math.max(1, ...itemViewTimes.map((r) => r.id + 1)),
      };
      return cachedState;
    }
  } catch (e) {
    console.warn("[feedme] Failed to parse database from localStorage:", e);
  }
  cachedState = emptyState();
  return cachedState;
}

function saveState(state: DbState): void {
  cachedState = state;
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Quota exceeded or storage disabled — keep working in-memory.
    console.warn("[feedme] Failed to persist database to localStorage:", e);
  }
}

// Test-only helper to reset both the in-memory cache and persisted state.
// Not exported from the native implementation; tests for this module call it
// directly.
export function __resetForTests(): void {
  cachedState = null;
  if (isStorageAvailable()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// ── Feeds ──────────────────────────────────────────────────────────────────

export async function getFeeds(): Promise<Feed[]> {
  const state = loadState();
  return [...state.feeds].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

export async function getFeedById(feedId: number): Promise<Feed | null> {
  const state = loadState();
  const feed = state.feeds.find((entry) => entry.id === feedId);
  return feed ? normalizeFeed(feed) : null;
}

export async function getFeedByUrl(url: string): Promise<Feed | null> {
  const state = loadState();
  const feed = state.feeds.find((entry) => entry.url === url);
  return feed ? normalizeFeed(feed) : null;
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
  reddit_include_comments,
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
  | "reddit_include_comments"
>): Promise<number> {
  const state = loadState();
  if (state.feeds.some((f) => f.url === url)) {
    // Mirror SQLite UNIQUE constraint behaviour.
    throw new Error(`Feed with url "${url}" already exists`);
  }
  const id = state.nextFeedId;
  const feed: Feed = {
    id,
    title,
    url,
    description: description ?? null,
    last_fetched: null,
    error: null,
    use_proxy: use_proxy ?? 0,
    nsfw: nsfw ?? 0,
    show_only_in_tag: show_only_in_tag ?? 0,
    show_only_in_custom_feed: show_only_in_custom_feed ?? 0,
    collapse_repeated: collapse_repeated ?? 0,
    reddit_include_comments: reddit_include_comments ?? 0,
    etag: null,
    last_modified: null,
    next_fetch_at: 0,
    consecutive_failures: 0,
    fetch_interval_ms: null,
    fetch_success_count: 0,
    fetch_failure_count: 0,
    notify_enabled: 0,
    notify_frequency: "off",
    notify_last_seen_item_id: null,
    notify_daily_last_sent_at: null,
  };
  state.feeds.push(feed);
  state.nextFeedId = id + 1;
  saveState(state);
  return id;
}

export async function deleteFeed(feedId: number): Promise<void> {
  const state = loadState();
  state.feeds = state.feeds.filter((f) => f.id !== feedId);
  // ON DELETE CASCADE: drop matching items too.
  state.items = state.items.filter((i) => i.feed_id !== feedId);
  state.feedTags = state.feedTags.filter((ft) => ft.feed_id !== feedId);
  state.customFeedMembers = state.customFeedMembers.filter(
    (m) => m.feed_id !== feedId
  );
  saveState(state);
}

export async function updateFeedLastFetched(feedId: number): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.last_fetched = Date.now();
    saveState(state);
  }
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
    | "reddit_include_comments"
  >
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.title = fields.title;
    feed.url = fields.url;
    feed.use_proxy = fields.use_proxy ?? 0;
    feed.nsfw = fields.nsfw ?? 0;
    feed.show_only_in_tag = fields.show_only_in_tag ?? 0;
    feed.show_only_in_custom_feed = fields.show_only_in_custom_feed ?? 0;
    feed.collapse_repeated = fields.collapse_repeated ?? 0;
    feed.reddit_include_comments = fields.reddit_include_comments ?? 0;
    saveState(state);
  }
}

export async function setFeedError(
  feedId: number,
  error: string | null
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.error = error;
    saveState(state);
  }
}

export async function updateFeedCacheValidators(
  feedId: number,
  etag: string | null,
  lastModified: string | null
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.etag = etag;
    feed.last_modified = lastModified;
    saveState(state);
  }
}

export async function updateFeedRateLimitInfo(
  feedId: number,
  info: string | null
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.rate_limit_info = info;
    saveState(state);
  }
}

export async function setFeedRefreshSuccess(
  feedId: number,
  fetchIntervalMs: number,
  nextFetchAt: number
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.fetch_interval_ms = fetchIntervalMs;
    feed.consecutive_failures = 0;
    feed.next_fetch_at = nextFetchAt;
    saveState(state);
  }
}

export async function setFeedRefreshFailure(
  feedId: number,
  consecutiveFailures: number,
  nextFetchAt: number
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.consecutive_failures = consecutiveFailures;
    feed.next_fetch_at = nextFetchAt;
    saveState(state);
  }
}

export async function recordFeedFetchOutcome(
  feedId: number,
  success: boolean
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (!feed) return;
  if (success) {
    feed.fetch_success_count = (feed.fetch_success_count ?? 0) + 1;
  } else {
    feed.fetch_failure_count = (feed.fetch_failure_count ?? 0) + 1;
  }
  saveState(state);
}

export async function resetStatistics(): Promise<void> {
  const state = loadState();
  for (const feed of state.feeds) {
    feed.fetch_success_count = 0;
    feed.fetch_failure_count = 0;
    feed.consecutive_failures = 0;
  }
  state.itemViewTimes = [];
  saveState(state);
}

export async function setFeedNotificationSettings(
  feedId: number,
  settings: {
    enabled: boolean;
    frequency: "immediate" | "daily" | "off";
  }
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.notify_enabled = settings.enabled ? 1 : 0;
    feed.notify_frequency = settings.frequency;
    saveState(state);
  }
}

export async function setFeedNotificationCheckpoint(
  feedId: number,
  lastSeenItemId: number | null
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.notify_last_seen_item_id = lastSeenItemId;
    saveState(state);
  }
}

export async function setFeedDailyNotificationSentAt(
  feedId: number,
  sentAt: number | null
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.notify_daily_last_sent_at = sentAt;
    saveState(state);
  }
}

export async function getMaxItemIdForFeed(
  feedId: number
): Promise<number | null> {
  const state = loadState();
  let maxId: number | null = null;
  for (const item of state.items) {
    if (item.feed_id !== feedId) continue;
    if (maxId === null || item.id > maxId) {
      maxId = item.id;
    }
  }
  return maxId;
}

export async function getUnseenItemsForFeed(
  feedId: number,
  sinceItemIdExclusive: number,
  limit: number
): Promise<FeedItem[]> {
  const state = loadState();
  return state.items
    .filter((item) => item.feed_id === feedId && item.id > sinceItemIdExclusive)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map((item) => ({ ...item }));
}

export async function getFeedItemWithFeedById(
  itemId: number
): Promise<FeedItemWithFeed | null> {
  const state = loadState();
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return null;
  const feed = state.feeds.find((entry) => entry.id === item.feed_id);
  if (!feed) return null;
  return {
    ...item,
    feed_title: feed.title,
  };
}

export async function getRecentPublishedAtForFeed(
  feedId: number,
  limit: number
): Promise<number[]> {
  const state = loadState();
  const stamps: number[] = [];
  for (const item of state.items) {
    if (item.feed_id === feedId && typeof item.published_at === "number") {
      stamps.push(item.published_at);
    }
  }
  stamps.sort((a, b) => b - a);
  return stamps.slice(0, limit);
}

export async function getItemCountForFeed(feedId: number): Promise<number> {
  const state = loadState();
  return state.items.reduce((n, i) => (i.feed_id === feedId ? n + 1 : n), 0);
}

export async function getAllPublishedAtForFeed(
  feedId: number,
  limit: number = 500
): Promise<number[]> {
  const state = loadState();
  const stamps: number[] = [];
  for (const item of state.items) {
    if (item.feed_id === feedId && typeof item.published_at === "number") {
      stamps.push(item.published_at);
    }
  }
  stamps.sort((a, b) => b - a);
  return stamps.slice(0, limit);
}

// ── Items ──────────────────────────────────────────────────────────────────

export async function getAllItems(): Promise<FeedItemWithFeed[]> {
  const state = loadState();
  const titleByFeedId = new Map(state.feeds.map((f) => [f.id, f.title]));
  return state.items
    .filter((i) => titleByFeedId.has(i.feed_id))
    .map((i) => ({ ...i, feed_title: titleByFeedId.get(i.feed_id) ?? "" }))
    .sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0));
}

export async function getItemsForFeed(feedId: number): Promise<FeedItem[]> {
  const state = loadState();
  return state.items
    .filter((i) => i.feed_id === feedId)
    .map((i) => ({ ...i }))
    .sort((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0));
}

export async function getItemsPage(
  options: ItemsPageOptions
): Promise<FeedItemWithFeed[]> {
  const {
    feedIds,
    excludeFeedIds,
    offset,
    limit,
    order = "newest",
    unreadOnly = false,
  } = options;

  if (feedIds != null && feedIds.length === 0) {
    return [];
  }

  const state = loadState();
  const titleByFeedId = new Map(state.feeds.map((f) => [f.id, f.title]));
  const feedIdSet = feedIds != null ? new Set(feedIds) : null;
  const excludeSet =
    excludeFeedIds != null && excludeFeedIds.length > 0
      ? new Set(excludeFeedIds)
      : null;

  const scoped = state.items
    .filter((i) => titleByFeedId.has(i.feed_id))
    .filter((i) => feedIdSet === null || feedIdSet.has(i.feed_id))
    .filter((i) => excludeSet === null || !excludeSet.has(i.feed_id))
    // Applied before ranking below, so stacked rank 0 is each feed's newest
    // *unread* item — mirrors the `items.read = 0` condition in database.ts.
    .filter((i) => !unreadOnly || !i.read)
    .map((i) => ({ ...i, feed_title: titleByFeedId.get(i.feed_id) ?? "" }))
    .sort(
      (a, b) => (b.published_at ?? 0) - (a.published_at ?? 0) || b.id - a.id
    );

  if (order === "stacked") {
    // Rank-major paging (mirrors the SQL window-function query in
    // database.ts): all rank-0 items (each feed's newest) page out before
    // any feed's rank-1 item, so quiet feeds always make the first page.
    // `scoped` is already newest-first, so per-feed encounter order = rank.
    const rankByItemId = new Map<number, number>();
    const seenPerFeed = new Map<number, number>();
    for (const item of scoped) {
      const rank = seenPerFeed.get(item.feed_id) ?? 0;
      rankByItemId.set(item.id, rank);
      seenPerFeed.set(item.feed_id, rank + 1);
    }
    scoped.sort(
      (a, b) =>
        (rankByItemId.get(a.id) ?? 0) - (rankByItemId.get(b.id) ?? 0) ||
        (b.published_at ?? 0) - (a.published_at ?? 0) ||
        b.id - a.id
    );
  }

  return scoped.slice(offset, offset + limit);
}

export async function upsertItems(
  feedId: number,
  items: ParsedFeedItem[]
): Promise<void> {
  const state = loadState();
  for (const item of items) {
    // Mirror `ON CONFLICT (feed_id, url) DO UPDATE` — but only when `url` is
    // non-null (SQLite does not consider NULLs equal in UNIQUE constraints).
    if (item.url != null) {
      const existing = state.items.find(
        (i) => i.feed_id === feedId && i.url === item.url
      );
      if (existing) {
        existing.title = item.title;
        existing.content = item.content ?? null;
        existing.image_url = item.imageUrl ?? null;
        existing.raw_xml = item.rawXml ?? null;
        existing.published_at = item.publishedAt ?? null;
        continue;
      }
    }

    state.items.push({
      id: state.nextItemId++,
      feed_id: feedId,
      title: item.title,
      url: item.url ?? null,
      content: item.content ?? null,
      image_url: item.imageUrl ?? null,
      raw_xml: item.rawXml ?? null,
      published_at: item.publishedAt ?? null,
      read: 0,
    });
  }
  saveState(state);
}

export async function markItemRead(itemId: number): Promise<void> {
  const state = loadState();
  const item = state.items.find((i) => i.id === itemId);
  if (item) {
    item.read = 1;
  }
  // Read Later items are auto-removed once they've been read.
  state.readLaterPosts = state.readLaterPosts.filter(
    (p) => p.item_id !== itemId
  );
  saveState(state);
}

export async function getItemRawXml(itemId: number): Promise<string | null> {
  const state = loadState();
  const item = state.items.find((i) => i.id === itemId);
  return item?.raw_xml ?? null;
}

/**
 * Deletes previously-stored items for `feedId` that are Reddit comment
 * entries (as opposed to submitted posts). Used to clean up items ingested
 * before the feed's "include comments" setting was turned off, or before the
 * feed's URL was rewritten to the posts-only `/submitted` endpoint — since
 * `upsertItems` never deletes rows on its own, those items would otherwise
 * remain visible forever.
 */
export async function deleteRedditCommentItems(feedId: number): Promise<void> {
  const state = loadState();
  const before = state.items.length;
  state.items = state.items.filter(
    (item) => !(item.feed_id === feedId && isRedditCommentRawXml(item.raw_xml))
  );
  if (state.items.length !== before) {
    saveState(state);
  }
}

export async function markItemUnread(itemId: number): Promise<void> {
  const state = loadState();
  const item = state.items.find((i) => i.id === itemId);
  if (item) {
    item.read = 0;
    saveState(state);
  }
}

export async function getUnreadCount(feedId: number): Promise<number> {
  const state = loadState();
  return state.items.reduce(
    (n, i) => (i.feed_id === feedId && i.read === 0 ? n + 1 : n),
    0
  );
}

// ── Saved Posts ────────────────────────────────────────────────────────────

export async function savePost(
  item: FeedItem,
  feedTitle: string
): Promise<void> {
  const state = loadState();
  // Mirror `ON CONFLICT (item_id) DO NOTHING`
  if (state.savedPosts.some((p) => p.item_id === item.id)) {
    return;
  }
  state.savedPosts.push({
    id: state.nextSavedPostId++,
    item_id: item.id,
    feed_id: item.feed_id,
    feed_title: feedTitle,
    title: item.title,
    url: item.url ?? null,
    content: item.content ?? null,
    published_at: item.published_at ?? null,
    saved_at: Date.now(),
  });
  saveState(state);
}

export async function unsavePost(itemId: number): Promise<void> {
  const state = loadState();
  state.savedPosts = state.savedPosts.filter((p) => p.item_id !== itemId);
  saveState(state);
}

export async function getSavedPosts(): Promise<SavedPost[]> {
  const state = loadState();
  return [...state.savedPosts].sort((a, b) => b.saved_at - a.saved_at);
}

export async function getSavedItemIds(): Promise<Set<number>> {
  const state = loadState();
  return new Set(
    state.savedPosts
      .filter((p) => p.item_id !== null)
      .map((p) => p.item_id as number)
  );
}

export async function getSavedItemIdsForFeed(
  feedId: number
): Promise<Set<number>> {
  const state = loadState();

  // Saved posts written by the current version store feed_id directly, so we
  // can filter without scanning state.items.  hasLegacySavedPosts is computed
  // once at load time so we avoid an O(n) scan on every call here.
  const legacyItemIds = state.hasLegacySavedPosts
    ? new Set(state.items.filter((i) => i.feed_id === feedId).map((i) => i.id))
    : null;

  return new Set(
    state.savedPosts
      .filter((p) => {
        if (p.item_id === null) return false;
        if (p.feed_id != null) return p.feed_id === feedId;
        return legacyItemIds!.has(p.item_id as number);
      })
      .map((p) => p.item_id as number)
  );
}

// ── Read Later Posts ───────────────────────────────────────────────────────

export async function addToReadLater(
  item: FeedItem,
  feedTitle: string
): Promise<void> {
  const state = loadState();
  // Mirror `ON CONFLICT (item_id) DO NOTHING`
  if (state.readLaterPosts.some((p) => p.item_id === item.id)) {
    return;
  }
  state.readLaterPosts.push({
    id: state.nextReadLaterPostId++,
    item_id: item.id,
    feed_title: feedTitle,
    title: item.title,
    url: item.url ?? null,
    content: item.content ?? null,
    image_url: item.image_url ?? null,
    published_at: item.published_at ?? null,
    added_at: Date.now(),
  });
  saveState(state);
}

export async function removeFromReadLater(itemId: number): Promise<void> {
  const state = loadState();
  state.readLaterPosts = state.readLaterPosts.filter(
    (p) => p.item_id !== itemId
  );
  saveState(state);
}

export async function getReadLaterPosts(): Promise<ReadLaterPost[]> {
  const state = loadState();
  return [...state.readLaterPosts].sort((a, b) => b.added_at - a.added_at);
}

export async function getReadLaterItemIds(): Promise<Set<number>> {
  const state = loadState();
  return new Set(
    state.readLaterPosts
      .filter((p) => p.item_id !== null)
      .map((p) => p.item_id as number)
  );
}

// ── Tags ───────────────────────────────────────────────────────────────────

function findTagByName(state: DbState, name: string): Tag | undefined {
  const lower = name.trim().toLowerCase();
  return state.tags.find((t) => t.name.toLowerCase() === lower);
}

export async function getTags(): Promise<Tag[]> {
  const state = loadState();
  return [...state.tags].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function getTagById(tagId: number): Promise<Tag | null> {
  const state = loadState();
  const tag = state.tags.find((entry) => entry.id === tagId);
  return tag
    ? { ...tag, notify_enabled: tag.notify_enabled === 1 ? 1 : 0 }
    : null;
}

export async function getTagsWithFeedCounts(): Promise<TagWithFeedCount[]> {
  const state = loadState();
  return [...state.tags]
    .map((t) => ({
      ...t,
      feed_count: state.feedTags.reduce(
        (n, ft) => (ft.tag_id === t.id ? n + 1 : n),
        0
      ),
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

export async function addTag(name: string): Promise<number> {
  const state = loadState();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  if (findTagByName(state, trimmed)) {
    throw new Error(`Tag "${trimmed}" already exists`);
  }
  const id = state.nextTagId;
  state.tags.push({ id, name: trimmed, notify_enabled: 0 });
  state.nextTagId = id + 1;
  saveState(state);
  return id;
}

export async function getOrCreateTag(name: string): Promise<Tag> {
  const state = loadState();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  const existing = findTagByName(state, trimmed);
  if (existing) return existing;
  const id = state.nextTagId;
  const tag: Tag = { id, name: trimmed, notify_enabled: 0 };
  state.tags.push(tag);
  state.nextTagId = id + 1;
  saveState(state);
  return tag;
}

export async function updateTag(tagId: number, name: string): Promise<void> {
  const state = loadState();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Tag name cannot be empty.");
  }
  const tag = state.tags.find((t) => t.id === tagId);
  if (tag) {
    tag.name = trimmed;
    saveState(state);
  }
}

export async function deleteTag(tagId: number): Promise<void> {
  const state = loadState();
  state.tags = state.tags.filter((t) => t.id !== tagId);
  state.feedTags = state.feedTags.filter((ft) => ft.tag_id !== tagId);
  saveState(state);
}

export async function getTagsForFeed(feedId: number): Promise<Tag[]> {
  const state = loadState();
  const tagIds = new Set(
    state.feedTags.filter((ft) => ft.feed_id === feedId).map((ft) => ft.tag_id)
  );
  return state.tags
    .filter((t) => tagIds.has(t.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

export async function getFeedsForTag(tagId: number): Promise<Feed[]> {
  const state = loadState();
  const feedIds = new Set(
    state.feedTags.filter((ft) => ft.tag_id === tagId).map((ft) => ft.feed_id)
  );
  return state.feeds
    .filter((f) => feedIds.has(f.id))
    .map(normalizeFeed)
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
}

export async function getFeedTagMap(): Promise<Map<number, number[]>> {
  const state = loadState();
  const map = new Map<number, number[]>();
  for (const ft of state.feedTags) {
    const list = map.get(ft.feed_id);
    if (list) list.push(ft.tag_id);
    else map.set(ft.feed_id, [ft.tag_id]);
  }
  return map;
}

export async function setFeedTags(
  feedId: number,
  tagIds: number[]
): Promise<void> {
  const state = loadState();
  const unique = Array.from(new Set(tagIds));
  state.feedTags = state.feedTags.filter((ft) => ft.feed_id !== feedId);
  for (const tagId of unique) {
    if (state.tags.some((t) => t.id === tagId)) {
      state.feedTags.push({ feed_id: feedId, tag_id: tagId });
    }
  }
  saveState(state);
}

export async function setTagFeeds(
  tagId: number,
  feedIds: number[]
): Promise<void> {
  const state = loadState();
  const unique = Array.from(new Set(feedIds));
  state.feedTags = state.feedTags.filter((ft) => ft.tag_id !== tagId);
  for (const feedId of unique) {
    if (state.feeds.some((f) => f.id === feedId)) {
      state.feedTags.push({ feed_id: feedId, tag_id: tagId });
    }
  }
  saveState(state);
}

export async function setTagNotificationEnabled(
  tagId: number,
  enabled: boolean
): Promise<void> {
  const state = loadState();
  const tag = state.tags.find((entry) => entry.id === tagId);
  if (tag) {
    tag.notify_enabled = enabled ? 1 : 0;
    saveState(state);
  }
}

// ── Custom Feeds ──────────────────────────────────────────────────────────

export async function getCustomFeeds(): Promise<CustomFeed[]> {
  const state = loadState();
  return [...state.customFeeds].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function getCustomFeedsWithMemberCounts(): Promise<
  (CustomFeed & { member_count: number })[]
> {
  const state = loadState();
  return [...state.customFeeds]
    .map((cf) => ({
      ...cf,
      member_count: state.customFeedMembers.reduce(
        (n, m) => (m.custom_feed_id === cf.id ? n + 1 : n),
        0
      ),
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

export async function getCustomFeedById(
  customFeedId: number
): Promise<CustomFeed | null> {
  const state = loadState();
  const cf = state.customFeeds.find((entry) => entry.id === customFeedId);
  return cf ? { ...cf } : null;
}

export async function addCustomFeed(fields: {
  name: string;
  icon: string;
  nsfw: number;
}): Promise<number> {
  const state = loadState();
  const trimmed = fields.name.trim();
  if (!trimmed) {
    throw new Error("Custom feed name cannot be empty.");
  }
  const id = state.nextCustomFeedId;
  state.customFeeds.push({
    id,
    name: trimmed,
    icon: fields.icon || "list",
    nsfw: fields.nsfw ? 1 : 0,
  });
  state.nextCustomFeedId = id + 1;
  saveState(state);
  return id;
}

export async function updateCustomFeed(
  customFeedId: number,
  fields: { name: string; icon: string; nsfw: number }
): Promise<void> {
  const state = loadState();
  const trimmed = fields.name.trim();
  if (!trimmed) {
    throw new Error("Custom feed name cannot be empty.");
  }
  const cf = state.customFeeds.find((entry) => entry.id === customFeedId);
  if (cf) {
    cf.name = trimmed;
    cf.icon = fields.icon || "list";
    cf.nsfw = fields.nsfw ? 1 : 0;
    saveState(state);
  }
}

export async function deleteCustomFeed(customFeedId: number): Promise<void> {
  const state = loadState();
  state.customFeeds = state.customFeeds.filter((cf) => cf.id !== customFeedId);
  state.customFeedMembers = state.customFeedMembers.filter(
    (m) => m.custom_feed_id !== customFeedId
  );
  saveState(state);
}

export async function getCustomFeedMembers(
  customFeedId: number
): Promise<number[]> {
  const state = loadState();
  return state.customFeedMembers
    .filter((m) => m.custom_feed_id === customFeedId)
    .map((m) => m.feed_id);
}

export async function setCustomFeedMembers(
  customFeedId: number,
  feedIds: number[]
): Promise<void> {
  const state = loadState();
  const unique = Array.from(new Set(feedIds));
  state.customFeedMembers = state.customFeedMembers.filter(
    (m) => m.custom_feed_id !== customFeedId
  );
  for (const feedId of unique) {
    if (state.feeds.some((f) => f.id === feedId)) {
      state.customFeedMembers.push({
        custom_feed_id: customFeedId,
        feed_id: feedId,
      });
    }
  }
  saveState(state);
}

export async function addCustomFeedMember(
  customFeedId: number,
  feedId: number
): Promise<void> {
  const state = loadState();
  if (!state.feeds.some((f) => f.id === feedId)) return;
  if (
    state.customFeedMembers.some(
      (m) => m.custom_feed_id === customFeedId && m.feed_id === feedId
    )
  ) {
    return;
  }
  state.customFeedMembers.push({
    custom_feed_id: customFeedId,
    feed_id: feedId,
  });
  saveState(state);
}

export async function removeCustomFeedMember(
  customFeedId: number,
  feedId: number
): Promise<void> {
  const state = loadState();
  const before = state.customFeedMembers.length;
  state.customFeedMembers = state.customFeedMembers.filter(
    (m) => !(m.custom_feed_id === customFeedId && m.feed_id === feedId)
  );
  if (state.customFeedMembers.length !== before) {
    saveState(state);
  }
}

export async function getFeedsForCustomFeed(
  customFeedId: number
): Promise<Feed[]> {
  const state = loadState();
  const feedIds = new Set(
    state.customFeedMembers
      .filter((m) => m.custom_feed_id === customFeedId)
      .map((m) => m.feed_id)
  );
  return state.feeds
    .filter((f) => feedIds.has(f.id))
    .map(normalizeFeed)
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
}

// ── Item view times ────────────────────────────────────────────────────────

export async function startItemViewTime(
  itemId: number,
  feedId: number
): Promise<number> {
  const state = loadState();
  const id = state.nextItemViewTimeId;
  state.itemViewTimes.push({
    id,
    item_id: itemId,
    feed_id: feedId,
    view_start_at: Date.now(),
    view_end_at: null,
  });
  state.nextItemViewTimeId = id + 1;
  // Do not persist incomplete sessions — they will be discarded on next load.
  cachedState = state;
  return id;
}

/** Maximum view session duration (30 minutes). Anything longer is capped. */
const MAX_VIEW_TIME_MS = 30 * 60 * 1000;

export async function endItemViewTime(rowId: number): Promise<void> {
  const state = loadState();
  const row = state.itemViewTimes.find(
    (r) => r.id === rowId && r.view_end_at === null
  );
  if (row) {
    row.view_end_at = Math.min(
      Date.now(),
      row.view_start_at + MAX_VIEW_TIME_MS
    );
    saveState(state);
  }
}

export async function getAverageViewTimeForFeed(
  feedId: number
): Promise<number | null> {
  const state = loadState();
  const completed = state.itemViewTimes.filter(
    (r) => r.feed_id === feedId && r.view_end_at !== null
  );
  if (completed.length === 0) return null;
  const total = completed.reduce(
    (sum, r) => sum + (r.view_end_at! - r.view_start_at),
    0
  );
  return total / completed.length;
}
