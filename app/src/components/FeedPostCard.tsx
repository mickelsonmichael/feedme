import React, { useMemo } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { parseContentAndLinks } from "../utils/contentActions";
import { proxiedImageUrl } from "../proxyFetch";
import { extractRedditGalleryUrl } from "../redditGallery";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";
import { MetaText } from "./ui";
import { fonts, fontSize, radii, spacing } from "../theme";

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
  expanded?: boolean;
  showExpand?: boolean;
  showRawXml?: boolean;
  cardWidth?: number;
  cardMediaRevealed?: boolean;
  cardMediaTestID?: string;
  expandedMediaTestID?: string;
  onOpenItem: () => void;
  onRevealCardMedia?: () => void;
  onToggleExpand?: () => void;
  onToggleRead: () => void;
  onToggleSave: () => void;
  onOpenOriginalLink: () => void;
  onOpenContentLink: (url: string) => void;
  onOpenRawXml?: () => void;
};

export function FeedPostCard({
  item,
  feedTitle,
  layout,
  nsfw = false,
  useProxy = false,
  saved,
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
  onOpenOriginalLink,
  onOpenContentLink,
  onOpenRawXml,
}: Props) {
  const { colors } = useTheme();
  const { text: contentText, links: contentLinks } = useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const redditCommentsLink = useMemo(
    () =>
      contentLinks.find(
        (link) => link.label === "Comments" && isRedditCommentsUrl(link.url)
      ) ?? null,
    [contentLinks]
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
  const isRedditGallery = useMemo(
    () => Boolean(extractRedditGalleryUrl(item.url, item.content)),
    [item.content, item.url]
  );
  const showCardRevealOverlay = isCardMediaBlurred && !isRedditGallery;

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
              deferGalleryLoad={isRedditGallery}
              useProxy={useProxy}
            />
            {showCardRevealOverlay ? (
              <TouchableOpacity
                style={[
                  styles.mediaBlurOverlay,
                  { backgroundColor: `${colors.paper}cc` },
                ]}
                onPress={() => onRevealCardMedia?.()}
                activeOpacity={0.9}
                accessibilityLabel="Reveal NSFW media"
              >
                <Feather name="eye" size={16} color={colors.ink} />
                <Text style={[styles.mediaBlurText, { color: colors.ink }]}>
                  Reveal images
                </Text>
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
            onPress={onOpenItem}
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
            <ReadToggleButton read={item.read} onPress={onToggleRead} />
            <SaveButton saved={saved} onPress={onToggleSave} />
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={onOpenOriginalLink}
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
        {item.image_url ? (
          <Image
            source={{ uri: proxiedImageUrl(item.image_url, useProxy) }}
            blurRadius={nsfw ? 24 : 0}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.cardContent}>
          <FeedPostMeta
            feedTitle={feedTitle}
            publishedAt={item.published_at}
            read={item.read}
          />
          <TouchableOpacity
            onPress={onOpenItem}
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
          <View style={[styles.actionRow, { borderTopColor: colors.inkFaint }]}>
            {showExpand && onToggleExpand ? (
              <TouchableOpacity
                onPress={onToggleExpand}
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
            <ReadToggleButton read={item.read} onPress={onToggleRead} />
            <SaveButton saved={saved} onPress={onToggleSave} />
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={onOpenOriginalLink}
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
                <Feather
                  name="message-circle"
                  size={18}
                  color={colors.inkSoft}
                />
              </TouchableOpacity>
            ) : null}
            {showRawXml && onOpenRawXml ? (
              <TouchableOpacity
                style={styles.iconActionBtn}
                onPress={onOpenRawXml}
                activeOpacity={0.6}
                hitSlop={8}
                accessibilityLabel="View raw XML"
              >
                <Feather name="terminal" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
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
            />
          ) : null}
          {item.content ? (
            <Text style={[styles.expandContent, { color: colors.ink }]}>
              {contentText}
            </Text>
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
      style={styles.iconActionBtn}
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={8}
      accessibilityLabel={saved ? "Unsave post" : "Save post"}
    >
      <Feather
        name="bookmark"
        size={18}
        color={saved ? colors.accent : colors.inkSoft}
      />
    </TouchableOpacity>
  );
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

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  cardLayout: {
    width: "100%",
    maxWidth: 760,
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
    gap: spacing.xs,
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
  },
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
    borderStyle: "dashed",
  },
  expandPanel: {
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderStyle: "dashed",
  },
  expandContent: {
    fontSize: fontSize.body,
    lineHeight: 20,
    fontFamily: fonts.body,
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
