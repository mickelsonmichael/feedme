import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, spacing } from "../theme";

type Props = {
  html: string;
};

export function SanitizedHtmlContent({ html }: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        { borderColor: colors.border, backgroundColor: colors.paperWarm },
      ]}
    >
      <div
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
