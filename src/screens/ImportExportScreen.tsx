import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFeeds, addFeed } from "../database";
import { generateOpml, parseOpml } from "../opml";
import { Feed } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

export default function ImportExportScreen() {
  const { colors } = useTheme();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFeeds()
      .then(setFeeds)
      .catch((err: Error) =>
        Alert.alert("Error", "Failed to load feeds: " + err.message)
      )
      .finally(() => setLoading(false));
  }, []);

  const handleExportOpml = async () => {
    try {
      const opmlContent = generateOpml(feeds);
      const file = new File(Paths.cache, "feedme-subscriptions.opml");
      file.write(opmlContent);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/x-opml",
          dialogTitle: "Export OPML",
        });
      } else {
        Alert.alert("Exported", "OPML saved to: " + file.uri);
      }
    } catch (err) {
      Alert.alert("Export Error", (err as Error).message);
    }
  };

  const handleImportOpml = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/xml", "text/x-opml", "application/xml", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const content = await new File(result.assets[0].uri).text();
      const parsedFeeds = parseOpml(content);

      if (parsedFeeds.length === 0) {
        Alert.alert(
          "No feeds found",
          "The selected file contained no valid feed entries."
        );
        return;
      }

      let added = 0;
      for (const feed of parsedFeeds) {
        try {
          await addFeed({
            title: feed.title,
            url: feed.url,
            description: feed.description ?? null,
          });
          added++;
        } catch (err) {
          // Skip feeds that already exist (UNIQUE constraint); rethrow unexpected errors
          if (!(err as Error).message?.includes("UNIQUE")) {
            throw err;
          }
        }
      }
      Alert.alert(
        "Import Complete",
        `Added ${added} of ${parsedFeeds.length} feeds.`
      );
      const updated = await getFeeds();
      setFeeds(updated);
    } catch (err) {
      Alert.alert("Import Error", (err as Error).message);
    }
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

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Text style={[styles.hint, { color: colors.inkSoft }]}>
        Use OPML to move your subscriptions between feed readers.
      </Text>

      <TouchableOpacity
        style={[
          styles.btn,
          { borderColor: colors.ink, backgroundColor: colors.paper },
        ]}
        onPress={handleImportOpml}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>
          ↓ import opml
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.btn,
          { borderColor: colors.ink, backgroundColor: colors.paper },
          feeds.length === 0 && styles.btnDisabled,
        ]}
        onPress={handleExportOpml}
        disabled={feeds.length === 0}
        activeOpacity={0.7}
      >
        <Text style={[styles.btnText, { color: colors.ink }]}>
          ↑ export opml
        </Text>
      </TouchableOpacity>

      {feeds.length === 0 && (
        <Text style={[styles.disabledHint, { color: colors.inkSoft }]}>
          Add some feeds before exporting.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  center: { alignItems: "center", justifyContent: "center" },
  hint: {
    fontSize: fontSize.body,
    fontStyle: "italic",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  btn: {
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    fontSize: fontSize.bodyLg,
    fontFamily: fonts.mono,
  },
  disabledHint: {
    fontSize: fontSize.body,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
