import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getFeeds,
  getAllItems,
  markItemRead,
  markItemUnread,
  savePost,
  unsavePost,
  getSavedItemIds,
} from "../database";
import { Feather } from "@expo/vector-icons";
import { refreshFeeds } from "../feedRefresher";
import {
  FeedLayoutMode,
  Feed,
  FeedItemWithFeed,
  RootStackParamList,
  TabParamList,
} from "../types";
import { toggleExpandedId } from "../expandItemIds";
import { MetaText, Pill } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { useHeaderContent } from "../context/HeaderContentContext";
import { SortMode, applySortMode } from "../sortItems";
import { FilterMode, applyFilter } from "../filterItems";
import { ExpandedFeedMedia } from "../components/ExpandedFeedMedia";
import { parseContentAndLinks } from "../utils/contentActions";
import { FeedPostCard } from "../components/FeedPostCard";
import { loadConfig } from "../storage";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

const CARD_IMAGE_WIDTH = 100;
const CARD_LAYOUT_WIDTH = 760;

export default function FeedListScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { setHeaderContent, clearHeaderContent } = useHeaderContent();
  const { width: viewportWidth } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isFocused = useIsFocused();
  const [feedLayout, setFeedLayout] = useState<FeedLayoutMode>(
    () => loadConfig().feedLayout ?? "compact"
  );
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [items, setItems] = useState<FeedItemWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("stacked");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [retainedUnreadIds, setRetainedUnreadIds] = useState<Set<number>>(
    new Set()
  );
  const selectedFeedId = route.params?.selectedFeedId;

  const loadData = useCallback(async () => {
    try {
      const feedData = await getFeeds();
      setFeeds(feedData);

      if (feedData.length > 0) {
        const errors = await refreshFeeds(feedData);
        if (errors > 0) {
          Alert.alert("Refresh", `${errors} feed(s) could not be refreshed.`);
        }
      }

      const [itemData, ids] = await Promise.all([
        getAllItems(),
        getSavedItemIds(),
      ]);
      setItems(itemData);
      setSavedIds(ids);
    } catch (err) {
      Alert.alert("Error", "Failed to load: " + (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFeedLayout(loadConfig().feedLayout ?? "compact");
      setRefreshing(true);
      loadData();
    }, [loadData])
  );

  const handleRefreshAll = async () => {
    setRetainedUnreadIds(new Set());
    setRefreshing(true);
    await loadData();
  };

  const handleOpenItem = async (item: FeedItemWithFeed) => {
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
      },
    });
  };

  const toggleSave = async (item: FeedItemWithFeed) => {
    const alreadySaved = savedIds.has(item.id);
    try {
      if (alreadySaved) {
        await unsavePost(item.id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      } else {
        await savePost(item, item.feed_title);
        setSavedIds((prev) => new Set(prev).add(item.id));
      }
    } catch (err) {
      Alert.alert("Error", "Could not update saved status.");
    }
  };

  const handleToggleExpand = async (item: FeedItemWithFeed) => {
    const isExpanding = !expandedIds.has(item.id);
    setExpandedIds((prev) => toggleExpandedId(prev, item.id));
    if (isExpanding && !item.read) {
      if (filter === "unread") {
        setRetainedUnreadIds((prev) => new Set(prev).add(item.id));
      }

      try {
        await markItemRead(item.id);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, read: 1 } : i))
        );
      } catch {
        Alert.alert("Error", "Could not update read status.");
      }
    }
  };

  const toggleRead = async (item: FeedItemWithFeed) => {
    try {
      if (item.read) {
        await markItemUnread(item.id);
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id ? { ...current, read: 0 } : current
          )
        );
        setRetainedUnreadIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        return;
      }

      if (filter === "unread") {
        setRetainedUnreadIds((prev) => new Set(prev).add(item.id));
      }

      await markItemRead(item.id);
      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id ? { ...current, read: 1 } : current
        )
      );
    } catch {
      Alert.alert("Error", "Could not update read status.");
    }
  };

  const handleOpenContentLink = useCallback((url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
  }, []);

  const handleOpenOriginalLink = useCallback((url: string | null) => {
    if (!url) {
      return;
    }

    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
  }, []);

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
    if (selectedFeedId !== undefined && sort === "stacked") {
      setSort("newest");
    }
  }, [selectedFeedId, sort]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasSearch = normalizedSearch.length > 0;
  const isSearchVisible = mobileSearchOpen || hasSearch;

  useEffect(() => {
    setRetainedUnreadIds(new Set());
  }, [filter]);

  const feedDetailsById = useMemo(
    () => new Map(feeds.map((feed) => [feed.id, feed])),
    [feeds]
  );

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

  const scopedItems = useMemo(() => {
    if (hasSearch) {
      return items;
    }

    if (selectedFeedId === undefined) return items;
    return items.filter((item) => item.feed_id === selectedFeedId);
  }, [items, selectedFeedId, hasSearch]);

  const searchedItems = useMemo(() => {
    if (!hasSearch) {
      return scopedItems;
    }

    return scopedItems.filter((item) => {
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

      return haystack.includes(normalizedSearch);
    });
  }, [scopedItems, hasSearch, feedDetailsById, normalizedSearch]);

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

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {!isWeb ? (
        <View
          style={[styles.searchWrap, { borderBottomColor: colors.inkFaint }]}
        >
          {isSearchVisible ? (
            searchField
          ) : (
            <TouchableOpacity
              style={[
                styles.searchOpenBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.paperWarm,
                },
              ]}
              onPress={() => setMobileSearchOpen(true)}
              accessibilityLabel="Open search"
              activeOpacity={0.8}
            >
              <Feather name="search" size={16} color={colors.inkSoft} />
              <Text
                style={[styles.searchOpenBtnText, { color: colors.inkSoft }]}
              >
                Search all feeds
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Filter + sort pills row */}
      <View style={[styles.filterRow, { borderBottomColor: colors.inkFaint }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPills}
        >
          <TouchableOpacity
            onPress={() => setFilter("all")}
            activeOpacity={0.7}
          >
            <Pill label="All" variant={filter === "all" ? "accent" : "soft"} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("unread")}
            activeOpacity={0.7}
          >
            <Pill
              label="Unread"
              variant={filter === "unread" ? "accent" : "soft"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("starred")}
            activeOpacity={0.7}
          >
            <Pill
              label="Saved"
              iconName="bookmark"
              variant={filter === "starred" ? "accent" : "soft"}
            />
          </TouchableOpacity>
          <View
            style={[styles.pillDivider, { backgroundColor: colors.inkFaint }]}
          />
          <TouchableOpacity
            onPress={() => setSort("newest")}
            activeOpacity={0.7}
          >
            <Pill
              label="Newest"
              variant={sort === "newest" ? "accent" : "soft"}
            />
          </TouchableOpacity>
          {selectedFeedId === undefined ? (
            <TouchableOpacity
              onPress={() => setSort("stacked")}
              activeOpacity={0.7}
            >
              <Pill
                label="Stacked"
                variant={sort === "stacked" ? "accent" : "soft"}
              />
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No feeds yet.
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            Tap ＋ to add your first subscription.
          </Text>
          <Text style={[styles.scrawl, { color: colors.accent }]}>
            or ↓ import an OPML file via Settings
          </Text>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.center}>
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
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => String(item.id)}
          onRefresh={handleRefreshAll}
          refreshing={refreshing}
          contentContainerStyle={[
            styles.list,
            feedLayout === "card" ? styles.cardList : null,
          ]}
          renderItem={({ item }) => {
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
                  saved={savedIds.has(item.id)}
                  cardWidth={cardWidth}
                  cardMediaTestID={`card-media-${item.id}`}
                  onOpenItem={() => handleOpenItem(item)}
                  onToggleRead={() => toggleRead(item)}
                  onToggleSave={() => toggleSave(item)}
                  onOpenOriginalLink={() => handleOpenOriginalLink(item.url)}
                  onOpenContentLink={handleOpenContentLink}
                />
              );
            }

            return (
              <FeedPostCard
                item={item}
                feedTitle={item.feed_title}
                layout="compact"
                saved={savedIds.has(item.id)}
                expanded={expandedIds.has(item.id)}
                showExpand
                expandedMediaTestID={`expanded-media-${item.id}`}
                onOpenItem={() => handleOpenItem(item)}
                onToggleExpand={() => handleToggleExpand(item)}
                onToggleRead={() => toggleRead(item)}
                onToggleSave={() => toggleSave(item)}
                onOpenOriginalLink={() => handleOpenOriginalLink(item.url)}
                onOpenContentLink={handleOpenContentLink}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  filterRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderStyle: "dashed",
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
  searchOpenBtn: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchOpenBtnText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
  },
  filterPills: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  pillDivider: {
    width: 1,
    height: 16,
    marginHorizontal: spacing.xs,
  },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
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
    borderStyle: "dashed",
  },
  actionMeta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  expandPanel: {
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderStyle: "dashed",
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
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    marginTop: spacing.lg,
    transform: [{ rotate: "-2deg" }],
    textAlign: "center",
  },
});
