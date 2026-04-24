export type Feed = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  last_fetched: number | null;
};

export type FeedItem = {
  id: number;
  feed_id: number;
  title: string;
  url: string | null;
  content: string | null;
  published_at: number | null;
  read: number;
};

export type ParsedFeedItem = {
  title: string;
  url: string | null;
  content: string | null;
  publishedAt: number | null;
};

export type RootStackParamList = {
  FeedList: undefined;
  AddFeed: undefined;
  FeedItems: { feed: Feed };
};
