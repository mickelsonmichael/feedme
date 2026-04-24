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
} from "../database";
import { fetchFeed } from "../feedParser";
import { FeedItem, RootStackParamList } from "../types";
import { MetaText } from "../components/ui";
import { colors, fonts, fontSize, radii, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "FeedItems">;

// Pseudo-stable mock vote count derived from the item id so it doesn't
// flicker between renders. Real vote support is mocked until backed by data.
function mockVotes(id: number): number {
  return ((id * 2654435761) >>> 0) % 900;
}

export default function FeedItemsScreen({ route, navigation }: Props) {
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
      const data = await getItemsForFeed(feed.id);
      setItems(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load items: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [feed.id]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

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

  const toggleSave = (id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerStrip}>
        <MetaText>
          {feed.url.replace(/^https?:\/\//, "")} · {items.length} items
        </MetaText>
        <View style={styles.spacer} />
        <MetaText>{refreshing ? "refreshing…" : "pull to refresh"}</MetaText>
      </View>
      {visibleItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No items yet.</Text>
          <TouchableOpacity
            style={styles.fetchBtn}
            onPress={handleRefresh}
            activeOpacity={0.8}
          >
            <Text style={styles.fetchBtnText}>fetch items →</Text>
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
              <View style={styles.card}>
                <View style={styles.cardMeta}>
                  <Text style={styles.sourceText}>{feed.title}</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <MetaText>{formatDate(item.published_at)}</MetaText>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <TouchableOpacity
                  onPress={() => handleOpenItem(item)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.title, item.read ? styles.titleRead : null]}
                    numberOfLines={3}
                  >
                    {item.title}
                  </Text>
                  {item.content ? (
                    <Text style={styles.summary} numberOfLines={2}>
                      {stripHtml(item.content)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                <View style={styles.actionRow}>
                  <Text style={styles.actionMeta}>↑ {mockVotes(item.id)}</Text>
                  <Text style={styles.actionMeta}>💬 0</Text>
                  <View style={styles.spacer} />
                  <TouchableOpacity
                    onPress={() => toggleSave(item.id)}
                    activeOpacity={0.6}
                    hitSlop={8}
                  >
                    <Text
                      style={[
                        styles.actionIcon,
                        saved && styles.actionIconActive,
                      ]}
                    >
                      {saved ? "❤" : "♡"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => hideItem(item.id)}
                    activeOpacity={0.6}
                    hitSlop={8}
                  >
                    <Text style={styles.actionIcon}>⊘</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleShare(item)}
                    activeOpacity={0.6}
                    hitSlop={8}
                  >
                    <Text style={styles.actionIcon}>↗</Text>
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
  container: { flex: 1, backgroundColor: colors.paper },
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
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
    gap: spacing.sm,
  },
  spacer: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
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
    color: colors.ink,
    fontWeight: "600",
  },
  metaDot: {
    fontSize: fontSize.meta,
    color: colors.inkSoft,
    marginHorizontal: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    color: colors.ink,
    fontWeight: "700",
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  titleRead: {
    color: colors.inkSoft,
    fontWeight: "500",
  },
  summary: {
    fontSize: fontSize.body,
    color: colors.inkSoft,
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
    borderTopColor: colors.inkFaint,
    borderStyle: "dashed",
  },
  actionMeta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
  },
  actionIcon: {
    fontSize: 18,
    color: colors.inkSoft,
    paddingHorizontal: spacing.xs,
  },
  actionIconActive: {
    color: colors.accent,
  },
  separator: { height: spacing.sm },
  emptyTitle: {
    fontSize: fontSize.h2,
    color: colors.ink,
    marginBottom: spacing.lg,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
  fetchBtn: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fetchBtnText: {
    color: colors.paper,
    fontWeight: "600",
    fontFamily: fonts.mono,
  },
});
