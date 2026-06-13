import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Platform,
  ViewToken,
} from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getFeeds,
  getItemsPage,
  getFeedsForTag,
  getCustomFeedById,
  getCustomFeedMembers,
  markItemRead,
  markItemUnread,
  savePost,
  unsavePost,
  getSavedItemIds,
  addToReadLater,
  removeFromReadLater,
  getReadLaterItemIds,
} from "../database";
import { Feather } from "@expo/vector-icons";
import { refreshFeeds } from "../feedRefresher";
import type { FeedRefreshProgress } from "../feedRefresher";
import {
  FeedLayoutMode,
  Feed,
  FeedItemWithFeed,
  RootStackParamList,
  TabParamList,
} from "../types";
import { toggleExpandedId } from "../expandItemIds";
import { MetaText } from "../components/ui";
import { CompactMenu } from "../components/CompactMenu";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { useHeaderContent } from "../context/HeaderContentContext";
import { useFeedScroll } from "../context/FeedScrollContext";
import { SortMode, applySortMode } from "../sortItems";
import { FilterMode, applyFilter } from "../filterItems";
import {
  type GroupFeedsMode,
  type FeedListRow,
  injectGroupDividers,
  isGroupDivider,
} from "../groupItems";
import {
  type CollapsedFeedListRow,
  applyCollapsedRuns,
  isCollapsedItemRow,
  isCollapsedRunRow,
} from "../collapseRepeated";
import { ExpandedFeedMedia } from "../components/ExpandedFeedMedia";
import { parseContentAndLinks } from "../utils/contentActions";
import { FeedPostCard } from "../components/FeedPostCard";
import { loadConfig, saveConfig } from "../storage";
import { openUrlWithPreference } from "../linkOpening";
import { resolveCustomFeedIcon } from "../customFeedIcons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

const CARD_IMAGE_WIDTH = 100;
const CARD_LAYOUT_WIDTH = 760;
const PAGE_SIZE = 50;

