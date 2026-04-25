import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { getSavedPosts, unsavePost } from "../database";
import { SavedPost } from "../types";
import { MetaText } from "../components/ui";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, radii, spacing } from "../theme";

export default function SavedScreen() {
  const { colors } = useTheme();
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getSavedPosts();
      setPosts(data);
    } catch (err) {
      Alert.alert(
        "Error",
        "Failed to load saved posts: " + (err as Error).message
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [loadPosts])
  );

  const handleUnsave = async (post: SavedPost) => {
    if (post.item_id === null) return;
    try {
      await unsavePost(post.item_id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch {
      Alert.alert("Error", "Could not remove saved post.");
    }
  };

  const handleOpen = (post: SavedPost) => {
    if (!post.url) return;
    Linking.openURL(post.url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
  };

  const formatDate = (ts: number | null): string => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
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

  if (posts.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.paper }]}>
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            No saved posts yet.
          </Text>
          <Text style={[styles.emptyBody, { color: colors.inkSoft }]}>
            Tap the bookmark icon on any post to keep it here forever.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item: post }) => (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.paper, borderColor: colors.ink },
            ]}
          >
            <View style={styles.cardMeta}>
              <Text style={[styles.sourceText, { color: colors.ink }]}>
                {post.feed_title}
              </Text>
              <Text style={[styles.metaDot, { color: colors.inkSoft }]}>·</Text>
              <MetaText>saved {formatDate(post.saved_at)}</MetaText>
            </View>

            <TouchableOpacity
              onPress={() => handleOpen(post)}
              activeOpacity={0.7}
              disabled={!post.url}
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
                onPress={() => handleUnsave(post)}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel="Remove saved post"
              >
                <Feather name="bookmark" size={18} color={colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
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
    fontFamily: fonts.mono,
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
    borderStyle: "dashed",
  },
  originalLink: {
    fontSize: fontSize.meta,
    fontFamily: fonts.mono,
  },
  spacer: { flex: 1 },
  separator: { height: spacing.sm },
});
