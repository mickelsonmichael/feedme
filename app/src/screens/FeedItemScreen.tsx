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
  addFeed,
  deleteFeed,
  getFeedByUrl,
  getFeedItemWithFeedById,
} from "../database";
import { getItemRawXml } from "../database";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedItem, RootStackParamList } from "../types";
import { parseContentAndLinks } from "../utils/contentActions";
import { openUrlWithPreference } from "../linkOpening";
import { loadConfig } from "../storage";
import {
  FeedItemContent,
  formatDate,
  isRedditCommentsUrl,
} from "../components/FeedItemContent";
import { FeedIcon } from "../components/FeedIcon";
import { extractRedditAuthor, buildRedditFeedUrl } from "../redditUtils";

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
  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const [toolbarHeight, setToolbarHeight] = React.useState(0);
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const [bionicReading] = React.useState(
    () => loadConfig().bionicReading ?? false
  );
  const { links: contentLinks } = React.useMemo(
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
  const redditAuthor = React.useMemo(
    () => extractRedditAuthor(item.content),
    [item.content]
  );
  const redditAuthorFeedUrl = redditAuthor
    ? buildRedditFeedUrl(`u/${redditAuthor}`)
    : null;
  const [authorFeedId, setAuthorFeedId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!redditAuthorFeedUrl) return;
    getFeedByUrl(redditAuthorFeedUrl)
      .then((feed) => setAuthorFeedId(feed?.id ?? null))
      .catch(() => {});
  }, [redditAuthorFeedUrl]);

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

  const handleViewXml = async () => {
    let rawXml: string | null = null;
    if (item.itemId != null) {
      try {
        rawXml = await getItemRawXml(item.itemId);
      } catch {
        // Fetch failure — navigate anyway to show the empty state
      }
    }
    navigation.navigate("RawXml", { rawXml, title: item.title ?? "Raw XML" });
  };

  const handleOpenContentLink = (url: string) => {
    openUrlWithPreference({ url, navigation, title: item.title });
  };

  const handleEditFeed = async () => {
    if (item.itemId === null) return;
    try {
      const feedItem = await getFeedItemWithFeedById(item.itemId);
      if (!feedItem) {
        Alert.alert("Error", "Could not find the feed for this post.");
        return;
      }
      navigation.navigate("FeedDetail", {
        feedId: feedItem.feed_id,
        returnToItem: item,
      });
    } catch {
      Alert.alert("Error", "Could not find the feed for this post.");
    }
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
      {/* Toolbar */}
      <View
        style={[styles.toolbar, { borderBottomColor: colors.border }]}
        onLayout={(e) => setToolbarHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={16} color={colors.ink} />
          <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
            Back
          </Text>
        </TouchableOpacity>

        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={handleToggleSave}
            activeOpacity={0.7}
            disabled={item.itemId === null || saving}
            accessibilityLabel={saved ? "Unsave" : "Save"}
          >
            <Feather
              name="bookmark"
              size={16}
              color={saved ? colors.accent : colors.ink}
            />
            <Text
              style={[
                styles.toolbarButtonLabel,
                { color: saved ? colors.accent : colors.ink },
              ]}
            >
              {saved ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={handleOpenExternal}
            activeOpacity={0.7}
            disabled={!item.url}
            accessibilityLabel="Open Link"
          >
            <Feather name="external-link" size={16} color={colors.ink} />
            <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
              Open
            </Text>
          </TouchableOpacity>

          {redditCommentsLink ? (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => handleOpenContentLink(redditCommentsLink.url)}
              activeOpacity={0.7}
              accessibilityLabel="Open Reddit comments"
            >
              <Feather name="message-circle" size={16} color={colors.ink} />
              <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
                Comments
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => setShowMoreMenu((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel="More options"
          >
            <Feather name="more-horizontal" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Overflow menu — rendered inside the screen View, positioned below toolbar */}
      {showMoreMenu ? (
        <TouchableOpacity
          style={[styles.moreOverlay, { top: toolbarHeight }]}
          onPress={() => setShowMoreMenu(false)}
          activeOpacity={1}
        >
          <View
            style={[
              styles.moreMenuContainer,
              {
                backgroundColor: colors.paper,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => {
                handleToggleRead();
                setShowMoreMenu(false);
              }}
              disabled={item.itemId === null || updatingRead}
              activeOpacity={0.7}
              accessibilityLabel={read ? "Mark as unread" : "Mark as read"}
            >
              <Feather
                name={read ? "eye-off" : "eye"}
                size={16}
                color={colors.ink}
              />
              <Text style={[styles.moreMenuItemText, { color: colors.ink }]}>
                {read ? "Mark Unread" : "Mark Read"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => {
                handleToggleReadLater();
                setShowMoreMenu(false);
              }}
              disabled={item.itemId === null || updatingReadLater}
              activeOpacity={0.7}
            >
              <Feather
                name="clock"
                size={16}
                color={readLater ? colors.accent : colors.ink}
              />
              <Text
                style={[
                  styles.moreMenuItemText,
                  { color: readLater ? colors.accent : colors.ink },
                ]}
              >
                {readLater ? "Remove from Later" : "Read Later"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => {
                handleViewXml();
                setShowMoreMenu(false);
              }}
              activeOpacity={0.7}
            >
              <Feather name="code" size={16} color={colors.ink} />
              <Text style={[styles.moreMenuItemText, { color: colors.ink }]}>
                View XML
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => {
                handleEditFeed();
                setShowMoreMenu(false);
              }}
              disabled={item.itemId === null}
              activeOpacity={0.7}
              accessibilityLabel="Edit Feed"
            >
              <Feather name="edit-2" size={16} color={colors.ink} />
              <Text style={[styles.moreMenuItemText, { color: colors.ink }]}>
                Edit Feed
              </Text>
            </TouchableOpacity>

            {redditAuthor ? (
              <TouchableOpacity
                style={styles.moreMenuItem}
                onPress={async () => {
                  if (!redditAuthorFeedUrl) return;
                  try {
                    if (authorFeedId !== null) {
                      await deleteFeed(authorFeedId);
                      setAuthorFeedId(null);
                    } else {
                      const newFeedId = await addFeed({
                        title: `Reddit - u/${redditAuthor}`,
                        url: redditAuthorFeedUrl,
                        description: null,
                        use_proxy: 0,
                        nsfw: 0,
                        show_only_in_tag: 0,
                        show_only_in_custom_feed: 0,
                        collapse_repeated: 0,
                        reddit_include_comments: 0,
                      });
                      setAuthorFeedId(newFeedId);
                    }
                  } catch {
                    Alert.alert("Error", "Could not update subscription.");
                  }
                  setShowMoreMenu(false);
                }}
                activeOpacity={0.7}
                accessibilityLabel={
                  authorFeedId !== null
                    ? `Unfollow u/${redditAuthor}`
                    : `Follow u/${redditAuthor}`
                }
              >
                <Feather
                  name={authorFeedId !== null ? "user-minus" : "user-plus"}
                  size={16}
                  color={authorFeedId !== null ? colors.accent : colors.ink}
                />
                <Text
                  style={[
                    styles.moreMenuItemText,
                    {
                      color: authorFeedId !== null ? colors.accent : colors.ink,
                    },
                  ]}
                >
                  {authorFeedId !== null ? "Unfollow User" : "Follow User"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Scrollable content */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.itemHeader,
            isDesktopWeb ? styles.desktopItemHeader : null,
          ]}
        >
          <View style={styles.itemMetaRow}>
            <FeedIcon feedUrl={item.feedUrl} />
            <Text style={[styles.itemMeta, { color: colors.inkSoft }]}>
              {item.feedTitle} - {formatDate(item.publishedAt)}
            </Text>
          </View>
          <Text style={[styles.itemTitle, { color: colors.ink }]}>
            {item.title}
          </Text>
          <View
            style={[styles.itemSeparator, { backgroundColor: colors.border }]}
          />
        </View>
        <FeedItemContent
          item={item}
          bionicReading={bionicReading}
          isDesktopWeb={isDesktopWeb}
          onOpenContentLink={handleOpenContentLink}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  toolbarButtonLabel: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.body,
  },
  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  moreOverlay: {
    position: "absolute",
    top: 0, // offset by toolbarHeight is applied inline
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  moreMenuContainer: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.md,
    minWidth: 170,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    overflow: "hidden",
    elevation: 3,
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moreMenuItemText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  itemHeader: {
    width: "100%",
    gap: spacing.xs,
  },
  desktopItemHeader: {
    maxWidth: 920,
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  itemMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  itemTitle: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: fontSize.h2,
    lineHeight: 26,
  },
  itemSeparator: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
  },
});
