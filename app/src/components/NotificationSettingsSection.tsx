import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getFeedById,
  getFeedsForTag,
  getMaxItemIdForFeed,
  getTagById,
  setFeedDailyNotificationSentAt,
  setFeedNotificationCheckpoint,
  setFeedNotificationSettings,
  setTagNotificationEnabled,
} from "../database";
import { useTheme } from "../context/ThemeContext";
import {
  ensureNotificationPermissions,
  getNotificationPermissionGranted,
} from "../notifications";
import { fonts, fontSize, radii, spacing } from "../theme";
import { Feed, Tag } from "../types";

type Props =
  | { source: "feed"; feedId: number }
  | { source: "tag"; tagId: number };

type FeedFrequency = "immediate" | "daily" | "off";

const FEED_FREQUENCY_OPTIONS: { value: FeedFrequency; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily digest" },
  { value: "off", label: "Off" },
];

function normalizeFeedFrequency(value: string | undefined): FeedFrequency {
  if (value === "immediate" || value === "daily" || value === "off") {
    return value;
  }
  return "off";
}

export default function NotificationSettingsSection(props: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (props.source === "feed") {
        setFeed(await getFeedById(props.feedId));
      } else {
        setTag(await getTagById(props.tagId));
      }
      setPermissionGranted(await getNotificationPermissionGranted());
    } finally {
      setLoading(false);
    }
  }, [props]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const feedFrequency = normalizeFeedFrequency(feed?.notify_frequency);
  const feedEnabled = feed?.notify_enabled === 1 && feedFrequency !== "off";
  const tagEnabled = tag?.notify_enabled === 1;

  const handleEnableForFeed = async (enabled: boolean) => {
    if (!feed) return;
    if (enabled) {
      const granted = await ensureNotificationPermissions();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "FeedMe needs notification permission to alert you about new items."
        );
        return;
      }
      const maxItemId = await getMaxItemIdForFeed(feed.id);
      await setFeedNotificationCheckpoint(feed.id, maxItemId);
      const nextFrequency: FeedFrequency =
        feed.notify_frequency === "daily" ? "daily" : "immediate";
      await setFeedNotificationSettings(feed.id, {
        enabled: true,
        frequency: nextFrequency,
      });
    } else {
      await setFeedNotificationSettings(feed.id, {
        enabled: false,
        frequency: "off",
      });
      await setFeedDailyNotificationSentAt(feed.id, null);
    }
    await loadData();
  };

  const handleFeedFrequency = async (next: FeedFrequency) => {
    if (!feed) return;
    if (next === "off") {
      await handleEnableForFeed(false);
      return;
    }
    const granted = await ensureNotificationPermissions();
    setPermissionGranted(granted);
    if (!granted) {
      Alert.alert(
        "Notifications disabled",
        "FeedMe needs notification permission to alert you about new items."
      );
      return;
    }
    if (feed.notify_enabled !== 1) {
      const maxItemId = await getMaxItemIdForFeed(feed.id);
      await setFeedNotificationCheckpoint(feed.id, maxItemId);
    }
    await setFeedNotificationSettings(feed.id, {
      enabled: true,
      frequency: next,
    });
    if (next === "daily") {
      await setFeedDailyNotificationSentAt(feed.id, null);
    }
    await loadData();
  };

  const handleEnableForTag = async (enabled: boolean) => {
    if (!tag) return;
    if (enabled) {
      const granted = await ensureNotificationPermissions();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "FeedMe needs notification permission to alert you about tagged feeds."
        );
        return;
      }
      const taggedFeeds = await getFeedsForTag(tag.id);
      for (const taggedFeed of taggedFeeds) {
        const maxItemId = await getMaxItemIdForFeed(taggedFeed.id);
        await setFeedNotificationCheckpoint(taggedFeed.id, maxItemId);
      }
    }
    await setTagNotificationEnabled(tag.id, enabled);
    await loadData();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionHeading, { color: colors.inkSoft }]}>
          Notifications
        </Text>
        <Text style={[styles.permission, { color: colors.inkFaint }]}>
          Permission: {permissionGranted ? "granted" : "not granted"}
        </Text>
      </View>

      {props.source === "feed" && feed ? (
        <>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>
                Notify on new items
              </Text>
              <Text style={[styles.rowHint, { color: colors.inkFaint }]}>
                Receive alerts for this feed
              </Text>
            </View>
            <Switch
              value={feedEnabled}
              onValueChange={handleEnableForFeed}
              thumbColor={colors.paper}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>

          <Text style={[styles.subHeading, { color: colors.inkSoft }]}>
            Frequency
          </Text>
          <View
            style={[
              styles.segmented,
              { borderColor: colors.border, backgroundColor: colors.paper },
            ]}
          >
            {FEED_FREQUENCY_OPTIONS.map((option) => {
              const active = feedFrequency === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.segment,
                    active && { backgroundColor: colors.accent },
                  ]}
                  onPress={() => handleFeedFrequency(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? colors.paper : colors.ink },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      {props.source === "tag" && tag ? (
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.ink }]}>
              Notify when tagged feeds have new items
            </Text>
            <Text style={[styles.rowHint, { color: colors.inkFaint }]}>
              Receive alerts for all feeds using this tag
            </Text>
          </View>
          <Switch
            value={tagEnabled}
            onValueChange={handleEnableForTag}
            thumbColor={colors.paper}
            trackColor={{ false: colors.border, true: colors.accent }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  loading: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionHeading: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  permission: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.bodyLg,
  },
  rowHint: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    marginTop: spacing.xs,
  },
  subHeading: {
    marginTop: spacing.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 3,
    alignSelf: "flex-start",
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  segmentText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
  },
});
