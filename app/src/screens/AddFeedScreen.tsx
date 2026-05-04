import React, { useEffect, useState } from "react";
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
  useWindowDimensions,
  Switch,
} from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { addFeed, getOrCreateTag, getTags, setFeedTags } from "../database";
import { extractFeedTitle } from "../feedParser";
import { RootStackParamList, Tag, TabParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { buildRedditFeedUrl, getSubreddit } from "../redditUtils";
import {
  extractYouTubeRssFeedUrl,
  getYouTubeChannelUrl,
} from "../youtubeUtils";
import {
  buildGitHubReleaseFeedUrl,
  getGitHubRepo,
} from "../githubUtils";
import { fetchWithProxyFallback } from "../proxyFetch";
import { SelectedTag, TagMultiSelect } from "../components/TagMultiSelect";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "AddFeed">,
  NativeStackScreenProps<RootStackParamList>
>;

type FeedSource = "url" | "reddit" | "youtube" | "github";

const SOURCE_OPTIONS: { value: FeedSource; label: string }[] = [
  { value: "url", label: "URL" },
  { value: "reddit", label: "Reddit" },
  { value: "youtube", label: "YouTube" },
  { value: "github", label: "GitHub" },
];

const PROXY_ALERT_TITLE = "Using Feed Proxy";
const PROXY_ALERT_MESSAGE =
  "This request was blocked in the browser, so Feedme used your configured feed proxy.";

export default function AddFeedScreen({ navigation, route }: Props) {
  const from = route.params?.from ?? "Feeds";
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const [source, setSource] = useState<FeedSource>("url");
  const [url, setUrl] = useState("");
  const [subreddit, setSubreddit] = useState("");
  const [youtubeChannel, setYoutubeChannel] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [title, setTitle] = useState("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const [showOnlyInTag, setShowOnlyInTag] = useState(false);
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  useEffect(() => {
    let mounted = true;
    getTags()
      .then((tags) => {
        if (mounted) setAvailableTags(tags);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setUrl("");
    setSubreddit("");
    setYoutubeChannel("");
    setGithubRepo("");
    setTitle("");
    setTitleManuallyEdited(false);
    setFeedError(null);
    setUseProxy(false);
    setIsNsfw(false);
    setShowOnlyInTag(false);
    setSelectedTags([]);
  };

  const handleSourceChange = (newSource: FeedSource) => {
    setSource(newSource);
    resetForm();
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

  const handleGithubRepoChange = (value: string) => {
    setGithubRepo(value);
    if (!titleManuallyEdited) {
      const parsed = getGitHubRepo(value);
      setTitle(parsed ? `GitHub - ${parsed.owner}/${parsed.repo}` : "");
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
      const { response, usedProxy } = await fetchWithProxyFallback(trimmed);
      if (usedProxy) {
        Alert.alert(PROXY_ALERT_TITLE, PROXY_ALERT_MESSAGE);
        setUseProxy(true);
      }
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

    const persistTagsForFeed = async (feedId: number) => {
      if (selectedTags.length === 0) return;
      const tagIds: number[] = [];
      for (const tag of selectedTags) {
        if (tag.id !== null) {
          tagIds.push(tag.id);
        } else {
          const created = await getOrCreateTag(tag.name);
          tagIds.push(created.id);
        }
      }
      await setFeedTags(feedId, tagIds);
    };

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
        const { response, usedProxy } = await fetchWithProxyFallback(redditUrl);
        if (usedProxy) {
          Alert.alert(PROXY_ALERT_TITLE, PROXY_ALERT_MESSAGE);
        }
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
        const newFeedId = await addFeed({
          title: feedTitle,
          url: redditUrl,
          description: null,
          use_proxy: usedProxy ? 1 : 0,
          nsfw: isNsfw ? 1 : 0,
          show_only_in_tag: showOnlyInTag ? 1 : 0,
        });
        await persistTagsForFeed(newFeedId);
        resetForm();
        navigation.navigate(from as "Feeds");
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
        const { response, usedProxy } =
          await fetchWithProxyFallback(channelUrl);
        if (usedProxy) {
          Alert.alert(PROXY_ALERT_TITLE, PROXY_ALERT_MESSAGE);
        }
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
        const newFeedId = await addFeed({
          title: feedTitle,
          url: feedUrl,
          description: null,
          use_proxy: usedProxy ? 1 : 0,
          nsfw: isNsfw ? 1 : 0,
          show_only_in_tag: showOnlyInTag ? 1 : 0,
        });
        await persistTagsForFeed(newFeedId);
        resetForm();
        navigation.navigate(from as "Feeds");
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

    if (source === "github") {
      const parsedRepo = getGitHubRepo(githubRepo);
      if (!parsedRepo) {
        Alert.alert(
          "Validation",
          "Please enter a valid GitHub repository (e.g. owner/repo or https://github.com/owner/repo)."
        );
        return;
      }
      const feedUrl = buildGitHubReleaseFeedUrl(githubRepo)!;
      const feedTitle =
        title.trim() || `GitHub - ${parsedRepo.owner}/${parsedRepo.repo}`;
      setLoading(true);
      try {
        const { response, usedProxy } = await fetchWithProxyFallback(feedUrl);
        if (usedProxy) {
          Alert.alert(PROXY_ALERT_TITLE, PROXY_ALERT_MESSAGE);
        }
        if (!response.ok) {
          if (response.status === 404) {
            setFeedError(
              `The repository https://github.com/${parsedRepo.owner}/${parsedRepo.repo} was not found. Check the owner and repository name and try again.`
            );
          } else {
            setFeedError(
              `Failed to connect to ${feedUrl}. Please check your connection and try again.`
            );
          }
          return;
        }
        const newFeedId = await addFeed({
          title: feedTitle,
          url: feedUrl,
          description: null,
          use_proxy: usedProxy ? 1 : 0,
          nsfw: isNsfw ? 1 : 0,
          show_only_in_tag: showOnlyInTag ? 1 : 0,
        });
        await persistTagsForFeed(newFeedId);
        resetForm();
        navigation.navigate(from as "Feeds");
      } catch (err) {
        if ((err as Error).message?.includes("UNIQUE")) {
          Alert.alert("Duplicate", "This feed is already in your list.");
        } else {
          setFeedError(
            `Failed to connect to ${feedUrl}. Please check your connection and try again.`
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
      const newFeedId = await addFeed({
        title: feedTitle,
        url: trimmedUrl,
        description: null,
        use_proxy: useProxy ? 1 : 0,
        nsfw: isNsfw ? 1 : 0,
        show_only_in_tag: showOnlyInTag ? 1 : 0,
      });
      await persistTagsForFeed(newFeedId);
      resetForm();
      navigation.navigate(from as "Feeds");
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
        contentContainerStyle={[
          styles.container,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={
            isDesktopWeb
              ? [
                  styles.card,
                  {
                    backgroundColor: colors.paper,
                    borderColor: colors.border,
                    shadowColor: colors.ink,
                  },
                ]
              : undefined
          }
        >
          {isDesktopWeb ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate(from as "Feeds")}
                activeOpacity={0.7}
                accessibilityLabel="Back"
              >
                <Feather name="arrow-left" size={16} color={colors.ink} />
                <Text style={[styles.actionText, { color: colors.ink }]}>
                  Back
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.inkSoft }]}>Source</Text>
          <View style={styles.sourceGrid}>
            {SOURCE_OPTIONS.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.sourceChip,
                  { borderColor: colors.border },
                  source === value && {
                    backgroundColor: colors.accent,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => handleSourceChange(value)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    { color: source === value ? colors.paper : colors.ink },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={[
              styles.hintBox,
              { borderColor: colors.border, backgroundColor: colors.paperWarm },
            ]}
          >
            <Text style={[styles.hintText, { color: colors.inkSoft }]}>
              {source === "reddit"
                ? "Enter a subreddit name to subscribe to its RSS feed."
                : source === "youtube"
                  ? "Enter a YouTube channel name or URL to subscribe to its RSS feed."
                  : source === "github"
                    ? "Enter a GitHub repository (e.g. owner/repo or a full GitHub URL) to subscribe to its releases feed."
                    : "Paste an RSS/Atom feed URL or a site URL - we'll try to find the feed."}
            </Text>
          </View>

          {source === "url" ? (
            <>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                Feed URL *
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
                Subreddit *
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
          ) : source === "youtube" ? (
            <>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                Channel *
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
          ) : (
            <>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                Repository *
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
                placeholder="owner/repo"
                placeholderTextColor={colors.inkFaint}
                value={githubRepo}
                onChangeText={handleGithubRepoChange}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </>
          )}

          <Text style={[styles.label, { color: colors.inkSoft }]}>
            Title (Optional)
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
                  : source === "github"
                    ? "GitHub - owner/repo"
                    : "My Favourite Blog"
            }
            placeholderTextColor={colors.inkFaint}
            value={title}
            onChangeText={handleTitleChange}
            returnKeyType="done"
          />

          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                nsfw
              </Text>
              <Text style={[styles.hintText, { color: colors.inkFaint }]}>
                Blur thumbnails and require tap-to-reveal in card view
              </Text>
            </View>
            <Switch
              value={isNsfw}
              onValueChange={setIsNsfw}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.paper}
            />
          </View>

          <Text style={[styles.label, { color: colors.inkSoft }]}>tags</Text>
          <TagMultiSelect
            value={selectedTags}
            onChange={setSelectedTags}
            availableTags={availableTags}
            testID="add-feed-tags"
          />

          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                show only on tag feeds
              </Text>
              <Text style={[styles.hintText, { color: colors.inkFaint }]}>
                Hide this feed&apos;s posts from the main feed. Posts will only
                appear when viewing this feed directly or any of its tags.
              </Text>
            </View>
            <Switch
              value={showOnlyInTag}
              onValueChange={setShowOnlyInTag}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.paper}
            />
          </View>

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
              Add Feed
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate("ImportExport")}
            activeOpacity={0.7}
            accessibilityLabel="Open OPML Import Export"
          >
            <Text style={[styles.linkText, { color: colors.accent }]}>
              Open OPML Import/Export
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg },
  desktopContent: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 920,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
  },
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
  sourceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sourceChip: {
    flexBasis: "48%",
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  sourceChipText: {
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    fontWeight: "600",
    textAlign: "center",
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  toggleLabelGroup: {
    flex: 1,
    marginRight: spacing.md,
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
  linkBtn: {
    marginTop: spacing.xl,
    alignItems: "center",
  },
  linkText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
    textDecorationLine: "underline",
    textDecorationStyle: "solid",
  },
});
