// FeedSearchScreen — discover RSS/Atom feeds on a given site URL.
// Uses `discoverFeeds` to scan a page for advertised feeds (link tags or
// common paths) and lets the user subscribe directly from the results.

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { addFeed } from "../database";
import { DiscoveredFeed, discoverFeeds } from "../feedDiscovery";
import { RootStackParamList, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "FeedSearch">,
  NativeStackScreenProps<RootStackParamList>
>;

type FeedRowState = "idle" | "adding" | "added" | "duplicate" | "error";

export default function FeedSearchScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const initialUrl = route.params?.initialUrl ?? "";
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveredFeed[] | null>(null);
  const [searchedUrl, setSearchedUrl] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, FeedRowState>>({});

  useEffect(() => {
    if (initialUrl) {
      void runSearch(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async (target: string) => {
    setLoading(true);
    setError(null);
    setResults(null);
    setRowState({});
    try {
      const { feeds, finalUrl } = await discoverFeeds(target);
      setResults(feeds);
      setSearchedUrl(finalUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!url.trim()) return;
    void runSearch(url);
  };

  const handleAdd = async (feed: DiscoveredFeed) => {
    setRowState((prev) => ({ ...prev, [feed.url]: "adding" }));
    try {
      await addFeed({
        title: feed.title || feed.url,
        url: feed.url,
        description: null,
      });
      setRowState((prev) => ({ ...prev, [feed.url]: "added" }));
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (message.includes("UNIQUE")) {
        setRowState((prev) => ({ ...prev, [feed.url]: "duplicate" }));
      } else {
        setRowState((prev) => ({ ...prev, [feed.url]: "error" }));
        Alert.alert("Error", `Could not add feed: ${message}`);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
            style={[styles.backBtn, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={16} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.ink }]}>
            Search for a feed
          </Text>
        </View>

        <Text style={[styles.helpText, { color: colors.inkSoft }]}>
          Paste a website URL and we&apos;ll look for RSS or Atom feeds it
          advertises.
        </Text>

        <Text style={[styles.label, { color: colors.inkSoft }]}>Site URL</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.ink,
                backgroundColor: colors.paper,
              },
            ]}
            placeholder="https://example.com"
            placeholderTextColor={colors.inkFaint}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            accessibilityLabel="Site URL"
          />
          <TouchableOpacity
            style={[
              styles.searchBtn,
              {
                backgroundColor: colors.accent,
                borderColor: colors.border,
              },
              loading && styles.btnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || !url.trim()}
            accessibilityLabel="Search for feeds"
            activeOpacity={0.8}
          >
            <Text style={[styles.searchBtnText, { color: colors.paper }]}>
              Search
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.statusText, { color: colors.inkSoft }]}>
              Looking for feeds…
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: colors.danger,
                backgroundColor: colors.paperWarm,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {results && !loading ? (
          <View style={styles.resultsBlock}>
            <Text style={[styles.resultsHeader, { color: colors.inkFaint }]}>
              {results.length === 0
                ? "NO FEEDS FOUND"
                : `${results.length} ${
                    results.length === 1 ? "FEED" : "FEEDS"
                  } FOUND`}
              {searchedUrl ? `  ·  ${shortUrl(searchedUrl)}` : ""}
            </Text>
            {results.length === 0 ? (
              <Text style={[styles.statusText, { color: colors.inkSoft }]}>
                We couldn&apos;t find any feeds at that URL. Try a different
                page on the site, or paste a feed URL directly into Add Feed.
              </Text>
            ) : (
              results.map((feed) => (
                <FeedResultRow
                  key={feed.url}
                  feed={feed}
                  state={rowState[feed.url] ?? "idle"}
                  onAdd={() => handleAdd(feed)}
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url;
  }
}

function FeedResultRow({
  feed,
  state,
  onAdd,
}: {
  feed: DiscoveredFeed;
  state: FeedRowState;
  onAdd: () => void;
}) {
  const { colors } = useTheme();
  const buttonLabel =
    state === "adding"
      ? "Adding…"
      : state === "added"
        ? "Added ✓"
        : state === "duplicate"
          ? "Already added"
          : "Add";
  const disabled =
    state === "adding" || state === "added" || state === "duplicate";
  return (
    <View style={[styles.resultRow, { borderColor: colors.inkFaint }]}>
      <View style={styles.resultBody}>
        <Text style={[styles.resultTitle, { color: colors.ink }]}>
          {feed.title ?? "Untitled feed"}
        </Text>
        <Text
          style={[styles.resultUrl, { color: colors.inkSoft }]}
          numberOfLines={2}
        >
          {feed.url}
        </Text>
        <Text style={[styles.resultMeta, { color: colors.inkFaint }]}>
          {sourceLabel(feed.source)}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.addBtn,
          {
            backgroundColor:
              state === "added" || state === "duplicate"
                ? colors.paperWarm
                : colors.accent,
            borderColor: colors.border,
          },
          disabled && state !== "added" && state !== "duplicate"
            ? styles.btnDisabled
            : null,
        ]}
        onPress={onAdd}
        disabled={disabled}
        accessibilityLabel={`Add ${feed.title ?? feed.url}`}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.addBtnText,
            {
              color:
                state === "added" || state === "duplicate"
                  ? colors.inkSoft
                  : colors.paper,
            },
          ]}
        >
          {buttonLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function sourceLabel(source: DiscoveredFeed["source"]): string {
  switch (source) {
    case "direct":
      return "URL is a feed";
    case "html":
      return "Found in page";
    case "common-path":
      return "Found by guessing";
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: fontSize.h2,
    fontFamily: fonts.sans,
    fontWeight: "700",
  },
  helpText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    minHeight: 40,
  },
  searchBtn: {
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.5 },
  statusBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  resultsBlock: {
    gap: spacing.sm,
  },
  resultsHeader: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    paddingVertical: spacing.md,
  },
  resultBody: { flex: 1, gap: 2 },
  resultTitle: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  resultUrl: {
    fontSize: fontSize.meta,
    fontFamily: fonts.mono,
  },
  resultMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    fontStyle: "italic",
  },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
});
