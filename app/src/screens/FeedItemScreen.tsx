import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import {
  addToReadLater,
  getReadLaterItemIds,
  getSavedItemIds,
  markItemRead,
  markItemUnread,
  removeFromReadLater,
  savePost,
  unsavePost,
} from "../database";
import { ExpandedFeedMedia } from "../components/ExpandedFeedMedia";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedItem, RootStackParamList } from "../types";
import { parseContentAndLinks } from "../utils/contentActions";
import { openUrlWithPreference } from "../linkOpening";

type Props = NativeStackScreenProps<RootStackParamList, "FeedItemView">;

export default function FeedItemScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { item } = route.params;
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [readLater, setReadLater] = React.useState(false);
  const [updatingReadLater, setUpdatingReadLater] = React.useState(false);
  const [read, setRead] = React.useState(item.read === 1);
  const [updatingRead, setUpdatingRead] = React.useState(false);
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const { text: contentText, links: contentLinks } = React.useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const redditCommentsLink = React.useMemo(
    () =>
      contentLinks.find(
        (link) => link.label === "Comments" && isRedditCommentsUrl(link.url)
      ) ?? null,
    [contentLinks]
  );
  const visibleContentLinks = React.useMemo(
    () =>
      contentLinks.filter(
        (link) =>
          link.label !== "Link" &&
          !(link.label === "Comments" && isRedditCommentsUrl(link.url))
      ),
    [contentLinks]
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: item.feedTitle || "post" });
  }, [navigation, item.feedTitle]);

  React.useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        if (item.itemId !== null) {
          const [savedIds, readLaterIds] = await Promise.all([
            getSavedItemIds(),
            getReadLaterItemIds(),
          ]);
          if (isMounted) {
            setSaved(savedIds.has(item.itemId));
            setReadLater(readLaterIds.has(item.itemId));
          }
        }

        if (item.itemId !== null && !item.read) {
          await markItemRead(item.itemId);
          if (isMounted) {
            setRead(true);
            // markItemRead auto-removes from Read Later list.
            setReadLater(false);
          }
        }
      } catch {
        // Ignore stale read/save refresh failures on entry.
      }
    };

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [item.itemId, item.read]);

  const handleOpenExternal = () => {
    if (!item.url) return;
    openUrlWithPreference({
      url: item.url,
      navigation,
      title: item.title,
    });
  };

  const handleOpenContentLink = (url: string) => {
    openUrlWithPreference({ url, navigation, title: item.title });
  };

  const handleToggleSave = async () => {
    if (item.itemId === null || saving) return;

    setSaving(true);
    try {
      if (saved) {
        await unsavePost(item.itemId);
        setSaved(false);
      } else {
        const post: FeedItem = {
          id: item.itemId,
          feed_id: 0,
          title: item.title,
          url: item.url,
          content: item.content,
          image_url: item.imageUrl,
          raw_xml: null,
          published_at: item.publishedAt,
          read: 1,
        };
        await savePost(post, item.feedTitle);
        setSaved(true);
      }
    } catch {
      Alert.alert("Error", "Could not update saved status.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRead = async () => {
    if (item.itemId === null || updatingRead) return;

    setUpdatingRead(true);
    try {
      if (read) {
        await markItemUnread(item.itemId);
        setRead(false);
      } else {
        await markItemRead(item.itemId);
        setRead(true);
        // markItemRead auto-removes from Read Later list.
        setReadLater(false);
      }
    } catch {
      Alert.alert("Error", "Could not update read status.");
    } finally {
      setUpdatingRead(false);
    }
  };

  const handleToggleReadLater = async () => {
    if (item.itemId === null || updatingReadLater) return;

    setUpdatingReadLater(true);
    try {
      if (readLater) {
        await removeFromReadLater(item.itemId);
        setReadLater(false);
      } else {
        const post: FeedItem = {
          id: item.itemId,
          feed_id: 0,
          title: item.title,
          url: item.url,
          content: item.content,
          image_url: item.imageUrl,
          raw_xml: null,
          published_at: item.publishedAt,
          read: read ? 1 : 0,
        };
        await addToReadLater(post, item.feedTitle);
        setReadLater(true);
      }
    } catch {
      Alert.alert("Error", "Could not update read later status.");
    } finally {
      setUpdatingReadLater(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.paper,
              borderColor: colors.border,
              shadowColor: colors.ink,
            },
          ]}
        >
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              accessibilityLabel="Back"
            >
              <Feather name="arrow-left" size={16} color={colors.ink} />
              <Text style={[styles.actionText, { color: colors.ink }]}>
                Back
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  borderColor: read ? colors.border : colors.accent,
                  backgroundColor: read ? colors.paper : colors.accent,
                },
              ]}
              onPress={handleToggleRead}
              activeOpacity={0.7}
              disabled={item.itemId === null || updatingRead}
              accessibilityLabel={read ? "Mark as unread" : "Mark as read"}
            >
              <Feather
                name={read ? "eye-off" : "eye"}
                size={16}
                color={read ? colors.ink : colors.paper}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: read ? colors.ink : colors.paper },
                ]}
              >
                {read ? "Unread" : "Read"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  borderColor: saved ? colors.ink : colors.border,
                  backgroundColor: saved ? colors.ink : colors.paper,
                },
              ]}
              onPress={handleToggleSave}
              activeOpacity={0.7}
              disabled={item.itemId === null || saving}
              accessibilityLabel={saved ? "Unsave" : "Save"}
            >
              <Feather
                name="bookmark"
                size={16}
                color={saved ? colors.paper : colors.ink}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: saved ? colors.paper : colors.ink },
                ]}
              >
                {saved ? "Saved" : "Save"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  borderColor: readLater ? colors.ink : colors.border,
                  backgroundColor: readLater ? colors.ink : colors.paper,
                },
              ]}
              onPress={handleToggleReadLater}
              activeOpacity={0.7}
              disabled={item.itemId === null || updatingReadLater}
              accessibilityLabel={
                readLater ? "Remove from read later" : "Add to read later"
              }
            >
              <Feather
                name="clock"
                size={16}
                color={readLater ? colors.paper : colors.ink}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: readLater ? colors.paper : colors.ink },
                ]}
              >
                {readLater ? "Later" : "Read Later"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border }]}
              onPress={handleOpenExternal}
              activeOpacity={0.7}
              disabled={!item.url}
              accessibilityLabel="Open Link"
            >
              <Feather name="external-link" size={16} color={colors.ink} />
              <Text style={[styles.actionText, { color: colors.ink }]}>
                Open Link
              </Text>
            </TouchableOpacity>

            {redditCommentsLink ? (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => handleOpenContentLink(redditCommentsLink.url)}
                activeOpacity={0.7}
                accessibilityLabel="Open Reddit comments"
              >
                <Feather name="message-circle" size={16} color={colors.ink} />
                <Text style={[styles.actionText, { color: colors.ink }]}>
                  Comments
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={[styles.meta, { color: colors.inkSoft }]}>
            {item.feedTitle} - {formatDate(item.publishedAt)}
          </Text>

          <Text style={[styles.title, { color: colors.ink }]}>
            {item.title}
          </Text>

          {item.imageUrl || item.url || item.content ? (
            <ExpandedFeedMedia
              imageUrl={item.imageUrl}
              itemUrl={item.url}
              content={item.content}
              useProxy={item.useProxy ?? false}
            />
          ) : null}

          <Text style={[styles.article, { color: colors.ink }]}>
            {contentText || "No content available."}
          </Text>

          {visibleContentLinks.length ? (
            <View style={styles.contentLinkRow}>
              {visibleContentLinks.map((link) => (
                <TouchableOpacity
                  key={`${link.label}:${link.url}`}
                  style={[
                    styles.contentLinkBtn,
                    { borderColor: colors.border },
                  ]}
                  onPress={() => handleOpenContentLink(link.url)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Open ${link.label}`}
                >
                  <Feather
                    name={link.label === "Comments" ? "message-circle" : "link"}
                    size={14}
                    color={colors.inkSoft}
                  />
                  <Text style={[styles.contentLinkText, { color: colors.ink }]}>
                    {link.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function formatDate(ts: number | null): string {
  if (!ts) return "unknown";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isRedditCommentsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!(hostname === "reddit.com" || hostname.endsWith(".reddit.com"))) {
      return false;
    }
    return parsed.pathname.toLowerCase().includes("/comments/");
  } catch {
    return /(?:https?:\/\/)?(?:(?:www|old)\.)?reddit\.com\/.*\/comments\//i.test(
      url
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
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
    gap: spacing.md,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.xs,
    rowGap: spacing.xs,
    flexWrap: "wrap",
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  actionText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  title: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: fontSize.h1,
    lineHeight: 34,
  },
  article: {
    fontSize: fontSize.bodyLg,
    lineHeight: 24,
    fontFamily: fonts.sans,
  },
  contentLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  contentLinkBtn: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contentLinkText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
});
