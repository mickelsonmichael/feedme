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
  Feed,
  FeedItem,
  FeedItemWithFeed,
  ParsedFeedItem,
  ReadLaterPost,
  SavedPost,
  Tag,
  TagWithFeedCount,
} from "./types";

const STORAGE_KEY = "feedme_db_v1";

type FeedTagRow = { feed_id: number; tag_id: number };

type DbState = {
  feeds: Feed[];
  items: FeedItem[];
  savedPosts: SavedPost[];
  readLaterPosts: ReadLaterPost[];
  tags: Tag[];
  feedTags: FeedTagRow[];
  nextFeedId: number;
  nextItemId: number;
  nextSavedPostId: number;
  nextReadLaterPostId: number;
  nextTagId: number;
};

function normalizeFeed(raw: Feed): Feed {
  return {
    ...raw,
    use_proxy: raw.use_proxy ?? 0,
    nsfw: raw.nsfw ?? 0,
    show_only_in_tag: raw.show_only_in_tag ?? 0,
  };
}

function emptyState(): DbState {
  return {
    feeds: [],
    items: [],
    savedPosts: [],
    readLaterPosts: [],
    tags: [],
    feedTags: [],
    nextFeedId: 1,
    nextItemId: 1,
    nextSavedPostId: 1,
    nextReadLaterPostId: 1,
    nextTagId: 1,
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
        parsed && Array.isArray(parsed.tags) ? (parsed.tags as Tag[]) : [];
      const feedTags =
        parsed && Array.isArray(parsed.feedTags)
          ? (parsed.feedTags as FeedTagRow[])
          : [];
      cachedState = {
        feeds,
        items,
        savedPosts,
        readLaterPosts,
        tags,
        feedTags,
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

export async function addFeed({
  title,
  url,
  description,
  use_proxy,
  nsfw,
  show_only_in_tag,
}: Pick<
  Feed,
  "title" | "url" | "description" | "use_proxy" | "nsfw" | "show_only_in_tag"
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
    "title" | "url" | "use_proxy" | "nsfw" | "show_only_in_tag"
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

export async function getItemCountForFeed(feedId: number): Promise<number> {
  const state = loadState();
  return state.items.reduce((n, i) => (i.feed_id === feedId ? n + 1 : n), 0);
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
  state.tags.push({ id, name: trimmed });
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
  const tag: Tag = { id, name: trimmed };
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
