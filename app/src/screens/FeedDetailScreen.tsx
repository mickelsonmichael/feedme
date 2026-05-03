import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  getFeeds,
  deleteFeed,
  updateFeed,
  updateFeedLastFetched,
  setFeedError,
  upsertItems,
  getTags,
  getTagsForFeed,
  getOrCreateTag,
  setFeedTags,
} from "../database";
import { fetchFeedWithMeta } from "../feedParser";
import { Feed, RootStackParamList, Tag, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { SelectedTag, TagMultiSelect } from "../components/TagMultiSelect";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "FeedDetail">,
  NativeStackScreenProps<RootStackParamList>
>;

const PROXY_ALERT_TITLE = "Using Feed Proxy";
const PROXY_ALERT_MESSAGE =
  "This request was blocked in the browser, so Feedme used your configured feed proxy.";

function formatDate(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const { feedId } = route.params;

  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [useProxy, setUseProxy] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const [showOnlyInTag, setShowOnlyInTag] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([]);
  const [originalTagIds, setOriginalTagIds] = useState<number[]>([]);

  const tagsChanged = (() => {
    if (selectedTags.some((t) => t.id === null)) return true;
    const current = selectedTags
      .map((t) => t.id)
      .filter((id): id is number => id !== null)
      .sort();
    const original = [...originalTagIds].sort();
    if (current.length !== original.length) return true;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== original[i]) return true;
    }
    return false;
  })();

  const hasChanges =
    feed !== null &&
    (title.trim() !== feed.title ||
      url.trim() !== feed.url ||
      useProxy !== (feed.use_proxy === 1) ||
      isNsfw !== (feed.nsfw === 1) ||
      showOnlyInTag !== (feed.show_only_in_tag === 1) ||
      tagsChanged);

  const loadFeed = useCallback(async () => {
    try {
      const [all, allTags] = await Promise.all([getFeeds(), getTags()]);
      const found = all.find((f) => f.id === feedId) ?? null;
      setFeed(found);
      setAvailableTags(allTags);
      if (found) {
        setTitle(found.title);
        setUrl(found.url);
        setUseProxy(found.use_proxy === 1);
        setIsNsfw(found.nsfw === 1);
        setShowOnlyInTag(found.show_only_in_tag === 1);
        const feedTags = await getTagsForFeed(found.id);
        setSelectedTags(feedTags.map((t) => ({ id: t.id, name: t.name })));
        setOriginalTagIds(feedTags.map((t) => t.id));
      }
    } finally {
      setLoading(false);
    }
  }, [feedId]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();

    if (!trimmedTitle) {
      Alert.alert("Validation", "Title cannot be empty.");
      return;
    }
    if (!trimmedUrl) {
      Alert.alert("Validation", "URL cannot be empty.");
      return;
    }
    if (
      !trimmedUrl.startsWith("http://") &&
      !trimmedUrl.startsWith("https://")
    ) {
      Alert.alert("Validation", "URL must start with http:// or https://");
      return;
    }

    setSaving(true);
    try {
      await updateFeed(feedId, {
        title: trimmedTitle,
        url: trimmedUrl,
        use_proxy: useProxy ? 1 : 0,
        nsfw: isNsfw ? 1 : 0,
        show_only_in_tag: showOnlyInTag ? 1 : 0,
      });

      // Resolve any newly-created tags and persist the membership list.
      const tagIds: number[] = [];
      for (const tag of selectedTags) {
        if (tag.id !== null) {
          tagIds.push(tag.id);
        } else {
          const created = await getOrCreateTag(tag.name);
          tagIds.push(created.id);
        }
      }
      await setFeedTags(feedId, tagIds);

      // Refetch feed after save
      try {
        const { items, usedProxy } = await fetchFeedWithMeta(
          trimmedUrl,
          useProxy
        );
        await upsertItems(feedId, items);
        await updateFeedLastFetched(feedId);
        await setFeedError(feedId, null);
        if (usedProxy) {
          Alert.alert(PROXY_ALERT_TITLE, PROXY_ALERT_MESSAGE);
        }
      } catch (fetchErr) {
        await setFeedError(feedId, (fetchErr as Error).message);
      }

      await loadFeed();
    } catch (err) {
      if ((err as Error).message?.includes("UNIQUE")) {
        Alert.alert("Duplicate", "Another feed with this URL already exists.");
      } else {
        Alert.alert("Error", "Could not save: " + (err as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const message = `Remove "${feed?.title ?? "this feed"}"? All associated items will be deleted.`;

    const doDelete = async () => {
      try {
        await deleteFeed(feedId);
        navigation.navigate("Feeds");
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

  if (!feed) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>
          Feed not found.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Mobile header */}
      {!isDesktopWeb ? (
        <View style={[styles.topBar, { borderBottomColor: colors.inkFaint }]}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Feeds")}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity
            onPress={handleSave}
            hitSlop={8}
            style={[styles.iconBtn, (!hasChanges || saving) && styles.disabled]}
            disabled={!hasChanges || saving}
            accessibilityLabel="Save feed"
          >
            <Feather
              name="save"
              size={22}
              color={!hasChanges || saving ? colors.inkFaint : colors.accent}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Delete feed"
          >
            <Feather name="trash-2" size={22} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            isDesktopWeb
              ? [
                  styles.card,
                  {
                    backgroundColor: colors.paper,
                    borderColor: colors.border,
                    shadowColor: colors.ink,
                  },
                ]
              : undefined
          }
        >
          {isDesktopWeb ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate("Feeds")}
                activeOpacity={0.7}
                accessibilityLabel="Back"
              >
                <Feather name="arrow-left" size={16} color={colors.ink} />
                <Text style={[styles.actionText, { color: colors.ink }]}>
                  Back
                </Text>
              </TouchableOpacity>
              <View style={styles.actionSpacer} />
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { borderColor: colors.border },
                  (!hasChanges || saving) && styles.actionBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={!hasChanges || saving}
                activeOpacity={0.7}
                accessibilityLabel="Save feed"
              >
                <Feather
                  name="save"
                  size={16}
                  color={
                    !hasChanges || saving ? colors.inkFaint : colors.accent
                  }
                />
                <Text
                  style={[
                    styles.actionText,
                    {
                      color:
                        !hasChanges || saving ? colors.inkFaint : colors.accent,
                    },
                  ]}
                >
                  Save
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { borderColor: colors.danger + "60" },
                ]}
                onPress={handleDelete}
                activeOpacity={0.7}
                accessibilityLabel="Delete feed"
              >
                <Feather name="trash-2" size={16} color={colors.danger} />
                <Text style={[styles.actionText, { color: colors.danger }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {feed.error ? (
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
                {feed.error}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.inkSoft }]}>title</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.paper,
                borderColor: colors.border,
                color: colors.ink,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="Feed title"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.inkSoft }]}>url</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.paper,
                borderColor: colors.border,
                color: colors.ink,
              },
            ]}
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/feed.xml"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
          />

          <Text style={[styles.lastFetch, { color: colors.inkSoft }]}>
            Last fetch: {formatDate(feed.last_fetched)}
          </Text>

          <View style={styles.proxyRow}>
            <View style={styles.proxyLabelGroup}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                use proxy
              </Text>
              <Text style={[styles.proxyHint, { color: colors.inkFaint }]}>
                Route requests through the configured proxy server
              </Text>
            </View>
            <Switch
              value={useProxy}
              onValueChange={setUseProxy}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.paper}
            />
          </View>

          <View style={styles.proxyRow}>
            <View style={styles.proxyLabelGroup}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                nsfw
              </Text>
              <Text style={[styles.proxyHint, { color: colors.inkFaint }]}>
                Blur thumbnails and require tap-to-reveal in card view
              </Text>
            </View>
            <Switch
              value={isNsfw}
              onValueChange={setIsNsfw}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.paper}
            />
          </View>

          <Text style={[styles.label, { color: colors.inkSoft }]}>tags</Text>
          <TagMultiSelect
            value={selectedTags}
            onChange={setSelectedTags}
            availableTags={availableTags}
            testID="feed-detail-tags"
          />

          <View style={styles.proxyRow}>
            <View style={styles.proxyLabelGroup}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                show only on tag feeds
              </Text>
              <Text style={[styles.proxyHint, { color: colors.inkFaint }]}>
                Hide this feed&apos;s posts from the main feed. Posts will only
                appear when viewing this feed directly or any of its tags.
              </Text>
            </View>
            <Switch
              value={showOnlyInTag}
              onValueChange={setShowOnlyInTag}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.paper}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  spacer: { flex: 1 },
  iconBtn: {
    padding: spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLg,
  },
  lastFetch: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginTop: spacing.xl,
  },
  proxyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
  },
  proxyLabelGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  proxyHint: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginTop: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 920,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  actionSpacer: { flex: 1 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
});
