import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "../types";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { parseContentAndLinks } from "../utils/contentActions";
import { applyBionicToHtml, toBionic } from "../utils/bionicReading";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent";
import { hasRenderableHtml, sanitizeHtml } from "../utils/sanitizeHtml";

export type FeedItemContentItem = RootStackParamList["FeedItemView"]["item"];

type Props = {
  item: FeedItemContentItem;
  bionicReading: boolean;
  isDesktopWeb?: boolean;
  onOpenContentLink?: (url: string) => void;
  includeRedditCommentsInLinks?: boolean;
};

export function FeedItemContent({
  item,
  bionicReading,
  isDesktopWeb = false,
  onOpenContentLink,
  includeRedditCommentsInLinks = false,
}: Props) {
  const { colors } = useTheme();
  const { text: contentText, links: contentLinks } = React.useMemo(
    () => parseContentAndLinks(item.content),
    [item.content]
  );
  const shouldRenderHtmlContent = React.useMemo(
    () => hasRenderableHtml(item.content),
    [item.content]
  );
  const sanitizedHtmlContent = React.useMemo(() => {
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
