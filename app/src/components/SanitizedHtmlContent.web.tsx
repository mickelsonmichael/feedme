import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import {
  articleParagraphSpacing,
  articleTypography,
  fonts,
  spacing,
  WEB_ARTICLE_FONT_SIZE,
} from "../theme";

type Props = {
  html: string;
};

const BLOCK_GAP = articleParagraphSpacing(WEB_ARTICLE_FONT_SIZE);

function SanitizedHtmlContentImpl({ html }: Props) {
  const { colors } = useTheme();
  const instanceClass = React.useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const scopeClass = `feedme-html-${instanceClass}`;
  // Block spacing is carried entirely by margin-bottom so adjacent blocks
  // always sit exactly one gap apart, and the first/last child never pushes
  // the article away from its container edges.
  const scopedCss = `
    .${scopeClass} a, .${scopeClass} a * { color: ${colors.accent}; }
    .${scopeClass} p,
    .${scopeClass} ul,
    .${scopeClass} ol,
    .${scopeClass} blockquote,
    .${scopeClass} pre,
    .${scopeClass} table { margin: 0 0 ${BLOCK_GAP}px; }
    .${scopeClass} ul, .${scopeClass} ol { padding-left: 1.25em; }
    .${scopeClass} li + li { margin-top: ${Math.round(BLOCK_GAP / 3)}px; }
    .${scopeClass} h1,
    .${scopeClass} h2,
    .${scopeClass} h3,
    .${scopeClass} h4,
    .${scopeClass} h5,
    .${scopeClass} h6 {
      margin: ${BLOCK_GAP}px 0 ${spacing.sm}px;
      line-height: ${articleTypography.headingLineHeightRatio};
    }
    .${scopeClass} blockquote {
      padding-left: ${spacing.md}px;
      border-left: 3px solid ${colors.border};
    }
    .${scopeClass} > *:first-child { margin-top: 0; }
    .${scopeClass} > *:last-child { margin-bottom: 0; }
    .${scopeClass} pre {
      white-space: pre-wrap;
      background: ${colors.paperWarm};
      border: 1px solid ${colors.border};
      border-radius: 6px;
      padding: 10px 12px;
      font-family: Menlo, Monaco, "Courier New", monospace;
      font-size: 11px;
      overflow-x: auto;
    }
  `;

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: colors.border, backgroundColor: colors.paperWarm },
      ]}
    >
      <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
      <div
        className={scopeClass}
        style={{
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: WEB_ARTICLE_FONT_SIZE,
          lineHeight: articleTypography.lineHeightRatio,
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </View>
  );
}

// Memoised: re-parsing and re-laying-out an article's HTML is the single
// most expensive thing the reader does, and `html` changes far less often
// than the screen above it re-renders.
export const SanitizedHtmlContent = React.memo(SanitizedHtmlContentImpl);

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
});
