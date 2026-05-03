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
};

export type Tag = {
  id: number;
  name: string;
};

export type TagWithFeedCount = Tag & { feed_count: number };

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
  AddFeed: { from?: string } | undefined;
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
    };
  };
  FeedDetail: { feedId: number };
  TagDetail: { tagId?: number; from?: string } | undefined;
  ImportExport: undefined;
  InAppBrowser: { url: string; title?: string };
};

export type TabParamList = {
  Feed:
    | {
        selectedFeedId?: number;
        selectedFeedTitle?: string;
        selectedTagId?: number;
        selectedTagName?: string;
        scrollToTop?: number;
      }
    | undefined;
  Saved: undefined;
  ReadLater: undefined;
  Feeds: undefined;
  Settings: undefined;
  AddFeed: { from?: string } | undefined;
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
    };
  };
  FeedDetail: { feedId: number };
  TagDetail: { tagId?: number; from?: string } | undefined;
  ImportExport: undefined;
  InAppBrowser: { url: string; title?: string };
};

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FEED_LAYOUT_MODES = ["compact", "card"] as const;
export type FeedLayoutMode = (typeof FEED_LAYOUT_MODES)[number];

export const LINK_OPEN_MODES = ["embedded", "external"] as const;
export type LinkOpenMode = (typeof LINK_OPEN_MODES)[number];
