import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  AppState,
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
  ActivityIndicator,
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
import { ChompingLoader, FeedLoadingScreen } from "../components/LoadingState";
import { Toast } from "../components/Toast";
import { CompactMenu } from "../components/CompactMenu";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { useHeaderContent } from "../context/HeaderContentContext";
import { useFeedScroll } from "../context/FeedScrollContext";
import { useBackgroundSync } from "../context/BackgroundSyncContext";
import { SortMode, applySortMode } from "../sortItems";
import { FilterMode, applyFilter } from "../filterItems";
import { mergeRetainedItems } from "../mergeRetainedItems";
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
import {
  SingleViewPost,
  SingleViewPostHandle,
} from "../components/SingleViewPost";
import {
  SingleViewPager,
  SingleViewPagerHandle,
  SINGLE_VIEW_WINDOW,
} from "../components/SingleViewPager";
import { extractRedditAuthor, buildRedditFeedUrl } from "../redditUtils";
import {
  prefetchItemMedia,
  SINGLE_VIEW_PREFETCH_AHEAD,
} from "../mediaPrefetch";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

const CARD_IMAGE_WIDTH = 100;
const CARD_LAYOUT_WIDTH = 760;
const PAGE_SIZE = 50;

// How long the very first local read gets before we're willing to put a
// loading screen up. An app restart with cached posts must land on those posts
// plus the background banner — the full loader on the way there reads as "the
// app is loading" all over again, which is precisely what the banner replaces.
//
// Sized against a measured cold start (emulator, dev bundle): the first read
// costs roughly a second, because getDatabase() runs the whole schema
// init/migration pass before getFeeds() and the first page query can even
// begin. This wants to cover that comfortably rather than clip it. A fresh
// install has no cache to find, runs past the window, and still gets the
// loader — followed by a far longer network fetch, so the extra wait to reach
// it is not the part that matters.
const INITIAL_LOAD_GRACE_MS = 1_200;

