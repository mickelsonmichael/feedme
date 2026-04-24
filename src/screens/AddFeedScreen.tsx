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
        <Text style={styles.label}>Feed URL *</Text>
        <View style={styles.urlRow}>
          <TextInput
            style={[styles.input, styles.urlInput]}
            placeholder="https://example.com/feed.xml"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onBlur={handleFetchTitle}
            returnKeyType="next"
          />
        </View>

        <Text style={styles.label}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="My Favourite Blog"
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
        />

        {loading && (
          <ActivityIndicator style={styles.spinner} color="#4A90E2" />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Add Feed</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F5F5F5" },
  container: { padding: 20 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 6,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  urlRow: { flexDirection: "row", alignItems: "center" },
  urlInput: { flex: 1 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#212121",
  },
  spinner: { marginTop: 12 },
  button: {
    marginTop: 32,
    backgroundColor: "#4A90E2",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
