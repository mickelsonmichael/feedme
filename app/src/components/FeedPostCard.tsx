import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { parseContentAndLinks } from "../utils/contentActions";
import { applyBionicToHtml, toBionic } from "../utils/bionicReading";
import { loadConfig } from "../storage";
import { proxiedImageUrl } from "../proxyFetch";
import {
  extractRedditGalleryUrl,
  fetchRedditGalleryImageUrlsCached,
} from "../redditGallery";
import { extractGifEmbedUrl, extractGifEmbedUrlFromContent } from "../gifUtils";
import { extractRedditAuthor } from "../redditUtils";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent";
import { MetaText } from "./ui";
import { fonts, fontSize, NSFW_BLUR_RADIUS, radii, spacing } from "../theme";
import { hasRenderableHtml, sanitizeHtml } from "../utils/sanitizeHtml";

const CARD_IMAGE_WIDTH = 100;

type FeedPostCardItem = {
  id: number;
  title: string;
  url: string | null;
  content: string | null;
  image_url: string | null;
  published_at: number | null;
  read: number;
};

type Props = {
  item: FeedPostCardItem;
  feedTitle: string;
  layout: "compact" | "card";
  nsfw?: boolean;
  useProxy?: boolean;
  saved: boolean;
  readLater?: boolean;
  expanded?: boolean;
  showExpand?: boolean;
  showRawXml?: boolean;
  cardWidth?: number;
  cardMediaRevealed?: boolean;
  cardMediaTestID?: string;
  expandedMediaTestID?: string;
  onOpenItem: (id: number) => void;
  onRevealCardMedia?: (id: number) => void;
  onToggleExpand?: (id: number) => void;
  onToggleRead: (id: number) => void;
  onToggleSave: (id: number) => void;
  onToggleReadLater?: (id: number) => void;
  onOpenOriginalLink: (id: number) => void;
  onOpenContentLink: (url: string) => void;
  onOpenRawXml?: (id: number) => void;
  /** undefined = no Reddit author detected; false = not followed; true = followed */
  authorFollowed?: boolean;
  onFollowAuthor?: (id: number) => void;
};

