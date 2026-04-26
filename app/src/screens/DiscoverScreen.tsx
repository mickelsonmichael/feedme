// DiscoverScreen — Placeholder "find new feeds" tab.
// Mock: shows a search row and a few curated example feeds the user could add.

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Avatar, MetaText, Wordmark } from "../components/ui";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

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
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Wordmark size={22} />
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
          / discover
        </Text>
      </View>
      <View
        style={[
          styles.searchRow,
          { borderColor: colors.border, backgroundColor: colors.paperWarm },
        ]}
      >
        <Text style={[styles.searchPlaceholder, { color: colors.inkSoft }]}>
          ⌕ search feeds by name or topic…
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.sectionLabel, { color: colors.inkSoft }]}>
          suggested for you
        </Text>
        {SUGGESTED.map((f) => (
          <View
            key={f.url}
            style={[styles.row, { borderBottomColor: colors.inkFaint }]}
          >
            <Avatar label={f.name} size={32} />
            <View style={styles.rowBody}>
              <Text style={[styles.feedName, { color: colors.ink }]}>
                {f.name}
              </Text>
              <MetaText>{f.url}</MetaText>
              <Text style={[styles.tagline, { color: colors.inkSoft }]}>
                {f.tagline}
              </Text>
            </View>
            <Text style={[styles.addBtn, { color: colors.accent }]}>
              ＋ add
            </Text>
          </View>
        ))}
        <Text style={[styles.scrawl, { color: colors.accent }]}>
          more discovery sources coming soon →
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  searchRow: {
    margin: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radii.md,
  },
  searchPlaceholder: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
  list: { padding: spacing.md, gap: spacing.md },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
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
    borderStyle: "dashed",
  },
  rowBody: { flex: 1, gap: 2 },
  feedName: {
    fontSize: fontSize.bodyLg,
    fontWeight: "600",
  },
  tagline: {
    fontSize: fontSize.meta,
    fontStyle: "italic",
  },
  addBtn: {
    fontSize: fontSize.body,
    fontWeight: "600",
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    alignSelf: "center",
    marginTop: spacing.lg,
    transform: [{ rotate: "-1.5deg" }],
  },
});
