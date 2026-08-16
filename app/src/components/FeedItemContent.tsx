import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "../types";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { parseContentAndLinks } from "../utils/contentActions";
import { ArticleText } from "./ArticleText";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent";
import { prepareArticleHtml } from "../utils/articleHtml";
import { hasRenderableHtml } from "../utils/sanitizeHtml";

export type FeedItemContentItem = RootStackParamList["FeedItemView"]["item"];

type Props = {
  item: FeedItemContentItem;
  bionicReading: boolean;
  isDesktopWeb?: boolean;
  onOpenContentLink?: (url: string) => void;
  includeRedditCommentsInLinks?: boolean;
  /** The reader has settled on this post. Heavy embeds (players, galleries)
   *  only mount once that's true — see SingleViewPager. */
  isLive?: boolean;
};

function FeedItemContentImpl({
  item,
  bionicReading,
  isDesktopWeb = false,
  onOpenContentLink,
  includeRedditCommentsInLinks = false,
  isLive = true,
}: Props) {
  const { colors } = useTheme();
  const { links: contentLinks, paragraphs: contentParagraphs } = React.useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const shouldRenderHtmlContent = React.useMemo(
    () => hasRenderableHtml(item.content),
    [item.content]
  );
  const sanitizedHtmlContent = React.useMemo(() => {
    if (!shouldRenderHtmlContent) return "";
    return prepareArticleHtml(item.content, bionicReading);
  }, [item.content, shouldRenderHtmlContent, bionicReading]);
  const visibleContentLinks = React.useMemo(
    () =>
      contentLinks.filter(
        (link) =>
          link.label !== "Link" &&
          (includeRedditCommentsInLinks ||
            !(link.label === "Comments" && isRedditCommentsUrl(link.url)))
      ),
    [contentLinks, includeRedditCommentsInLinks]
  );

  return (
    <View
      style={[styles.articleInner, isDesktopWeb ? styles.desktopInner : null]}
    >
      {item.imageUrl || item.url || item.content ? (
        <ExpandedFeedMedia
          imageUrl={item.imageUrl}
          itemUrl={item.url}
          content={item.content}
          useProxy={item.useProxy ?? false}
          nsfw={item.nsfw ?? false}
          deferGalleryLoad={!isLive}
          deferGifLoad={!isLive || (item.nsfw ?? false)}
          isLive={isLive}
        />
      ) : null}

      {shouldRenderHtmlContent ? (
        <SanitizedHtmlContent html={sanitizedHtmlContent} />
      ) : (
        <ArticleText
          paragraphs={contentParagraphs}
          bionicReading={bionicReading}
          color={colors.ink}
          fallbackText="No content available."
        />
      )}

      {onOpenContentLink && visibleContentLinks.length ? (
        <View style={styles.contentLinkRow}>
          {visibleContentLinks.map((link) => (
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
      ) : null}
    </View>
  );
}

export const FeedItemContent = React.memo(FeedItemContentImpl);

export function isRedditCommentsUrl(url: string): boolean {
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

export function formatDate(ts: number | null): string {
  if (!ts) return "unknown";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  articleInner: {
    width: "100%",
    gap: spacing.md,
  },
  desktopInner: {
    maxWidth: 920,
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
