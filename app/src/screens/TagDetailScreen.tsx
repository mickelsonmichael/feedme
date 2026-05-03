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
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  addTag,
  deleteTag,
  getFeeds,
  getFeedsForTag,
  getTags,
  setTagFeeds,
  updateTag,
} from "../database";
import {
  Feed,
  RootStackParamList,
  Tag,
  TabParamList,
} from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { getFeedIconUrl } from "../feedIcon";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "TagDetail">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function TagDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const tagId = route.params?.tagId;
  const isEditMode = tagId !== undefined;

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [allFeeds, setAllFeeds] = useState<Feed[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(
    new Set()
  );
  const [originalFeedIds, setOriginalFeedIds] = useState<Set<number>>(
    new Set()
  );
  const [search, setSearch] = useState("");
  const [failedIconUris, setFailedIconUris] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const feeds = await getFeeds();
      setAllFeeds(feeds);
      if (isEditMode && tagId !== undefined) {
        const [tags, taggedFeeds] = await Promise.all([
          getTags(),
          getFeedsForTag(tagId),
        ]);
        const tag = tags.find((t) => t.id === tagId) ?? null;
        if (tag) {
          setName(tag.name);
          setOriginalName(tag.name);
        }
        const ids = new Set(taggedFeeds.map((f) => f.id));
        setSelectedFeedIds(ids);
        setOriginalFeedIds(ids);
      }
    } finally {
      setLoading(false);
    }
  }, [isEditMode, tagId]);

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
      if (next.has(feedId)) {
        next.delete(feedId);
      } else {
        next.add(feedId);
      }
      return next;
    });
  };

  const feedIdsEqual = useMemo(() => {
    if (selectedFeedIds.size !== originalFeedIds.size) return false;
    for (const id of selectedFeedIds) {
      if (!originalFeedIds.has(id)) return false;
    }
    return true;
  }, [selectedFeedIds, originalFeedIds]);

  const hasChanges = isEditMode
    ? name.trim() !== originalName || !feedIdsEqual
    : name.trim().length > 0 || selectedFeedIds.size > 0;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation", "Tag name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      let resolvedTagId: number;
      if (isEditMode && tagId !== undefined) {
        if (trimmed !== originalName) {
          await updateTag(tagId, trimmed);
        }
        resolvedTagId = tagId;
      } else {
        resolvedTagId = await addTag(trimmed);
      }
      await setTagFeeds(resolvedTagId, Array.from(selectedFeedIds));
      goBack();
    } catch (err) {
      const message = (err as Error).message ?? "Could not save tag";
      if (message.toLowerCase().includes("unique")) {
        Alert.alert("Duplicate", "A tag with this name already exists.");
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditMode || tagId === undefined) return;
    const message = `Remove tag "${originalName}"? Feeds tagged with it will keep their other tags.`;

    const doDelete = async () => {
      try {
        await deleteTag(tagId);
        goBack();
      } catch (err) {
        const errMsg = "Could not delete tag: " + (err as Error).message;
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

    Alert.alert("Remove Tag", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doDelete },
    ]);
  };

  const visibleFeeds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allFeeds;
    return allFeeds.filter(
      (f) =>
        f.title.toLowerCase().includes(query) ||
        f.url.toLowerCase().includes(query)
    );
  }, [allFeeds, search]);

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
            style={[styles.iconBtn, (!hasChanges || saving) && styles.disabled]}
            disabled={!hasChanges || saving}
            accessibilityLabel="Save tag"
          >
            <Feather
              name="save"
              size={22}
              color={!hasChanges || saving ? colors.inkFaint : colors.accent}
            />
          </TouchableOpacity>
          {isEditMode ? (
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel="Delete tag"
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
                  (!hasChanges || saving) && styles.actionBtnDisabled,
                ]}
                onPress={handleSave}
                disabled={!hasChanges || saving}
                activeOpacity={0.7}
                accessibilityLabel="Save tag"
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
              {isEditMode ? (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { borderColor: colors.danger + "60" },
                  ]}
                  onPress={handleDelete}
                  activeOpacity={0.7}
                  accessibilityLabel="Delete tag"
                >
                  <Feather name="trash-2" size={16} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={[styles.heading, { color: colors.ink }]}>
            {isEditMode ? "Edit Tag" : "Add Tag"}
          </Text>

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
            placeholder="e.g. work, news"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Tag name"
          />

          <Text style={[styles.label, { color: colors.inkSoft }]}>feeds</Text>
          <Text style={[styles.hintText, { color: colors.inkFaint }]}>
            Select which feeds belong to this tag.
          </Text>

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
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View
            style={[
              styles.feedList,
              {
                borderColor: colors.border,
              },
            ]}
          >
            {visibleFeeds.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.inkFaint }]}>
                No feeds match.
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
                    accessibilityLabel={`${checked ? "Unselect" : "Select"} feed ${feed.title}`}
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
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
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
  actionBtnDisabled: { opacity: 0.5 },
  actionText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h2,
    fontWeight: "600",
    marginBottom: spacing.md,
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
  feedIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
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
