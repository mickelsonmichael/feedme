import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, radii, spacing } from "../theme";
import type { ColorTokens } from "../theme";
import { FeedBadge, FeedStats } from "../feedStats";

type Props = {
  stats: FeedStats;
};

function badgeColor(badge: FeedBadge, colors: ColorTokens): string {
  switch (badge) {
    case "Invalid":
    case "Unstable":
      return colors.danger;
    case "Dead":
      return colors.inkSoft;
    case "Spammy":
      return colors.accent;
    case "FrequentlySkipped":
      // Use a readable amber/orange rather than the highlight yellow
      // (which is too light for text/border).
      return "#b87c00";
  }
}

export function FeedStatusBadge({ badge }: { badge: FeedBadge }) {
  const { colors } = useTheme();
  const color = badgeColor(badge, colors);
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color, backgroundColor: color + "1A" },
      ]}
      accessibilityLabel={`Feed status: ${badge}`}
    >
      <Text style={[styles.pillText, { color }]}>{badge}</Text>
    </View>
  );
}

type RowProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  hint?: string | null;
  badge?: FeedBadge | null;
  /** When set, the row is highlighted as the source of the active badge. */
  highlight?: boolean;
};

function StatRow({ icon, label, value, hint, badge, highlight }: RowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Feather
        name={icon}
        size={14}
        color={highlight ? badgeColor(badge!, colors) : colors.inkSoft}
        style={styles.rowIcon}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>
            {label}
          </Text>
          {badge ? (
            <View
              style={[
                styles.inlinePill,
                {
                  borderColor: badgeColor(badge, colors),
                  backgroundColor: badgeColor(badge, colors) + "1A",
                },
              ]}
            >
              <Text
                style={[
                  styles.inlinePillText,
                  { color: badgeColor(badge, colors) },
                ]}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.rowValue, { color: colors.ink }]}>{value}</Text>
        {hint ? (
          <Text style={[styles.rowHint, { color: colors.inkFaint }]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function FeedStatsSection({ stats }: Props) {
  const { colors } = useTheme();

  // Decide which row owns the active badge so the UI can highlight it once.
  // Order mirrors selectBadge priority.
  let badgeOwner: "stability" | "frequency" | "newest" | "readTime" | null =
    null;
  if (stats.badge === "Invalid" || stats.badge === "Unstable") {
    badgeOwner = "stability";
  } else if (stats.badge === "Dead") {
    badgeOwner = "newest";
  } else if (stats.badge === "Spammy") {
    badgeOwner = "frequency";
  } else if (stats.badge === "FrequentlySkipped") {
    badgeOwner = "readTime";
  }

  const frequencyHint =
    stats.frequency.window === "90d"
      ? "averaged over the last 90 days"
      : stats.frequency.window === "lifetime"
        ? "averaged over the feed's full history"
        : null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.inkSoft }]}>
        statistics
      </Text>

      <View
        style={[
          styles.card,
          { borderColor: colors.border, backgroundColor: colors.paperWarm },
        ]}
      >
        <StatRow
          icon="bar-chart-2"
          label="Post frequency"
          value={stats.frequency.label}
          hint={frequencyHint}
          badge={badgeOwner === "frequency" ? stats.badge : null}
          highlight={badgeOwner === "frequency"}
        />

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
          accessibilityElementsHidden
        />

        <StatRow
          icon="activity"
          label="Stability"
          value={stats.stability.label}
          hint={
            stats.stability.totalCount > 0
              ? `${stats.stability.failureCount} failure${stats.stability.failureCount === 1 ? "" : "s"} out of ${stats.stability.totalCount} attempt${stats.stability.totalCount === 1 ? "" : "s"}`
              : "counters reset after the latest app update"
          }
          badge={badgeOwner === "stability" ? stats.badge : null}
          highlight={badgeOwner === "stability"}
        />

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
          accessibilityElementsHidden
        />

        <StatRow
          icon={
            stats.lastFetch.ok === false
              ? "alert-circle"
              : stats.lastFetch.ok === true
                ? "check-circle"
                : "clock"
          }
          label="Last fetch"
          value={stats.lastFetch.label}
        />
        {stats.lastFetch.error ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: colors.danger,
                backgroundColor: colors.danger + "18",
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {stats.lastFetch.error}
            </Text>
          </View>
        ) : null}

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
          accessibilityElementsHidden
        />

        <StatRow
          icon="hash"
          label="Total posts"
          value={String(stats.totalPosts)}
          hint={
            stats.newestPostAgeLabel
              ? `newest: ${stats.newestPostAgeLabel}`
              : null
          }
          badge={badgeOwner === "newest" ? stats.badge : null}
          highlight={badgeOwner === "newest"}
        />

        {stats.postingWindow.label ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
            />
            <StatRow
              icon="calendar"
              label="Typical posting window"
              value={stats.postingWindow.label}
            />
          </>
        ) : null}

        {stats.consecutiveFailures > 0 ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
            />
            <StatRow
              icon="alert-triangle"
              label="Failure streak"
              value={`${stats.consecutiveFailures} in a row`}
            />
          </>
        ) : null}

        {stats.nextFetchLabel ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
            />
            <StatRow
              icon="clock"
              label="Next scheduled fetch"
              value={stats.nextFetchLabel}
            />
          </>
        ) : null}

        {stats.avgReadTimeLabel ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
            />
            <StatRow
              icon="eye"
              label="Avg read time"
              value={stats.avgReadTimeLabel}
              hint="time spent before pressing Next in single layout"
              badge={badgeOwner === "readTime" ? stats.badge : null}
              highlight={badgeOwner === "readTime"}
            />
          </>
        ) : null}

        {stats.rateLimitInfo ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
              accessibilityElementsHidden
            />
            <StatRow
              icon="alert-octagon"
              label="Rate limit"
              value={stats.rateLimitInfo}
              hint="server returned 429 Too Many Requests"
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  heading: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowIcon: {
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  rowValue: {
    fontSize: fontSize.bodyLg,
    fontFamily: fonts.sans,
  },
  rowHint: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
    opacity: 0.5,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 18,
  },
  pill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  pillText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  inlinePill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  inlinePillText: {
    fontSize: 9,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
