import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Share,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getItemsForFeed,
  upsertItems,
  markItemRead,
  updateFeedLastFetched,
  savePost,
  unsavePost,
  getSavedItemIds,
} from "../database";
import { fetchFeed } from "../feedParser";
import { FeedItem, RootStackParamList } from "../types";
import { MetaText } from "../components/ui";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "FeedItems">;

// Pseudo-stable mock vote count derived from the item id so it doesn't
// flicker between renders. Real vote support is mocked until backed by data.
function mockVotes(id: number): number {
  return ((id * 2654435761) >>> 0) % 900;
}

export default function FeedItemsScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { feed } = route.params;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: feed.title });
  }, [navigation, feed.title]);

  const loadItems = useCallback(async () => {
    try {
      const [data, ids] = await Promise.all([
        getItemsForFeed(feed.id),
        getSavedItemIds(),
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
    try {
      const fetched = await fetchFeed(feed.url);
      await upsertItems(feed.id, fetched);
      await updateFeedLastFetched(feed.id);
      await loadItems();
    } catch (err) {
      Alert.alert("Refresh Error", (err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [feed, loadItems]);

  useFocusEffect(
    useCallback(() => {
      handleRefresh();
    }, [handleRefresh])
  );

  const handleOpenItem = async (item: FeedItem) => {
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

  const toggleSave = async (item: FeedItem) => {
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
        await savePost(item, feed.title);
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

  const handleShare = async (item: FeedItem) => {
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

  const visibleItems = useMemo(
    () => items.filter((i) => !hiddenIds.has(i.id)),
    [items, hiddenIds]
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
      <View
        style={[styles.headerStrip, { borderBottomColor: colors.inkFaint }]}
      >
        <MetaText>
          {feed.url.replace(/^https?:\/\//, "")} · {items.length} items
        </MetaText>
        <View style={styles.spacer} />
        <MetaText>{refreshing ? "refreshing…" : "pull to refresh"}</MetaText>
      </View>
      {visibleItems.length === 0 ? (
        <View style={styles.center}>
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
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => String(item.id)}
          onRefresh={handleRefresh}
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
                <View style={styles.cardMeta}>
                  <Text style={[styles.sourceText, { color: colors.ink }]}>
                    {feed.title}
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
                  <Text style={[styles.actionMeta, { color: colors.inkSoft }]}>
                    ↑ {mockVotes(item.id)}
                  </Text>
                  <Text style={[styles.actionMeta, { color: colors.inkSoft }]}>
                    💬 0
                  </Text>
                  <View style={styles.spacer} />
                  <TouchableOpacity
                    onPress={() => toggleSave(item)}
                    activeOpacity={0.6}
                    hitSlop={8}
                  >
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
  headerStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    gap: spacing.sm,
  },
  spacer: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
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
    fontFamily: fonts.mono,
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
    fontFamily: fonts.mono,
  },
  actionIcon: {
    fontSize: 18,
    paddingHorizontal: spacing.xs,
  },
  separator: { height: spacing.sm },
  emptyTitle: {
    fontSize: fontSize.h2,
    marginBottom: spacing.lg,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
  fetchBtn: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fetchBtnText: {
    fontWeight: "600",
    fontFamily: fonts.mono,
  },
});