function FeedPostCardComponent({
  item,
  feedTitle,
  layout,
  nsfw = false,
  useProxy = false,
  saved,
  readLater = false,
  expanded = false,
  showExpand = false,
  showRawXml = false,
  cardWidth,
  cardMediaRevealed = false,
  cardMediaTestID,
  expandedMediaTestID,
  onOpenItem,
  onRevealCardMedia,
  onToggleExpand,
  onToggleRead,
  onToggleSave,
  onToggleReadLater,
  onOpenOriginalLink,
  onOpenContentLink,
  onOpenRawXml,
  authorFollowed,
  onFollowAuthor,
}: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isLargeScreen = Platform.OS === "web" && width >= 768;
  const { text: contentText, links: contentLinks } = useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const shouldRenderHtmlContent = useMemo(
    () => hasRenderableHtml(item.content),
    [item.content]
  );
  const [bionicReading] = useState(() => loadConfig().bionicReading ?? false);
  const sanitizedHtmlContent = useMemo(() => {
    if (!shouldRenderHtmlContent) return "";
    // Strip <img> tags — images are displayed via ExpandedFeedMedia above the
    // content panel, so rendering them again inside the HTML would show the
    // same image twice (e.g. the Reddit thumbnail before "submitted by").
    // Also clean up empty <a> and <td> elements left behind after img removal
    // to prevent layout gaps (e.g. an empty table cell from the image column).
    const html = sanitizeHtml(item.content ?? "")
      .replace(/<img\b[^>]*\/?>/gi, "")
      .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
      .replace(/<td\b[^>]*>\s*<\/td>/gi, "");
    return bionicReading ? applyBionicToHtml(html) : html;
  }, [item.content, shouldRenderHtmlContent, bionicReading]);
  const redditCommentsLink = useMemo(
    () =>
      contentLinks.find(
        (link) => link.label === "Comments" && isRedditCommentsUrl(link.url)
      ) ?? null,
    [contentLinks]
  );
  const redditAuthor = useMemo(
    () => extractRedditAuthor(item.content),
    [item.content]
  );
  const visibleContentLinks = useMemo(
    () =>
      contentLinks.filter(
        (link) =>
          link.label !== "Link" &&
          !(link.label === "Comments" && isRedditCommentsUrl(link.url))
      ),
    [contentLinks]
  );
  const isCardMediaBlurred = layout === "card" && nsfw && !cardMediaRevealed;
  const redditGalleryUrl = useMemo(
    () => extractRedditGalleryUrl(item.url, item.content),
    [item.content, item.url]
  );
  const isRedditGallery = Boolean(redditGalleryUrl);
  const isGif = useMemo(
    () =>
      Boolean(
        extractGifEmbedUrl(item.url) ??
        extractGifEmbedUrlFromContent(item.content)
      ),
    [item.url, item.content]
  );
  const showCardRevealOverlay = isCardMediaBlurred;
  // For card NSFW galleries we want to show the first image (blurred) under
  // the reveal overlay rather than auto-loading the entire carousel. Once the
  // user taps reveal, we also auto-load the rest of the gallery.
  const cardGalleryDeferred =
    layout === "card" && isRedditGallery && nsfw && !cardMediaRevealed;
  // In compact rows we only ever render the small thumbnail; for Reddit
  // galleries the parsed feed item rarely includes an `image_url`, so we
  // resolve the first gallery image lazily and use it as the thumbnail.
  const galleryThumbnailUrl = useRedditGalleryThumbnail(
    layout === "compact" && !item.image_url ? redditGalleryUrl : null,
    useProxy
  );

  if (layout === "card") {
    return (
      <View
        style={[
          styles.card,
          styles.cardLayout,
          { width: cardWidth },
          {
            backgroundColor: colors.paper,
            borderColor: colors.border,
          },
        ]}
      >
        {item.image_url || item.url || item.content ? (
          <View style={styles.cardMediaWrap}>
            <ExpandedFeedMedia
              imageUrl={item.image_url}
              imageAlignment="center"
              itemUrl={item.url}
              content={item.content}
              testID={cardMediaTestID}
              blur={showCardRevealOverlay}
              nsfw={nsfw}
              deferGalleryLoad={cardGalleryDeferred}
              deferGifLoad={isGif}
              useProxy={useProxy}
            />
            {showCardRevealOverlay ? (
              <TouchableOpacity
                style={styles.mediaBlurOverlay}
                onPress={() => onRevealCardMedia?.(item.id)}
                activeOpacity={0.85}
                accessibilityLabel="Reveal NSFW media"
              >
                <View
                  style={[
                    styles.mediaBlurPill,
                    { backgroundColor: `${colors.ink}d9` },
                  ]}
                >
                  <Feather name="eye" size={16} color={colors.paper} />
                  <Text style={[styles.mediaBlurText, { color: colors.paper }]}>
                    Reveal media
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        <View style={styles.cardLayoutContent}>
          <FeedPostMeta
            feedTitle={feedTitle}
            publishedAt={item.published_at}
            read={item.read}
          />
          <TouchableOpacity
            onPress={() => onOpenItem(item.id)}
            activeOpacity={0.7}
            accessibilityLabel={`Open post: ${item.title}`}
          >
            <Text
              style={[
                styles.title,
                { color: colors.ink },
                item.read ? { color: colors.inkSoft, fontWeight: "500" } : null,
              ]}
              numberOfLines={4}
            >
              {item.title}
            </Text>
            {item.content ? (
              <Text
                style={[styles.summary, { color: colors.inkSoft }]}
                numberOfLines={6}
              >
                {contentText}
              </Text>
            ) : null}
          </TouchableOpacity>
          {visibleContentLinks.length ? (
            <ContentLinkRow
              links={visibleContentLinks}
              onOpenContentLink={onOpenContentLink}
            />
          ) : null}
          <View style={[styles.actionRow, { borderTopColor: colors.inkFaint }]}>
            <ReadToggleButton
              read={item.read}
              onPress={() => onToggleRead(item.id)}
            />
            <SaveButton saved={saved} onPress={() => onToggleSave(item.id)} />
            {onToggleReadLater ? (
              <ReadLaterButton
                readLater={readLater}
                onPress={() => onToggleReadLater(item.id)}
              />
            ) : null}
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => onOpenOriginalLink(item.id)}
              activeOpacity={0.6}
              hitSlop={8}
              accessibilityLabel="Open original link"
              disabled={!item.url}
            >
              <Feather
                name="external-link"
                size={18}
                color={item.url ? colors.inkSoft : colors.inkFaint}
              />
            </TouchableOpacity>
            {redditCommentsLink ? (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => onOpenContentLink(redditCommentsLink.url)}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel="Open Reddit comments"
              >
                <Feather
                  name="message-circle"
                  size={18}
                  color={colors.inkSoft}
                />
              </TouchableOpacity>
            ) : null}
            {redditAuthor && onFollowAuthor ? (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={() => onFollowAuthor(item.id)}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel={
                  authorFollowed
                    ? `Unfollow u/${redditAuthor}`
                    : `Follow u/${redditAuthor}`
                }
              >
                <Feather
                  name={authorFollowed ? "user-minus" : "user-plus"}
                  size={18}
                  color={authorFollowed ? colors.accent : colors.inkSoft}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.paper,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.cardRow}>
        {!expanded && (item.image_url || galleryThumbnailUrl) ? (
          <View style={styles.cardImage}>
            <View
              style={[
                styles.cardImageFill,
                nsfw && Platform.OS !== "web"
                  ? styles.cardImageNsfwFilter
                  : null,
              ]}
            >
              <Image
                source={{
                  uri: item.image_url
                    ? proxiedImageUrl(item.image_url, useProxy)
                    : (galleryThumbnailUrl as string),
                }}
                blurRadius={nsfw ? NSFW_BLUR_RADIUS : 0}
                autoplay={!nsfw}
                style={styles.cardImageFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`thumb-${item.id}`}
                transition={120}
              />
            </View>
          </View>
        ) : null}
        <View style={styles.cardContent}>
          <FeedPostMeta
            feedTitle={feedTitle}
            publishedAt={item.published_at}
            read={item.read}
          />
          <TouchableOpacity
            onPress={() => onOpenItem(item.id)}
            activeOpacity={0.7}
            accessibilityLabel={`Open post: ${item.title}`}
          >
            <Text
              style={[
                styles.title,
                { color: colors.ink },
                item.read ? { color: colors.inkSoft, fontWeight: "500" } : null,
              ]}
              numberOfLines={3}
            >
              {item.title}
            </Text>
            {item.content ? (
              <Text
                style={[styles.summary, { color: colors.inkSoft }]}
                numberOfLines={2}
              >
                {contentText}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          styles.actionRow,
          {
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.xs,
            paddingBottom: spacing.sm,
            justifyContent: isLargeScreen ? "flex-start" : "space-evenly",
            marginTop: 0,
          },
        ]}
      >
        {showExpand && onToggleExpand ? (
          <TouchableOpacity
            onPress={() => onToggleExpand(item.id)}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityLabel={expanded ? "Collapse post" : "Expand post"}
          >
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={expanded ? colors.accent : colors.inkSoft}
            />
          </TouchableOpacity>
        ) : null}
        <ReadToggleButton
          read={item.read}
          onPress={() => onToggleRead(item.id)}
        />
        <SaveButton saved={saved} onPress={() => onToggleSave(item.id)} />
        {onToggleReadLater ? (
          <ReadLaterButton
            readLater={readLater}
            onPress={() => onToggleReadLater(item.id)}
          />
        ) : null}
        <TouchableOpacity
          style={styles.iconActionBtn}
          onPress={() => onOpenOriginalLink(item.id)}
          activeOpacity={0.6}
          hitSlop={8}
          disabled={!item.url}
          accessibilityLabel="Open original link"
        >
          <Feather
            name="external-link"
            size={18}
            color={item.url ? colors.inkSoft : colors.inkFaint}
          />
        </TouchableOpacity>
        {redditCommentsLink ? (
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => onOpenContentLink(redditCommentsLink.url)}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityLabel="Open Reddit comments"
          >
            <Feather name="message-circle" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        ) : null}
        {redditAuthor && onFollowAuthor ? (
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => onFollowAuthor(item.id)}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityLabel={
              authorFollowed
                ? `Unfollow u/${redditAuthor}`
                : `Follow u/${redditAuthor}`
            }
          >
            <Feather
              name={authorFollowed ? "user-minus" : "user-plus"}
              size={18}
              color={authorFollowed ? colors.accent : colors.inkSoft}
            />
          </TouchableOpacity>
        ) : null}
        {showRawXml && onOpenRawXml ? (
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={() => onOpenRawXml(item.id)}
            activeOpacity={0.6}
            hitSlop={8}
            accessibilityLabel="View raw XML"
          >
            <Feather name="terminal" size={18} color={colors.inkSoft} />
          </TouchableOpacity>
        ) : null}
      </View>
      {showExpand && expanded ? (
        <View
          style={[
            styles.expandPanel,
            {
              borderTopColor: colors.inkFaint,
              backgroundColor: colors.paperWarm,
            },
          ]}
        >
          {item.image_url || item.url || item.content ? (
            <ExpandedFeedMedia
              imageUrl={item.image_url}
              itemUrl={item.url}
              content={item.content}
              testID={expandedMediaTestID}
              useProxy={useProxy}
              nsfw={nsfw}
              deferGalleryLoad={false}
              deferGifLoad={isGif}
            />
          ) : null}
          {item.content ? (
            shouldRenderHtmlContent ? (
              <SanitizedHtmlContent html={sanitizedHtmlContent} />
            ) : (
              <Text style={[styles.expandContent, { color: colors.ink }]}>
                {bionicReading
                  ? toBionic(contentText || "").map((token, i) =>
                      token.kind === "space" ? (
                        token.text
                      ) : (
                        <Text key={i}>
                          <Text style={styles.bionicBold}>{token.bold}</Text>
                          {token.rest}
                        </Text>
                      )
                    )
                  : contentText}
              </Text>
            )
          ) : null}
          {visibleContentLinks.length ? (
            <ContentLinkRow
              links={visibleContentLinks}
              onOpenContentLink={onOpenContentLink}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FeedPostMeta({
  feedTitle,
  publishedAt,
  read,
}: {
  feedTitle: string;
  publishedAt: number | null;
  read: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.cardMeta}>
      <Text style={[styles.sourceText, { color: colors.ink }]}>
        {feedTitle}
      </Text>
      <Text style={[styles.metaDot, { color: colors.inkSoft }]}>·</Text>
      <MetaText>{formatDate(publishedAt)}</MetaText>
      {!read ? (
        <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
      ) : null}
    </View>
  );
}

function ContentLinkRow({
  links,
  onOpenContentLink,
}: {
  links: Array<{ label: "Link" | "Comments"; url: string }>;
  onOpenContentLink: (url: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.contentLinkRow}>
      {links.map((link) => (
        <TouchableOpacity
          key={`${link.label}:${link.url}`}
          style={[styles.contentLinkBtn, { borderColor: colors.border }]}
          onPress={() => onOpenContentLink(link.url)}
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
  );
}

function ReadToggleButton({
  read,
  onPress,
}: {
  read: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={styles.iconActionBtn}
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={8}
      accessibilityLabel={read ? "Mark post as unread" : "Mark post as read"}
    >
      <Feather
        name={read ? "eye-off" : "eye"}
        size={18}
        color={read ? colors.inkSoft : colors.accent}
      />
    </TouchableOpacity>
  );
}

function SaveButton({
  saved,
  onPress,
}: {
  saved: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.iconActionBtn,
        saved && { backgroundColor: colors.ink, borderRadius: 999 },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={8}
      accessibilityLabel={saved ? "Unsave post" : "Save post"}
    >
      <Feather
        name="bookmark"
        size={18}
        color={saved ? colors.paper : colors.inkSoft}
      />
    </TouchableOpacity>
  );
}

function ReadLaterButton({
  readLater,
  onPress,
}: {
  readLater: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.iconActionBtn,
        readLater && { backgroundColor: colors.ink, borderRadius: 999 },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={8}
      accessibilityLabel={
        readLater ? "Remove from read later" : "Add to read later"
      }
    >
      <Feather
        name="clock"
        size={18}
        color={readLater ? colors.paper : colors.inkSoft}
      />
    </TouchableOpacity>
  );
}

function useRedditGalleryThumbnail(
  galleryUrl: string | null,
  useProxy?: boolean
): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!galleryUrl) {
      setThumbnailUrl(null);
      return;
    }

    let active = true;
    fetchRedditGalleryImageUrlsCached(galleryUrl, useProxy)
      .then((urls) => {
        if (!active) return;
        const first = urls
          .map((url) => proxiedImageUrl(url, useProxy))
          .find((url): url is string => Boolean(url));
        setThumbnailUrl(first ?? null);
      })
      .catch(() => {
        if (!active) return;
        setThumbnailUrl(null);
      });

    return () => {
      active = false;
    };
  }, [galleryUrl, useProxy]);

  return thumbnailUrl;
}

function formatDate(ts: number | null): string {
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

export const FeedPostCard = React.memo(FeedPostCardComponent, arePropsEqual);

function arePropsEqual(prev: Props, next: Props): boolean {
  // Item identity is the most expensive thing to compare; rely on referential
  // equality + the small set of mutable fields list screens flip in place.
  if (prev.item !== next.item) {
    if (
      prev.item.id !== next.item.id ||
      prev.item.read !== next.item.read ||
      prev.item.title !== next.item.title ||
      prev.item.url !== next.item.url ||
      prev.item.content !== next.item.content ||
      prev.item.image_url !== next.item.image_url ||
      prev.item.published_at !== next.item.published_at
    ) {
      return false;
    }
  }
  return (
    prev.feedTitle === next.feedTitle &&
    prev.layout === next.layout &&
    prev.nsfw === next.nsfw &&
    prev.useProxy === next.useProxy &&
    prev.saved === next.saved &&
    prev.readLater === next.readLater &&
    prev.expanded === next.expanded &&
    prev.showExpand === next.showExpand &&
    prev.showRawXml === next.showRawXml &&
    prev.cardWidth === next.cardWidth &&
    prev.cardMediaRevealed === next.cardMediaRevealed &&
    prev.cardMediaTestID === next.cardMediaTestID &&
    prev.expandedMediaTestID === next.expandedMediaTestID &&
    prev.onOpenItem === next.onOpenItem &&
    prev.onRevealCardMedia === next.onRevealCardMedia &&
    prev.onToggleExpand === next.onToggleExpand &&
    prev.onToggleRead === next.onToggleRead &&
    prev.onToggleSave === next.onToggleSave &&
    prev.onToggleReadLater === next.onToggleReadLater &&
    prev.onOpenOriginalLink === next.onOpenOriginalLink &&
    prev.onOpenContentLink === next.onOpenContentLink &&
    prev.onOpenRawXml === next.onOpenRawXml &&
    prev.authorFollowed === next.authorFollowed &&
    prev.onFollowAuthor === next.onFollowAuthor
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 0.5,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  cardLayout: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  cardLayoutContent: {
    gap: spacing.sm,
  },
  cardMediaWrap: {
    position: "relative",
  },
  mediaBlurOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaBlurPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  mediaBlurText: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  cardRow: {
    flexDirection: "row",
  },
  cardImage: {
    width: CARD_IMAGE_WIDTH,
    alignSelf: "stretch",
    overflow: "hidden",
  },
  cardImageFill: {
    flex: 1,
  },
  cardImageNsfwFilter: {
    filter: [{ blur: 20 }],
  } as object,
  cardContent: {
    flex: 1,
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
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
  expandPanel: {
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
  },
  expandContent: {
    fontSize: fontSize.body,
    lineHeight: 20,
    fontFamily: fonts.body,
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
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconActionBtn: {
    minHeight: 30,
    minWidth: 30,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  contentLinkText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
});