// Minimum idle time — no refresh and no user activity — before returning to
// the app (AppState -> active) is allowed to trigger another refresh.
// Backgrounding for a moment — switching apps briefly, or opening a link in
// the external browser while mid-read — used to kick off a full refresh
// every time the app came back, even seconds later, which could reshuffle
// the feed out from under a post the user just opened. Per-feed adaptive
// scheduling in refreshFeeds still governs whether any given feed is
// actually contacted once a refresh does run.
const RESUME_REFRESH_IDLE_MS = 15 * 60 * 1_000;

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
  // Whether the initial local read has been slow enough to justify a loading
  // screen — see INITIAL_LOAD_GRACE_MS. `loading` is one-way (it is only ever
  // cleared), so a single mount-time timer covers the whole app session.
  const [initialLoadGraceElapsed, setInitialLoadGraceElapsed] = useState(false);
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
  // Deferred background refresh (mobile app launch, returning to the app from
  // the background, and pull-to-refresh): the cached posts are already on
  // screen, and the network refresh runs behind a slim "Fetching new posts in
  // the background…" banner instead of taking the screen over.
  //
  // Both of these live in a provider above the tab navigator, which renders the
  // banner itself (BackgroundSyncBannerHost). A sync outlives this screen's
  // visibility — leaving for Feeds/Discover/Settings must not make it look like
  // the sync stopped — so the state can't be local to the screen. This screen
  // is still the only writer.
  const {
    syncing: backgroundRefreshing,
    setSyncing: setBackgroundRefreshing,
    progress: refreshProgress,
    setProgress: setRefreshProgress,
  } = useBackgroundSync();
  // Set when a background refresh finished and brought in posts the user isn't
  // seeing yet. Drives the "New posts available. Tap to reload" button; the
  // freshly-queried page waits in pendingRefreshedPageRef until the user taps,
  // so the list is never swapped out from under them.
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const pendingRefreshedPageRef = useRef<{
    items: FeedItemWithFeed[];
    hasMore: boolean;
    pagedCount: number;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Id (not index!) of the post currently active in single layout — null
  // until the render-time lock-in below picks the first available post. An
  // id is the source of truth precisely because it never goes stale the way
  // an index into a reordering/appending array can; see singleSafeIndex,
  // derived fresh from this on every render, below the visibleItems memo.
  const [singleActiveItemId, setSingleActiveItemId] = useState<number | null>(
    null
  );
  // Bumped to rebuild the reader's frozen reading sequence from scratch —
  // only ever for an explicit user action (accepting the "New posts
  // available" page). Scope/filter/sort/search changes rebuild it too, via
  // singleScopeKey; see the singleItems memo.
  const [singleReloadEpoch, setSingleReloadEpoch] = useState(0);
  // Index the reader was last known to be at, so a lookup that somehow fails
  // holds position instead of snapping to the top of the list.
  const singleLastKnownIndexRef = useRef(0);
  // True while the user has swiped past the last locally-loaded post and is
  // waiting on handleLoadMore's DB page fetch to resolve before we can
  // advance. Drives a spinner on the Next control instead of a silent no-op.
  const [singleAwaitingNextPost, setSingleAwaitingNextPost] = useState(false);
  const [showSingleMoreMenu, setShowSingleMoreMenu] = useState(false);
  const [singleToolbarHeight, setSingleToolbarHeight] = useState(0);
  const [showSingleFilters, setShowSingleFilters] = useState(false);
  const selectedFeedId = route.params?.selectedFeedId;
  const selectedTagId = route.params?.selectedTagId;
  const selectedCustomFeedId = route.params?.selectedCustomFeedId;
  const [customFeedNsfw, setCustomFeedNsfw] = useState(false);
  const [customFeedIcon, setCustomFeedIcon] = useState<string | null>(null);
  const scrollToTopParam = route.params?.scrollToTop;

  const flatListRef = useRef<FlashListRef<CollapsedFeedListRow>>(null);
  // Imperative handle of the web reader's single post — used to scroll it
  // back to top for tab-re-tap / pull-to-refresh. On mobile the equivalent
  // goes through singlePagerRef, which owns the active slot.
  const activeSingleViewPostRef = useRef<SingleViewPostHandle | null>(null);
  // The mobile reader's pager (gesture, animation and windowing all live in
  // SingleViewPager). Web renders a single post directly instead.
  const singlePagerRef = useRef<SingleViewPagerHandle | null>(null);
  const pendingScrollToTopRef = useRef(false);
  // Set when committing a stashed page from the "New posts available" banner:
  // single layout must jump to the first unread of the newly-landed items
  // rather than stay anchored to the post being read.
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

  // Current filter mode, for the same reason as sortRef — and paging genuinely
  // depends on it. An unread-only page is queried unread-only (see
  // ItemsPageOptions.unreadOnly); filtering a read-agnostic page client-side
  // instead means a page the user has already read collapses to nothing, and
  // the empty state renders no list, so there is nothing left to page with.
  // Kept in sync by the filter-change effect below.
  const filterRef = useRef(filter);

  // The feed_id scope (set by loadData) that handleLoadMore re-queries when
  // fetching subsequent pages.
  const scopeRef = useRef<{
    feedIds: number[] | null;
    excludeFeedIds: number[];
  }>({ feedIds: null, excludeFeedIds: [] });

  // Incremented at the start of every loadData call so handleLoadMore can
  // detect and discard a page that resolves after the scope has changed.
  const loadGenerationRef = useRef(0);

  // How many of the committed items came from the paged query, which is what
  // the next page's OFFSET has to be counted against. Not the same as
  // items.length once retained-but-read posts are merged in (see
  // mergeRetainedItems): counting those would skip unread posts that were
  // never loaded.
  const pagedCountRef = useRef(0);

  // True only for this component instance's very first focus. Screens in a
  // bottom-tab navigator stay mounted for the app's whole lifetime, so the
  // first focus is the app actually starting up (fresh launch, or relaunch
  // after the process was killed) rather than a tab switch — mobile treats
  // it exactly like a manual pull-to-refresh instead of trusting whatever is
  // still sitting in the local SQLite cache from the last session.
  const isInitialFocusRef = useRef(true);

  // Read from the AppState listener below, which is registered once and must
  // not be torn down and re-registered on every focus/state change.
  const appStateRef = useRef(AppState.currentState);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  // Timestamp of the last time the app was known to be "in use" — either a
  // refresh (cold start, resume sync, manual pull-to-refresh) or the user
  // doing something with the feed (opening a post/link, paging in single
  // layout, scrolling). Gates RESUME_REFRESH_IDLE_MS below: a resume-sync
  // only makes sense after real inactivity, not after a moment spent reading.
  // Without folding activity in here too, opening a post's external link —
  // which backgrounds and immediately re-foregrounds the app — would look
  // exactly like "the user was away" and yank the feed out from under them
  // mid-read.
  const lastActiveAtRef = useRef(0);

  // Records that the user is actively using the app right now. Threaded
  // through the handlers below rather than tracked automatically so it only
  // fires on deliberate interaction, not passive re-renders.
  const markActivity = useCallback(() => {
    lastActiveAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => setInitialLoadGraceElapsed(true),
      INITIAL_LOAD_GRACE_MS
    );
    return () => clearTimeout(timer);
  }, []);

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
      singlePagerRef.current?.scrollToTop();
      activeSingleViewPostRef.current?.scrollToTop();
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
      markActivity();
    },
    [markActivity, setIsFeedScrolled]
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

  // True while a deferred (banner-backed) refresh is running. Set in loadData
  // so every deferred path is covered: cold start, app resume, pull-to-refresh.
  const backgroundSyncInFlightRef = useRef(false);

  const loadData = useCallback(
    async (
      refreshRemote: boolean,
      deferNewItems = false,
      // Bypass per-feed adaptive scheduling. Set only for a refresh the user
      // explicitly asked for: without it, pulling to refresh shortly after a
      // sync skips every feed still in backoff and returns instantly, so
      // nothing fetches and no banner is ever seen — the refresh silently does
      // nothing. Matches FeedItemsScreen's explicit-refresh behaviour. Host
      // 429 rate limits are checked separately in refreshFeeds and are NOT
      // bypassed by this.
      forceRemote = false
    ) => {
      const generation = ++loadGenerationRef.current;
      // Tracked for every deferred refresh, not just the app-resume one, so
      // that re-focusing the Feed tab mid-sync can tell a sync is still running
      // and leave it alone.
      if (deferNewItems) {
        backgroundSyncInFlightRef.current = true;
      }
      // Any non-deferred load (sort change, scope change, tab switch, manual
      // refresh) supersedes a pending background result — its stashed page was
      // queried for a scope/sort that may no longer apply, so drop it and hide
      // the button rather than let a stale reload lurk.
      if (!deferNewItems) {
        pendingRefreshedPageRef.current = null;
        setNewPostsAvailable(false);
        setBackgroundRefreshing(false);
      }
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
        // results if this loadData call is still the latest one. Returns the
        // number of items committed, or null if this call was superseded.
        //
        // When `defer` is true (any commit belonging to a background refresh
        // that has posts on screen to defer from), genuinely new posts are
        // stashed in pendingRefreshedPageRef and surfaced via the "New posts
        // available" button rather than committed into the visible list — the
        // user keeps reading the cached posts until they choose to reload.
        // Saved/read-later sets and (if unchanged) the item list still commit
        // immediately.
        const queryAndCommitPage = async (
          defer = false
        ): Promise<number | null> => {
          // Re-query as many items as are already committed, not just the
          // first page. This commit *replaces* the list wholesale, so asking
          // for PAGE_SIZE while the user has paged further in silently throws
          // away everything past item 50 — which, in the single-post reader,
          // deletes the very post being read out from under them and drops
          // the reader back to the top of the list.
          const pageLimit = Math.max(PAGE_SIZE, pagedCountRef.current);
          const unreadOnly = filterRef.current === "unread";
          const [page, ids, readLaterIdsLoaded] = await Promise.all([
            getItemsPage({
              feedIds: scopeFeedIds,
              excludeFeedIds,
              offset: 0,
              limit: pageLimit,
              order: sortRef.current,
              unreadOnly,
            }),
            getSavedItemIds(),
            getReadLaterItemIds(),
          ]);
          if (loadGenerationRef.current !== generation) {
            return null;
          }
          // An unread-only page excludes posts the user read moments ago —
          // including the ones retainedUnreadIds is deliberately holding on
          // screen so the row under the user's thumb doesn't evaporate the
          // instant mark-as-read-on-scroll fires. Carry those back in from the
          // committed list; visibleItems still decides whether to show them.
          const itemData =
            unreadOnly && retainedUnreadIdsRef.current.size > 0
              ? mergeRetainedItems(
                  page,
                  itemsRef.current,
                  retainedUnreadIdsRef.current
                )
              : page;
          // Paging offsets count query-sourced rows only, so carried-over
          // retained items can't push the next page's offset past unread
          // posts that were never loaded.
          const pagedCount = page.length;
          const morePages = pagedCount === pageLimit;
          setSavedIds(ids);
          setReadLaterIds(readLaterIdsLoaded);
          if (defer) {
            const currentIds = new Set(itemsRef.current.map((i) => i.id));
            const hasNewPosts = itemData.some((i) => !currentIds.has(i.id));
            if (hasNewPosts) {
              pendingRefreshedPageRef.current = {
                items: itemData,
                hasMore: morePages,
                pagedCount,
              };
              setNewPostsAvailable(true);
              return itemData.length;
            }
            // Nothing new arrived — fall through and commit in place so any
            // read-state / content edits from the refresh are still picked up
            // without bothering the user with a reload button.
          }
          pagedCountRef.current = pagedCount;
          setItems(itemData);
          setHasMore(morePages);
          return itemData.length;
        };

        // Stale-while-revalidate: always render whatever is cached locally
        // first, so the user sees content immediately instead of staring at a
        // spinner while dozens of network fetches complete. The remote
        // refresh below then updates the list in place when it finishes.
        //
        // On a deferred refresh where posts are *already* on screen (returning
        // to a backgrounded app), this first commit has to respect the
        // hold-back too: the local DB may already contain newer posts — from
        // the background sync task, or from a previous deferred refresh the
        // user hasn't accepted yet — and committing them here would push them
        // under the reader, which is exactly what the banner exists to prevent.
        const deferFirstQuery = deferNewItems && itemsRef.current.length > 0;
        const firstPageCount = await queryAndCommitPage(deferFirstQuery);
        const committedFirstPage = firstPageCount !== null;

        // Cold-start edge case: the local cache had nothing for this scope
        // yet (fresh install, or the background sync task hasn't run since
        // install). Mobile normally only refreshes on an explicit
        // pull-to-refresh (see refreshRemote/shouldRefreshOnFocus above), so
        // without this the user would land on the empty state and need to
        // manually refresh to ever see content. Force a remote refresh in
        // that case, same as a manual refresh would.
        const forceRefreshEmptyCache =
          committedFirstPage &&
          firstPageCount === 0 &&
          feedsToRefresh.length > 0;

        // Defer new posts behind the "New posts available" button only when we
        // actually rendered cached posts to defer *from*. A first-ever load
        // with an empty cache has nothing to show, so it keeps the full-screen
        // loader and commits in place instead.
        const willDefer =
          deferNewItems &&
          committedFirstPage &&
          !forceRefreshEmptyCache &&
          (firstPageCount ?? 0) > 0;

        // Only clear the skeleton if this call's page actually committed —
        // if a newer loadData call has already superseded this one, letting
        // this stale call clear `loading` would hide the skeleton before the
        // newer call's items have landed. When forcing a refresh of an empty
        // cache, keep the skeleton up until that refresh lands instead of
        // flashing the empty state first.
        if (committedFirstPage && !forceRefreshEmptyCache) {
          setLoading(false);
        }

        if (!refreshRemote && !forceRefreshEmptyCache) {
          setRefreshProgress(null);
        } else if (feedsToRefresh.length > 0) {
          if (forceRefreshEmptyCache) {
            setRefreshing(true);
          }
          // Any refresh running with posts already on screen announces itself
          // in the banner — cold start, app resume, web focus, and an explicit
          // pull-to-refresh alike. Tying this to `willDefer` meant a manual
          // refresh in the single-post reader showed nothing at all beyond the
          // pull spinner, which is inconsistent for no good reason. Only a
          // refresh with nothing to show falls through to the full loader.
          if (
            committedFirstPage &&
            !forceRefreshEmptyCache &&
            (firstPageCount ?? 0) > 0
          ) {
            setBackgroundRefreshing(true);
          }
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
            force: forceRemote,
            concurrency: Platform.OS === "web" ? 6 : 3,
          });
          // Keep this lightweight \u2014 just the count \u2014 since the per-feed
          // reason is already persisted to `feed.error` and surfaced in full
          // on the Feeds screen. A stale (superseded) call shouldn't pop a
          // toast about a refresh the user can no longer see the result of.
          if (errors > 0 && loadGenerationRef.current === generation) {
            setToastMessage(
              `${errors} feed${errors === 1 ? "" : "s"} could not be refreshed.`
            );
          }

          if (loadGenerationRef.current === generation) {
            // Feed rows may have new titles / error states after the refresh.
            const refreshedFeeds = await getFeeds();
            if (loadGenerationRef.current === generation) {
              setFeeds(refreshedFeeds);
            }
            await queryAndCommitPage(willDefer);
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
        if (loadGenerationRef.current === generation) {
          Alert.alert("Error", "Failed to load: " + (err as Error).message);
        }
      } finally {
        // A superseded call must not touch shared UI state on its way out —
        // doing so can clear `refreshing`/`loading` for the newer, still
        // in-flight call before its items have committed, leaving the screen
        // on the empty state until that call eventually finishes.
        if (deferNewItems) {
          backgroundSyncInFlightRef.current = false;
        }
        if (loadGenerationRef.current === generation) {
          setLoading(false);
          setRefreshing(false);
          setRefreshProgress(null);
          setBackgroundRefreshing(false);
        }
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
        offset: pagedCountRef.current,
        limit: PAGE_SIZE,
        order: sortRef.current,
        unreadOnly: filterRef.current === "unread",
      });
      if (loadGenerationRef.current !== generation) return; // scope changed mid-flight
      pagedCountRef.current += nextPage.length;
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
      const layout = config.feedLayout ?? "compact";
      setFeedLayout(layout);
      setGroupFeeds(config.groupFeeds ?? "none");
      setBionicReading(config.bionicReading ?? false);
      markAsReadOnScrollRef.current = config.markAsReadOnScroll ?? false;
      const isAppStart = isInitialFocusRef.current;
      isInitialFocusRef.current = false;
      const refreshRemote = shouldRefreshOnFocus || isAppStart;
      // Mobile cold start: render the cached posts right away and pull new
      // ones in behind a background banner, then offer a "New posts available"
      // button. This applies to every layout, single-post reader included —
      // that's the layout where an unannounced mid-read list swap is most
      // disruptive, and the button's "reset" is exactly what a reader wants
      // once the sync lands.
      const deferNewItems = isAppStart && !shouldRefreshOnFocus;
      // Coming back to the Feed tab while a background sync is still running:
      // leave it alone. This re-read is non-deferred, so it would clear the
      // banner and bump the load generation, making the running sync's results
      // get discarded on arrival — the user would watch the banner vanish and
      // never get the "New posts available" button. The sync commits its own
      // fresh page when it lands, so there is nothing to re-read here anyway.
      if (backgroundSyncInFlightRef.current && !deferNewItems) {
        return;
      }
      if (refreshRemote && !deferNewItems) {
        setRefreshing(true);
      }
      if (refreshRemote) {
        lastActiveAtRef.current = Date.now();
      }
      loadData(refreshRemote, deferNewItems);
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

  // Re-page from the database when the filter changes, for the same reason as
  // the sort effect above: the unread filter is part of the page query, so the
  // already-loaded window is the wrong set of rows for the new mode. Toggling
  // to Unread has to re-query or the list would show only whichever of the
  // loaded posts happen to be unread — nothing at all, once the user has read
  // the top of their feed. Local re-query only — no network.
  useEffect(() => {
    if (filterRef.current === filter) return;
    filterRef.current = filter;
    loadData(false);
  }, [filter, loadData]);

  // Commit the posts a background refresh stashed, then reset the feed to the
  // freshest content. Driven by the "New posts available" button, and
  // deliberately mirrors where a completed manual refresh leaves the user:
  // scrolled to the top in the list layouts, parked on the first unread post
  // in the single-post reader.
  const handleShowNewPosts = useCallback(() => {
    const pending = pendingRefreshedPageRef.current;
    pendingRefreshedPageRef.current = null;
    setNewPostsAvailable(false);
    if (pending) {
      if (feedLayout === "single") {
        // The tap *is* the request to move, so this is the one commit that
        // gets to rebuild the reader's frozen sequence from the new page.
        // The flag drives the jump-to-first-unread effect once it lands.
        setSingleReloadEpoch((epoch) => epoch + 1);
        singleSelectUnreadOnNextItemsRef.current = true;
        singleLastAutoMarkedIdRef.current = null;
      }
      // Defer the scroll-to-top until the new items actually commit (same
      // reasoning as the pull-to-refresh scroll — see pendingScrollToTopRef).
      pendingScrollToTopRef.current = true;
      pagedCountRef.current = pending.pagedCount;
      setItems(pending.items);
      setHasMore(pending.hasMore);
    }
    setIsFeedScrolled(false);
  }, [feedLayout, setIsFeedScrolled]);

  // Returning to the app after it was backgrounded is, from the user's point
  // of view, the same event as launching it — but the tab navigator keeps this
  // screen mounted, so useFocusEffect never re-fires and nothing would sync at
  // all. Run the same deferred background refresh here: banner while it works,
  // "New posts available" when it lands, posts readable throughout.
  // Web is excluded — it already revalidates via shouldRefreshOnFocus.
  useEffect(() => {
    if (shouldRefreshOnFocus) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        nextState !== "active" ||
        appStateRef.current === "active" ||
        backgroundSyncInFlightRef.current
      ) {
        appStateRef.current = nextState;
        return;
      }
      appStateRef.current = nextState;
      if (!isFocusedRef.current) return;

      // Idle gate: skip a resume sync unless the app has genuinely been left
      // alone — no refresh and no user activity — for a while. See
      // RESUME_REFRESH_IDLE_MS.
      if (Date.now() - lastActiveAtRef.current < RESUME_REFRESH_IDLE_MS) {
        return;
      }
      lastActiveAtRef.current = Date.now();

      // refreshFeeds still honours per-feed adaptive scheduling (force:false),
      // so a quick app-switch round trip costs nothing on the wire.
      // loadData owns backgroundSyncInFlightRef for the whole deferred run.
      loadData(true, true);
    });

    return () => subscription.remove();
  }, [loadData, shouldRefreshOnFocus]);

  const handleRefreshAll = async () => {
    // A manual refresh supersedes any pending background result — its stashed
    // page was queried before this fetch, so drop it and re-stash below.
    pendingRefreshedPageRef.current = null;
    setNewPostsAvailable(false);
    setRetainedUnreadIds(new Set());
    // A manual refresh just did the job an automatic resume sync would have —
    // postpone the next one so it doesn't immediately re-fire behind it.
    markActivity();
    // Deliberately *not* done here: setRefreshing(true), the scroll-to-top
    // request, and the single-reader index reset. Holding RefreshControl's
    // spinner up for the whole sync pins the reader in a "loading" state for
    // as long as it takes every feed to answer — with 44 feeds that is tens of
    // seconds of a spinner and a feed that jumps out from under you the moment
    // it ends. A pull is a request to *fetch*, not to be interrupted: the
    // spinner retracts immediately, the banner reports progress, prev/next and
    // swiping stay live, and the feed only moves when the user taps "New posts
    // available". Forced so feeds still in backoff are actually fetched.
    await loadData(true, true, true);
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

  // Cached by item identity, which is what makes the reader's memoised post
  // subtrees actually hold: a fresh object here would change every mounted
  // slot's `item` prop on every render of this screen, and this screen
  // re-renders constantly (refresh progress alone ticks once per feed). The
  // cache is rebuilt whenever the feed metadata it folds in changes, so
  // there's nothing stale to invalidate.
  const feedItemViewItemCache = useMemo(
    () =>
      new WeakMap<
        FeedItemWithFeed,
        RootStackParamList["FeedItemView"]["item"]
      >(),
    [customFeedNsfw, feedDetailsById]
  );
  const buildFeedItemViewItem = useCallback(
    (item: FeedItemWithFeed): RootStackParamList["FeedItemView"]["item"] => {
      const cached = feedItemViewItemCache.get(item);
      if (cached) return cached;

      const built = {
        itemId: item.id,
        title: item.title,
        url: item.url,
        content: item.content,
        imageUrl: item.image_url,
        publishedAt: item.published_at,
        feedTitle: item.feed_title,
        feedUrl: feedDetailsById.get(item.feed_id)?.url ?? null,
        read: item.read,
        useProxy: feedDetailsById.get(item.feed_id)?.use_proxy === 1,
        nsfw: feedDetailsById.get(item.feed_id)?.nsfw === 1 || customFeedNsfw,
      };
      feedItemViewItemCache.set(item, built);
      return built;
    },
    [customFeedNsfw, feedDetailsById, feedItemViewItemCache]
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

  const feedDetailsByIdRef = useRef(feedDetailsById);
  feedDetailsByIdRef.current = feedDetailsById;

  const savedIdsRef = useRef(savedIds);
  savedIdsRef.current = savedIds;

  const retainedUnreadIdsRef = useRef(retainedUnreadIds);
  retainedUnreadIdsRef.current = retainedUnreadIds;

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

      markActivity();
      navigation.navigate("FeedItemView", {
        item: buildFeedItemViewItem(item),
      });
    },
    [buildFeedItemViewItem, filter, markActivity, navigation]
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
        const originFeed = feedDetailsByIdRef.current.get(item.feed_id);
        await addFeed({
          title: `Reddit - u/${authorName}`,
          url: feedUrl,
          description: null,
          use_proxy: 0,
          nsfw: originFeed?.nsfw === 1 ? 1 : 0,
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
      markActivity();
      openUrlWithPreference({ url, navigation });
    },
    [markActivity, navigation]
  );

  const handleOpenOriginalLink = useCallback(
    async (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item || !item.url) {
        return;
      }

      markActivity();
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
    [filter, markActivity, navigation]
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

  useEffect(() => {
    if (
      (selectedFeedId !== undefined ||
        selectedTagId !== undefined ||
        selectedCustomFeedId !== undefined) &&
      sort === "stacked"
    ) {
      // Keep sortRef in lockstep with this programmatic flip so the
      // sort-change effect above doesn't mistake it for a user-initiated
      // toggle and fire a redundant re-page on top of the initial load.
      sortRef.current = "newest";
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

    setSingleActiveItemId(null);
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

  // ---------------------------------------------------------------------
  // Single-post reader: the frozen reading sequence.
  //
  // `visibleItems` is rebuilt constantly — every background refresh replaces
  // the whole array, the stacked sort re-derives its order from a fresh
  // Date.now(), and the unread filter drops posts the moment they're
  // auto-marked read. That churn is fine for a scrolling list, where the
  // user's anchor is a scroll offset over content they can see moving. It is
  // *not* fine for the reader, where a single post fills the screen and any
  // reordering underneath it is invisible until it teleports the user
  // somewhere else entirely.
  //
  // So while the user is reading, the sequence they're walking is frozen:
  // entries hold their position for as long as the scope lasts, their
  // content is refreshed by id when a newer copy shows up, and genuinely new
  // posts are appended at the end rather than inserted around the reader.
  // Nothing is ever removed or reordered. Actual reloads are explicit — a
  // scope/filter/sort/search change, or the "New posts available" button —
  // and go through singleReloadEpoch below.
  const singleScopeKey = `${filter}|${normalizedSearch}|${sort}|${selectedFeedId}|${selectedTagId}|${selectedCustomFeedId}|${singleReloadEpoch}`;
  const singleSequenceRef = useRef<{
    key: string;
    items: FeedItemWithFeed[];
  }>({ key: "", items: [] });

  const singleItems = useMemo(() => {
    if (feedLayout !== "single") {
      return visibleItems;
    }

    const cached = singleSequenceRef.current;
    const previous = cached.key === singleScopeKey ? cached.items : [];
    const freshById = new Map(visibleItems.map((item) => [item.id, item]));
    const held = new Set<number>();

    const merged = previous.map((item) => {
      held.add(item.id);
      // Prefer the newer copy (read flag, edited title) but keep the slot.
      return freshById.get(item.id) ?? item;
    });
    for (const item of visibleItems) {
      if (!held.has(item.id)) merged.push(item);
    }

    singleSequenceRef.current = { key: singleScopeKey, items: merged };
    return merged;
  }, [feedLayout, singleScopeKey, visibleItems]);

  // The active post is tracked by identity (singleActiveItemId), not
  // position, so it survives the sequence being appended to underneath it.
  //
  // The one thing an id can't do on its own is pick a *starting* post — so
  // lock one in the first moment data is available. This is React's
  // documented "adjusting state during render" pattern, not a useEffect, so
  // the very first paint already has a real anchor instead of flashing
  // index-0-of-whatever-that-means-right-now for a frame first.
  if (
    feedLayout === "single" &&
    singleActiveItemId === null &&
    singleItems.length > 0
  ) {
    setSingleActiveItemId(singleItems[0].id);
  }

  // If the active id genuinely can't be found, hold the position the reader
  // was already at rather than snapping to index 0. The frozen sequence
  // above should make this unreachable; it used to be a silent
  // `Math.max(0, -1)`, which is exactly why the reader teleporting to the
  // top of the list went undiagnosed for so long.
  const singleFoundIndex = singleItems.findIndex(
    (item) => item.id === singleActiveItemId
  );
  const singleSafeIndex =
    singleFoundIndex >= 0
      ? singleFoundIndex
      : Math.min(
          singleLastKnownIndexRef.current,
          Math.max(0, singleItems.length - 1)
        );
  singleLastKnownIndexRef.current = singleSafeIndex;
  const currentSingleItem = singleItems[singleSafeIndex] ?? null;
  // Mirrored for the pager's callbacks, which must read the *current* value
  // without being rebuilt (and re-handed to GestureDetector) on every move.
  const singleSafeIndexRef = useRef(singleSafeIndex);
  singleSafeIndexRef.current = singleSafeIndex;
  const singleItemsRef = useRef(singleItems);
  singleItemsRef.current = singleItems;
  const currentSingleViewItem = useMemo(
    () => (currentSingleItem ? buildFeedItemViewItem(currentSingleItem) : null),
    [buildFeedItemViewItem, currentSingleItem]
  );
  // Held stable so it doesn't re-render the active post on every parent pass.
  const singleRefreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefreshAll}
        colors={[colors.accent]}
        tintColor={colors.accent}
      />
    ),
    [colors.accent, handleRefreshAll, refreshing]
  );
  const singlePreviousDisabled = singleSafeIndex === 0;
  const singleNextDisabled =
    (singleSafeIndex >= singleItems.length - 1 && !hasMore) ||
    singleAwaitingNextPost;
  const singleItemRedditAuthor = currentSingleItem
    ? extractRedditAuthor(currentSingleItem.content)
    : null;
  const singleItemAuthorFollowed = singleItemRedditAuthor
    ? followedRedditUsers.has(singleItemRedditAuthor.toLowerCase())
    : false;

  useEffect(() => {
    if (feedLayout !== "single" || !singleSelectUnreadOnNextItemsRef.current) {
      return;
    }

    singleSelectUnreadOnNextItemsRef.current = false;
    const unreadIndex = singleItems.findIndex((item) => item.read !== 1);
    setSingleActiveItemId(
      singleItems[unreadIndex >= 0 ? unreadIndex : 0]?.id ?? null
    );
  }, [feedLayout, singleItems]);

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
      singleItems.length === 0
    ) {
      return;
    }

    if (singleSafeIndex >= singleItems.length - 5) {
      handleLoadMore();
    }
  }, [
    feedLayout,
    handleLoadMore,
    hasMore,
    loadingMore,
    singleSafeIndex,
    singleItems.length,
  ]);

  // Once handleLoadMore's DB page fetch resolves, advance into the newly
  // loaded post if the user is still waiting on it (see handleSingleNext).
  useEffect(() => {
    if (feedLayout !== "single" || !singleAwaitingNextPost || loadingMore) {
      return;
    }

    setSingleAwaitingNextPost(false);
    if (singleSafeIndex < singleItems.length - 1) {
      setSingleActiveItemId(singleItems[singleSafeIndex + 1]?.id ?? null);
      setIsFeedScrolled(false);
    }
  }, [
    feedLayout,
    loadingMore,
    setIsFeedScrolled,
    singleAwaitingNextPost,
    singleSafeIndex,
    singleItems.length,
  ]);

  // Post text/HTML is already local (read from SQLite up front), so the only
  // thing that can still stall a swipe is media (images, Reddit
  // galleries/videos). Posts inside the pager's window are already mounted
  // and fetching for themselves, so warm the ones just *beyond* it — those
  // are what the next swipe promotes into the window.
  useEffect(() => {
    if (feedLayout !== "single") {
      return;
    }

    for (
      let offset = SINGLE_VIEW_WINDOW + 1;
      offset <= SINGLE_VIEW_WINDOW + SINGLE_VIEW_PREFETCH_AHEAD;
      offset += 1
    ) {
      const item = singleItems[singleSafeIndex + offset];
      if (!item) break;
      prefetchItemMedia(buildFeedItemViewItem(item));
    }
  }, [buildFeedItemViewItem, feedLayout, singleSafeIndex, singleItems]);

  // View-time tracking (start on activation/NSFW-reveal, end on explicit
  // "Next") now lives in SingleViewPost itself, keyed to each windowed
  // slot's own `isActive` — see activeSingleViewPostRef.

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

  // Navigation is now entirely the pager's business — it owns the gesture,
  // the animation and the window. All this screen decides is what a move
  // *means*: which post becomes active, and what to do at the far edge.
  const handleSingleAdvance = useCallback(
    (direction: 1 | -1) => {
      markActivity();
      const newIndex = singleSafeIndexRef.current + direction;
      setSingleActiveItemId(singleItemsRef.current[newIndex]?.id ?? null);
      setIsFeedScrolled(false);
    },
    [markActivity, setIsFeedScrolled]
  );

  // Swiped forward past the last locally-loaded post: wait for
  // handleLoadMore's DB page fetch (already in flight if the near-end
  // prefetch effect above triggered it) and auto-advance once it resolves.
  const handleSingleEdgeForward = useCallback(() => {
    markActivity();
    if (!hasMoreRef.current) return;
    setSingleAwaitingNextPost(true);
    if (!loadingMoreRef.current) {
      handleLoadMore();
    }
  }, [handleLoadMore, markActivity]);

  const handleSinglePrevious = useCallback(
    () => singlePagerRef.current?.advance(-1),
    []
  );

  const handleSingleNext = useCallback(
    () => singlePagerRef.current?.advance(1),
    []
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

  // The full skeleton takeover is reserved for the case where there is
  // genuinely nothing to show: the initial load before the first cached page
  // lands, and a refresh of an empty library. Once posts are on screen, no
  // refresh — manual, cold-start, or app-resume — replaces them with a
  // loader; it reports progress in a banner above the content instead so the
  // user can keep reading and swiping. See the banners below.
  if (loading || (refreshing && items.length === 0 && feeds.length > 0)) {
    // Hold quietly while the cached page is still being read: an app restart
    // with content to show must land on that content plus the background
    // banner, never on a loading screen. Plain paper, so the handoff from the
    // splash is seamless rather than a loader flashing by en route.
    if (loading && !initialLoadGraceElapsed) {
      return (
        <View
          style={[styles.container, { backgroundColor: colors.paper }]}
          testID="initial-load-hold"
        />
      );
    }
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

      {/* The sync banner itself is rendered by the tab navigator, not here, so
          it survives switching tabs. It still carries the per-feed counts, so
          it replaces the separate "Refreshing n/n" row that used to sit here.

          One banner at a time: the sync banner is *replaced* by the reset
          banner when the sync finishes, rather than stacking with it if new
          posts were already waiting when the sync started. The reset banner
          stays screen-local because tapping it acts on this feed. */}
      {newPostsAvailable && !backgroundRefreshing ? (
        <TouchableOpacity
          onPress={handleShowNewPosts}
          activeOpacity={0.85}
          accessibilityLabel="Show new posts"
          accessibilityRole="button"
          style={[
            styles.newPostsButton,
            {
              backgroundColor: colors.accent,
              borderBottomColor: colors.inkFaint,
            },
          ]}
        >
          <Feather name="arrow-up" size={14} color={colors.paper} />
          <Text style={[styles.newPostsButtonText, { color: colors.paper }]}>
            New posts available. Tap to reload
          </Text>
        </TouchableOpacity>
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
                  accessibilityLabel={
                    singleAwaitingNextPost ? "Loading next post" : "Next post"
                  }
                  style={styles.singleToolbarButton}
                >
                  {singleAwaitingNextPost ? (
                    <ActivityIndicator size="small" color={colors.inkFaint} />
                  ) : (
                    <Feather
                      name="chevron-right"
                      size={24}
                      color={singleNextDisabled ? colors.inkFaint : colors.ink}
                    />
                  )}
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
                    { borderBottomColor: colors.border },
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
                <TouchableOpacity
                  style={[
                    styles.singleMoreMenuItem,
                    singleItemRedditAuthor
                      ? { borderBottomColor: colors.border }
                      : null,
                  ]}
                  onPress={() => {
                    navigation.navigate("FeedDetail", {
                      feedId: currentSingleItem.feed_id,
                      returnToItem: currentSingleViewItem ?? undefined,
                    });
                    setShowSingleMoreMenu(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Edit Feed"
                >
                  <Feather name="edit-2" size={16} color={colors.ink} />
                  <Text
                    style={[
                      styles.singleMoreMenuItemText,
                      { color: colors.ink },
                    ]}
                  >
                    Edit Feed
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
          {isWeb ? (
            <SingleViewPost
              key={currentSingleItem.id}
              ref={activeSingleViewPostRef}
              item={currentSingleViewItem}
              feedId={currentSingleItem.feed_id}
              isActive
              isLive
              bionicReading={bionicReading}
              isDesktopWeb={isDesktopWeb}
              onOpenContentLink={handleOpenContentLink}
              onScroll={handleScroll}
              refreshControl={singleRefreshControl}
            />
          ) : (
            <SingleViewPager
              ref={singlePagerRef}
              items={singleItems}
              activeIndex={singleSafeIndex}
              viewportWidth={viewportWidth}
              bionicReading={bionicReading}
              buildViewItem={buildFeedItemViewItem}
              onAdvance={handleSingleAdvance}
              onEdgeForward={handleSingleEdgeForward}
              onOpenContentLink={handleOpenContentLink}
              onScroll={handleScroll}
              refreshControl={singleRefreshControl}
            />
          )}
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
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />
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
      <ChompingLoader />
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
  newPostsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  newPostsButtonText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
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