export default function FeedListScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { setHeaderContent, clearHeaderContent } = useHeaderContent();
  const { setIsFeedScrolled } = useFeedScroll();
  const { width: viewportWidth } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const shouldRefreshOnFocus = isWeb;
  const isFocused = useIsFocused();
  const [feedLayout, setFeedLayout] = useState<FeedLayoutMode>(
    () => loadConfig().feedLayout ?? "compact"
  );
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [items, setItems] = useState<FeedItemWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>(() =>
    loadConfig().hideReadByDefault ? "unread" : "all"
  );
  const [sort, setSort] = useState<SortMode>(
    () => loadConfig().defaultSort ?? "stacked"
  );
  const [groupFeeds, setGroupFeeds] = useState<GroupFeedsMode>(
    () => loadConfig().groupFeeds ?? "none"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [readLaterIds, setReadLaterIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [uncollapsedIds, setUncollapsedIds] = useState<Set<number>>(
    () => new Set(loadConfig().uncollapsedItemIds ?? [])
  );
  const [revealedRunIds, setRevealedRunIds] = useState<Set<string>>(
    () => new Set()
  );
  const [revealedNsfwCardIds, setRevealedNsfwCardIds] = useState<Set<number>>(
    new Set()
  );
  const [retainedUnreadIds, setRetainedUnreadIds] = useState<Set<number>>(
    new Set()
  );
  const [refreshProgress, setRefreshProgress] =
    useState<FeedRefreshProgress | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const selectedFeedId = route.params?.selectedFeedId;
  const selectedTagId = route.params?.selectedTagId;
  const selectedCustomFeedId = route.params?.selectedCustomFeedId;
  const [customFeedNsfw, setCustomFeedNsfw] = useState(false);
  const [customFeedIcon, setCustomFeedIcon] = useState<string | null>(null);
  const scrollToTopParam = route.params?.scrollToTop;

  const flatListRef = useRef<FlashListRef<CollapsedFeedListRow>>(null);
  const pendingScrollToTopRef = useRef(false);
  const markAsReadOnScrollRef = useRef(
    loadConfig().markAsReadOnScroll ?? false
  );

  // Stable seed for the stacked-sort RNG. Generated once and reset only when
  // loadData fetches a fresh list from the database. This prevents the random
  // per-feed offsets from being regenerated on every in-place item update (e.g.
  // marking an item as read), which was causing the feed to shuffle on read.
  const sortSeedRef = useRef(Math.random());

  // The feed_id scope (set by loadData) that handleLoadMore re-queries when
  // fetching subsequent pages.
  const scopeRef = useRef<{
    feedIds: number[] | null;
    excludeFeedIds: number[];
  }>({ feedIds: null, excludeFeedIds: [] });

  // Incremented at the start of every loadData call so handleLoadMore can
  // detect and discard a page that resolves after the scope has changed.
  const loadGenerationRef = useRef(0);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 400,
  }).current;

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!markAsReadOnScrollRef.current) return;
      for (const token of viewableItems) {
        const row = token.item as CollapsedFeedListRow;
        if (
          isGroupDivider(row) ||
          isCollapsedItemRow(row) ||
          isCollapsedRunRow(row)
        )
          continue;
        const item = row;
        if (!item.read) {
          setRetainedUnreadIds((prev) => new Set(prev).add(item.id));
          markItemRead(item.id)
            .then(() => {
              setItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, read: 1 } : i))
              );
              // markItemRead auto-removes from Read Later list.
              setReadLaterIds((prev) => {
                if (!prev.has(item.id)) return prev;
                const next = new Set(prev);
                next.delete(item.id);
                return next;
              });
            })
            .catch(() => {});
        }
      }
    },
    []
  );

  // Mobile: scroll to top when the Feed tab button is tapped while already focused.
  // animated:false is required for reliability with FlashList: when items have
  // variable heights (card-layout images, expanded compact rows) the animated
  // overscroll gets confused by layout changes as virtualized items are
  // measured on the way up, causing the scroll to stop in chunks partway
  // through. An instant snap always reaches offset 0.
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        setIsFeedScrolled(false);
      }
    });
    return unsubscribe;
  }, [navigation, setIsFeedScrolled]);

  // Web sidebar: scroll to top when the Feed nav item is pressed while already active
  useEffect(() => {
    if (scrollToTopParam) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      setIsFeedScrolled(false);
    }
  }, [scrollToTopParam, setIsFeedScrolled]);

  // Threshold (in px) past which we consider the feed "scrolled" — used to
  // morph the Feed tab/nav icon into an up-arrow as an affordance for the
  // tap-to-scroll-to-top behavior. Small enough to feel responsive after
  // scrolling roughly one card; large enough to ignore tiny overscrolls.
  const SCROLL_INDICATOR_THRESHOLD = 200;

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = event.nativeEvent.contentOffset.y;
      setIsFeedScrolled(y > SCROLL_INDICATOR_THRESHOLD);
    },
    [setIsFeedScrolled]
  );

  // Reset the scrolled indicator when the screen loses focus so other tabs
  // don't show a stale up-arrow on the Feed button.
  useEffect(() => {
    if (!isFocused) {
      setIsFeedScrolled(false);
    }
  }, [isFocused, setIsFeedScrolled]);

  // Scroll to top after a pull-to-refresh once new items are committed.
  // Calling scrollToOffset immediately after `await loadData()` would fire
  // before React commits the state updates from setItems, so the list can
  // re-render with fresh content and then discard the scroll. Using a flag
  // here defers the scroll until after the next render cycle.
  useEffect(() => {
    if (pendingScrollToTopRef.current) {
      pendingScrollToTopRef.current = false;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [items]);

  const loadData = useCallback(
    async (refreshRemote: boolean) => {
      const generation = ++loadGenerationRef.current;
      try {
        const feedData = await getFeeds();
        setFeeds(feedData);

        // Determine which feeds to refresh AND the item query's scope based
        // on the current selection.
        // Selected single feed -> just that feed.
        // Selected tag -> only feeds tagged with it.
        // Selected custom feed -> only that custom feed's member feeds.
        // Otherwise -> all feeds, excluding ones flagged "show only on tag /
        // custom feeds" from the items query.
        let feedsToRefresh: Feed[] = feedData;
        let cfNsfw = false;
        let scopeFeedIds: number[] | null = null;
        let excludeFeedIds: number[] = [];
        if (selectedFeedId !== undefined) {
          feedsToRefresh = feedData.filter((f) => f.id === selectedFeedId);
          scopeFeedIds = feedsToRefresh.map((f) => f.id);
        } else if (selectedTagId !== undefined) {
          const tagged = await getFeedsForTag(selectedTagId);
          const taggedIds = new Set(tagged.map((f) => f.id));
          feedsToRefresh = feedData.filter((f) => taggedIds.has(f.id));
          scopeFeedIds = feedsToRefresh.map((f) => f.id);
        } else if (selectedCustomFeedId !== undefined) {
          const [cf, members] = await Promise.all([
            getCustomFeedById(selectedCustomFeedId),
            getCustomFeedMembers(selectedCustomFeedId),
          ]);
          const memberIdSet = new Set(members);
          cfNsfw = cf?.nsfw === 1;
          setCustomFeedIcon(cf?.icon ?? null);
          feedsToRefresh = feedData.filter((f) => memberIdSet.has(f.id));
          scopeFeedIds = feedsToRefresh.map((f) => f.id);
        } else {
          setCustomFeedIcon(null);
          excludeFeedIds = feedData
            .filter(
              (f) =>
                f.show_only_in_tag === 1 || f.show_only_in_custom_feed === 1
            )
            .map((f) => f.id);
        }
        setCustomFeedNsfw(cfNsfw);
        scopeRef.current = { feedIds: scopeFeedIds, excludeFeedIds };

        if (!refreshRemote) {
          setRefreshProgress(null);
        } else if (feedsToRefresh.length > 0) {
          setRefreshProgress({
            total: feedsToRefresh.length,
            completed: 0,
            loading: feedsToRefresh.length,
            succeeded: 0,
            failed: 0,
            skipped: 0,
          });
          const errors = await refreshFeeds(feedsToRefresh, {
            onProgress: setRefreshProgress,
            force: false,
          });
          if (errors > 0) {
            Alert.alert("Refresh", `${errors} feed(s) could not be refreshed.`);
          }
        } else {
          setRefreshProgress({
            total: 0,
            completed: 0,
            loading: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
          });
        }

        const [itemData, ids] = await Promise.all([
          getItemsPage({
            feedIds: scopeFeedIds,
            excludeFeedIds,
            offset: 0,
            limit: PAGE_SIZE,
          }),
          getSavedItemIds(),
        ]);
        const readLaterIdsLoaded = await getReadLaterItemIds();

        if (loadGenerationRef.current === generation) {
          // Only regenerate the sort seed on remote refreshes (pull-to-refresh).
          // Keeping the seed stable when re-focusing after navigation (e.g.
          // returning from a detail view) prevents the list from shuffling and
          // makes the just-viewed item stay at its original position.
          if (refreshRemote) {
            sortSeedRef.current = Math.random();
          }
          setItems(itemData);
          setHasMore(itemData.length === PAGE_SIZE);
          setSavedIds(ids);
          setReadLaterIds(readLaterIdsLoaded);
        }
      } catch (err) {
        Alert.alert("Error", "Failed to load: " + (err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setRefreshProgress(null);
      }
    },
    [selectedFeedId, selectedTagId, selectedCustomFeedId]
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const generation = loadGenerationRef.current;
    try {
      const { feedIds, excludeFeedIds } = scopeRef.current;
      const nextPage = await getItemsPage({
        feedIds,
        excludeFeedIds,
        offset: itemsRef.current.length,
        limit: PAGE_SIZE,
      });
      if (loadGenerationRef.current !== generation) return; // scope changed mid-flight
      setItems((prev) => [...prev, ...nextPage]);
      setHasMore(nextPage.length === PAGE_SIZE);
    } catch {
      // onEndReached can fire repeatedly; an alert here would be noisy.
      // hasMore stays true so scrolling again retries.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const config = loadConfig();
      setFeedLayout(config.feedLayout ?? "compact");
      setGroupFeeds(config.groupFeeds ?? "none");
      markAsReadOnScrollRef.current = config.markAsReadOnScroll ?? false;
      if (shouldRefreshOnFocus) {
        setRefreshing(true);
      }
      loadData(shouldRefreshOnFocus);
    }, [loadData, shouldRefreshOnFocus])
  );

  const handleRefreshAll = async () => {
    setRetainedUnreadIds(new Set());
    setRefreshing(true);
    // Set the flag before loadData so the useEffect watching `items` will
    // scroll to top after React commits the freshly loaded items.
    pendingScrollToTopRef.current = true;
    await loadData(true);
    // animated:false matches the tab-press scroll-to-top behavior; FlashList's
    // animated scroll can stall with variable-height rows.
    setIsFeedScrolled(false);
  };

  const feedDetailsById = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed])),
    [feeds]
  );

  // Ref mirrors of frequently-changing state, kept fresh on every render so
  // that the row-action callbacks below can stay referentially stable
  // (empty/near-empty deps). Stable callback identities let FeedPostCard's
  // React.memo actually skip re-renders for rows that haven't changed.
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const itemsByIdRef = useRef(itemsById);
  itemsByIdRef.current = itemsById;

  const savedIdsRef = useRef(savedIds);
  savedIdsRef.current = savedIds;

  const readLaterIdsRef = useRef(readLaterIds);
  readLaterIdsRef.current = readLaterIds;

  const expandedIdsRef = useRef(expandedIds);
  expandedIdsRef.current = expandedIds;

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;

  const handleOpenItem = useCallback(
    (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item) return;

      if (filter === "unread" && !item.read) {
        setRetainedUnreadIds((prev) => new Set(prev).add(item.id));
      }

      navigation.navigate("FeedItemView", {
        item: {
          itemId: item.id,
          title: item.title,
          url: item.url,
          content: item.content,
          imageUrl: item.image_url,
          publishedAt: item.published_at,
          feedTitle: item.feed_title,
          read: item.read,
          useProxy: feedDetailsById.get(item.feed_id)?.use_proxy === 1,
          nsfw: feedDetailsById.get(item.feed_id)?.nsfw === 1 || customFeedNsfw,
        },
      });
    },
    [filter, navigation, feedDetailsById, customFeedNsfw]
  );

  const toggleSave = useCallback(async (id: number) => {
    const item = itemsByIdRef.current.get(id);
    if (!item) return;

    const alreadySaved = savedIdsRef.current.has(id);
    try {
      if (alreadySaved) {
        await unsavePost(id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await savePost(item, item.feed_title);
        setSavedIds((prev) => new Set(prev).add(id));
      }
    } catch (err) {
      Alert.alert("Error", "Could not update saved status.");
    }
  }, []);

  const toggleReadLater = useCallback(async (id: number) => {
    const item = itemsByIdRef.current.get(id);
    if (!item) return;

    const alreadyAdded = readLaterIdsRef.current.has(id);
    try {
      if (alreadyAdded) {
        await removeFromReadLater(id);
        setReadLaterIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await addToReadLater(item, item.feed_title);
        setReadLaterIds((prev) => new Set(prev).add(id));
      }
    } catch {
      Alert.alert("Error", "Could not update read later status.");
    }
  }, []);

  const handleToggleExpand = useCallback(
    async (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item) return;

      const isExpanding = !expandedIdsRef.current.has(id);
      setExpandedIds((prev) => toggleExpandedId(prev, id));
      if (isExpanding && !item.read) {
        if (filter === "unread") {
          setRetainedUnreadIds((prev) => new Set(prev).add(id));
        }

        try {
          await markItemRead(id);
          setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, read: 1 } : i))
          );
          setReadLaterIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch {
          Alert.alert("Error", "Could not update read status.");
        }
      }
    },
    [filter]
  );

  const toggleRead = useCallback(
    async (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item) return;

      try {
        if (item.read) {
          await markItemUnread(id);
          setItems((prev) =>
            prev.map((current) =>
              current.id === id ? { ...current, read: 0 } : current
            )
          );
          setRetainedUnreadIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          return;
        }

        if (filter === "unread") {
          setRetainedUnreadIds((prev) => new Set(prev).add(id));
        }

        await markItemRead(id);
        setItems((prev) =>
          prev.map((current) =>
            current.id === id ? { ...current, read: 1 } : current
          )
        );
        setReadLaterIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        Alert.alert("Error", "Could not update read status.");
      }
    },
    [filter]
  );

  const handleRevealCardMedia = useCallback((id: number) => {
    setRevealedNsfwCardIds((prev) => new Set(prev).add(id));
  }, []);

  // Maximum number of uncollapsed item ids we keep on disk. Old ids age out
  // naturally as items get refreshed and dropped, but cap it so that an
  // unbounded persisted list cannot accumulate over months of usage.
  const UNCOLLAPSED_PERSIST_CAP = 500;

  const handleUncollapseItem = useCallback((id: number) => {
    setUncollapsedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      const ids = Array.from(next);
      const trimmed =
        ids.length > UNCOLLAPSED_PERSIST_CAP
          ? ids.slice(ids.length - UNCOLLAPSED_PERSIST_CAP)
          : ids;
      saveConfig({ uncollapsedItemIds: trimmed });
      return next;
    });
  }, []);

  // Reveal of a compressed-run stub is intentionally session-only: when the
  // user re-opens the app the "first 4 + show more" cap is re-applied so the
  // feed always stays compact.
  const handleRevealRun = useCallback((runKey: string) => {
    setRevealedRunIds((prev) => {
      if (prev.has(runKey)) return prev;
      const next = new Set(prev);
      next.add(runKey);
      return next;
    });
  }, []);

  const handleOpenContentLink = useCallback(
    (url: string) => {
      openUrlWithPreference({ url, navigation });
    },
    [navigation]
  );

  const handleOpenOriginalLink = useCallback(
    async (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item || !item.url) {
        return;
      }

      openUrlWithPreference({ url: item.url, navigation });

      if (!item.read) {
        if (filter === "unread") {
          setRetainedUnreadIds((prev) => new Set(prev).add(id));
        }

        try {
          await markItemRead(id);
          setItems((prev) =>
            prev.map((current) =>
              current.id === id ? { ...current, read: 1 } : current
            )
          );
          setReadLaterIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch {
          // Link was opened; silently ignore read-status update failure.
        }
      }
    },
    [filter, navigation]
  );

  const formatDate = (ts: number | null): string => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  useEffect(() => {
    if (
      (selectedFeedId !== undefined ||
        selectedTagId !== undefined ||
        selectedCustomFeedId !== undefined) &&
      sort === "stacked"
    ) {
      setSort("newest");
    }
  }, [selectedFeedId, selectedTagId, selectedCustomFeedId, sort]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasSearch = normalizedSearch.length > 0;
  const isSearchVisible = mobileSearchOpen || hasSearch;

  // While searching, keep paginating in the background so the search covers
  // the whole scoped dataset rather than just the first page.
  useEffect(() => {
    if (!hasSearch || !hasMore || loadingMore) return;
    handleLoadMore();
  }, [hasSearch, hasMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    setRetainedUnreadIds(new Set());
  }, [filter]);

  const selectedFeedTitle = useMemo(() => {
    if (selectedCustomFeedId !== undefined) {
      return route.params?.selectedCustomFeedName ?? null;
    }
    if (selectedTagId !== undefined) {
      return route.params?.selectedTagName ?? null;
    }
    if (selectedFeedId === undefined) {
      return null;
    }

    return (
      route.params?.selectedFeedTitle ??
      feedDetailsById.get(selectedFeedId)?.title
    );
  }, [
    feedDetailsById,
    route.params?.selectedFeedTitle,
    route.params?.selectedTagName,
    route.params?.selectedCustomFeedName,
    selectedFeedId,
    selectedTagId,
    selectedCustomFeedId,
  ]);

  const searchField = useMemo(
    () => (
      <View
        style={[
          styles.searchRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.paperWarm,
          },
        ]}
      >
        <Feather name="search" size={16} color={colors.inkSoft} />
        <TextInput
          style={[styles.searchInput, { color: colors.ink }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search feeds and post content"
          placeholderTextColor={colors.inkSoft}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search feeds and posts"
        />
        {!isWeb ? (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery("");
              setMobileSearchOpen(false);
            }}
            accessibilityLabel="Close search"
            activeOpacity={0.7}
          >
            <Feather name="x" size={16} color={colors.inkSoft} />
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    [colors, isWeb, searchQuery]
  );

  useEffect(() => {
    if (!isWeb || !isFocused) {
      clearHeaderContent();
      return;
    }

    setHeaderContent(searchField);

    return () => {
      clearHeaderContent();
    };
  }, [clearHeaderContent, isFocused, isWeb, searchField, setHeaderContent]);

  // Building the per-item search haystack is O(n * content) and was previously
  // recomputed on every change to `items` (i.e. every focus return), even when
  // the user wasn't searching. Skip the work entirely unless a search is
  // active — the map only feeds the searched-items filter below.
  const searchHaystacks = useMemo(() => {
    const map = new Map<number, string>();
    if (!hasSearch) return map;
    for (const item of items) {
      const sourceFeed = feedDetailsById.get(item.feed_id);
      const haystack = [
        item.feed_title,
        sourceFeed?.title,
        sourceFeed?.description,
        sourceFeed?.url,
        item.title,
        item.content,
        item.url,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n")
        .toLowerCase();
      map.set(item.id, haystack);
    }
    return map;
  }, [items, feedDetailsById, hasSearch]);

  const searchedItems = useMemo(() => {
    if (!hasSearch) {
      return items;
    }

    return items.filter((item) => {
      const haystack = searchHaystacks.get(item.id) ?? "";
      return haystack.includes(normalizedSearch);
    });
  }, [items, hasSearch, searchHaystacks, normalizedSearch]);

  const sortedItems = useMemo(() => {
    // Build a deterministic LCG RNG from the stable per-session seed so that
    // the stacked sort produces the same feed ordering for every re-render
    // within a session (e.g. after marking an item as read). The seed is only
    // rotated inside loadData, ensuring the order genuinely varies per reload.
    let s = (sortSeedRef.current * 0x100000000) >>> 0;
    const stableRng = () => {
      s = Math.imul(s, 1664525) + 1013904223;
      return (s >>> 0) / 0x100000000;
    };
    return applySortMode(searchedItems, sort, undefined, stableRng);
  }, [searchedItems, sort]);

  const visibleItems = useMemo(() => {
    const filtered = applyFilter(sortedItems, filter, savedIds);
    if (filter !== "unread" || retainedUnreadIds.size === 0) {
      return filtered;
    }

    const filteredIds = new Set(filtered.map((item) => item.id));
    return sortedItems.filter(
      (item) => filteredIds.has(item.id) || retainedUnreadIds.has(item.id)
    );
  }, [sortedItems, filter, savedIds, retainedUnreadIds]);

  // Inject time-bucket group dividers when grouping is active and sort is newest.
  const displayItems = useMemo<CollapsedFeedListRow[]>(() => {
    const withDividers: FeedListRow[] =
      sort === "newest" && groupFeeds !== "none"
        ? injectGroupDividers(visibleItems, groupFeeds)
        : visibleItems;

    // Collapse repeated runs only in the Newest sort — the Stacked sort
    // already interleaves feeds so runs of the same feed are unlikely.
    if (sort !== "newest") return withDividers;

    const collapseFeedIds = new Set<number>();
    for (const feed of feeds) {
      if (feed.collapse_repeated === 1) collapseFeedIds.add(feed.id);
    }
    if (collapseFeedIds.size === 0) return withDividers;

    return applyCollapsedRuns(
      withDividers,
      collapseFeedIds,
      uncollapsedIds,
      revealedRunIds
    );
  }, [visibleItems, sort, groupFeeds, feeds, uncollapsedIds, revealedRunIds]);

  const renderItem = useCallback(
    ({ item }: { item: CollapsedFeedListRow }) => {
      if (isGroupDivider(item)) {
        return (
          <View
            style={[styles.groupDivider, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.groupDividerLabel, { color: colors.inkSoft }]}>
              {item.label}
            </Text>
          </View>
        );
      }

      if (isCollapsedItemRow(item)) {
        const collapsed = item.item;
        const truncated =
          collapsed.title.length > 80
            ? collapsed.title.slice(0, 77).trimEnd() + "…"
            : collapsed.title;
        return (
          <TouchableOpacity
            onPress={() => handleUncollapseItem(collapsed.id)}
            activeOpacity={0.6}
            accessibilityLabel={`Uncollapse: ${collapsed.title}`}
            accessibilityRole="button"
            style={[
              styles.collapsedRow,
              { borderBottomColor: colors.inkFaint },
            ]}
            testID={`collapsed-item-${collapsed.id}`}
          >
            <Feather name="chevron-down" size={14} color={colors.inkFaint} />
            <Text
              style={[styles.collapsedRowText, { color: colors.inkSoft }]}
              numberOfLines={1}
            >
              {truncated}
            </Text>
          </TouchableOpacity>
        );
      }

      if (isCollapsedRunRow(item)) {
        const label = `Show ${item.count} more post${item.count === 1 ? "" : "s"}`;
        return (
          <TouchableOpacity
            onPress={() => handleRevealRun(item.runKey)}
            activeOpacity={0.6}
            accessibilityLabel={label}
            accessibilityRole="button"
            style={[
              styles.collapsedRow,
              { borderBottomColor: colors.inkFaint },
            ]}
            testID={`collapsed-run-${item.runKey}`}
          >
            <Feather name="more-horizontal" size={14} color={colors.inkFaint} />
            <Text
              style={[styles.collapsedRowText, { color: colors.inkSoft }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      }

      const sourceFeed = feedDetailsById.get(item.feed_id);
      const isFeedNsfw = sourceFeed?.nsfw === 1 || customFeedNsfw;
      const feedUseProxy = sourceFeed?.use_proxy === 1;

      if (feedLayout === "card") {
        const cardWidth = Math.min(
          CARD_LAYOUT_WIDTH,
          Math.max(0, viewportWidth - spacing.md * 2)
        );
        return (
          <FeedPostCard
            item={item}
            feedTitle={item.feed_title}
            layout="card"
            nsfw={isFeedNsfw}
            useProxy={feedUseProxy}
            saved={savedIds.has(item.id)}
            readLater={readLaterIds.has(item.id)}
            cardMediaRevealed={revealedNsfwCardIds.has(item.id)}
            cardWidth={cardWidth}
            cardMediaTestID={`card-media-${item.id}`}
            onOpenItem={handleOpenItem}
            onRevealCardMedia={handleRevealCardMedia}
            onToggleRead={toggleRead}
            onToggleSave={toggleSave}
            onToggleReadLater={toggleReadLater}
            onOpenOriginalLink={handleOpenOriginalLink}
            onOpenContentLink={handleOpenContentLink}
          />
        );
      }

      return (
        <FeedPostCard
          item={item}
          feedTitle={item.feed_title}
          layout="compact"
          nsfw={isFeedNsfw}
          useProxy={feedUseProxy}
          saved={savedIds.has(item.id)}
          readLater={readLaterIds.has(item.id)}
          expanded={expandedIds.has(item.id)}
          showExpand
          expandedMediaTestID={`expanded-media-${item.id}`}
          onOpenItem={handleOpenItem}
          onToggleExpand={handleToggleExpand}
          onToggleRead={toggleRead}
          onToggleSave={toggleSave}
          onToggleReadLater={toggleReadLater}
          onOpenOriginalLink={handleOpenOriginalLink}
          onOpenContentLink={handleOpenContentLink}
        />
      );
    },
    [
      colors,
      feedDetailsById,
      customFeedNsfw,
      feedLayout,
      viewportWidth,
      savedIds,
      readLaterIds,
      expandedIds,
      revealedNsfwCardIds,
      handleUncollapseItem,
      handleRevealRun,
      handleOpenItem,
      handleRevealCardMedia,
      toggleRead,
      toggleSave,
      toggleReadLater,
      handleOpenOriginalLink,
      handleOpenContentLink,
      handleToggleExpand,
    ]
  );

  if (loading) {
    const totalLoading = refreshProgress?.total ?? 0;
    const completed = refreshProgress?.completed ?? 0;
    const activeLoading = refreshProgress?.loading ?? totalLoading;

    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingTitle, { color: colors.ink }]}>
          Loading feeds...
        </Text>
        <Text style={[styles.loadingMeta, { color: colors.inkSoft }]}>
          {completed} completed of {totalLoading}
        </Text>
        <Text style={[styles.loadingMeta, { color: colors.inkSoft }]}>
          {activeLoading} still loading
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {selectedFeedTitle ? (
        <View style={[styles.scopeRow, { borderBottomColor: colors.inkFaint }]}>
          <Feather
            name={
              selectedCustomFeedId !== undefined
                ? resolveCustomFeedIcon(customFeedIcon)
                : selectedTagId !== undefined
                  ? "tag"
                  : "rss"
            }
            size={14}
            color={colors.inkSoft}
          />
          <Text style={[styles.scopeText, { color: colors.ink }]}>
            {selectedFeedTitle}
          </Text>
        </View>
      ) : null}

      {/* Compact filter + sort + search controls */}
      <View style={[styles.filterRow, { borderBottomColor: colors.inkFaint }]}>
        <View style={styles.filterControls}>
          <CompactMenu<FilterMode>
            value={filter === "starred" ? "all" : filter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
            ]}
            onChange={setFilter}
            accessibilityLabel="Filter posts"
          />
          {selectedFeedId === undefined &&
          selectedTagId === undefined &&
          selectedCustomFeedId === undefined ? (
            <CompactMenu<SortMode>
              value={sort}
              options={[
                { value: "newest", label: "Newest" },
                { value: "stacked", label: "Stacked" },
              ]}
              onChange={setSort}
              accessibilityLabel="Sort posts"
            />
          ) : (
            <CompactMenu<SortMode>
              value={sort}
              options={[{ value: "newest", label: "Newest" }]}
              onChange={setSort}
              accessibilityLabel="Sort posts"
            />
          )}
        </View>
        {!isWeb ? (
          <TouchableOpacity
            onPress={() => setMobileSearchOpen((open) => !open)}
            accessibilityLabel={
              isSearchVisible ? "Close search" : "Open search"
            }
            activeOpacity={0.7}
            hitSlop={8}
            style={styles.searchIconBtn}
          >
            <Feather
              name="search"
              size={16}
              color={isSearchVisible ? colors.accent : colors.inkSoft}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {!isWeb && isSearchVisible ? (
        <View
          style={[styles.searchWrap, { borderBottomColor: colors.inkFaint }]}
        >
          {searchField}
        </View>
      ) : null}

      {refreshing && refreshProgress && refreshProgress.total > 0 ? (
        <View
          style={[
            styles.refreshProgressRow,
            { borderBottomColor: colors.inkFaint },
          ]}
        >
          <MetaText>
            Refreshing feeds: {refreshProgress.completed}/
            {refreshProgress.total} completed
          </MetaText>
          <View style={styles.progressSpacer} />
          <MetaText>{refreshProgress.loading} loading</MetaText>
        </View>
      ) : null}

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No feeds yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            Add one now or go to settings to import an OPML file
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("AddFeed", { from: "Feed" })}
            style={styles.refreshBtn}
            activeOpacity={0.8}
          >
            <Text style={[styles.refreshBtnText, { color: colors.accent }]}>
              Add Feed +
            </Text>
          </TouchableOpacity>
        </View>
      ) : visibleItems.length === 0 ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.center}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefreshAll}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
        >
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {hasSearch
              ? "No matches found."
              : filter === "unread"
                ? "All caught up!"
                : filter === "starred"
                  ? "No saved items."
                  : "No items yet."}
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            {hasSearch
              ? "Try a different word, feed name, or topic."
              : filter === "unread"
                ? "You have no unread items."
                : filter === "starred"
                  ? "Bookmark items to see them here."
                  : "Pull down to refresh your feeds."}
          </Text>
          {!hasSearch && filter === "all" ? (
            <TouchableOpacity
              onPress={handleRefreshAll}
              disabled={refreshing}
              hitSlop={8}
              style={styles.refreshBtn}
            >
              <Text style={[styles.refreshBtnText, { color: colors.accent }]}>
                Refresh
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <FlashList
          ref={flatListRef}
          data={displayItems}
          keyExtractor={keyExtractor}
          getItemType={(item) =>
            isGroupDivider(item)
              ? "divider"
              : isCollapsedRunRow(item)
                ? "collapsed-run"
                : isCollapsedItemRow(item)
                  ? "collapsed"
                  : "item"
          }
          onRefresh={handleRefreshAll}
          refreshing={refreshing}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={handleViewableItemsChanged}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          contentContainerStyle={[
            styles.list,
            feedLayout === "card" ? styles.cardList : null,
          ]}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? LoadingMoreFooter : null}
        />
      )}
    </View>
  );
}

function isRedditCommentsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!(hostname === "reddit.com" || hostname.endsWith(".reddit.com"))) {
      return false;
    }
    return parsed.pathname.toLowerCase().includes("/comments/");
  } catch {
    return /(?:https?:\/\/)?(?:(?:www|old)\.)?reddit\.com\/.*\/comments\//i.test(
      url
    );
  }
}

const keyExtractor = (item: CollapsedFeedListRow) => {
  if (isGroupDivider(item)) return item.key;
  if (isCollapsedRunRow(item)) return `collapsed-run-${item.runKey}`;
  if (isCollapsedItemRow(item)) return `collapsed-${item.item.id}`;
  return String(item.id);
};

function Separator() {
  return <View style={styles.separator} />;
}

function LoadingMoreFooter() {
  const { colors } = useTheme();
  return (
    <View style={styles.loadMoreFooter}>
      <ActivityIndicator size="small" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  filterControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchIconBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  scopeText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    fontWeight: "600",
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  searchRow: {
    width: "100%",
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    padding: 0,
  },
  refreshProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  progressSpacer: {
    flex: 1,
  },
  loadingTitle: {
    marginTop: spacing.md,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  loadingMeta: {
    marginTop: spacing.xs,
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  groupDivider: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
    borderBottomWidth: 1,
  },
  groupDividerLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapsedRowText: {
    flex: 1,
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontStyle: "italic",
  },
  cardList: {
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  cardLayout: {
    maxWidth: CARD_LAYOUT_WIDTH,
  },
  cardLayoutContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: "row",
  },
  cardImage: {
    width: CARD_IMAGE_WIDTH,
    alignSelf: "stretch",
  },
  cardContent: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sourceText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  metaDot: {
    fontSize: fontSize.meta,
    marginHorizontal: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "700",
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  summary: {
    fontSize: fontSize.body,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  actionMeta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  expandPanel: {
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
  },
  expandContent: {
    fontSize: fontSize.body,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  contentLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  contentLinkBtn: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contentLinkText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
  separator: { height: spacing.sm },
  loadMoreFooter: { paddingVertical: spacing.lg, alignItems: "center" },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  emptySub: {
    fontSize: fontSize.bodyLg,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  refreshBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  refreshBtnText: {
    fontSize: fontSize.bodyLg,
    fontFamily: fonts.body,
  },
});
