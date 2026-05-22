import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();
  const instanceClass = React.useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const scopeClass = `feedme-html-${instanceClass}`;
  const scopedCss = `
    .${scopeClass} a, .${scopeClass} a * { color: ${colors.accent}; }
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

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
});
