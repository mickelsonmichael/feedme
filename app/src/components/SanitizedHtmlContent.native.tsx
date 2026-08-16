import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import RenderHTML from "react-native-render-html";
import { useTheme } from "../context/ThemeContext";
import {
  articleHeadingLineHeight,
  articleLineHeight,
  articleParagraphSpacing,
  fonts,
  fontSize,
  spacing,
} from "../theme";

type Props = {
  html: string;
};

const DEFAULT_TEXT_PROPS = { selectable: true };
const IGNORED_DOM_TAGS: string[] = ["iframe"];

const BODY_SIZE = fontSize.bodyLg;
const BODY_LINE_HEIGHT = articleLineHeight(BODY_SIZE);
const BLOCK_GAP = articleParagraphSpacing(BODY_SIZE);

function headingStyle(size: number) {
  return {
    fontSize: size,
    lineHeight: articleHeadingLineHeight(size),
    marginTop: BLOCK_GAP,
    marginBottom: spacing.sm,
  };
}

function SanitizedHtmlContentImpl({ html }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(width - spacing.lg * 2, 0);

  const source = useMemo(() => ({ html }), [html]);

  const baseStyle = useMemo(
    () => ({
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: BODY_SIZE,
      lineHeight: BODY_LINE_HEIGHT,
    }),
    [colors.ink]
  );

  // sanitizeHtml() does not strip inline `style` attributes, so feed content
  // can carry colors that clash with the app theme (especially in dark
  // mode). Disabling inline CSS processing forces baseStyle/tagsStyles to
  // always win, matching the old WebView CSS's `!important` overrides.
  //
  // Block spacing is carried entirely by marginBottom (marginTop stays 0
  // except on headings, which want breathing room above them). RNRH's
  // experimental margin collapsing then guarantees one uniform gap between
  // any two blocks, instead of the doubled or halved gaps you get when both
  // sides contribute a margin.
  const tagsStyles = useMemo(
    () => ({
      p: { marginTop: 0, marginBottom: BLOCK_GAP },
      ul: { marginTop: 0, marginBottom: BLOCK_GAP, paddingLeft: spacing.lg },
      ol: { marginTop: 0, marginBottom: BLOCK_GAP, paddingLeft: spacing.lg },
      li: { marginTop: 0, marginBottom: spacing.sm },
      blockquote: {
        marginTop: 0,
        marginBottom: BLOCK_GAP,
        marginLeft: 0,
        marginRight: 0,
        paddingLeft: spacing.md,
        borderLeftWidth: 3,
        borderLeftColor: colors.border,
      },
      h1: headingStyle(fontSize.h1),
      h2: headingStyle(fontSize.h2),
      h3: headingStyle(fontSize.title),
      h4: headingStyle(fontSize.bodyLg),
      h5: headingStyle(fontSize.bodyLg),
      h6: headingStyle(fontSize.bodyLg),
      a: { color: colors.accent },
      pre: {
        marginTop: 0,
        marginBottom: BLOCK_GAP,
        backgroundColor: colors.paperWarm,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 6,
        padding: spacing.sm + 2,
      },
      code: {
        fontFamily: fonts.mono,
        fontSize: fontSize.sm,
      },
    }),
    [colors.accent, colors.paperWarm, colors.border]
  );

  return (
    <View style={styles.wrap}>
      <RenderHTML
        contentWidth={contentWidth}
        source={source}
        baseStyle={baseStyle}
        tagsStyles={tagsStyles}
        enableCSSInlineProcessing={false}
        enableExperimentalMarginCollapsing
        defaultTextProps={DEFAULT_TEXT_PROPS}
        ignoredDomTags={IGNORED_DOM_TAGS}
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
    marginTop: spacing.xs,
  },
});
