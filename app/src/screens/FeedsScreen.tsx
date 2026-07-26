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
import {
  getFeeds,
  getTagsWithFeedCounts,
  getCustomFeedsWithMemberCounts,
} from "../database";
import {
  CustomFeedWithMemberCount,
  Feed,
  RootStackParamList,
  TabParamList,
  TagWithFeedCount,
} from "../types";
import { DashedDivider } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { getFeedIconUrl } from "../feedIcon";
import { resolveCustomFeedIcon } from "../customFeedIcons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feeds">,
  NativeStackScreenProps<RootStackParamList>
>;

// Cap on how many failed feeds are listed by name in the banner before
// collapsing the rest into an "…and N more" line, mirroring the summary the
// aggregated Feed screen used to show in its own refresh-failure alert.
const MAX_SHOWN_FAILURES = 3;

export default function FeedsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [tags, setTags] = useState<TagWithFeedCount[]>([]);
  const [customFeeds, setCustomFeeds] = useState<CustomFeedWithMemberCount[]>(
    []
  );
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Feeds currently carrying an error from their last refresh attempt.
  // `feed.error` is persisted by the refresher and cleared on the next
  // successful fetch, so this always reflects current state rather than a
  // one-off refresh session.
  const failedFeeds = useMemo(() => feeds.filter((f) => f.error), [feeds]);

  const loadData = useCallback(async () => {
    try {
      const [feedData, tagData, cfData] = await Promise.all([
        getFeeds(),
        getTagsWithFeedCounts(),
        getCustomFeedsWithMemberCounts(),
      ]);
      setFeeds(feedData);
      setTags(tagData);
      setCustomFeeds(cfData);
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
    // Feeds flagged as "custom-feed only" should never appear in the main
    // FEEDS list — they only show up inside their custom feed's manage
    // screen.
    const baseFeeds = feeds.filter((f) => f.show_only_in_custom_feed !== 1);
    const q = search.trim().toLowerCase();
    if (!q) return baseFeeds;
    return baseFeeds.filter(
      (f) =>
        f.title.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)
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

      {failedFeeds.length > 0 ? (
        <View
          style={[
            styles.errorBanner,
            { backgroundColor: colors.danger, borderColor: colors.danger },
          ]}
          accessibilityLabel={`${failedFeeds.length} feed${failedFeeds.length === 1 ? "" : "s"} failed to refresh`}
        >
          <View style={styles.errorBannerHeader}>
            <Feather name="alert-triangle" size={16} color={colors.paper} />
            <Text style={[styles.errorBannerTitle, { color: colors.paper }]}>
              {failedFeeds.length} feed{failedFeeds.length === 1 ? "" : "s"}{" "}
              failed to refresh
            </Text>
          </View>
          {failedFeeds.slice(0, MAX_SHOWN_FAILURES).map((feed) => (
            <Text
              key={feed.id}
              style={[styles.errorBannerItem, { color: colors.paper }]}
              numberOfLines={1}
            >
              • {feed.title}: {feed.error}
            </Text>
          ))}
          {failedFeeds.length > MAX_SHOWN_FAILURES ? (
            <Text style={[styles.errorBannerItem, { color: colors.paper }]}>
              …and {failedFeeds.length - MAX_SHOWN_FAILURES} more
            </Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={visibleFeeds}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <DashedDivider />}
        ListHeaderComponent={() => (
          <>
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate("Feed", {})}
                accessibilityLabel="Go to all feeds"
                activeOpacity={0.7}
              >
                <Feather name="home" size={16} color={colors.inkSoft} />
                <Text style={[styles.rowTitle, { color: colors.ink }]}>
                  All Feeds
                </Text>
              </TouchableOpacity>
              <DashedDivider />
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate("Saved")}
                accessibilityLabel="Go to saved"
                activeOpacity={0.7}
              >
                <Feather name="bookmark" size={16} color={colors.inkSoft} />
                <Text style={[styles.rowTitle, { color: colors.ink }]}>
                  Saved
                </Text>
              </TouchableOpacity>
              <DashedDivider />
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate("ReadLater")}
                accessibilityLabel="Go to read later"
                activeOpacity={0.7}
              >
                <Feather name="clock" size={16} color={colors.inkSoft} />
                <Text style={[styles.rowTitle, { color: colors.ink }]}>
                  Read Later
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.inkSoft }]}>
                  Custom Feeds
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("CustomFeedEdit", { from: "Feeds" })
                  }
                  hitSlop={8}
                  accessibilityLabel="Add custom feed"
                  activeOpacity={0.7}
                  style={styles.sectionAddBtn}
                >
                  <Feather name="plus" size={16} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>
              {customFeeds.length === 0 ? (
                <Text style={[styles.sectionEmpty, { color: colors.inkSoft }]}>
                  No custom feeds yet. Tap + to create one.
                </Text>
              ) : (
                customFeeds.map((cf, idx) => (
                  <React.Fragment key={cf.id}>
                    {idx > 0 ? <DashedDivider /> : null}
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={styles.rowTap}
                        onPress={() =>
                          navigation.navigate("Feed", {
                            selectedCustomFeedId: cf.id,
                            selectedCustomFeedName: cf.name,
                          })
                        }
                        accessibilityLabel={`Open custom feed ${cf.name}`}
                        activeOpacity={0.7}
                      >
                        <Feather
                          name={resolveCustomFeedIcon(cf.icon)}
                          size={16}
                          color={colors.inkSoft}
                        />
                        <Text
                          style={[styles.rowTitle, { color: colors.ink }]}
                          numberOfLines={1}
                        >
                          {cf.name}
                        </Text>
                        <Text
                          style={[styles.rowCount, { color: colors.inkSoft }]}
                        >
                          {cf.member_count}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() =>
                          navigation.navigate("CustomFeedManage", {
                            customFeedId: cf.id,
                            from: "Feeds",
                          })
                        }
                        hitSlop={8}
                        accessibilityLabel={`Manage ${cf.name}`}
                        activeOpacity={0.6}
                      >
                        <Feather
                          name="edit-2"
                          size={15}
                          color={colors.inkSoft}
                        />
                      </TouchableOpacity>
                    </View>
                  </React.Fragment>
                ))
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.inkSoft }]}>
                  Tags
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("TagDetail", { from: "Feeds" })
                  }
                  hitSlop={8}
                  accessibilityLabel="Add tag"
                  activeOpacity={0.7}
                  style={styles.sectionAddBtn}
                >
                  <Feather name="plus" size={16} color={colors.inkSoft} />
                </TouchableOpacity>
              </View>
              {tags.length === 0 ? (
                <Text style={[styles.sectionEmpty, { color: colors.inkSoft }]}>
                  No tags yet. Tap + to add one.
                </Text>
              ) : (
                tags.map((tag, idx) => (
                  <React.Fragment key={tag.id}>
                    {idx > 0 ? <DashedDivider /> : null}
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={styles.rowTap}
                        onPress={() =>
                          navigation.navigate("Feed", {
                            selectedTagId: tag.id,
                            selectedTagName: tag.name,
                          })
                        }
                        accessibilityLabel={`Open tag ${tag.name}`}
                        activeOpacity={0.7}
                      >
                        <Feather name="tag" size={16} color={colors.inkSoft} />
                        <Text
                          style={[styles.rowTitle, { color: colors.ink }]}
                          numberOfLines={1}
                        >
                          {tag.name}
                        </Text>
                        <Text
                          style={[styles.rowCount, { color: colors.inkSoft }]}
                        >
                          {tag.feed_count}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() =>
                          navigation.navigate("TagDetail", {
                            tagId: tag.id,
                            from: "Feeds",
                          })
                        }
                        hitSlop={8}
                        accessibilityLabel={`Edit ${tag.name}`}
                        activeOpacity={0.6}
                      >
                        <Feather
                          name="edit-2"
                          size={15}
                          color={colors.inkSoft}
                        />
                      </TouchableOpacity>
                    </View>
                  </React.Fragment>
                ))
              )}
            </View>

            <View style={[styles.section, styles.feedsSection]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.inkSoft }]}>
                  Feeds
                </Text>
                <Text style={[styles.rowCount, { color: colors.inkSoft }]}>
                  {visibleFeeds.length}
                </Text>
              </View>
            </View>
          </>
        )}
        ListEmptyComponent={() =>
          feeds.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>
                No feeds yet.
              </Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                Tap Add Feed + above to add your first feed.
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
            <View style={[styles.row, styles.feedRow]}>
              <TouchableOpacity
                style={styles.rowTap}
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
                ) : (
                  <View
                    style={[
                      styles.feedIcon,
                      styles.feedIconPlaceholder,
                      { backgroundColor: colors.paperWarm },
                    ]}
                  />
                )}
                <Text
                  style={[styles.rowTitle, { color: colors.ink }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
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
                style={styles.editBtn}
                onPress={() =>
                  navigation.navigate("FeedDetail", { feedId: item.id })
                }
                hitSlop={8}
                accessibilityLabel={`Edit ${item.title}`}
                activeOpacity={0.6}
              >
                <Feather name="edit-2" size={15} color={colors.inkSoft} />
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
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  errorBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorBannerTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },
  errorBannerItem: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  list: { paddingBottom: spacing.xl },

  // Section: a grouped block (quick links, custom feeds, tags, feeds list).
  // Sections are separated only by vertical spacing — no border boxes.
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  feedsSection: {
    paddingBottom: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionAddBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.xs,
  },
  sectionEmpty: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },

  // Unified row. Used by quick links, custom feeds, tags, and feed entries.
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: spacing.sm,
  },
  rowTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  rowTitle: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  rowCount: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontVariant: ["tabular-nums"],
    paddingHorizontal: spacing.xs,
  },

  // Feed rows live in the FlatList body (outside `section` padding), so they
  // get their own horizontal padding to match section content alignment.
  feedRow: {
    paddingHorizontal: spacing.lg,
  },
  feedIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  feedIconPlaceholder: {
    opacity: 0.6,
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

  // Ghost icon button — replaces the heavy bordered square. Sits on the
  // right edge of editable rows and stays visually quiet so the row content
  // reads first.
  editBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },

  emptyState: {
    alignItems: "center",
    padding: spacing.xl,
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
