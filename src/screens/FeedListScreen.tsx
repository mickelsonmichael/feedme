import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
  Share,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getFeeds,
  getAllItems,
  markItemRead,
  savePost,
  unsavePost,
  getSavedItemIds,
} from "../database";
import { Feather } from "@expo/vector-icons";
import { refreshFeeds } from "../feedRefresher";
import {
  Feed,
  FeedItemWithFeed,
  RootStackParamList,
  TabParamList,
} from "../types";
import { MetaText, Pill } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { SortMode, applySortMode } from "../sortItems";
import { FilterMode, applyFilter } from "../filterItems";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

// Pseudo-stable mock vote count derived from the item id so it doesn't
// flicker between renders. Real vote support is mocked until backed by data.
function mockVotes(id: number): number {
  return ((id * 2654435761) >>> 0) % 900;
}

const CARD_IMAGE_WIDTH = 100;

export default function FeedListScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [items, setItems] = useState<FeedItemWithFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("stacked");
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

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
      setRefreshing(true);
      loadData();
    }, [loadData])
  );

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleOpenItem = async (item: FeedItemWithFeed) => {
    await markItemRead(item.id);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, read: 1 } : i))
    );
    if (item.url) {
      Linking.openURL(item.url).catch(() =>
        Alert.alert("Error", "Cannot open this URL.")
      );
    }
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

  const hideItem = (id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleShare = async (item: FeedItemWithFeed) => {
    if (!item.url) return;
    try {
      await Share.share({
        message: item.url,
        url: item.url,
        title: item.title,
      });
    } catch {
      // Ignore share errors
    }
  };

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

  const sortedItems = useMemo(() => applySortMode(items, sort), [items, sort]);

  const visibleItems = useMemo(
    () =>
      applyFilter(sortedItems, filter, savedIds).filter(
        (i) => !hiddenIds.has(i.id)
      ),
    [sortedItems, filter, savedIds, hiddenIds]
  );

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
            <Pill label="all" variant={filter === "all" ? "accent" : "soft"} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("unread")}
            activeOpacity={0.7}
          >
            <Pill
              label="unread"
              variant={filter === "unread" ? "accent" : "soft"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter("starred")}
            activeOpacity={0.7}
          >
            <Pill
              label="★ starred"
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
              label="newest"
              variant={sort === "newest" ? "accent" : "soft"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSort("stacked")}
            activeOpacity={0.7}
          >
            <Pill
              label="stacked"
              variant={sort === "stacked" ? "accent" : "soft"}
            />
          </TouchableOpacity>
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
            {filter === "unread"
              ? "All caught up!"
              : filter === "starred"
                ? "No starred items."
                : "No items yet."}
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            {filter === "unread"
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
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const saved = savedIds.has(item.id);
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.paper,
                    borderColor: colors.ink,
                  },
                ]}
              >
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.cardContent}>
                  <View style={styles.cardMeta}>
                    <Text style={[styles.sourceText, { color: colors.ink }]}>
                      {item.feed_title}
                    </Text>
                    <Text style={[styles.metaDot, { color: colors.inkSoft }]}>
                      ·
                    </Text>
                    <MetaText>{formatDate(item.published_at)}</MetaText>
                    {!item.read && (
                      <View
                        style={[
                          styles.unreadDot,
                          { backgroundColor: colors.accent },
                        ]}
                      />
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleOpenItem(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.title,
                        { color: colors.ink },
                        item.read
                          ? { color: colors.inkSoft, fontWeight: "500" }
                          : null,
                      ]}
                      numberOfLines={3}
                    >
                      {item.title}
                    </Text>
                    {item.content ? (
                      <Text
                        style={[styles.summary, { color: colors.inkSoft }]}
                        numberOfLines={2}
                      >
                        {stripHtml(item.content)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                  <View
                    style={[
                      styles.actionRow,
                      { borderTopColor: colors.inkFaint },
                    ]}
                  >
                    <Text
                      style={[styles.actionMeta, { color: colors.inkSoft }]}
                    >
                      ↑ {mockVotes(item.id)}
                    </Text>
                    <Text
                      style={[styles.actionMeta, { color: colors.inkSoft }]}
                    >
                      💬 0
                    </Text>
                    <View style={styles.spacer} />
                    <TouchableOpacity
                      onPress={() => toggleSave(item)}
                      activeOpacity={0.6}
                      hitSlop={8}
                      accessibilityLabel={saved ? "Unsave post" : "Save post"}
                    >
                      {/* Feather only has one bookmark icon; saved state is
                        distinguished by accent color vs. soft ink. */}
                      <Feather
                        name="bookmark"
                        size={18}
                        color={saved ? colors.accent : colors.inkSoft}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => hideItem(item.id)}
                      activeOpacity={0.6}
                      hitSlop={8}
                    >
                      <Text
                        style={[styles.actionIcon, { color: colors.inkSoft }]}
                      >
                        ⊘
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleShare(item)}
                      activeOpacity={0.6}
                      hitSlop={8}
                    >
                      <Text
                        style={[styles.actionIcon, { color: colors.inkSoft }]}
                      >
                        ↗
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  card: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
    overflow: "hidden",
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
  actionIcon: {
    fontSize: 18,
    paddingHorizontal: spacing.xs,
  },
  spacer: { flex: 1 },
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
