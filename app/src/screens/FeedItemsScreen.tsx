import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getItemsForFeed,
  markItemRead,
  markItemUnread,
  savePost,
  unsavePost,
  getSavedItemIdsForFeed,
  getFeeds,
  addFeed,
  deleteFeed,
  getFeedByUrl,
} from "../database";
import { refreshFeeds } from "../feedRefresher";
import { Feed, FeedItem, RootStackParamList } from "../types";
import { toggleExpandedId } from "../expandItemIds";
import { MetaText } from "../components/ui";
import { FeedLoadingScreen } from "../components/LoadingState";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedPostCard } from "../components/FeedPostCard";
import { openUrlWithPreference } from "../linkOpening";
import { extractRedditAuthor, buildRedditFeedUrl } from "../redditUtils";

type Props = NativeStackScreenProps<RootStackParamList, "FeedItems">;

export default function FeedItemsScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { feed } = route.params;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [rawXmlItem, setRawXmlItem] = useState<FeedItem | null>(null);
  const [allFeeds, setAllFeeds] = useState<Feed[]>([]);
  const listRef = useRef<FlashListRef<FeedItem>>(null);
  const pendingScrollToTopRef = useRef(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: feed.title });
  }, [navigation, feed.title]);

  const followedRedditUsers = useMemo(() => {
    const users = new Set<string>();
    for (const f of allFeeds) {
      const match = f.url.match(/reddit\.com\/user\/([^/?#.\s]+)/i);
      if (match) users.add(match[1].toLowerCase());
    }
    return users;
  }, [allFeeds]);

  useEffect(() => {
    getFeeds()
      .then(setAllFeeds)
      .catch(() => {});
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const [data, ids] = await Promise.all([
        getItemsForFeed(feed.id),
        getSavedItemIdsForFeed(feed.id),
      ]);
      setItems(data);
      setSavedIds(ids);
    } catch (err) {
      Alert.alert("Error", "Failed to load items: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [feed.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    pendingScrollToTopRef.current = true;
    try {
      // Explicit single-feed refresh: bypass adaptive scheduling so the
      // user actually gets a fresh fetch even if the feed is in backoff.
      let feedError: string | null = null;
      const errors = await refreshFeeds([feed], {
        force: true,
        onFeedFailure: (_, error) => {
          feedError = error.message;
        },
      });
      if (errors > 0) {
        Alert.alert("Refresh Error", feedError ?? "Failed to refresh feed.");
      }
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  }, [feed, loadItems]);

  const hasLoadedOnceRef = React.useRef(false);
  useFocusEffect(
    useCallback(() => {
      // Only auto-refresh on first focus; subsequent focuses (e.g. returning
      // from the detail screen) reload from the local DB to keep navigation
      // snappy and avoid burning the radio.
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        handleRefresh();
      } else {
        loadItems();
      }
    }, [handleRefresh, loadItems])
  );

  // Scroll to top after pull-to-refresh once new items are committed.
  useEffect(() => {
    if (pendingScrollToTopRef.current) {
      pendingScrollToTopRef.current = false;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [items]);

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

  const expandedIdsRef = useRef(expandedIds);
  expandedIdsRef.current = expandedIds;

  const handleOpenItem = useCallback(
    (id: number) => {
      const item = itemsByIdRef.current.get(id);
      if (!item) return;

      navigation.navigate("FeedItemView", {
        item: {
          itemId: item.id,
          title: item.title,
          url: item.url,
          content: item.content,
          imageUrl: item.image_url,
          publishedAt: item.published_at,
          feedTitle: feed.title,
          read: item.read,
          useProxy: feed.use_proxy === 1,
          nsfw: feed.nsfw === 1,
        },
      });
    },
    [feed.title, feed.use_proxy, feed.nsfw, navigation]
  );

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
        try {
          await markItemRead(id);
          setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, read: 1 } : i))
          );
        } catch {
          // Link was opened; silently ignore read-status update failure.
        }
      }
    },
    [navigation]
  );

  const toggleSave = useCallback(
    async (id: number) => {
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
          await savePost(item, feed.title);
          setSavedIds((prev) => new Set(prev).add(id));
        }
      } catch (err) {
        Alert.alert("Error", "Could not update saved status.");
      }
    },
    [feed.title]
  );

  const handleToggleExpand = useCallback(async (id: number) => {
    const item = itemsByIdRef.current.get(id);
    if (!item) return;

    const isExpanding = !expandedIdsRef.current.has(id);
    setExpandedIds((prev) => toggleExpandedId(prev, id));
    if (isExpanding && !item.read) {
      try {
        await markItemRead(id);
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, read: 1 } : i))
        );
      } catch {
        Alert.alert("Error", "Could not update read status.");
      }
    }
  }, []);

  const toggleRead = useCallback(async (id: number) => {
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
        return;
      }

      await markItemRead(id);
      setItems((prev) =>
        prev.map((current) =>
          current.id === id ? { ...current, read: 1 } : current
        )
      );
    } catch {
      Alert.alert("Error", "Could not update read status.");
    }
  }, []);

  const handleOpenRawXml = useCallback((id: number) => {
    setRawXmlItem(itemsByIdRef.current.get(id) ?? null);
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
        });
      }
      const updatedFeeds = await getFeeds();
      setAllFeeds(updatedFeeds);
    } catch {
      Alert.alert("Error", "Could not update subscription.");
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const itemRedditAuthor = extractRedditAuthor(item.content);
      const itemAuthorFollowed = itemRedditAuthor
        ? followedRedditUsers.has(itemRedditAuthor.toLowerCase())
        : undefined;
      return (
        <FeedPostCard
          item={item}
          feedTitle={feed.title}
          layout="compact"
          nsfw={feed.nsfw === 1}
          useProxy={feed.use_proxy === 1}
          saved={savedIds.has(item.id)}
          expanded={expandedIds.has(item.id)}
          showExpand
          showRawXml
          expandedMediaTestID={`expanded-media-${item.id}`}
          onOpenItem={handleOpenItem}
          onToggleExpand={handleToggleExpand}
          onToggleRead={toggleRead}
          onToggleSave={toggleSave}
          onOpenOriginalLink={handleOpenOriginalLink}
          onOpenContentLink={handleOpenContentLink}
          onOpenRawXml={handleOpenRawXml}
          authorFollowed={itemAuthorFollowed}
          onFollowAuthor={itemRedditAuthor ? handleFollowAuthor : undefined}
        />
      );
    },
    [
      feed.title,
      feed.nsfw,
      feed.use_proxy,
      savedIds,
      expandedIds,
      followedRedditUsers,
      handleOpenItem,
      handleToggleExpand,
      toggleRead,
      toggleSave,
      handleOpenOriginalLink,
      handleOpenContentLink,
      handleOpenRawXml,
      handleFollowAuthor,
    ]
  );

  if (loading) {
    return <FeedLoadingScreen />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View
        style={[styles.headerStrip, { borderBottomColor: colors.inkFaint }]}
      >
        <MetaText>
          {feed.url.replace(/^https?:\/\//, "")} · {items.length} items
        </MetaText>
        <View style={styles.spacer} />
        <MetaText>{refreshing ? "refreshing…" : "pull to refresh"}</MetaText>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          hitSlop={8}
        >
          <MetaText style={{ color: colors.accent }}>Refresh</MetaText>
        </TouchableOpacity>
      </View>
      {items.length === 0 ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.center}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
        >
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No items yet.
          </Text>
          <TouchableOpacity
            style={[
              styles.fetchBtn,
              {
                borderColor: colors.accent,
                backgroundColor: colors.accent,
              },
            ]}
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <Text style={[styles.fetchBtnText, { color: colors.paper }]}>
              fetch items →
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={keyExtractor}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
        />
      )}
      <Modal
        visible={rawXmlItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setRawXmlItem(null)}
      >
        {rawXmlItem ? (
          <View
            style={[
              styles.rawModalOverlay,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
          >
            <View
              style={[
                styles.rawModalSheet,
                {
                  backgroundColor: colors.paperWarm,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.rawModalHeader,
                  { borderBottomColor: colors.inkFaint },
                ]}
              >
                <Feather name="terminal" size={16} color={colors.inkSoft} />
                <Text style={[styles.rawModalTitle, { color: colors.ink }]}>
                  Raw XML
                </Text>
                <TouchableOpacity
                  onPress={() => setRawXmlItem(null)}
                  hitSlop={8}
                  accessibilityLabel="Close raw XML"
                >
                  <Feather name="x" size={18} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.rawModalScroll}
                contentContainerStyle={styles.rawModalContent}
              >
                <Text
                  style={[styles.rawModalText, { color: colors.ink }]}
                  selectable
                >
                  {rawXmlItem.raw_xml ?? "(no raw XML available)"}
                </Text>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const keyExtractor = (item: FeedItem) => String(item.id);

function Separator() {
  return <View style={styles.separator} />;
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
  headerStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  spacer: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  separator: { height: spacing.sm },
  emptyTitle: {
    fontSize: fontSize.h2,
    marginBottom: spacing.lg,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
  fetchBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fetchBtnText: {
    fontWeight: "600",
    fontFamily: fonts.sans,
  },
  rawModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  rawModalSheet: {
    maxHeight: "70%",
    borderTopWidth: 1,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    overflow: "hidden",
  },
  rawModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  rawModalTitle: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  rawModalScroll: {
    flex: 1,
  },
  rawModalContent: {
    padding: spacing.md,
  },
  rawModalText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.mono,
    lineHeight: 18,
  },
});
