import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

function SanitizedHtmlContentImpl({ html }: Props) {
  const { colors } = useTheme();
  const instanceClass = React.useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const scopeClass = `feedme-html-${instanceClass}`;
  const scopedCss = `
    .${scopeClass} a, .${scopeClass} a * { color: ${colors.accent}; }
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
          fontSize: 17,
          lineHeight: 1.45,
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
