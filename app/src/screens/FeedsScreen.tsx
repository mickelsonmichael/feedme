import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getFeeds, deleteFeed } from "../database";
import { Feed, RootStackParamList, TabParamList } from "../types";
import { DashedDivider } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { getFeedIconUrl } from "../feedIcon";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feeds">,
  NativeStackScreenProps<RootStackParamList>
>;

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function FeedsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadFeeds = useCallback(async () => {
    try {
      const data = await getFeeds();
      setFeeds(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteFeed = (feed: Feed) => {
    const message = `Remove "${feed.title}"? All associated items will be deleted.`;

    const doDelete = async () => {
      try {
        await deleteFeed(feed.id);
        setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
      } catch (err) {
        const errMsg = "Could not delete feed: " + (err as Error).message;
        if (Platform.OS === "web") {
          window.alert(errMsg);
        } else {
          Alert.alert("Error", errMsg);
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        doDelete();
      }
      return;
    }

    Alert.alert("Remove Feed", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doDelete },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      loadFeeds();
    }, [loadFeeds])
  );

  const visibleFeeds = useMemo(() => {
    if (!search.trim()) return feeds;
    return feeds.filter(
      (f) => fuzzyMatch(search, f.title) || fuzzyMatch(search, f.url)
    );
  }, [feeds, search]);

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
      <View style={styles.topRow}>
        <View
          style={[
            styles.searchRow,
            { borderColor: colors.inkFaint, backgroundColor: colors.paperWarm },
          ]}
        >
          <Feather name="search" size={14} color={colors.inkSoft} />
          <TextInput
            style={[styles.searchInput, { color: colors.ink }]}
            placeholder="search by title or url…"
            placeholderTextColor={colors.inkFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { borderColor: colors.border, backgroundColor: colors.accent },
          ]}
          onPress={() => navigation.navigate("AddFeed", { from: "Feeds" })}
          accessibilityLabel="Add feed"
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color={colors.paper} />
        </TouchableOpacity>
      </View>

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No feeds yet.
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            Tap the plus button above to add your first feed.
          </Text>
        </View>
      ) : visibleFeeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No matches.
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            Try a different search term.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleFeeds}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <DashedDivider />}
          renderItem={({ item }) => {
            const iconUri = getFeedIconUrl(item.url);
            const showIcon = Boolean(iconUri && !failedIconUris.has(iconUri));

            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  navigation.navigate("FeedDetail", { feedId: item.id })
                }
                activeOpacity={0.7}
              >
                {showIcon ? (
                  <Image
                    source={{ uri: iconUri ?? undefined }}
                    style={styles.feedIcon}
                    onError={() => {
                      if (!iconUri) {
                        return;
                      }
                      setFailedIconUris((prev) => new Set(prev).add(iconUri));
                    }}
                  />
                ) : null}
                <View style={styles.rowBody}>
                  <Text style={[styles.feedTitle, { color: colors.ink }]}>
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.feedUrl, { color: colors.inkSoft }]}
                    numberOfLines={1}
                  >
                    {item.url}
                  </Text>
                </View>
                {item.error ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.danger,
                        borderColor: colors.danger,
                      },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: colors.paper }]}>
                      Error
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => handleDeleteFeed(item)}
                  hitSlop={8}
                  accessibilityLabel={`Delete ${item.title}`}
                >
                  <Feather name="trash-2" size={18} color={colors.danger} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: spacing.md,
    gap: spacing.sm,
  },
  searchRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    paddingVertical: 0,
  },
  list: { paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  feedIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  rowBody: { flex: 1, gap: 2 },
  feedTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  feedUrl: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontFamily: fonts.heading,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  emptySub: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    textAlign: "center",
  },
});
