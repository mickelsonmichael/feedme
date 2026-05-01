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
  SavedPost,
} from "./types";

const STORAGE_KEY = "feedme_db_v1";

type DbState = {
  feeds: Feed[];
  items: FeedItem[];
  savedPosts: SavedPost[];
  nextFeedId: number;
  nextItemId: number;
  nextSavedPostId: number;
};

function normalizeFeed(raw: Feed): Feed {
  return {
    ...raw,
    use_proxy: raw.use_proxy ?? 0,
    nsfw: raw.nsfw ?? 0,
  };
}

function emptyState(): DbState {
  return {
    feeds: [],
    items: [],
    savedPosts: [],
    nextFeedId: 1,
    nextItemId: 1,
    nextSavedPostId: 1,
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
      cachedState = {
        feeds,
        items,
        savedPosts,
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
}: Pick<
  Feed,
  "title" | "url" | "description" | "use_proxy" | "nsfw"
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
  fields: Pick<Feed, "title" | "url" | "use_proxy" | "nsfw">
): Promise<void> {
  const state = loadState();
  const feed = state.feeds.find((f) => f.id === feedId);
  if (feed) {
    feed.title = fields.title;
    feed.url = fields.url;
    feed.use_proxy = fields.use_proxy ?? 0;
    feed.nsfw = fields.nsfw ?? 0;
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
    saveState(state);
  }
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
