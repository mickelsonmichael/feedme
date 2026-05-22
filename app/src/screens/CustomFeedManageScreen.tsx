import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  deleteCustomFeed,
  getCustomFeedById,
  getFeedsForCustomFeed,
  removeCustomFeedMember,
} from "../database";
import { CustomFeed, Feed, RootStackParamList, TabParamList } from "../types";
import { DashedDivider } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { getFeedIconUrl } from "../feedIcon";
import { resolveCustomFeedIcon } from "../customFeedIcons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "CustomFeedManage">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function CustomFeedManageScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { customFeedId } = route.params;
  const from = route.params.from ?? "Feeds";

  const [customFeed, setCustomFeed] = useState<CustomFeed | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    try {
      const cf = await getCustomFeedById(customFeedId);
      if (!cf) {
        setCustomFeed(null);
        setFeeds([]);
        setNotFound(true);
        return;
      }
      setCustomFeed(cf);
      setNotFound(false);
      const members = await getFeedsForCustomFeed(customFeedId);
      setFeeds(members);
    } finally {
      setLoading(false);
    }
  }, [customFeedId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const visibleFeeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return feeds;
    return feeds.filter(
      (f) =>
        f.title.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)
    );
  }, [feeds, search]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(from as "Feeds");
    }
  }, [navigation, from]);

  const handleDelete = useCallback(() => {
    if (!customFeed) return;
    const performDelete = async () => {
      try {
        await deleteCustomFeed(customFeed.id);
        navigation.navigate(from as "Feeds");
      } catch (err) {
        Alert.alert(
          "Error",
          "Could not delete custom feed: " + (err as Error).message
        );
      }
    };
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          `Delete custom feed "${customFeed.name}"? This won't delete the feeds inside it.`
        );
      if (ok) {
        void performDelete();
      }
      return;
    }
    Alert.alert(
      "Delete custom feed?",
      `"${customFeed.name}" will be removed. The feeds inside it won't be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void performDelete();
          },
        },
      ]
    );
  }, [customFeed, navigation, from]);

  const handleRemoveMember = useCallback(
    (feed: Feed) => {
      const performRemove = async () => {
        try {
          await removeCustomFeedMember(customFeedId, feed.id);
          await loadData();
        } catch (err) {
          Alert.alert(
            "Error",
            "Could not remove feed: " + (err as Error).message
          );
        }
      };
      if (Platform.OS === "web") {
        const ok =
          typeof window !== "undefined" &&
          window.confirm(
            `Remove "${feed.title}" from this custom feed? The feed itself won't be deleted.`
          );
        if (ok) {
          void performRemove();
        }
        return;
      }
      Alert.alert(
        "Remove from custom feed?",
        `"${feed.title}" will no longer appear in this custom feed. The feed itself won't be deleted.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void performRemove();
            },
          },
        ]
      );
    },
    [customFeedId, loadData]
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

  if (notFound || !customFeed) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>
          Custom feed not found.
        </Text>
        <TouchableOpacity
          style={[
            styles.headerBtn,
            { borderColor: colors.border, marginTop: spacing.md },
          ]}
          onPress={handleBack}
          accessibilityLabel="Back"
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={16} color={colors.ink} />
          <Text style={[styles.headerBtnText, { color: colors.ink }]}>
            Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={[styles.headerBar, { borderBottomColor: colors.inkFaint }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={handleBack}
          accessibilityLabel="Back"
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Feather
            name={resolveCustomFeedIcon(customFeed.icon)}
            size={18}
            color={colors.ink}
          />
          <Text
            style={[styles.headerTitle, { color: colors.ink }]}
            numberOfLines={1}
          >
            {customFeed.name}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.headerBtn, { borderColor: colors.border }]}
          onPress={() =>
            navigation.navigate("CustomFeedEdit", {
              customFeedId: customFeed.id,
              from: "CustomFeedManage",
            })
          }
          accessibilityLabel="Edit custom feed"
          activeOpacity={0.7}
        >
          <Feather name="edit-2" size={14} color={colors.inkSoft} />
          <Text style={[styles.headerBtnText, { color: colors.inkSoft }]}>
            Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerBtn, { borderColor: colors.border }]}
          onPress={handleDelete}
          accessibilityLabel="Delete custom feed"
          activeOpacity={0.7}
        >
          <Feather name="trash-2" size={14} color={colors.danger} />
          <Text style={[styles.headerBtnText, { color: colors.danger }]}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>

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
          onPress={() =>
            navigation.navigate("AddFeed", {
              customFeedId: customFeed.id,
              from: "CustomFeedManage",
            })
          }
          accessibilityLabel="Add feed to this custom feed"
          activeOpacity={0.8}
        >
          <Text style={[styles.addBtnText, { color: colors.paper }]}>
            Add Feed +
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={visibleFeeds}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <DashedDivider />}
        ListHeaderComponent={() => (
          <View
            style={[styles.feedsHeader, { borderBottomColor: colors.inkFaint }]}
          >
            <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>
              FEEDS IN THIS CUSTOM FEED
            </Text>
          </View>
        )}
        ListEmptyComponent={() =>
          feeds.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>
                No feeds in this custom feed yet.
              </Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                Tap Add Feed + above to add one.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>
                No matches.
              </Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                Try a different search term.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const iconUri = getFeedIconUrl(item.url);
          const showIcon = Boolean(iconUri && !failedIconUris.has(iconUri));

          return (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() =>
                  navigation.navigate("Feed", {
                    selectedFeedId: item.id,
                    selectedFeedTitle: item.title,
                  })
                }
                accessibilityLabel={`Open ${item.title}`}
                activeOpacity={0.7}
              >
                {showIcon ? (
                  <Image
                    source={{ uri: iconUri ?? undefined }}
                    style={styles.feedIcon}
                    cachePolicy="memory-disk"
                    transition={80}
                    onError={() => {
                      if (!iconUri) return;
                      setFailedIconUris((prev) => new Set(prev).add(iconUri));
                    }}
                  />
                ) : null}
                <View style={styles.rowBody}>
                  <Text style={[styles.feedTitle, { color: colors.ink }]}>
                    {item.title}
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
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { borderColor: colors.border }]}
                onPress={() =>
                  navigation.navigate("FeedDetail", { feedId: item.id })
                }
                hitSlop={8}
                accessibilityLabel={`Edit ${item.title}`}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editBtn,
                  { borderColor: colors.border, marginRight: spacing.lg },
                ]}
                onPress={() => handleRemoveMember(item)}
                hitSlop={8}
                accessibilityLabel={`Remove ${item.title} from custom feed`}
                activeOpacity={0.8}
              >
                <Feather name="x" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
      />
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
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  headerBackBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.h2,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  headerBtnText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "stretch",
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
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    paddingVertical: 0,
  },
  addBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  list: { paddingBottom: spacing.sm },
  feedsHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  feedIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  rowBody: { flex: 1, gap: 2 },
  feedTitle: {
    fontSize: fontSize.body,
    fontWeight: "600",
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
  editBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
});
