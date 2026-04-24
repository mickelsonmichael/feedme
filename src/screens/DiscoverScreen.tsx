// DiscoverScreen — Placeholder "find new feeds" tab.
// Mock: shows a search row and a few curated example feeds the user could add.

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Avatar, MetaText, Wordmark } from "../components/ui";
import { colors, fonts, fontSize, radii, spacing } from "../theme";

const SUGGESTED = [
  {
    name: "The Verge",
    url: "theverge.com/rss",
    tagline: "tech news, reviews, culture",
  },
  {
    name: "Hacker News",
    url: "news.ycombinator.com/rss",
    tagline: "what programmers are reading",
  },
  {
    name: "NYT Cooking",
    url: "cooking.nytimes.com/rss",
    tagline: "weeknight recipes & technique",
  },
  {
    name: "Ars Technica",
    url: "arstechnica.com/feed",
    tagline: "science, tech, policy",
  },
  {
    name: "Stratechery",
    url: "stratechery.com/feed",
    tagline: "analysis of tech & media",
  },
];

export default function DiscoverScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Wordmark size={22} />
        <Text style={styles.subtitle}>/ discover</Text>
      </View>
      <View style={styles.searchRow}>
        <Text style={styles.searchPlaceholder}>
          ⌕ search feeds by name or topic…
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionLabel}>suggested for you</Text>
        {SUGGESTED.map((f) => (
          <View key={f.url} style={styles.row}>
            <Avatar label={f.name} size={32} />
            <View style={styles.rowBody}>
              <Text style={styles.feedName}>{f.name}</Text>
              <MetaText>{f.url}</MetaText>
              <Text style={styles.tagline}>{f.tagline}</Text>
            </View>
            <Text style={styles.addBtn}>＋ add</Text>
          </View>
        ))}
        <Text style={styles.scrawl}>more discovery sources coming soon →</Text>
      </ScrollView>
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
  searchRow: {
    margin: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.ink,
    borderRadius: radii.sm,
    backgroundColor: colors.paperWarm,
  },
  searchPlaceholder: {
    fontFamily: fonts.mono,
    fontSize: fontSize.body,
    color: colors.inkSoft,
  },
  list: { padding: spacing.md, gap: spacing.md },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
  },
  rowBody: { flex: 1, gap: 2 },
  feedName: {
    fontSize: fontSize.bodyLg,
    color: colors.ink,
    fontWeight: "600",
  },
  tagline: {
    fontSize: fontSize.meta,
    color: colors.inkSoft,
    fontStyle: "italic",
  },
  addBtn: {
    fontSize: fontSize.body,
    color: colors.accent,
    fontWeight: "600",
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    color: colors.accent,
    alignSelf: "center",
    marginTop: spacing.lg,
    transform: [{ rotate: "-1.5deg" }],
  },
});
