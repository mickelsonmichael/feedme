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
import { getItemRawXml } from "../database";
import { ExpandedFeedMedia } from "../components/ExpandedFeedMedia";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FeedItem, RootStackParamList } from "../types";
import { parseContentAndLinks } from "../utils/contentActions";
import { toBionic } from "../utils/bionicReading";
import { openUrlWithPreference } from "../linkOpening";
import { loadConfig } from "../storage";
import { SanitizedHtmlContent } from "../components/SanitizedHtmlContent";
import { hasRenderableHtml, sanitizeHtml } from "../utils/sanitizeHtml";

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
  const { text: contentText, links: contentLinks } = React.useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const shouldRenderHtmlContent = React.useMemo(
    () => hasRenderableHtml(item.content),
    [item.content]
  );
  const sanitizedHtmlContent = React.useMemo(
    () => (shouldRenderHtmlContent ? sanitizeHtml(item.content ?? "") : ""),
    [item.content, shouldRenderHtmlContent]
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
              style={styles.moreMenuItem}
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
            styles.articleInner,
            isDesktopWeb ? styles.desktopInner : null,
          ]}
        >
          <Text style={[styles.meta, { color: colors.inkSoft }]}>
            {item.feedTitle} - {formatDate(item.publishedAt)}
          </Text>

          <Text style={[styles.title, { color: colors.ink }]}>
            {item.title}
          </Text>

          <View
            style={[styles.separator, { backgroundColor: colors.border }]}
          />

          {item.imageUrl || item.url || item.content ? (
            <ExpandedFeedMedia
              imageUrl={item.imageUrl}
              itemUrl={item.url}
              content={item.content}
              useProxy={item.useProxy ?? false}
              nsfw={item.nsfw ?? false}
              deferGalleryLoad={false}
              deferGifLoad={item.nsfw ?? false}
            />
          ) : null}

          {shouldRenderHtmlContent ? (
            <SanitizedHtmlContent html={sanitizedHtmlContent} />
          ) : (
            <Text style={[styles.article, { color: colors.ink }]}>
              {bionicReading
                ? toBionic(contentText || "No content available.").map(
                    (token, i) =>
                      token.kind === "space" ? (
                        token.text
                      ) : (
                        <Text key={i}>
                          <Text style={styles.bionicBold}>{token.bold}</Text>
                          {token.rest}
                        </Text>
                      )
                  )
                : contentText || "No content available."}
            </Text>
          )}

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
  },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  articleInner: {
    width: "100%",
    gap: spacing.md,
  },
  desktopInner: {
    maxWidth: 920,
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
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  article: {
    fontSize: fontSize.bodyLg,
    lineHeight: 24,
    fontFamily: fonts.sans,
  },
  bionicBold: {
    fontWeight: "700",
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
