import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather } from "@react-native-vector-icons/feather";
import { useTheme } from "../context/ThemeContext";
import { parseContentAndLinks } from "../utils/contentActions";
import { loadConfig } from "../storage";
import { proxiedImageUrl } from "../proxyFetch";
import {
  extractRedditGalleryUrl,
  fetchRedditGalleryImageUrlsCached,
} from "../redditGallery";
import { extractGifEmbedUrl, extractGifEmbedUrlFromContent } from "../gifUtils";
import { extractRedditAuthor, isRedditCommentsUrl } from "../redditUtils";
import { formatRelativeAge } from "../utils/relativeAge";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";
import { ArticleText } from "./ArticleText";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent";
import { MetaText } from "./ui";
import { IconButton } from "./IconButton";
import { fonts, fontSize, NSFW_BLUR_RADIUS, radii, spacing } from "../theme";
import { prepareArticleHtml } from "../utils/articleHtml";
import { hasRenderableHtml } from "../utils/sanitizeHtml";

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
  authorFollowed,
  onFollowAuthor,
}: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isLargeScreen = Platform.OS === "web" && width >= 768;
  const {
    text: contentText,
    links: contentLinks,
    paragraphs: contentParagraphs,
  } = useMemo(() => parseContentAndLinks(item.content), [item.content]);
  // The article body only renders in a compact row's expand panel, so only
  // pay for it there. Sanitising a post's full HTML is the most expensive
  // thing a row does, and doing it for every collapsed row — and again each
  // time FlashList recycles a cell onto a new post — was wasted work on the
  // scroll path. Card layout never shows the body at all.
  const showsArticleBody = layout === "compact" && showExpand && expanded;
  // Fade the panel in only when the user expands this post. FlashList
  // recycles this component onto other posts, and an already-expanded post
  // scrolling back into view must just be there, not fade in again.
  const lastExpansionRef = useRef({ id: item.id, expanded });
  const expandedByUser =
    expanded &&
    lastExpansionRef.current.id === item.id &&
    !lastExpansionRef.current.expanded;
  useEffect(() => {
    lastExpansionRef.current = { id: item.id, expanded };
  }, [item.id, expanded]);
  const shouldRenderHtmlContent = useMemo(
    () => showsArticleBody && hasRenderableHtml(item.content),
    [item.content, showsArticleBody]
  );
  const [bionicReading] = useState(() => loadConfig().bionicReading ?? false);
  const sanitizedHtmlContent = useMemo(() => {
    if (!shouldRenderHtmlContent) return "";
    return prepareArticleHtml(item.content, bionicReading);
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

  // The actions both layouts share; compact puts its expand toggle first.
  const postActions = (
    <>
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
      <IconButton
        style={styles.iconActionBtn}
        onPress={() => onOpenOriginalLink(item.id)}
        disabled={!item.url}
        accessibilityLabel="Open original link"
      >
        <Feather
          name="external-link"
          size={18}
          color={item.url ? colors.inkSoft : colors.inkFaint}
        />
      </IconButton>
      {redditCommentsLink ? (
        <IconButton
          style={styles.iconActionBtn}
          onPress={() => onOpenContentLink(redditCommentsLink.url)}
          accessibilityLabel="Open Reddit comments"
        >
          <Feather name="message-circle" size={18} color={colors.inkSoft} />
        </IconButton>
      ) : null}
      {redditAuthor && onFollowAuthor ? (
        <IconButton
          style={styles.iconActionBtn}
          onPress={() => onFollowAuthor(item.id)}
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
        </IconButton>
      ) : null}
    </>
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
            {postActions}
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
          <View
            style={[styles.cardImage, { backgroundColor: colors.paperWarm }]}
          >
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
          <IconButton
            onPress={() => onToggleExpand(item.id)}
            accessibilityLabel={expanded ? "Collapse post" : "Expand post"}
          >
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={expanded ? colors.accent : colors.inkSoft}
            />
          </IconButton>
        ) : null}
        {postActions}
      </View>
      {showExpand && expanded ? (
        <Animated.View
          entering={expandedByUser ? FadeIn.duration(180) : undefined}
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
              <ArticleText
                paragraphs={contentParagraphs}
                bionicReading={bionicReading}
                color={colors.ink}
              />
            )
          ) : null}
          {visibleContentLinks.length ? (
            <ContentLinkRow
              links={visibleContentLinks}
              onOpenContentLink={onOpenContentLink}
            />
          ) : null}
        </Animated.View>
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
      <MetaText>{formatRelativeAge(publishedAt)}</MetaText>
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
  links: { label: "Link" | "Comments"; url: string }[];
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
    <IconButton
      style={styles.iconActionBtn}
      onPress={onPress}
      accessibilityLabel={read ? "Mark post as unread" : "Mark post as read"}
    >
      <Feather
        name={read ? "eye-off" : "eye"}
        size={18}
        color={read ? colors.inkSoft : colors.accent}
      />
    </IconButton>
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
    <IconButton
      style={[
        styles.iconActionBtn,
        saved && { backgroundColor: colors.ink, borderRadius: 999 },
      ]}
      onPress={onPress}
      accessibilityLabel={saved ? "Unsave post" : "Save post"}
    >
      <Feather
        name="bookmark"
        size={18}
        color={saved ? colors.paper : colors.inkSoft}
      />
    </IconButton>
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
    <IconButton
      style={[
        styles.iconActionBtn,
        readLater && { backgroundColor: colors.ink, borderRadius: 999 },
      ]}
      onPress={onPress}
      accessibilityLabel={
        readLater ? "Remove from read later" : "Add to read later"
      }
    >
      <Feather
        name="clock"
        size={18}
        color={readLater ? colors.paper : colors.inkSoft}
      />
    </IconButton>
  );
}

function useRedditGalleryThumbnail(
  galleryUrl: string | null,
  useProxy?: boolean
): string | null {
  // Tagged with the gallery it was resolved for. FlashList recycles a cell —
  // state and all — onto a different post, and an untagged thumbnail showed the
  // previous post's image until the effect below caught up a frame later.
  const [resolved, setResolved] = useState<{
    galleryUrl: string;
    thumbnailUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (!galleryUrl) return;

    let active = true;
    fetchRedditGalleryImageUrlsCached(galleryUrl, useProxy)
      .then((urls) => {
        if (!active) return;
        const first = urls
          .map((url) => proxiedImageUrl(url, useProxy))
          .find((url): url is string => Boolean(url));
        setResolved({ galleryUrl, thumbnailUrl: first ?? null });
      })
      .catch(() => {
        if (!active) return;
        setResolved({ galleryUrl, thumbnailUrl: null });
      });

    return () => {
      active = false;
    };
  }, [galleryUrl, useProxy]);

  return galleryUrl && resolved?.galleryUrl === galleryUrl
    ? resolved.thumbnailUrl
    : null;
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
