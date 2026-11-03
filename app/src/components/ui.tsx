// Small shared UI primitives used across the redesigned screens.

import React from "react";
import { View, Text, StyleSheet, TextStyle, StyleProp } from "react-native";
import { fonts, fontSize, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

export function MetaText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.meta, { color: colors.inkSoft }, style]}>
      {children}
    </Text>
  );
}

export function DashedDivider() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.dashedDivider, { borderBottomColor: colors.inkFaint }]}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    marginVertical: spacing.sm,
  },
});
