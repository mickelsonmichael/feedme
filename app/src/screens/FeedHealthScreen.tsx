import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getFeeds, getFeedItemStats, deleteFeed } from "../database";
import { RootStackParamList, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import {
  buildFeedsWithHealth,
  FeedFlag,
  FeedWithHealth,
  DEAD_THRESHOLD_DAYS,
  SPAMMY_THRESHOLD_PER_DAY,
  ERROR_THRESHOLD,
} from "../feedHealth";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "FeedHealth">,
  NativeStackScreenProps<RootStackParamList>
>;

type ActiveFilter = "all" | FeedFlag;

const FLAG_CONFIG: Record<
  FeedFlag,
  { label: string; color: string; icon: string; description: string }
> = {
  dead: {
    label: "Dead",
    color: "#b44b4b",
    icon: "wifi-off",
    description: `No successful fetch in ${DEAD_THRESHOLD_DAYS}+ days`,
  },
  spammy: {
    label: "Spammy",
    color: "#c07a1a",
    icon: "alert-triangle",
    description: `Averaging ${SPAMMY_THRESHOLD_PER_DAY}+ posts/day`,
  },
  erroring: {
    label: "Erroring",
    color: "#7e78c4",
    icon: "x-circle",
    description: `${ERROR_THRESHOLD}+ consecutive fetch errors`,
  },
};

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FeedHealthScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [feedsWithHealth, setFeedsWithHealth] = useState<FeedWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const loadData = useCallback(async () => {
    try {
      const [feeds, stats] = await Promise.all([
        getFeeds(),
        getFeedItemStats(),
      ]);
      const statsMap = new Map(stats.map((s) => [s.feedId, s]));
      setFeedsWithHealth(buildFeedsWithHealth(feeds, statsMap));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const flaggedFeeds = feedsWithHealth.filter((f) => f.flags.length > 0);
  const visibleFeeds =
    activeFilter === "all"
      ? flaggedFeeds
      : flaggedFeeds.filter((f) =>
          (f.flags as string[]).includes(activeFilter)
        );

  const deadCount = feedsWithHealth.filter((f) =>
    (f.flags as string[]).includes("dead")
  ).length;
  const spammyCount = feedsWithHealth.filter((f) =>
    (f.flags as string[]).includes("spammy")
  ).length;
  const erroringCount = feedsWithHealth.filter((f) =>
    (f.flags as string[]).includes("erroring")
  ).length;

  const confirmUnsubscribe = (feed: FeedWithHealth) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Unsubscribe from "${feed.title}"?`)) {
        handleUnsubscribe(feed);
      }
    } else {
      Alert.alert(
        "Unsubscribe",
        `Remove "${feed.title}" from your subscriptions?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unsubscribe",
            style: "destructive",
            onPress: () => handleUnsubscribe(feed),
          },
        ]
      );
    }
  };

  const handleUnsubscribe = async (feed: FeedWithHealth) => {
    await deleteFeed(feed.id);
    setFeedsWithHealth((prev) => prev.filter((f) => f.id !== feed.id));
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
      <FlatList
        data={visibleFeeds}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={() => (
          <>
            {/* Back button */}
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Go back"
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={16} color={colors.inkSoft} />
              <Text style={[styles.backText, { color: colors.inkSoft }]}>
                Feed Health
              </Text>
            </TouchableOpacity>

            {/* Summary cards */}
            <View style={styles.summaryRow}>
              {(["dead", "spammy", "erroring"] as FeedFlag[]).map((flag) => {
                const cfg = FLAG_CONFIG[flag];
                const count =
                  flag === "dead"
                    ? deadCount
                    : flag === "spammy"
                      ? spammyCount
                      : erroringCount;
                const active = activeFilter === flag;
                return (
                  <TouchableOpacity
                    key={flag}
                    style={[
                      styles.summaryCard,
                      {
                        backgroundColor: active
                          ? colors.paperWarm
                          : colors.paper,
                        borderColor: active ? cfg.color : colors.border,
                      },
                    ]}
                    onPress={() =>
                      setActiveFilter(active ? "all" : (flag as ActiveFilter))
                    }
                    accessibilityLabel={`Filter by ${cfg.label}: ${count} feeds`}
                    activeOpacity={0.8}
                  >
                    <Feather
                      name={
                        cfg.icon as React.ComponentProps<typeof Feather>["name"]
                      }
                      size={16}
                      color={cfg.color}
                    />
                    <Text style={[styles.summaryCount, { color: cfg.color }]}>
                      {count}
                    </Text>
                    <Text
                      style={[styles.summaryLabel, { color: colors.inkSoft }]}
                    >
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filter row */}
            {activeFilter !== "all" && (
              <View style={styles.filterRow}>
                <Text style={[styles.filterText, { color: colors.inkSoft }]}>
                  {FLAG_CONFIG[activeFilter as FeedFlag].description} — tap card
                  to clear
                </Text>
              </View>
            )}

            {/* Section label */}
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: colors.inkFaint },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>
                {activeFilter === "all"
                  ? `${flaggedFeeds.length} FLAGGED FEED${flaggedFeeds.length !== 1 ? "S" : ""}`
                  : `${visibleFeeds.length} ${FLAG_CONFIG[activeFilter as FeedFlag].label.toUpperCase()} FEED${visibleFeeds.length !== 1 ? "S" : ""}`}
              </Text>
            </View>
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={40} color={colors.inkFaint} />
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>
              {feedsWithHealth.length === 0
                ? "No feeds yet."
                : "All feeds are healthy!"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
              {feedsWithHealth.length === 0
                ? "Add some feeds to get started."
                : "No feeds are flagged as dead, spammy, or erroring."}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <FeedHealthRow
            feed={item}
            onUnsubscribe={() => confirmUnsubscribe(item)}
            onKeep={() =>
              navigation.navigate("FeedDetail", { feedId: item.id })
            }
          />
        )}
      />
    </View>
  );
}

function FeedHealthRow({
  feed,
  onUnsubscribe,
  onKeep,
}: {
  feed: FeedWithHealth;
  onUnsubscribe: () => void;
  onKeep: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.feedRow, { borderBottomColor: colors.border }]}>
      <View style={styles.feedInfo}>
        <Text
          style={[styles.feedTitle, { color: colors.ink }]}
          numberOfLines={1}
        >
          {feed.title}
        </Text>

        {/* Stats line */}
        <Text style={[styles.feedMeta, { color: colors.inkSoft }]}>
          Last fetch: {formatDate(feed.last_fetched)} · {feed.totalItems} items
          stored · {feed.avgPostsPerDay.toFixed(1)} posts/day (30d)
        </Text>

        {/* Flag badges */}
        <View style={styles.flagRow}>
          {feed.flags.map((flag) => {
            const cfg = FLAG_CONFIG[flag as FeedFlag];
            return (
              <View
                key={flag}
                style={[
                  styles.flagBadge,
                  { backgroundColor: cfg.color + "22", borderColor: cfg.color },
                ]}
              >
                <Feather
                  name={
                    cfg.icon as React.ComponentProps<typeof Feather>["name"]
                  }
                  size={10}
                  color={cfg.color}
                />
                <Text style={[styles.flagBadgeText, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionCol}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { borderColor: colors.danger, backgroundColor: "transparent" },
          ]}
          onPress={onUnsubscribe}
          accessibilityLabel={`Unsubscribe from ${feed.title}`}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: colors.danger }]}>
            Remove
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { borderColor: colors.border, backgroundColor: "transparent" },
          ]}
          onPress={onKeep}
          accessibilityLabel={`Keep ${feed.title} and view details`}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnText, { color: colors.inkSoft }]}>
            Details
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  list: { paddingBottom: spacing.xl },

  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: {
    fontSize: fontSize.title,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },

  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  summaryCount: {
    fontSize: fontSize.h2,
    fontFamily: fonts.sans,
    fontWeight: "700",
    lineHeight: 22,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  filterText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontStyle: "italic",
  },

  sectionHeader: {
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
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
  emptySub: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    textAlign: "center",
  },

  feedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  feedInfo: { flex: 1, gap: spacing.xs },
  feedTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  feedMeta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  flagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  flagBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },

  actionCol: {
    gap: spacing.xs,
    alignItems: "flex-end",
    paddingTop: spacing.xs,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
});
