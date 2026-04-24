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
import { fetchFeed, extractFeedTitle } from "../feedParser";
import { RootStackParamList } from "../types";
import { colors, fonts, fontSize, radii, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddFeed">;

export default function AddFeedScreen({ navigation }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

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
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            paste an RSS/Atom feed URL or a site URL — we’ll try to find the
            feed.
          </Text>
        </View>

        <Text style={styles.label}>feed url *</Text>
        <TextInput
          style={styles.input}
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

        <Text style={styles.label}>title (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="My Favourite Blog"
          placeholderTextColor={colors.inkFaint}
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
        />

        {loading && (
          <ActivityIndicator style={styles.spinner} color={colors.accent} />
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          onPress={handleAdd}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>add feed →</Text>
        </TouchableOpacity>

        <Text style={styles.scrawl}>or import OPML via Settings ↗</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg },
  hintBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.ink,
    borderRadius: radii.sm,
    padding: spacing.md,
    backgroundColor: colors.paperWarm,
    marginBottom: spacing.lg,
  },
  hintText: {
    fontSize: fontSize.body,
    color: colors.inkSoft,
    fontFamily: fonts.mono,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyLg,
    color: colors.ink,
  },
  spinner: { marginTop: spacing.md },
  primaryBtn: {
    marginTop: spacing.xxl,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color: colors.paper,
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    fontFamily: fonts.mono,
  },
  scrawl: {
    fontFamily: fonts.brand,
    fontSize: fontSize.bodyLg,
    color: colors.accent,
    marginTop: spacing.xl,
    textAlign: "center",
    transform: [{ rotate: "-2deg" }],
  },
});
