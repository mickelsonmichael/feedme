export type Feed = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  last_fetched: number | null;
  error: string | null;
  use_proxy?: number;
  nsfw?: number;
  show_only_in_tag?: number;
  /** When 1, hide this feed's posts from the main "All Feeds" view and the
   *  main FEEDS list on the Feeds screen. Posts still appear when viewing
   *  this feed directly or any custom feed that contains it. Used by feeds
   *  added through a custom feed's "Add Feed" flow so that they don't leak
   *  into the main subscription list. */
  show_only_in_custom_feed?: number;
  /** HTTP `ETag` validator from the last successful refresh, used for
   *  conditional GETs (`If-None-Match`). */
  etag?: string | null;
  /** HTTP `Last-Modified` validator from the last successful refresh, used
   *  for conditional GETs (`If-Modified-Since`). */
  last_modified?: string | null;
  /** Wall-clock ms after which `refreshFeeds` is allowed to re-fetch this
   *  feed when not forced. `0` (the post-migration default) and `null` both
   *  mean "fetch eligible right now". */
  next_fetch_at?: number | null;
  /** Number of refresh attempts in a row that have failed. Reset to 0 on
   *  any successful fetch (200 or 304). Drives the exponential backoff in
   *  `next_fetch_at`. */
  consecutive_failures?: number;
  /** Cumulative count of successful fetch attempts (200 or 304) since the
   *  feed was added. Used by the stats panel on the feed detail screen. */
  fetch_success_count?: number;
  /** Cumulative count of failed fetch attempts (network error, parse error,
   *  or wall-clock timeout) since the feed was added. */
  fetch_failure_count?: number;
  /** Learned base polling interval in ms — the median gap between recent
   *  `published_at` values, clamped to `[15 min, 24 h]`. Null until the
   *  first successful refresh after the migration. */
  fetch_interval_ms?: number | null;
  notify_enabled?: number;
  notify_frequency?: "immediate" | "daily" | "off";
  notify_last_seen_item_id?: number | null;
  notify_daily_last_sent_at?: number | null;
};

export type Tag = {
  id: number;
  name: string;
  notify_enabled?: number;
};

export type TagWithFeedCount = Tag & { feed_count: number };

/** A user-defined "custom feed": a named, filtered view over a subset of the
 *  user's existing feed subscriptions. Subscriptions remain the single source
 *  of truth — refresh state, read/unread, and saved/read-later status are
 *  shared with the main feed and any other custom feed referencing the same
 *  underlying subscription. */
export type CustomFeed = {
  id: number;
  name: string;
  /** Feather icon name. Stored as a string rather than a typed icon name so
   *  the column doesn't need to enumerate every Feather glyph; the UI falls
   *  back to a default if the value isn't a known glyph. */
  icon: string;
  /** When 1, every post viewed inside this custom feed is treated as NSFW
   *  regardless of the underlying subscription's nsfw flag. */
  nsfw: number;
};

export type CustomFeedWithMemberCount = CustomFeed & { member_count: number };

/** Maximum number of tags that can be attached to a single feed. */
export const MAX_TAGS_PER_FEED = 25;

export type FeedItem = {
  id: number;
  feed_id: number;
  title: string;
  url: string | null;
  content: string | null;
  image_url: string | null;
  raw_xml: string | null;
  published_at: number | null;
  read: number;
};

export type FeedItemWithFeed = FeedItem & { feed_title: string };

export type SavedPost = {
  id: number;
  item_id: number | null;
  /** Feed the item belongs to. Stored on web for efficient per-feed filtering;
   *  undefined on native (the SQL query handles scoping). */
  feed_id?: number | null;
  feed_title: string;
  title: string;
  url: string | null;
  content: string | null;
  published_at: number | null;
  saved_at: number;
};

export type ReadLaterPost = {
  id: number;
  item_id: number | null;
  feed_title: string;
  title: string;
  url: string | null;
  content: string | null;
  image_url: string | null;
  published_at: number | null;
  added_at: number;
};

export type ParsedFeedItem = {
  title: string;
  url: string | null;
  content: string | null;
  imageUrl?: string | null;
  rawXml?: string | null;
  publishedAt: number | null;
};

export type RootStackParamList = {
  Tabs: undefined;
  AddFeed: { from?: string; customFeedId?: number } | undefined;
  CustomFeedEdit: { customFeedId?: number; from?: string } | undefined;
  CustomFeedManage: { customFeedId: number; from?: string };
  FeedItems: { feed: Feed };
  FeedItemView: {
    item: {
      itemId: number | null;
      title: string;
      url: string | null;
      content: string | null;
      imageUrl: string | null;
      publishedAt: number | null;
      feedTitle: string;
      read: number;
      useProxy?: boolean;
      nsfw?: boolean;
    };
  };
  FeedDetail: { feedId: number };
  TagDetail: { tagId?: number; from?: string } | undefined;
  ImportExport: undefined;
  InAppBrowser: { url: string; title?: string };
  RawXml: { rawXml: string | null; title?: string };
};

export type TabParamList = {
  Feed:
    | {
        selectedFeedId?: number;
        selectedFeedTitle?: string;
        selectedTagId?: number;
        selectedTagName?: string;
        selectedCustomFeedId?: number;
        selectedCustomFeedName?: string;
        scrollToTop?: number;
      }
    | undefined;
  Saved: undefined;
  ReadLater: undefined;
  Feeds: undefined;
  Discover: undefined;
  FeedSearch: { initialUrl?: string } | undefined;
  Settings: undefined;
  AddFeed: { from?: string; customFeedId?: number } | undefined;
  CustomFeedEdit: { customFeedId?: number; from?: string } | undefined;
  CustomFeedManage: { customFeedId: number; from?: string };
  FeedItems: { feed: Feed };
  FeedItemView: {
    item: {
      itemId: number | null;
      title: string;
      url: string | null;
      content: string | null;
      imageUrl: string | null;
      publishedAt: number | null;
      feedTitle: string;
      read: number;
      useProxy?: boolean;
      nsfw?: boolean;
    };
  };
  FeedDetail: { feedId: number };
  TagDetail: { tagId?: number; from?: string } | undefined;
  ImportExport: undefined;
  InAppBrowser: { url: string; title?: string };
  RawXml: { rawXml: string | null; title?: string };
};

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FEED_LAYOUT_MODES = ["compact", "card"] as const;
export type FeedLayoutMode = (typeof FEED_LAYOUT_MODES)[number];

export const LINK_OPEN_MODES = ["embedded", "external"] as const;
export type LinkOpenMode = (typeof LINK_OPEN_MODES)[number];

export const GROUP_FEEDS_MODES = [
  "none",
  "hourly",
  "daily",
  "weekly",
  "monthly",
] as const;
export type GroupFeedsMode = (typeof GROUP_FEEDS_MODES)[number];
