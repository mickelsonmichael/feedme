import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import RenderHTML from "react-native-render-html";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, spacing } from "../theme";

type Props = {
  html: string;
};

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(width - spacing.lg * 2, 0);

  const baseStyle = useMemo(
    () => ({
      color: colors.ink,
      fontFamily: fonts.sans,
      fontSize: fontSize.body,
      lineHeight: Math.round(fontSize.body * 1.45),
    }),
    [colors.ink]
  );

  // sanitizeHtml() does not strip inline `style` attributes, so feed content
  // can carry colors that clash with the app theme (especially in dark
  // mode). Disabling inline CSS processing forces baseStyle/tagsStyles to
  // always win, matching the old WebView CSS's `!important` overrides.
  const tagsStyles = useMemo(
    () => ({
      a: { color: colors.accent },
      pre: {
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
        source={{ html }}
        baseStyle={baseStyle}
        tagsStyles={tagsStyles}
        enableCSSInlineProcessing={false}
        enableExperimentalMarginCollapsing
        defaultTextProps={{ selectable: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xs,
  },
});
