import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getFeeds, deleteFeed } from "../database";
import { fetchFeed } from "../feedParser";
import { Feed, RootStackParamList, TabParamList } from "../types";
import { Avatar, MetaText, Pill, Wordmark } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function FeedListScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Filter pills are visual-only for now: unread/starred counts aren't
  // available on the Feed model yet (see issues #13, #14). The selected
  // value persists during the session so the UI still feels interactive.
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");

  const loadFeeds = useCallback(async () => {
    try {
      const data = await getFeeds();
      setFeeds(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load feeds: " + (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeeds();
    }, [loadFeeds])
  );

  const handleDelete = (feed: Feed) => {
    Alert.alert("Remove Feed", `Remove "${feed.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteFeed(feed.id);
          setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
        },
      },
    ]);
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    let errors = 0;
    for (const feed of feeds) {
      try {
        await fetchFeed(feed.url);
      } catch {
        errors++;
      }
    }
    if (errors > 0) {
      Alert.alert("Refresh", `${errors} feed(s) could not be refreshed.`);
    }
    setRefreshing(false);
  };

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
      {/* Wordmark header */}
      <View style={[styles.topBar, { borderBottomColor: colors.ink }]}>
        <Wordmark size={26} />
        <Text style={[styles.topBarSub, { color: colors.inkSoft }]}>
          / {feeds.length} {feeds.length === 1 ? "feed" : "feeds"}
        </Text>
      </View>

      {/* Filter pills row */}
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
      ) : (
        <FlatList
          data={feeds}
          keyExtractor={(item) => String(item.id)}
          onRefresh={handleRefreshAll}
          refreshing={refreshing}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.paper }]}
              onPress={() => navigation.navigate("FeedItems", { feed: item })}
              onLongPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Avatar label={item.title} size={36} />
              <View style={styles.rowBody}>
                <Text
                  style={[styles.feedTitle, { color: colors.ink }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <MetaText>{item.url.replace(/^https?:\/\//, "")}</MetaText>
              </View>
              <Text style={[styles.chevron, { color: colors.inkSoft }]}>›</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => (
            <View
              style={[styles.separator, { borderBottomColor: colors.inkFaint }]}
            />
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.accent,
            borderColor: colors.ink,
            shadowColor: colors.ink,
          },
        ]}
        onPress={() => navigation.navigate("AddFeed")}
        accessibilityLabel="Add feed"
        activeOpacity={0.8}
      >
        <Text style={[styles.fabText, { color: colors.paper }]}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1.2,
  },
  topBarSub: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
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
  },
  list: { paddingBottom: 80 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowBody: { flex: 1, gap: 2 },
  feedTitle: {
    fontSize: fontSize.title,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  chevron: {
    fontSize: 22,
  },
  separator: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    marginHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  emptySub: {
    fontSize: fontSize.bodyLg,
    marginTop: spacing.sm,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    marginTop: spacing.lg,
    transform: [{ rotate: "-2deg" }],
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    elevation: 4,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "600",
  },
});
