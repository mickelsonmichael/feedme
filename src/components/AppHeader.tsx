// Shared header component used across all tab screens.
// Shows the "FeedMe" app name in sans-serif with an optional subtitle.
// Handles top safe-area insets so the header stays below device notches/cameras.

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, fontSize, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // On web, the browser handles safe areas and insets.top is 0; use a fixed
  // top padding instead so the header doesn't sit flush against the viewport.
  const paddingTop =
    Platform.OS === "web" ? spacing.md : insets.top + spacing.sm;

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: colors.ink,
          backgroundColor: colors.paper,
          paddingTop,
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.ink }]}>FeedMe</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1.2,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.sans,
    fontSize: fontSize.h2,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
  },
});
