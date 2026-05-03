import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getFeeds, getTagsWithFeedCounts } from "../database";
import { Feed, RootStackParamList, TabParamList, TagWithFeedCount } from "../types";
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
  const [tags, setTags] = useState<TagWithFeedCount[]>([]);
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [feedData, tagData] = await Promise.all([
        getFeeds(),
        getTagsWithFeedCounts(),
      ]);
      setFeeds(feedData);
      setTags(tagData);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
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
          <Text style={[styles.addBtnText, { color: colors.paper }]}>
            Add Feed +
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.quickLinksSection,
          { borderBottomColor: colors.inkFaint },
        ]}
      >
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate("Feed", {})}
          accessibilityLabel="Go to all feeds"
          activeOpacity={0.8}
        >
          <Feather name="home" size={16} color={colors.inkSoft} />
          <Text style={[styles.quickLinkText, { color: colors.ink }]}>
            All Feeds
          </Text>
        </TouchableOpacity>
        <DashedDivider />
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate("Saved")}
          accessibilityLabel="Go to saved"
          activeOpacity={0.8}
        >
          <Feather name="bookmark" size={16} color={colors.inkSoft} />
          <Text style={[styles.quickLinkText, { color: colors.ink }]}>
            Saved
          </Text>
        </TouchableOpacity>
        <DashedDivider />
        <TouchableOpacity
          style={styles.quickLinkRow}
          onPress={() => navigation.navigate("ReadLater")}
          accessibilityLabel="Go to read later"
          activeOpacity={0.8}
        >
          <Feather name="clock" size={16} color={colors.inkSoft} />
          <Text style={[styles.quickLinkText, { color: colors.ink }]}>
            Read Later
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.tagsSection,
          { borderBottomColor: colors.inkFaint },
        ]}
      >
        <View style={styles.tagsHeader}>
          <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>
            TAGS
          </Text>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("TagDetail", { from: "Feeds" })
            }
            hitSlop={8}
            accessibilityLabel="Add tag"
            activeOpacity={0.7}
            style={styles.tagAddBtn}
          >
            <Feather name="plus" size={14} color={colors.inkSoft} />
          </TouchableOpacity>
        </View>
        {tags.length === 0 ? (
          <Text style={[styles.tagEmpty, { color: colors.inkFaint }]}>
            No tags yet. Tap + to add one.
          </Text>
        ) : (
          tags.map((tag) => (
            <View key={tag.id} style={styles.tagRow}>
              <TouchableOpacity
                style={styles.tagRowMain}
                onPress={() =>
                  navigation.navigate("Feed", {
                    selectedTagId: tag.id,
                    selectedTagName: tag.name,
                  })
                }
                accessibilityLabel={`Open tag ${tag.name}`}
                activeOpacity={0.7}
              >
                <Feather name="tag" size={14} color={colors.inkSoft} />
                <Text style={[styles.tagText, { color: colors.ink }]}>
                  {tag.name}
                </Text>
                <Text style={[styles.tagCount, { color: colors.inkFaint }]}>
                  {tag.feed_count}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editBtn,
                  { borderColor: colors.border, marginRight: 0 },
                ]}
                onPress={() =>
                  navigation.navigate("TagDetail", {
                    tagId: tag.id,
                    from: "Feeds",
                  })
                }
                hitSlop={8}
                accessibilityLabel={`Edit ${tag.name}`}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No feeds yet.
          </Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            Tap Add Feed + above to add your first feed.
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
              </View>
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
  quickLinksSection: {
    marginHorizontal: 0,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  quickLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  quickLinkText: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
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
    marginRight: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  tagsSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  tagsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  tagAddBtn: {
    marginLeft: "auto",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  tagEmpty: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontStyle: "italic",
    paddingVertical: spacing.xs,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tagRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 40,
  },
  tagText: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  tagCount: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    paddingHorizontal: spacing.sm,
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
