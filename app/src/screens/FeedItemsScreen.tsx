import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  getItemsForFeed,
  upsertItems,
  markItemRead,
  markItemUnread,
  updateFeedLastFetched,
  savePost,
  unsavePost,
  getSavedItemIds,
} from "../database";
import { fetchFeed } from "../feedParser";
import { FeedItem, RootStackParamList } from "../types";
import { toggleExpandedId } from "../expandItemIds";
import { MetaText } from "../components/ui";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedPostCard } from "../components/FeedPostCard";
import { openUrlWithPreference } from "../linkOpening";

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

  const handleOpenItem = useCallback(
    (item: FeedItem) => {
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
        },
      });
    },
    [feed.title, feed.use_proxy, navigation]
  );

  const handleOpenContentLink = useCallback(
    (url: string) => {
      openUrlWithPreference({ url, navigation });
    },
    [navigation]
  );

  const handleOpenOriginalLink = useCallback(
    (url: string | null) => {
      if (!url) {
        return;
      }

      openUrlWithPreference({ url, navigation });
    },
    [navigation]
  );

  const toggleSave = useCallback(
    async (item: FeedItem) => {
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
    },
    [feed.title, savedIds]
  );

  const handleToggleExpand = useCallback(
    async (item: FeedItem) => {
      const isExpanding = !expandedIds.has(item.id);
      setExpandedIds((prev) => toggleExpandedId(prev, item.id));
      if (isExpanding && !item.read) {
        try {
          await markItemRead(item.id);
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, read: 1 } : i))
          );
        } catch {
          Alert.alert("Error", "Could not update read status.");
        }
      }
    },
    [expandedIds]
  );

  const toggleRead = useCallback(async (item: FeedItem) => {
    try {
      if (item.read) {
        await markItemUnread(item.id);
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id ? { ...current, read: 0 } : current
          )
        );
        return;
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
  }, []);

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
          data={items}
          keyExtractor={keyExtractor}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
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
              onOpenItem={() => handleOpenItem(item)}
              onToggleExpand={() => handleToggleExpand(item)}
              onToggleRead={() => toggleRead(item)}
              onToggleSave={() => toggleSave(item)}
              onOpenOriginalLink={() => handleOpenOriginalLink(item.url)}
              onOpenContentLink={handleOpenContentLink}
              onOpenRawXml={() => setRawXmlItem(item)}
            />
          )}
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
    borderStyle: "dashed",
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
    borderStyle: "dashed",
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
