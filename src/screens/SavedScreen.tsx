// SavedScreen — "Read later" / bookmarks placeholder tab.
// Mock functionality: currently just an empty state matching the wireframe
// tone (see wire-mobile.jsx MobileFeed bottom nav: feed / saved / discover / settings).

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Wordmark } from "../components/ui";
import { colors, fonts, fontSize, spacing } from "../theme";

export default function SavedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Wordmark size={22} />
        <Text style={styles.subtitle}>/ saved</Text>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No saved posts yet.</Text>
        <Text style={styles.emptyBody}>
          Tap the save icon on any post to keep it here for later.
        </Text>
        <Text style={styles.scrawl}>← coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1.2,
    borderBottomColor: colors.ink,
    gap: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
    color: colors.inkSoft,
  },
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
    color: colors.ink,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: fontSize.bodyLg,
    color: colors.inkSoft,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    color: colors.accent,
    marginTop: spacing.md,
    transform: [{ rotate: "-2deg" }],
  },
});
