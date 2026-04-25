import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import {
  getFeeds,
  deleteFeed,
  updateFeed,
  updateFeedLastFetched,
  setFeedError,
  upsertItems,
} from "../database";
import { fetchFeed } from "../feedParser";
import { Feed, RootStackParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "FeedDetail">;

function formatDate(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedDetailScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { feedId } = route.params;

  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const hasChanges =
    feed !== null && (title.trim() !== feed.title || url.trim() !== feed.url);

  const loadFeed = useCallback(async () => {
    try {
      const all = await getFeeds();
      const found = all.find((f) => f.id === feedId) ?? null;
      setFeed(found);
      if (found) {
        setTitle(found.title);
        setUrl(found.url);
      }
    } finally {
      setLoading(false);
    }
  }, [feedId]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();

    if (!trimmedTitle) {
      Alert.alert("Validation", "Title cannot be empty.");
      return;
    }
    if (!trimmedUrl) {
      Alert.alert("Validation", "URL cannot be empty.");
      return;
    }
    if (
      !trimmedUrl.startsWith("http://") &&
      !trimmedUrl.startsWith("https://")
    ) {
      Alert.alert("Validation", "URL must start with http:// or https://");
      return;
    }

    setSaving(true);
    try {
      await updateFeed(feedId, { title: trimmedTitle, url: trimmedUrl });

      // Refetch feed after save
      try {
        const fetched = await fetchFeed(trimmedUrl);
        await upsertItems(feedId, fetched);
        await updateFeedLastFetched(feedId);
        await setFeedError(feedId, null);
      } catch (fetchErr) {
        await setFeedError(feedId, (fetchErr as Error).message);
      }

      await loadFeed();
    } catch (err) {
      if ((err as Error).message?.includes("UNIQUE")) {
        Alert.alert("Duplicate", "Another feed with this URL already exists.");
      } else {
        Alert.alert("Error", "Could not save: " + (err as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const message = `Remove "${feed?.title ?? "this feed"}"? All associated items will be deleted.`;

    const doDelete = async () => {
      try {
        await deleteFeed(feedId);
        navigation.goBack();
      } catch (err) {
        const errMsg = "Could not delete feed: " + (err as Error).message;
        if (Platform.OS === "web") {
          window.alert(errMsg);
        } else {
          Alert.alert("Error", errMsg);
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        doDelete();
      }
      return;
    }

    Alert.alert("Remove Feed", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doDelete },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!feed) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.paper },
        ]}
      >
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>
          Feed not found.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Custom header */}
      <View style={[styles.topBar, { borderBottomColor: colors.inkFaint }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity
          onPress={handleSave}
          hitSlop={8}
          style={[styles.iconBtn, (!hasChanges || saving) && styles.disabled]}
          disabled={!hasChanges || saving}
          accessibilityLabel="Save feed"
        >
          <Feather
            name="save"
            size={22}
            color={!hasChanges || saving ? colors.inkFaint : colors.accent}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel="Delete feed"
        >
          <Feather name="trash-2" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {feed.error ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: colors.danger,
                backgroundColor: colors.danger + "18",
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {feed.error}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.inkSoft }]}>title</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.paper,
              borderColor: colors.ink,
              color: colors.ink,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="Feed title"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="sentences"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={[styles.label, { color: colors.inkSoft }]}>url</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.paper,
              borderColor: colors.ink,
              color: colors.ink,
            },
          ]}
          value={url}
          onChangeText={setUrl}
          placeholder="https://example.com/feed.xml"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
        />

        <Text style={[styles.lastFetch, { color: colors.inkSoft }]}>
          Last fetch: {formatDate(feed.last_fetched)}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  spacer: { flex: 1 },
  iconBtn: {
    padding: spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorBox: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
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
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLg,
  },
  lastFetch: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.h2,
    fontFamily: fonts.heading,
    fontWeight: "600",
  },
});
