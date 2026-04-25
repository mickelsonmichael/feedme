import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { addFeed } from "../database";
import { extractFeedTitle } from "../feedParser";
import { RootStackParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { buildRedditFeedUrl, getSubreddit } from "../redditUtils";
import {
  extractYouTubeRssFeedUrl,
  getYouTubeChannelUrl,
} from "../youtubeUtils";

type Props = NativeStackScreenProps<RootStackParamList, "AddFeed">;

type FeedSource = "url" | "reddit" | "youtube";

export default function AddFeedScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [source, setSource] = useState<FeedSource>("url");
  const [url, setUrl] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [youtubeChannel, setYoutubeChannel] = useState("");
  const [title, setTitle] = useState("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const handleSourceChange = (newSource: FeedSource) => {
    setSource(newSource);
    setUrl("");
    setSubreddit("");
    setYoutubeChannel("");
    setTitle("");
    setTitleManuallyEdited(false);
    setFeedError(null);
  };

  const handleSubredditChange = (value: string) => {
    setSubreddit(value);
    if (!titleManuallyEdited) {
      const cleaned = getSubreddit(value);
      setTitle(cleaned ? `Reddit - r/${cleaned}` : "");
    }
  };

  const handleYoutubeChannelChange = (value: string) => {
    setYoutubeChannel(value);
    if (!titleManuallyEdited) {
      const trimmed = value.trim();
      setTitle(trimmed ? `YouTube - ${trimmed.replace(/^@/, "")}` : "");
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setTitleManuallyEdited(true);
  };

  const handleFetchTitle = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const response = await fetch(trimmed);
      const text = await response.text();
      const detected = extractFeedTitle(text);
      setTitle(detected);
    } catch {
      // Ignore — user can enter title manually
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    setFeedError(null);

    if (source === "reddit") {
      const cleanedSubreddit = getSubreddit(subreddit);
      if (!cleanedSubreddit) {
        Alert.alert("Validation", "Please enter a subreddit name.");
        return;
      }
      const redditUrl = buildRedditFeedUrl(cleanedSubreddit);
      const feedTitle = title.trim() || `Reddit - r/${cleanedSubreddit}`;
      setLoading(true);
      try {
        const response = await fetch(redditUrl);
        if (!response.ok) {
          if (response.status === 404) {
            setFeedError(
              `The subreddit https://www.reddit.com/r/${cleanedSubreddit} was not found. Check the subreddit name and try again.`
            );
          } else {
            setFeedError(
              `Failed to connect to ${redditUrl}. Please check your connection and try again.`
            );
          }
          return;
        }
        await addFeed({ title: feedTitle, url: redditUrl, description: null });
        navigation.goBack();
      } catch (err) {
        if ((err as Error).message?.includes("UNIQUE")) {
          Alert.alert("Duplicate", "This feed is already in your list.");
        } else {
          setFeedError(
            `Failed to connect to ${redditUrl}. Please check your connection and try again.`
          );
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (source === "youtube") {
      const trimmedChannel = youtubeChannel.trim();
      if (!trimmedChannel) {
        Alert.alert("Validation", "Please enter a YouTube channel name.");
        return;
      }
      const channelUrl = getYouTubeChannelUrl(trimmedChannel);
      const channelLabel = trimmedChannel.replace(/^@/, "");
      const feedTitle = title.trim() || `YouTube - ${channelLabel}`;
      setLoading(true);
      try {
        const response = await fetch(channelUrl);
        if (!response.ok) {
          if (response.status === 404) {
            setFeedError(
              `The channel ${channelUrl} was not found. Check the channel name and try again.`
            );
          } else {
            setFeedError(
              `Failed to connect to ${channelUrl}. Please check your connection and try again.`
            );
          }
          return;
        }
        const html = await response.text();
        const feedUrl = extractYouTubeRssFeedUrl(html);
        if (!feedUrl) {
          setFeedError(
            `Could not find an RSS feed for ${channelUrl}. The channel may not exist or may not be accessible.`
          );
          return;
        }
        await addFeed({ title: feedTitle, url: feedUrl, description: null });
        navigation.goBack();
      } catch (err) {
        if ((err as Error).message?.includes("UNIQUE")) {
          Alert.alert("Duplicate", "This feed is already in your list.");
        } else {
          setFeedError(
            `Failed to connect to ${channelUrl}. Please check your connection and try again.`
          );
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // URL mode
    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();

    if (!trimmedUrl) {
      Alert.alert("Validation", "Please enter a feed URL.");
      return;
    }

    if (
      !trimmedUrl.startsWith("http://") &&
      !trimmedUrl.startsWith("https://")
    ) {
      Alert.alert("Validation", "URL must start with http:// or https://");
      return;
    }

    const feedTitle = trimmedTitle || trimmedUrl;

    setLoading(true);
    try {
      await addFeed({ title: feedTitle, url: trimmedUrl, description: null });
      navigation.goBack();
    } catch (err) {
      if ((err as Error).message?.includes("UNIQUE")) {
        Alert.alert("Duplicate", "This feed is already in your list.");
      } else {
        Alert.alert("Error", "Could not save feed: " + (err as Error).message);
      }
    } finally {
      setLoading(false);
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
        <Text style={[styles.label, { color: colors.inkSoft }]}>source</Text>
        <View style={[styles.segmentedControl, { borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              source === "url" && {
                backgroundColor: colors.accent,
              },
            ]}
            onPress={() => handleSourceChange("url")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: source === "url" ? colors.paper : colors.ink },
              ]}
            >
              URL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              source === "reddit" && {
                backgroundColor: colors.accent,
              },
            ]}
            onPress={() => handleSourceChange("reddit")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: source === "reddit" ? colors.paper : colors.ink },
              ]}
            >
              Reddit
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              source === "youtube" && {
                backgroundColor: colors.accent,
              },
            ]}
            onPress={() => handleSourceChange("youtube")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.segmentBtnText,
                { color: source === "youtube" ? colors.paper : colors.ink },
              ]}
            >
              YouTube
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.hintBox,
            { borderColor: colors.border, backgroundColor: colors.paperWarm },
          ]}
        >
          <Text style={[styles.hintText, { color: colors.inkSoft }]}>
            {source === "reddit"
              ? "enter a subreddit name to subscribe to its RSS feed."
              : source === "youtube"
                ? "enter a YouTube channel name or URL to subscribe to its RSS feed."
                : "paste an RSS/Atom feed URL or a site URL — we'll try to find the feed."}
          </Text>
        </View>

        {source === "url" ? (
          <>
            <Text style={[styles.label, { color: colors.inkSoft }]}>
              feed url *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.paper,
                  borderColor: colors.border,
                  color: colors.ink,
                },
              ]}
              placeholder="https://example.com/feed.xml"
              placeholderTextColor={colors.inkFaint}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onBlur={handleFetchTitle}
              returnKeyType="next"
            />
          </>
        ) : source === "reddit" ? (
          <>
            <Text style={[styles.label, { color: colors.inkSoft }]}>
              subreddit *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.paper,
                  borderColor: colors.border,
                  color: colors.ink,
                },
              ]}
              placeholder="pics"
              placeholderTextColor={colors.inkFaint}
              value={subreddit}
              onChangeText={handleSubredditChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.inkSoft }]}>
              channel *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.paper,
                  borderColor: colors.border,
                  color: colors.ink,
                },
              ]}
              placeholder="@atrioc"
              placeholderTextColor={colors.inkFaint}
              value={youtubeChannel}
              onChangeText={handleYoutubeChannelChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </>
        )}

        <Text style={[styles.label, { color: colors.inkSoft }]}>
          title (optional)
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.paper,
              borderColor: colors.border,
              color: colors.ink,
            },
          ]}
          placeholder={
            source === "reddit"
              ? "Reddit - r/subreddit"
              : source === "youtube"
                ? "YouTube - ChannelName"
                : "My Favourite Blog"
          }
          placeholderTextColor={colors.inkFaint}
          value={title}
          onChangeText={handleTitleChange}
          returnKeyType="done"
        />

        {loading && (
          <ActivityIndicator style={styles.spinner} color={colors.accent} />
        )}

        {feedError !== null && (
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
              {feedError}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.accent, borderColor: colors.border },
            loading && styles.btnDisabled,
          ]}
          onPress={handleAdd}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryBtnText, { color: colors.paper }]}>
            add feed →
          </Text>
        </TouchableOpacity>

        <Text style={[styles.scrawl, { color: colors.accent }]}>
          or import OPML via Settings ↗
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg },
  segmentedControl: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  segmentBtnText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
  },
  hintBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  hintText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLg,
  },
  spinner: { marginTop: spacing.md },
  errorBox: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: spacing.xxl,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    fontFamily: fonts.sans,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    marginTop: spacing.xl,
    textAlign: "center",
    transform: [{ rotate: "-2deg" }],
  },
});
