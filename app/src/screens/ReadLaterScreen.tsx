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
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { getReadLaterPosts, removeFromReadLater } from "../database";
import { ReadLaterPost, RootStackParamList, TabParamList } from "../types";
import { MetaText } from "../components/ui";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, radii, spacing } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "ReadLater">,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ReadLaterScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [posts, setPosts] = useState<ReadLaterPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getReadLaterPosts();
      setPosts(data);
    } catch (err) {
      Alert.alert(
        "Error",
        "Failed to load read later list: " + (err as Error).message
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

  const handleRemove = async (post: ReadLaterPost) => {
    if (post.item_id === null) return;
    try {
      await removeFromReadLater(post.item_id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch {
      Alert.alert("Error", "Could not remove read later item.");
    }
  };

  const handleOpen = (post: ReadLaterPost) => {
    // Navigate with read=0 so the item gets marked read on entry, which
    // (via markItemRead) will auto-remove it from the Read Later list.
    navigation.navigate("FeedItemView", {
      item: {
        itemId: post.item_id,
        title: post.title,
        url: post.url,
        content: post.content,
        imageUrl: post.image_url,
        publishedAt: post.published_at,
        feedTitle: post.feed_title,
        read: 0,
      },
    });
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
        <View style={[styles.scopeRow, { borderBottomColor: colors.inkFaint }]}>
          <Feather name="clock" size={14} color={colors.inkSoft} />
          <Text style={[styles.scopeText, { color: colors.ink }]}>
            Viewing: Read Later
          </Text>
        </View>
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>
            Nothing to read later.
          </Text>
          <Text style={[styles.emptyBody, { color: colors.inkSoft }]}>
            Tap the clock icon on any post to add it here. Items disappear once
            you've read them.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={[styles.scopeRow, { borderBottomColor: colors.inkFaint }]}>
        <Feather name="clock" size={14} color={colors.inkSoft} />
        <Text style={[styles.scopeText, { color: colors.ink }]}>
          Viewing: Read Later
        </Text>
      </View>
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
              <MetaText>added {formatDate(post.added_at)}</MetaText>
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
                accessibilityLabel="Remove from read later"
              >
                <Feather name="clock" size={18} color={colors.accent} />
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
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderStyle: "dashed",
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
    borderStyle: "dashed",
  },
  originalLink: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  spacer: { flex: 1 },
  separator: { height: spacing.sm },
});
