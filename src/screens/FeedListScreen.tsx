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
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFeeds, deleteFeed, addFeed } from "../database";
import { generateOpml, parseOpml } from "../opml";
import { fetchFeed } from "../feedParser";
import { Feed, RootStackParamList, TabParamList } from "../types";
import { Avatar, MetaText, Pill, Wordmark } from "../components/ui";
import { colors, fonts, fontSize, radii, spacing } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function FeedListScreen({ navigation }: Props) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const handleExportOpml = async () => {
    try {
      const opmlContent = generateOpml(feeds);
      const file = new File(Paths.cache, "feedme-subscriptions.opml");
      file.write(opmlContent);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/x-opml",
          dialogTitle: "Export OPML",
        });
      } else {
        Alert.alert("Exported", "OPML saved to: " + file.uri);
      }
    } catch (err) {
      Alert.alert("Export Error", (err as Error).message);
    }
  };

  const handleImportOpml = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/xml", "text/x-opml", "application/xml", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const content = await new File(result.assets[0].uri).text();
      const parsedFeeds = parseOpml(content);

      if (parsedFeeds.length === 0) {
        Alert.alert(
          "No feeds found",
          "The selected file contained no valid feed entries."
        );
        return;
      }

      let added = 0;
      for (const feed of parsedFeeds) {
        try {
          await addFeed({
            title: feed.title,
            url: feed.url,
            description: feed.description ?? null,
          });
          added++;
        } catch (err) {
          // Skip feeds that already exist (UNIQUE constraint); rethrow unexpected errors
          if (!(err as Error).message?.includes("UNIQUE")) {
            throw err;
          }
        }
      }
      Alert.alert(
        "Import Complete",
        `Added ${added} of ${parsedFeeds.length} feeds.`
      );
      loadFeeds();
    } catch (err) {
      Alert.alert("Import Error", (err as Error).message);
    }
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
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Wordmark header */}
      <View style={styles.topBar}>
        <Wordmark size={26} />
        <Text style={styles.topBarSub}>
          / {feeds.length} {feeds.length === 1 ? "feed" : "feeds"}
        </Text>
      </View>

      {/* Filter pills row */}
      <View style={styles.filterRow}>
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

      {/* OPML import/export — moves to Settings per issue #26 */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={handleImportOpml}
          activeOpacity={0.7}
        >
          <Text style={styles.toolbarBtnText}>↓ import opml</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toolbarBtn,
            feeds.length === 0 && styles.toolbarBtnDisabled,
          ]}
          onPress={handleExportOpml}
          disabled={feeds.length === 0}
          activeOpacity={0.7}
        >
          <Text style={styles.toolbarBtnText}>↑ export opml</Text>
        </TouchableOpacity>
      </View>

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No feeds yet.</Text>
          <Text style={styles.emptySub}>
            Tap ＋ to add your first subscription.
          </Text>
          <Text style={styles.scrawl}>
            or ↓ import an OPML file from another reader
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
              style={styles.row}
              onPress={() => navigation.navigate("FeedItems", { feed: item })}
              onLongPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Avatar label={item.title} size={36} />
              <View style={styles.rowBody}>
                <Text style={styles.feedTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <MetaText>{item.url.replace(/^https?:\/\//, "")}</MetaText>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddFeed")}
        accessibilityLabel="Add feed"
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1.2,
    borderBottomColor: colors.ink,
  },
  topBarSub: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
    color: colors.inkSoft,
  },
  filterRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
  },
  filterPills: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flexDirection: "row",
  },
  toolbar: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
  },
  toolbarBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  toolbarBtnDisabled: { opacity: 0.4 },
  toolbarBtnText: {
    color: colors.ink,
    fontSize: fontSize.body,
    fontFamily: fonts.mono,
  },
  list: { paddingBottom: 80 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.paper,
  },
  rowBody: { flex: 1, gap: 2 },
  feedTitle: {
    fontSize: fontSize.title,
    color: colors.ink,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  chevron: {
    fontSize: 22,
    color: colors.inkSoft,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
    marginHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    color: colors.ink,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  emptySub: {
    fontSize: fontSize.bodyLg,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    color: colors.accent,
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
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.ink,
    elevation: 4,
    shadowColor: colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: colors.paper,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "600",
  },
});
