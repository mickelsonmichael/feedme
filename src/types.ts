export type Feed = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  last_fetched: number | null;
  error: string | null;
};

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
  AddFeed: undefined;
  FeedItems: { feed: Feed };
  FeedDetail: { feedId: number };
  ImportExport: undefined;
};

export type TabParamList = {
  Feed:
    | {
        selectedFeedId?: number;
        selectedFeedTitle?: string;
      }
    | undefined;
  Saved: undefined;
  Feeds: undefined;
  Settings: undefined;
};

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
