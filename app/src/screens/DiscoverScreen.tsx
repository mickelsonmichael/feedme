// DiscoverScreen — Find new feeds.
//
// Top: an entry-point button that opens the FeedSearch screen for finding
// feeds on a given site URL.
// Below: a curated list of suggested feeds the user can add with a single tap.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { addFeed, getFeeds } from "../database";
import { RootStackParamList, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import curatedFeeds from "../data/curatedFeeds.json";

type CuratedFeed = {
  title: string;
  url: string;
  iconUrl: string;
  description: string;
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Discover">,
  NativeStackScreenProps<RootStackParamList>
>;

type RowState = "idle" | "adding" | "added";

export default function DiscoverScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [subscribedUrls, setSubscribedUrls] = useState<Set<string>>(new Set());
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());

  const loadSubscribed = useCallback(async () => {
    try {
      const feeds = await getFeeds();
      setSubscribedUrls(new Set(feeds.map((feed) => feed.url)));
    } catch {
      setSubscribedUrls(new Set());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSubscribed();
    }, [loadSubscribed])
  );

  useEffect(() => {
    loadSubscribed();
  }, [loadSubscribed]);

  const feeds = useMemo(() => curatedFeeds as CuratedFeed[], []);

  const handleAdd = async (feed: CuratedFeed) => {
    setRowState((prev) => ({ ...prev, [feed.url]: "adding" }));
    try {
      await addFeed({
        title: feed.title,
        url: feed.url,
        description: feed.description ?? null,
      });
      setRowState((prev) => ({ ...prev, [feed.url]: "added" }));
      setSubscribedUrls((prev) => new Set(prev).add(feed.url));
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (message.includes("UNIQUE")) {
        setSubscribedUrls((prev) => new Set(prev).add(feed.url));
      } else {
        setRowState((prev) => ({ ...prev, [feed.url]: "idle" }));
        Alert.alert("Error", `Could not add feed: ${message}`);
      }
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.paper }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.ink }]}>Discover</Text>
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
        Find new feeds to follow.
      </Text>

      <TouchableOpacity
        style={[
          styles.searchCta,
          { borderColor: colors.border, backgroundColor: colors.paperWarm },
        ]}
        onPress={() => navigation.navigate("FeedSearch", {})}
        accessibilityLabel="Open feed search"
        activeOpacity={0.8}
      >
        <Feather name="search" size={18} color={colors.accent} />
        <View style={styles.searchCtaBody}>
          <Text style={[styles.searchCtaTitle, { color: colors.ink }]}>
            Search a website for feeds
          </Text>
          <Text style={[styles.searchCtaSub, { color: colors.inkSoft }]}>
            Paste any site URL — we&apos;ll detect the RSS feed for you.
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.inkSoft} />
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>
        CURATED FEEDS
      </Text>

      <View style={styles.list}>
        {feeds.map((feed) => {
          const isSubscribed =
            subscribedUrls.has(feed.url) || rowState[feed.url] === "added";
          const state = rowState[feed.url] ?? "idle";
          const showIcon = !failedIcons.has(feed.iconUrl);
          return (
            <View
              key={feed.url}
              style={[styles.row, { borderBottomColor: colors.inkFaint }]}
            >
              <View
                style={[styles.iconWrap, { backgroundColor: colors.paperWarm }]}
              >
                {showIcon ? (
                  <Image
                    source={{ uri: feed.iconUrl }}
                    style={styles.icon}
                    cachePolicy="memory-disk"
                    transition={80}
                    onError={() =>
                      setFailedIcons((prev) => new Set(prev).add(feed.iconUrl))
                    }
                  />
                ) : (
                  <Feather name="rss" size={16} color={colors.inkSoft} />
                )}
              </View>
              <View style={styles.body}>
                <Text style={[styles.feedTitle, { color: colors.ink }]}>
                  {feed.title}
                </Text>
                <Text
                  style={[styles.feedDesc, { color: colors.inkSoft }]}
                  numberOfLines={2}
                >
                  {feed.description}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  isSubscribed
                    ? {
                        backgroundColor: colors.paperWarm,
                        borderColor: colors.border,
                      }
                    : {
                        backgroundColor: colors.accent,
                        borderColor: colors.border,
                      },
                  state === "adding" ? styles.btnDisabled : null,
                ]}
                onPress={() => handleAdd(feed)}
                disabled={isSubscribed || state === "adding"}
                accessibilityLabel={
                  isSubscribed
                    ? `${feed.title} already subscribed`
                    : `Add ${feed.title}`
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.addBtnText,
                    {
                      color: isSubscribed ? colors.inkSoft : colors.paper,
                    },
                  ]}
                >
                  {isSubscribed
                    ? "Added ✓"
                    : state === "adding"
                      ? "Adding…"
                      : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.h1,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  searchCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  searchCtaBody: { flex: 1, gap: 2 },
  searchCtaTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  searchCtaSub: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginTop: spacing.sm,
  },
  list: { gap: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderStyle: "dashed",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
  },
  body: { flex: 1, gap: 2 },
  feedTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  feedDesc: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.7 },
});
