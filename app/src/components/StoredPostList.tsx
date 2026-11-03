import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@react-native-vector-icons/feather";
import type { FeedItemViewItem } from "../types";
import { MetaText } from "./ui";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, radii, spacing } from "../theme";
import { stripHtml } from "../utils/contentActions";
import { formatRelativeAge } from "../utils/relativeAge";

/** The columns the Saved and Read Later lists have in common. */
export type StoredPost = {
  id: number;
  item_id: number | null;
  feed_title: string;
  title: string;
  url: string | null;
  content: string | null;
  published_at: number | null;
};

type Props<P extends StoredPost> = {
  icon: "bookmark" | "clock";
  /** Shown after "Viewing: " in the scope row. */
  scopeLabel: string;
  emptyTitle: string;
  emptyBody: string;
  /** Prefix of the alert shown when loading fails. */
  loadErrorMessage: string;
  removeErrorMessage: string;
  removeAccessibilityLabel: string;
  load: () => Promise<P[]>;
  remove: (itemId: number) => Promise<void>;
  /** e.g. "saved 3d" — the verb and timestamp for the meta row. */
  addedLabel: (post: P) => string;
  /** What FeedItemScreen is opened with for this post. */
  toViewItem: (post: P) => FeedItemViewItem;
  navigation: {
    navigate: (
      screen: "FeedItemView",
      params: { item: FeedItemViewItem }
    ) => void;
  };
};

/** A list of posts kept locally (Saved, Read Later), with a remove button. */
export function StoredPostList<P extends StoredPost>({
  icon,
  scopeLabel,
  emptyTitle,
  emptyBody,
  loadErrorMessage,
  removeErrorMessage,
  removeAccessibilityLabel,
  load,
  remove,
  addedLabel,
  toViewItem,
  navigation,
}: Props<P>) {
  const { colors } = useTheme();
  const [posts, setPosts] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load()
        .then(setPosts)
        .catch((err: Error) => {
          Alert.alert("Error", loadErrorMessage + err.message);
        })
        .finally(() => setLoading(false));
    }, [load, loadErrorMessage])
  );

  const handleRemove = async (post: P) => {
    if (post.item_id === null) return;
    try {
      await remove(post.item_id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch {
      Alert.alert("Error", removeErrorMessage);
    }
  };

  const handleOpen = (post: P) => {
    navigation.navigate("FeedItemView", { item: toViewItem(post) });
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

  const scopeRow = (
    <View style={[styles.scopeRow, { borderBottomColor: colors.inkFaint }]}>
      <Feather name={icon} size={14} color={colors.inkSoft} />
      <Text style={[styles.scopeText, { color: colors.ink }]}>
        Viewing: {scopeLabel}
      </Text>
    </View>
  );

  if (posts.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.paper }]}>
        {scopeRow}
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            {emptyTitle}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.inkSoft }]}>
            {emptyBody}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      {scopeRow}
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item: post }) => (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.paper, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardMeta}>
              <Text style={[styles.sourceText, { color: colors.ink }]}>
                {post.feed_title}
              </Text>
              <Text style={[styles.metaDot, { color: colors.inkSoft }]}>·</Text>
              <MetaText>{addedLabel(post)}</MetaText>
            </View>

            <TouchableOpacity
              onPress={() => handleOpen(post)}
              activeOpacity={0.7}
              disabled={!post.url}
              accessibilityLabel={`Open post: ${post.title}`}
            >
              <Text style={[styles.title, { color: colors.ink }]}>
                {post.title}
              </Text>
              {post.content ? (
                <Text
                  style={[styles.summary, { color: colors.inkSoft }]}
                  numberOfLines={2}
                >
                  {stripHtml(post.content)}
                </Text>
              ) : null}
            </TouchableOpacity>

            <View
              style={[styles.actionRow, { borderTopColor: colors.inkFaint }]}
            >
              {post.url ? (
                <TouchableOpacity
                  onPress={() => handleOpen(post)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.originalLink, { color: colors.accent }]}>
                    view original ↗
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.originalLink, { color: colors.inkFaint }]}>
                  no link available
                </Text>
              )}
              <View style={styles.spacer} />
              <TouchableOpacity
                onPress={() => handleRemove(post)}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel={removeAccessibilityLabel}
              >
                <Feather name={icon} size={18} color={colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={Separator}
      />
    </View>
  );
}

/** "saved 3d" / "added just now" for the meta row. */
export function addedAgo(verb: string, ts: number | null): string {
  return `${verb} ${formatRelativeAge(ts)}`;
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h2,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: fontSize.bodyLg,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  scopeText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    fontWeight: "600",
  },
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sourceText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  metaDot: {
    fontSize: fontSize.meta,
    marginHorizontal: 2,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "700",
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  summary: {
    fontSize: fontSize.body,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  originalLink: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  spacer: { flex: 1 },
  separator: { height: spacing.sm },
});
