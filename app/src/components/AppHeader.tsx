// Shared header component used across all app screens.
// Handles top safe-area insets so the header stays below device notches/cameras.

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, fontSize, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { useHeaderContent } from "../context/HeaderContentContext";

export function AppHeader() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { headerContent } = useHeaderContent();
  const { width } = useWindowDimensions();
  const showHeaderContent = Platform.OS === "web" && Boolean(headerContent);
  const showTitle = Platform.OS === "web" && width >= 768;

  // On web, the browser handles safe areas and insets.top is 0; use a fixed
  // top padding instead so the header doesn't sit flush against the viewport.
  const paddingTop =
    Platform.OS === "web" ? spacing.md : insets.top + spacing.sm;

  return (
    <View
      style={[
        styles.header,
        {
          alignItems: showHeaderContent ? "center" : "baseline",
          borderBottomColor: colors.border,
          backgroundColor: colors.paper,
          paddingTop,
        },
      ]}
    >
      {showTitle ? (
        <Text style={[styles.title, { color: colors.ink }]}>FeedMe</Text>
      ) : null}
      {showHeaderContent ? (
        <View testID="app-header-content" style={styles.headerContent}>
          {headerContent}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  headerContent: {
    width: "100%",
    maxWidth: 440,
    marginLeft: "auto",
    flexShrink: 1,
  },
  title: {
    fontFamily: fonts.sans,
    fontSize: fontSize.h2,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
