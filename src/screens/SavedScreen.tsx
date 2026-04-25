// SavedScreen — "Read later" / bookmarks placeholder tab.
// Mock functionality: currently just an empty state matching the wireframe
// tone (see wire-mobile.jsx MobileFeed bottom nav: feed / saved / discover / settings).

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { fonts, fontSize, spacing } from "../theme";

export default function SavedScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>
          No saved posts yet.
        </Text>
        <Text style={[styles.emptyBody, { color: colors.inkSoft }]}>
          Tap the save icon on any post to keep it here for later.
        </Text>
        <Text style={[styles.scrawl, { color: colors.accent }]}>
          ← coming soon
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.h2,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: fontSize.bodyLg,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    marginTop: spacing.md,
    transform: [{ rotate: "-2deg" }],
  },
});
