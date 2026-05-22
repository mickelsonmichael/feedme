import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  addCustomFeed,
  deleteCustomFeed,
  getCustomFeedById,
  getCustomFeedMembers,
  getFeeds,
  setCustomFeedMembers,
  updateCustomFeed,
} from "../database";
import { Feed, RootStackParamList, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { getFeedIconUrl } from "../feedIcon";
import {
  CUSTOM_FEED_ICON_OPTIONS,
  DEFAULT_CUSTOM_FEED_ICON,
  filterCustomFeedIcons,
  resolveCustomFeedIcon,
} from "../customFeedIcons";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "CustomFeedEdit">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function CustomFeedEditScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const customFeedId = route.params?.customFeedId;
  const isEditMode = customFeedId !== undefined;

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_CUSTOM_FEED_ICON);
  const [nsfw, setNsfw] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [allFeeds, setAllFeeds] = useState<Feed[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(
    new Set()
  );
  const [feedSearch, setFeedSearch] = useState("");
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const feeds = await getFeeds();
      setAllFeeds(feeds);
      if (isEditMode && customFeedId !== undefined) {
        const [cf, members] = await Promise.all([
          getCustomFeedById(customFeedId),
          getCustomFeedMembers(customFeedId),
        ]);
        if (cf) {
          setName(cf.name);
          setOriginalName(cf.name);
          setIcon(cf.icon || DEFAULT_CUSTOM_FEED_ICON);
          setNsfw(cf.nsfw === 1);
        }
        setSelectedFeedIds(new Set(members));
      }
    } finally {
      setLoading(false);
    }
  }, [isEditMode, customFeedId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const goBack = () => {
    if (route.params?.from === "Feeds") {
      navigation.navigate("Feeds");
    } else {
      navigation.navigate("Feed", {});
    }
  };

  const toggleFeed = (feedId: number) => {
    setSelectedFeedIds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) next.delete(feedId);
      else next.add(feedId);
      return next;
    });
  };

  const hasName = name.trim().length > 0;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Custom feed name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      let resolvedId: number;
      if (isEditMode && customFeedId !== undefined) {
        await updateCustomFeed(customFeedId, {
          name: trimmed,
          icon,
          nsfw: nsfw ? 1 : 0,
        });
        resolvedId = customFeedId;
      } else {
        resolvedId = await addCustomFeed({
          name: trimmed,
          icon,
          nsfw: nsfw ? 1 : 0,
        });
      }
      await setCustomFeedMembers(resolvedId, Array.from(selectedFeedIds));
      goBack();
    } catch (err) {
      Alert.alert(
        "Error",
        (err as Error).message ?? "Could not save custom feed."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditMode || customFeedId === undefined) return;
    const message = `Remove custom feed "${originalName}"? The underlying subscriptions and their items will be kept.`;

    const doDelete = async () => {
      try {
        await deleteCustomFeed(customFeedId);
        goBack();
      } catch (err) {
        const msg = "Could not delete custom feed: " + (err as Error).message;
        if (Platform.OS === "web") window.alert(msg);
        else Alert.alert("Error", msg);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) doDelete();
      return;
    }

    Alert.alert("Remove Custom Feed", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doDelete },
    ]);
  };

  const visibleIcons = useMemo(
    () => filterCustomFeedIcons(iconSearch, CUSTOM_FEED_ICON_OPTIONS),
    [iconSearch]
  );

  const visibleFeeds = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    if (!q) return allFeeds;
    return allFeeds.filter(
      (f) =>
        f.title.toLowerCase().includes(q) || f.url.toLowerCase().includes(q)
    );
  }, [allFeeds, feedSearch]);

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

  const resolvedIcon = resolveCustomFeedIcon(icon);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!isDesktopWeb ? (
        <View style={[styles.topBar, { borderBottomColor: colors.inkFaint }]}>
          <TouchableOpacity
            onPress={goBack}
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
            style={[styles.iconBtn, (!hasName || saving) && styles.disabled]}
            disabled={!hasName || saving}
            accessibilityLabel="Save custom feed"
          >
            <Feather
              name="save"
              size={22}
              color={!hasName || saving ? colors.inkFaint : colors.accent}
            />
          </TouchableOpacity>
          {isEditMode ? (
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel="Delete custom feed"
            >
              <Feather name="trash-2" size={22} color={colors.danger} />
            </TouchableOpacity>
          ) : null}
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
                onPress={goBack}
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
                  (!hasName || saving) && styles.actionBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={!hasName || saving}
                activeOpacity={0.7}
                accessibilityLabel="Save custom feed"
              >
                <Feather
                  name="save"
                  size={16}
                  color={!hasName || saving ? colors.inkFaint : colors.accent}
                />
                <Text
                  style={[
                    styles.actionText,
                    {
                      color:
                        !hasName || saving ? colors.inkFaint : colors.accent,
                    },
                  ]}
                >
                  Save
                </Text>
              </TouchableOpacity>
              {isEditMode ? (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { borderColor: colors.danger + "60" },
                  ]}
                  onPress={handleDelete}
                  activeOpacity={0.7}
                  accessibilityLabel="Delete custom feed"
                >
                  <Feather name="trash-2" size={16} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.headingRow}>
            <Feather name={resolvedIcon} size={22} color={colors.accent} />
            <Text style={[styles.heading, { color: colors.ink }]}>
              {isEditMode ? "Edit Custom Feed" : "Create Custom Feed"}
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.inkSoft }]}>name *</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.paper,
                borderColor: colors.border,
                color: colors.ink,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Morning Reads"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Custom feed name"
          />

          <Text style={[styles.label, { color: colors.inkSoft }]}>icon</Text>
          <View
            style={[
              styles.searchRow,
              {
                borderColor: colors.inkFaint,
                backgroundColor: colors.paperWarm,
              },
            ]}
          >
            <Feather name="search" size={14} color={colors.inkSoft} />
            <TextInput
              style={[styles.searchInput, { color: colors.ink }]}
              placeholder="search icons…"
              placeholderTextColor={colors.inkFaint}
              value={iconSearch}
              onChangeText={setIconSearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search icons"
            />
          </View>
          <View style={styles.iconGrid} testID="custom-feed-icon-grid">
            {visibleIcons.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.inkFaint }]}>
                No icons match.
              </Text>
            ) : (
              visibleIcons.map((opt) => {
                const selected = opt.name === icon;
                return (
                  <TouchableOpacity
                    key={opt.name}
                    style={[
                      styles.iconCell,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected
                          ? colors.paperWarm
                          : colors.paper,
                      },
                    ]}
                    onPress={() => setIcon(opt.name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Pick icon ${opt.name}`}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={opt.name}
                      size={18}
                      color={selected ? colors.accent : colors.inkSoft}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <View style={styles.nsfwRow}>
            <View style={styles.nsfwLabelWrap}>
              <Text
                style={[styles.label, { color: colors.inkSoft, marginTop: 0 }]}
              >
                mark all posts as nsfw
              </Text>
              <Text style={[styles.hintText, { color: colors.inkFaint }]}>
                When on, every post in this custom feed is gated as NSFW
                regardless of the source feed.
              </Text>
            </View>
            <Switch
              value={nsfw}
              onValueChange={setNsfw}
              accessibilityLabel="Mark feed as NSFW"
              testID="custom-feed-nsfw-switch"
            />
          </View>

          <Text style={[styles.label, { color: colors.inkSoft }]}>
            subscriptions
          </Text>
          <Text style={[styles.hintText, { color: colors.inkFaint }]}>
            Pick which of your existing feeds belong to this custom feed. Read /
            unread, saved, and refresh state is shared with the main feed.
          </Text>
          <View
            style={[
              styles.infoBox,
              {
                borderColor: colors.border,
                backgroundColor: colors.paperWarm,
              },
            ]}
          >
            <Feather name="info" size={14} color={colors.inkSoft} />
            <Text style={[styles.infoBoxText, { color: colors.inkSoft }]}>
              More feeds can be added later from this custom feed&apos;s manage
              screen.
            </Text>
          </View>

          <View
            style={[
              styles.searchRow,
              {
                borderColor: colors.inkFaint,
                backgroundColor: colors.paperWarm,
              },
            ]}
          >
            <Feather name="search" size={14} color={colors.inkSoft} />
            <TextInput
              style={[styles.searchInput, { color: colors.ink }]}
              placeholder="search feeds…"
              placeholderTextColor={colors.inkFaint}
              value={feedSearch}
              onChangeText={setFeedSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.feedList, { borderColor: colors.border }]}>
            {visibleFeeds.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.inkFaint }]}>
                {allFeeds.length === 0
                  ? "No feeds yet — add some from Manage Feeds first."
                  : "No feeds match."}
              </Text>
            ) : (
              visibleFeeds.map((feed) => {
                const checked = selectedFeedIds.has(feed.id);
                const iconUri = getFeedIconUrl(feed.url);
                const showIcon = Boolean(
                  iconUri && !failedIconUris.has(iconUri)
                );
                return (
                  <TouchableOpacity
                    key={feed.id}
                    style={[
                      styles.feedRow,
                      { borderBottomColor: colors.inkFaint },
                    ]}
                    onPress={() => toggleFeed(feed.id)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={`${checked ? "Remove" : "Add"} ${feed.title}`}
                  >
                    <Feather
                      name={checked ? "check-square" : "square"}
                      size={18}
                      color={checked ? colors.accent : colors.inkSoft}
                    />
                    {showIcon ? (
                      <Image
                        source={{ uri: iconUri ?? undefined }}
                        style={styles.feedIcon}
                        cachePolicy="memory-disk"
                        transition={80}
                        onError={() => {
                          if (!iconUri) return;
                          setFailedIconUris((prev) =>
                            new Set(prev).add(iconUri)
                          );
                        }}
                      />
                    ) : null}
                    <Text
                      style={[styles.feedTitle, { color: colors.ink }]}
                      numberOfLines={1}
                    >
                      {feed.title}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
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
  iconBtn: { padding: spacing.sm },
  disabled: { opacity: 0.4 },
  content: { padding: spacing.lg, gap: spacing.sm },
  desktopContent: { alignItems: "center", paddingHorizontal: spacing.xl },
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
  actionBtnDisabled: { opacity: 0.5 },
  actionText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h2,
    fontWeight: "600",
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  hintText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginBottom: spacing.sm,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoBoxText: {
    flex: 1,
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLg,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    paddingVertical: 0,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  iconCell: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nsfwRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  nsfwLabelWrap: { flex: 1 },
  feedList: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  feedIcon: { width: 16, height: 16, borderRadius: 4 },
  feedTitle: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  emptyText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontStyle: "italic",
    padding: spacing.md,
  },
});
