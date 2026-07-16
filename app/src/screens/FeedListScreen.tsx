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
  startItemViewTime,
  endItemViewTime,
  getItemRawXml,
  addFeed,
  deleteFeed,
  getFeedByUrl,
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
import {
  FeedLoadingScreen,
  PulsingDots,
  RefreshProgressBar,
} from "../components/LoadingState";
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
import { FeedPostCard } from "../components/FeedPostCard";
import { loadConfig, saveConfig } from "../storage";
import { openUrlWithPreference } from "../linkOpening";
import { resolveCustomFeedIcon } from "../customFeedIcons";
import { FeedItemContent, formatDate } from "../components/FeedItemContent";
import { extractRedditAuthor, buildRedditFeedUrl } from "../redditUtils";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { resolveSingleSwipeDirection } from "../singleSwipeDirection";

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
  const isDesktopWeb = isWeb && viewportWidth >= 768;
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
  const [bionicReading, setBionicReading] = useState(
    () => loadConfig().bionicReading ?? false
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
  const [singleActiveIndex, setSingleActiveIndex] = useState(0);
  // Snapshot of visibleItems / the "scope" (everything that legitimately
  // resets singleActiveIndex to 0 — see the effect below) as of the last
  // render where the single-layout resync logic ran. Lets a *silent*
  // visibleItems reload (same scope, new array reference — e.g. a
  // focus-regain re-query picking up a background-sync write) be
  // distinguished from a *deliberate* scope/filter/sort/search/layout
  // change, so the active post can be re-anchored by id only in the former
  // case. See the resync block below the visibleItems memo.
  const [singlePrevVisibleItems, setSinglePrevVisibleItems] = useState<
    FeedItemWithFeed[]
  >([]);
  const [singlePrevScopeKey, setSinglePrevScopeKey] = useState<string | null>(
    null
  );
  const [showSingleMoreMenu, setShowSingleMoreMenu] = useState(false);
  const [singleToolbarHeight, setSingleToolbarHeight] = useState(0);
  const [showSingleFilters, setShowSingleFilters] = useState(false);
  const [singleNsfwRevealed, setSingleNsfwRevealed] = useState(false);
  /** Row ID of the active item_view_times record in single layout.
   *  Persisted as a ref (not state) to avoid triggering re-renders. */
  const singleViewTimeRowIdRef = useRef<number | null>(null);
  const selectedFeedId = route.params?.selectedFeedId;
  const selectedTagId = route.params?.selectedTagId;
  const selectedCustomFeedId = route.params?.selectedCustomFeedId;
  const [customFeedNsfw, setCustomFeedNsfw] = useState(false);
  const [customFeedIcon, setCustomFeedIcon] = useState<string | null>(null);
  const scrollToTopParam = route.params?.scrollToTop;

  const flatListRef = useRef<FlashListRef<CollapsedFeedListRow>>(null);
  const singleScrollRef = useRef<ScrollView | null>(null);
  const pendingScrollToTopRef = useRef(false);
  // Set by pull-to-refresh: request a scroll-to-top when the *refreshed*
  // items commit (loadData's second, post-network commit) rather than when
  // the immediate cached-items commit lands.
  const scrollAfterRefreshRef = useRef(false);
  // Same deal for single layout's "jump to first unread": it must react to
  // the refreshed items, not the interim cached commit.
  const selectUnreadAfterRefreshRef = useRef(false);
  const singleSelectUnreadOnNextItemsRef = useRef(false);
  const singleLastAutoMarkedIdRef = useRef<number | null>(null);
  const markAsReadOnScrollRef = useRef(
    loadConfig().markAsReadOnScroll ?? false
  );

  // Current sort mode, readable from inside loadData/handleLoadMore without
  // retriggering the focus effect (which would kick off a full remote refresh
  // on a simple sort toggle). Kept in sync by the sort-change effect below,
  // which re-queries page 0 locally whenever the mode changes.
  const sortRef = useRef(sort);

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

  const scrollCurrentViewToTop = useCallback(() => {
    if (feedLayout === "single") {
      singleScrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [feedLayout]);

  // Mobile: scroll to top when the Feed tab button is tapped while already focused.
  // animated:false is required for reliability with FlashList: when items have
  // variable heights (card-layout images, expanded compact rows) the animated
  // overscroll gets confused by layout changes as virtualized items are
  // measured on the way up, causing the scroll to stop in chunks partway
  // through. An instant snap always reaches offset 0.
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) {
        scrollCurrentViewToTop();
        setIsFeedScrolled(false);
      }
    });
    return unsubscribe;
  }, [navigation, scrollCurrentViewToTop, setIsFeedScrolled]);

  // Web sidebar: scroll to top when the Feed nav item is pressed while already active
  useEffect(() => {
    if (scrollToTopParam) {
      scrollCurrentViewToTop();
      setIsFeedScrolled(false);
    }
  }, [scrollCurrentViewToTop, scrollToTopParam, setIsFeedScrolled]);

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
      scrollCurrentViewToTop();
    }
  }, [items, scrollCurrentViewToTop]);

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

        // Query the local database for the current scope and commit the
        // results if this loadData call is still the latest one. Returns
        // whether the commit happened.
        const queryAndCommitPage = async (): Promise<boolean> => {
          const [itemData, ids, readLaterIdsLoaded] = await Promise.all([
            getItemsPage({
              feedIds: scopeFeedIds,
              excludeFeedIds,
              offset: 0,
              limit: PAGE_SIZE,
              order: sortRef.current,
            }),
            getSavedItemIds(),
            getReadLaterItemIds(),
          ]);
          if (loadGenerationRef.current !== generation) {
            return false;
          }
          setItems(itemData);
          setHasMore(itemData.length === PAGE_SIZE);
          setSavedIds(ids);
          setReadLaterIds(readLaterIdsLoaded);
          return true;
        };

        // Stale-while-revalidate: always render whatever is cached locally
        // first, so the user sees content immediately instead of staring at a
        // spinner while dozens of network fetches complete. The remote
        // refresh below then updates the list in place when it finishes.
        await queryAndCommitPage();
        setLoading(false);

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
          const feedFailures: Array<{ title: string; error: string }> = [];
          const errors = await refreshFeeds(feedsToRefresh, {
            onProgress: setRefreshProgress,
            force: false,
            concurrency: Platform.OS === "web" ? 6 : 3,
            onFeedFailure: (feed, error) => {
              feedFailures.push({ title: feed.title, error: error.message });
            },
          });
          if (errors > 0) {
            const MAX_SHOWN = 3;
            const details = feedFailures
              .slice(0, MAX_SHOWN)
              .map(({ title, error }) => `\u2022 ${title}: ${error}`)
              .join("\n");
            const overflow =
              feedFailures.length > MAX_SHOWN
                ? `\n\u2026and ${feedFailures.length - MAX_SHOWN} more`
                : "";
            Alert.alert(
              "Refresh",
              `${errors} feed(s) could not be refreshed.\n\n${details}${overflow}`
            );
          }

          if (loadGenerationRef.current === generation) {
            if (scrollAfterRefreshRef.current) {
              scrollAfterRefreshRef.current = false;
              pendingScrollToTopRef.current = true;
            }
            if (selectUnreadAfterRefreshRef.current) {
              selectUnreadAfterRefreshRef.current = false;
              singleSelectUnreadOnNextItemsRef.current = true;
            }
            // Feed rows may have new titles / error states after the refresh.
            const refreshedFeeds = await getFeeds();
            if (loadGenerationRef.current === generation) {
              setFeeds(refreshedFeeds);
            }
            await queryAndCommitPage();
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
      } catch (err) {
        Alert.alert("Error", "Failed to load: " + (err as Error).message);
      } finally {
        scrollAfterRefreshRef.current = false;
        selectUnreadAfterRefreshRef.current = false;
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
        order: sortRef.current,
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
      setBionicReading(config.bionicReading ?? false);
      markAsReadOnScrollRef.current = config.markAsReadOnScroll ?? false;
      if (shouldRefreshOnFocus) {
        setRefreshing(true);
      }
      loadData(shouldRefreshOnFocus);
    }, [loadData, shouldRefreshOnFocus])
  );

  // Re-page from the database when the sort mode changes: pagination order
  // depends on the mode ("stacked" pages rank-major, "newest" pages globally
  // reverse-chronological), so the already-loaded window may not contain the
  // items the new mode should show first. Local re-query only — no network.
  useEffect(() => {
    if (sortRef.current === sort) return;
    sortRef.current = sort;
    loadData(false);
  }, [sort, loadData]);

  const handleRefreshAll = async () => {
    setRetainedUnreadIds(new Set());
    if (feedLayout === "single") {
      selectUnreadAfterRefreshRef.current = true;
      singleLastAutoMarkedIdRef.current = null;
      setSingleActiveIndex(0);
    }
    setRefreshing(true);
    // Ask loadData to scroll to top once the refreshed (post-network) items
    // commit — not when the immediate cached-items commit happens.
    scrollAfterRefreshRef.current = true;
    await loadData(true);
    // animated:false matches the tab-press scroll-to-top behavior; FlashList's
    // animated scroll can stall with variable-height rows.
    setIsFeedScrolled(false);
  };

  const feedDetailsById = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed])),
    [feeds]
  );

  const followedRedditUsers = useMemo(() => {
    const users = new Set<string>();
    for (const feed of feeds) {
      const match = feed.url.match(/reddit\.com\/user\/([^/?#.\s]+)/i);
      if (match) users.add(match[1].toLowerCase());
    }
    return users;
  }, [feeds]);

  const buildFeedItemViewItem = useCallback(
    (item: FeedItemWithFeed): RootStackParamList["FeedItemView"]["item"] => ({
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
    }),
    [customFeedNsfw, feedDetailsById]
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
        item: buildFeedItemViewItem(item),
      });
    },
    [buildFeedItemViewItem, filter, navigation]
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

  const handleFollowAuthor = useCallback(async (id: number) => {
    const item = itemsByIdRef.current.get(id);
    if (!item) return;
    const authorName = extractRedditAuthor(item.content);
    if (!authorName) return;
    const feedUrl = buildRedditFeedUrl(`u/${authorName}`);
    try {
      const existingFeed = await getFeedByUrl(feedUrl);
      if (existingFeed) {
        await deleteFeed(existingFeed.id);
      } else {
        await addFeed({
          title: `Reddit - u/${authorName}`,
          url: feedUrl,
          description: null,
          use_proxy: 0,
          nsfw: 0,
          show_only_in_tag: 0,
          show_only_in_custom_feed: 0,
          collapse_repeated: 0,
          reddit_include_comments: 0,
        });
      }
      const updatedFeeds = await getFeeds();
      setFeeds(updatedFeeds);
    } catch {
      Alert.alert("Error", "Could not update subscription.");
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

  const handleSingleViewXml = useCallback(
    async (id: number) => {
      const item = itemsByIdRef.current.get(id);
      let rawXml: string | null = null;
      try {
        rawXml = await getItemRawXml(id);
      } catch {
        // Fetch failure — navigate anyway to show the empty state
      }
      navigation.navigate("RawXml", {
        rawXml,
        title: item?.title ?? "Raw XML",
      });
    },
    [navigation]
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

  useEffect(() => {
    if (feedLayout !== "single") {
      singleLastAutoMarkedIdRef.current = null;
      return;
    }

    setSingleActiveIndex(0);
  }, [
    feedLayout,
    filter,
    normalizedSearch,
    selectedCustomFeedId,
    selectedFeedId,
    selectedTagId,
    sort,
  ]);

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

  const sortedItems = useMemo(
    () => applySortMode(searchedItems, sort),
    [searchedItems, sort]
  );

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

  // Keep the active post anchored to its identity — not its raw position —
  // across a silent visibleItems reload (focus-regain re-query, background
  // sync landing new items, etc). Without this, singleActiveIndex is pure
  // index arithmetic: if the list gets reordered underneath it (e.g. a new
  // item shifts every other item's rank in "stacked" sort), the index keeps
  // pointing at the same slot but a different post ends up there, and
  // Previous/Next silently walk from the wrong post.
  //
  // This runs as a synchronous state adjustment during render (React's
  // documented "adjusting state when a prop changes" pattern) rather than a
  // useEffect, so that if the index needs correcting, it happens before this
  // render's JSX (built from the stale index) ever commits/paints — an
  // effect-based fix would flash the wrong post for one frame first.
  if (feedLayout === "single") {
    const singleScopeKey = [
      feedLayout,
      filter,
      normalizedSearch,
      selectedCustomFeedId,
      selectedFeedId,
      selectedTagId,
      sort,
    ].join(" ");

    if (singleScopeKey !== singlePrevScopeKey) {
      // Deliberate scope/filter/sort/search/layout change — the reset-to-0
      // effect below owns this transition. Just record the new baseline.
      setSinglePrevScopeKey(singleScopeKey);
      setSinglePrevVisibleItems(visibleItems);
    } else if (
      visibleItems !== singlePrevVisibleItems &&
      !singleSelectUnreadOnNextItemsRef.current
    ) {
      setSinglePrevVisibleItems(visibleItems);

      const prevIndex =
        singlePrevVisibleItems.length === 0
          ? 0
          : Math.min(singleActiveIndex, singlePrevVisibleItems.length - 1);
      const prevActiveItem = singlePrevVisibleItems[prevIndex] ?? null;

      if (prevActiveItem) {
        const resyncedIndex = visibleItems.findIndex(
          (item) => item.id === prevActiveItem.id
        );
        if (resyncedIndex !== -1 && resyncedIndex !== singleActiveIndex) {
          setSingleActiveIndex(resyncedIndex);
        }
        // If not found (deleted/filtered out), leave singleActiveIndex as-is
        // — the clamp effect below handles an out-of-bounds fallback.
      }
    } else if (visibleItems !== singlePrevVisibleItems) {
      setSinglePrevVisibleItems(visibleItems);
    }
  }

  const singleSafeIndex =
    visibleItems.length === 0
      ? 0
      : Math.min(singleActiveIndex, visibleItems.length - 1);
  const currentSingleItem = visibleItems[singleSafeIndex] ?? null;
  const currentSingleViewItem = useMemo(
    () => (currentSingleItem ? buildFeedItemViewItem(currentSingleItem) : null),
    [buildFeedItemViewItem, currentSingleItem]
  );
  const singlePreviousDisabled = singleSafeIndex === 0;
  const singleNextDisabled =
    singleSafeIndex >= visibleItems.length - 1 && !hasMore;
  const isSingleItemNsfw = currentSingleItem
    ? feedDetailsById.get(currentSingleItem.feed_id)?.nsfw === 1 ||
      customFeedNsfw
    : false;
  const singleItemRedditAuthor = currentSingleItem
    ? extractRedditAuthor(currentSingleItem.content)
    : null;
  const singleItemAuthorFollowed = singleItemRedditAuthor
    ? followedRedditUsers.has(singleItemRedditAuthor.toLowerCase())
    : false;

  // Reset the NSFW reveal state whenever the active post changes.
  useEffect(() => {
    setSingleNsfwRevealed(false);
  }, [currentSingleItem?.id]);

  useEffect(() => {
    if (feedLayout !== "single" || visibleItems.length === 0) {
      return;
    }

    const maxIndex = visibleItems.length - 1;
    if (singleActiveIndex > maxIndex) {
      setSingleActiveIndex(maxIndex);
    }
  }, [feedLayout, singleActiveIndex, visibleItems.length]);

  useEffect(() => {
    if (feedLayout !== "single" || !singleSelectUnreadOnNextItemsRef.current) {
      return;
    }

    singleSelectUnreadOnNextItemsRef.current = false;
    const unreadIndex = visibleItems.findIndex((item) => item.read !== 1);
    setSingleActiveIndex(unreadIndex >= 0 ? unreadIndex : 0);
  }, [feedLayout, visibleItems]);

  useEffect(() => {
    if (
      feedLayout !== "single" ||
      !currentSingleItem ||
      singleLastAutoMarkedIdRef.current === currentSingleItem.id
    ) {
      return;
    }

    singleLastAutoMarkedIdRef.current = currentSingleItem.id;
    if (currentSingleItem.read) {
      return;
    }

    if (filter === "unread") {
      setRetainedUnreadIds((prev) => new Set(prev).add(currentSingleItem.id));
    }

    markItemRead(currentSingleItem.id)
      .then(() => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === currentSingleItem.id ? { ...item, read: 1 } : item
          )
        );
        setReadLaterIds((prev) => {
          if (!prev.has(currentSingleItem.id)) return prev;
          const next = new Set(prev);
          next.delete(currentSingleItem.id);
          return next;
        });
      })
      .catch(() => {
        Alert.alert("Error", "Could not update read status.");
      });
  }, [currentSingleItem, feedLayout, filter]);

  useEffect(() => {
    if (
      feedLayout !== "single" ||
      !hasMore ||
      loadingMore ||
      visibleItems.length === 0
    ) {
      return;
    }

    if (singleSafeIndex >= visibleItems.length - 5) {
      handleLoadMore();
    }
  }, [
    feedLayout,
    handleLoadMore,
    hasMore,
    loadingMore,
    singleSafeIndex,
    visibleItems.length,
  ]);

  // Track how long the user views each post in single layout. Start a timer
  // when the active item changes; the timer is ended in handleSingleNext.
  // We use a ref to store the record ID so the effect doesn't need to be
  // listed as a dependency of handleSingleNext.
  // For NSFW posts the timer is deferred until the content is revealed — see
  // the companion effect below.
  useEffect(() => {
    if (feedLayout !== "single" || !currentSingleItem) return;

    // NSFW items: timer starts on reveal, not on navigation. Always reset the
    // ref here so a stale ID from the previous item is never carried over.
    singleViewTimeRowIdRef.current = null;
    if (isSingleItemNsfw) return;

    const itemId = currentSingleItem.id;
    const feedId = currentSingleItem.feed_id;
    let rowId: number | null = null;
    let cancelled = false;

    startItemViewTime(itemId, feedId)
      .then((id) => {
        if (!cancelled) {
          singleViewTimeRowIdRef.current = id;
          rowId = id;
        } else {
          // Component unmounted or item changed before the insert resolved —
          // endItemViewTime is a no-op for records with a NULL end, so we
          // leave the row to be cleaned up on next startup.
        }
      })
      .catch(() => {
        // Non-critical — silently ignore view time failures.
      });

    return () => {
      cancelled = true;
      // Do NOT end the timer on cleanup — only end it when the user
      // explicitly presses Next. If they go back or switch modes the row
      // stays open and will be discarded on next startup.
      singleViewTimeRowIdRef.current = null;
      void rowId; // keep linter happy
    };
  }, [currentSingleItem, feedLayout, isSingleItemNsfw]);

  // For NSFW posts: start the view timer the first time the user reveals the
  // content. The guard on singleViewTimeRowIdRef prevents double-starting if
  // the user toggles visibility off and on again.
  useEffect(() => {
    if (
      feedLayout !== "single" ||
      !currentSingleItem ||
      !isSingleItemNsfw ||
      !singleNsfwRevealed ||
      singleViewTimeRowIdRef.current !== null
    )
      return;

    const itemId = currentSingleItem.id;
    const feedId = currentSingleItem.feed_id;
    let cancelled = false;

    startItemViewTime(itemId, feedId)
      .then((id) => {
        if (!cancelled) {
          singleViewTimeRowIdRef.current = id;
        }
      })
      .catch(() => {
        // Non-critical — silently ignore view time failures.
      });

    return () => {
      cancelled = true;
      // Do NOT null the ref here — the item-change effect above owns that.
    };
  }, [currentSingleItem, feedLayout, isSingleItemNsfw, singleNsfwRevealed]);

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

  const handleSinglePrevious = useCallback(() => {
    if (singleSafeIndex === 0) {
      return;
    }

    setSingleActiveIndex(singleSafeIndex - 1);
    singleScrollRef.current?.scrollTo({ y: 0, animated: false });
    setIsFeedScrolled(false);
  }, [setIsFeedScrolled, singleSafeIndex]);

  const handleSingleNext = useCallback(() => {
    // End the view-time session for the current post before moving on.
    const rowId = singleViewTimeRowIdRef.current;
    if (rowId !== null) {
      singleViewTimeRowIdRef.current = null;
      endItemViewTime(rowId).catch(() => {
        // Non-critical — silently ignore view time failures.
      });
    }

    if (singleSafeIndex < visibleItems.length - 1) {
      setSingleActiveIndex(singleSafeIndex + 1);
      singleScrollRef.current?.scrollTo({ y: 0, animated: false });
      setIsFeedScrolled(false);
      return;
    }

    if (hasMore && !loadingMore) {
      handleLoadMore();
    }
  }, [
    handleLoadMore,
    hasMore,
    loadingMore,
    setIsFeedScrolled,
    singleSafeIndex,
    visibleItems.length,
  ]);

  const singleSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-10, 10])
        .onEnd((e) => {
          const direction = resolveSingleSwipeDirection(
            e.translationX,
            e.translationY,
            e.velocityX
          );
          if (direction === "next") {
            handleSingleNext();
          } else if (direction === "previous") {
            handleSinglePrevious();
          }
        }),
    [handleSingleNext, handleSinglePrevious]
  );

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
      const itemRedditAuthor = extractRedditAuthor(item.content);
      const itemAuthorFollowed = itemRedditAuthor
        ? followedRedditUsers.has(itemRedditAuthor.toLowerCase())
        : undefined;

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
            authorFollowed={itemAuthorFollowed}
            onFollowAuthor={itemRedditAuthor ? handleFollowAuthor : undefined}
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
          authorFollowed={itemAuthorFollowed}
          onFollowAuthor={itemRedditAuthor ? handleFollowAuthor : undefined}
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
      followedRedditUsers,
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
      handleFollowAuthor,
    ]
  );

  // Initial load (before the first cached page lands) and first-ever refresh
  // of an empty library both get the full skeleton treatment.
  if (loading || (refreshing && items.length === 0 && feeds.length > 0)) {
    return <FeedLoadingScreen progress={refreshProgress} />;
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
      {feedLayout !== "single" ? (
        <View
          style={[styles.filterRow, { borderBottomColor: colors.inkFaint }]}
        >
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
      ) : null}

      {feedLayout !== "single" && !isWeb && isSearchVisible ? (
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
            Refreshing {refreshProgress.completed}/{refreshProgress.total}
          </MetaText>
          <View style={styles.progressBarFlex}>
            <RefreshProgressBar progress={refreshProgress} />
          </View>
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
      ) : feedLayout === "single" &&
        currentSingleItem &&
        currentSingleViewItem ? (
        <View style={styles.fill}>
          {/* Fixed toolbar + collapsible filter bar */}
          <View
            onLayout={(e) =>
              setSingleToolbarHeight(e.nativeEvent.layout.height)
            }
          >
            <View
              style={[
                styles.singleToolbar,
                { borderBottomColor: colors.border },
              ]}
            >
              <View style={styles.singleToolbarLeft}>
                <TouchableOpacity
                  onPress={() => setShowSingleMoreMenu((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityLabel="More options"
                  style={styles.singleToolbarButton}
                >
                  <Feather
                    name="more-horizontal"
                    size={22}
                    color={colors.ink}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowSingleFilters((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityLabel={
                    showSingleFilters ? "Hide filters" : "Show filters"
                  }
                  style={styles.singleToolbarButton}
                >
                  <Feather
                    name="sliders"
                    size={22}
                    color={
                      showSingleFilters || hasSearch
                        ? colors.accent
                        : colors.ink
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleOpenOriginalLink(currentSingleItem.id)}
                  activeOpacity={0.7}
                  accessibilityLabel="Open post link"
                  style={styles.singleToolbarButton}
                >
                  <Feather name="external-link" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <View style={styles.singleToolbarRight}>
                <TouchableOpacity
                  onPress={handleSinglePrevious}
                  disabled={singlePreviousDisabled}
                  activeOpacity={0.7}
                  accessibilityLabel="Previous post"
                  style={styles.singleToolbarButton}
                >
                  <Feather
                    name="chevron-left"
                    size={24}
                    color={
                      singlePreviousDisabled ? colors.inkFaint : colors.ink
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSingleNext}
                  disabled={singleNextDisabled}
                  activeOpacity={0.7}
                  accessibilityLabel="Next post"
                  style={styles.singleToolbarButton}
                >
                  <Feather
                    name="chevron-right"
                    size={24}
                    color={singleNextDisabled ? colors.inkFaint : colors.ink}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {showSingleFilters ? (
              <View
                style={[
                  styles.singleFilterBar,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: colors.paperWarm,
                  },
                ]}
              >
                <View style={styles.singleFilterBarControls}>
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
                <View
                  style={[
                    styles.searchRow,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.paper,
                    },
                  ]}
                >
                  <Feather name="search" size={16} color={colors.inkSoft} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.ink }]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search posts"
                    placeholderTextColor={colors.inkSoft}
                    autoCorrect={false}
                    autoCapitalize="none"
                    accessibilityLabel="Search posts"
                  />
                  {searchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setSearchQuery("")}
                      activeOpacity={0.7}
                      accessibilityLabel="Clear search"
                    >
                      <Feather name="x" size={16} color={colors.inkSoft} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {/* Overflow menu */}
          {showSingleMoreMenu ? (
            <TouchableOpacity
              style={[styles.singleMoreOverlay, { top: singleToolbarHeight }]}
              onPress={() => setShowSingleMoreMenu(false)}
              activeOpacity={1}
            >
              <View
                style={[
                  styles.singleMoreMenuContainer,
                  {
                    backgroundColor: colors.paper,
                    borderColor: colors.border,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.singleMoreMenuItem,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    toggleSave(currentSingleItem.id);
                    setShowSingleMoreMenu(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={
                    savedIds.has(currentSingleItem.id)
                      ? "Unsave post"
                      : "Save post"
                  }
                >
                  <Feather
                    name="bookmark"
                    size={16}
                    color={
                      savedIds.has(currentSingleItem.id)
                        ? colors.accent
                        : colors.ink
                    }
                  />
                  <Text
                    style={[
                      styles.singleMoreMenuItemText,
                      {
                        color: savedIds.has(currentSingleItem.id)
                          ? colors.accent
                          : colors.ink,
                      },
                    ]}
                  >
                    {savedIds.has(currentSingleItem.id) ? "Unsave" : "Save"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.singleMoreMenuItem,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    toggleReadLater(currentSingleItem.id);
                    setShowSingleMoreMenu(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={
                    readLaterIds.has(currentSingleItem.id)
                      ? "Remove from Read Later"
                      : "Add to Read Later"
                  }
                >
                  <Feather
                    name="clock"
                    size={16}
                    color={
                      readLaterIds.has(currentSingleItem.id)
                        ? colors.accent
                        : colors.ink
                    }
                  />
                  <Text
                    style={[
                      styles.singleMoreMenuItemText,
                      {
                        color: readLaterIds.has(currentSingleItem.id)
                          ? colors.accent
                          : colors.ink,
                      },
                    ]}
                  >
                    {readLaterIds.has(currentSingleItem.id)
                      ? "Remove from Later"
                      : "Read Later"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.singleMoreMenuItem,
                    { borderBottomColor: colors.border },
                  ]}
                  onPress={() => {
                    toggleRead(currentSingleItem.id);
                    setShowSingleMoreMenu(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={
                    currentSingleItem.read
                      ? "Mark post unread"
                      : "Mark post read"
                  }
                >
                  <Feather
                    name={currentSingleItem.read ? "eye-off" : "eye"}
                    size={16}
                    color={colors.ink}
                  />
                  <Text
                    style={[
                      styles.singleMoreMenuItemText,
                      { color: colors.ink },
                    ]}
                  >
                    {currentSingleItem.read ? "Mark Unread" : "Mark Read"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.singleMoreMenuItem,
                    singleItemRedditAuthor
                      ? { borderBottomColor: colors.border }
                      : null,
                  ]}
                  onPress={() => {
                    handleSingleViewXml(currentSingleItem.id);
                    setShowSingleMoreMenu(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="View raw XML"
                >
                  <Feather name="code" size={16} color={colors.ink} />
                  <Text
                    style={[
                      styles.singleMoreMenuItemText,
                      { color: colors.ink },
                    ]}
                  >
                    View XML
                  </Text>
                </TouchableOpacity>
                {singleItemRedditAuthor ? (
                  <TouchableOpacity
                    style={styles.singleMoreMenuItem}
                    onPress={async () => {
                      const feedUrl = buildRedditFeedUrl(
                        `u/${singleItemRedditAuthor}`
                      );
                      try {
                        const existingFeed = await getFeedByUrl(feedUrl);
                        if (existingFeed) {
                          await deleteFeed(existingFeed.id);
                        } else {
                          await addFeed({
                            title: `Reddit - u/${singleItemRedditAuthor}`,
                            url: feedUrl,
                            description: null,
                            use_proxy: 0,
                            nsfw: 0,
                            show_only_in_tag: 0,
                            show_only_in_custom_feed: 0,
                            collapse_repeated: 0,
                            reddit_include_comments: 0,
                          });
                        }
                        const updatedFeeds = await getFeeds();
                        setFeeds(updatedFeeds);
                      } catch {
                        Alert.alert("Error", "Could not update subscription.");
                      }
                      setShowSingleMoreMenu(false);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel={
                      singleItemAuthorFollowed
                        ? `Unfollow u/${singleItemRedditAuthor}`
                        : `Follow u/${singleItemRedditAuthor}`
                    }
                  >
                    <Feather
                      name={
                        singleItemAuthorFollowed ? "user-minus" : "user-plus"
                      }
                      size={16}
                      color={
                        singleItemAuthorFollowed ? colors.accent : colors.ink
                      }
                    />
                    <Text
                      style={[
                        styles.singleMoreMenuItemText,
                        {
                          color: singleItemAuthorFollowed
                            ? colors.accent
                            : colors.ink,
                        },
                      ]}
                    >
                      {singleItemAuthorFollowed
                        ? "Unfollow User"
                        : "Follow User"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Scrollable content */}
          {(() => {
            const singleScrollView = (
              <ScrollView
                ref={singleScrollRef}
                contentContainerStyle={[
                  styles.content,
                  isDesktopWeb ? styles.desktopContent : null,
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefreshAll}
                    colors={[colors.accent]}
                    tintColor={colors.accent}
                  />
                }
                onScroll={handleScroll}
                scrollEventThrottle={64}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={[
                    styles.singleInner,
                    isDesktopWeb ? styles.singleDesktopInner : null,
                  ]}
                >
                  <View style={styles.singlePostHeader}>
                    <Text
                      style={[styles.singlePostMeta, { color: colors.inkSoft }]}
                    >
                      {currentSingleItem.feed_title} -{" "}
                      {formatDate(currentSingleItem.published_at)}
                    </Text>
                    <Text
                      style={[styles.singlePostTitle, { color: colors.ink }]}
                    >
                      {currentSingleItem.title}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.singlePostSeparator,
                      { backgroundColor: colors.border },
                    ]}
                  />
                  {isSingleItemNsfw ? (
                    <TouchableOpacity
                      onPress={() => setSingleNsfwRevealed((v) => !v)}
                      style={[styles.singleNsfwRevealButton]}
                      activeOpacity={0.7}
                      accessibilityLabel={
                        singleNsfwRevealed
                          ? "Hide NSFW content"
                          : "Reveal NSFW content"
                      }
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.singleNsfwRevealText,
                          { color: colors.inkSoft },
                        ]}
                      >
                        {singleNsfwRevealed ? "Hide NSFW" : "Reveal NSFW"}
                      </Text>
                      <Feather
                        name={
                          singleNsfwRevealed ? "chevron-up" : "chevron-down"
                        }
                        size={16}
                        color={colors.inkSoft}
                      />
                    </TouchableOpacity>
                  ) : null}

                  {isSingleItemNsfw && !singleNsfwRevealed ? (
                    <View style={styles.singleNsfwPlaceholder}>
                      <Feather
                        name="eye-off"
                        size={48}
                        color={colors.inkFaint}
                      />
                      <Text
                        style={[
                          styles.singleNsfwPlaceholderText,
                          { color: colors.inkFaint },
                        ]}
                      >
                        NSFW content hidden
                      </Text>
                    </View>
                  ) : (
                    <FeedItemContent
                      item={currentSingleViewItem}
                      bionicReading={bionicReading}
                      onOpenContentLink={handleOpenContentLink}
                      includeRedditCommentsInLinks
                    />
                  )}
                </View>
              </ScrollView>
            );

            return isWeb ? (
              singleScrollView
            ) : (
              <GestureDetector gesture={singleSwipeGesture}>
                {singleScrollView}
              </GestureDetector>
            );
          })()}
        </View>
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
  return (
    <View style={styles.loadMoreFooter}>
      <PulsingDots />
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
  progressBarFlex: {
    flex: 1,
    alignItems: "flex-end",
    marginLeft: spacing.md,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  singlePostHeader: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  singlePostMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  singlePostTitle: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: fontSize.h2,
    lineHeight: 26,
  },
  singlePostSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  singleInner: {
    width: "100%",
    gap: spacing.lg,
  },
  singleDesktopInner: {
    maxWidth: 920,
  },
  singleToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  singleToolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  singleToolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  singleToolbarButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  singleFilterBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  singleFilterBarControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  singleMoreOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  singleMoreMenuContainer: {
    position: "absolute",
    top: spacing.xs,
    left: spacing.md,
    minWidth: 170,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: "hidden",
    elevation: 3,
  },
  singleMoreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  singleMoreMenuItemText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
  singleNsfwRevealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: "center",
  },
  singleNsfwRevealText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
  },
  singleNsfwPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  singleNsfwPlaceholderText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
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
