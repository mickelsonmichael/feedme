import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFeeds, addFeed } from "../database";
import { generateOpml, parseOpml } from "../opml";
import { Feed, RootStackParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "ImportExport">;

export default function ImportExportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);

  const setStatus = (message: string | null, isError = false) => {
    setStatusMessage(message);
    setStatusIsError(isError);
  };

  useEffect(() => {
    getFeeds()
      .then(setFeeds)
      .catch((err: Error) => {
        Alert.alert("Error", "Failed to load feeds: " + err.message);
        setStatus(`Failed to load feeds: ${err.message}`, true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleExportOpml = async () => {
    setStatus(null);

    if (feeds.length === 0) {
      setStatus("Add some feeds before exporting.", true);
      return;
    }

    try {
      const opmlContent = generateOpml(feeds);

      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([opmlContent], {
          type: "text/x-opml;charset=utf-8",
        });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = "feedme-subscriptions.opml";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(downloadUrl);
        setStatus("Exported OPML to your downloads folder.");
        return;
      }

      const file = new ExpoFile(Paths.cache, "feedme-subscriptions.opml");
      file.write(opmlContent);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/x-opml",
          dialogTitle: "Export OPML",
        });
        setStatus("Exported OPML successfully.");
      } else {
        Alert.alert("Exported", "OPML saved to: " + file.uri);
        setStatus(`OPML saved to: ${file.uri}`);
      }
    } catch (err) {
      Alert.alert("Export Error", (err as Error).message);
      setStatus("Export failed: " + (err as Error).message, true);
    }
  };

  const handleImportOpml = async () => {
    setStatus(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Put .opml first so web file pickers default to OPML files instead of generic XML.
        type: [".opml", "text/x-opml", "application/xml", "text/xml", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setStatus("Import canceled.");
        return;
      }

      const selected = result.assets[0];
      const content = await readPickedFileContent(selected);
      const parsedFeeds = parseOpml(content);

      if (parsedFeeds.length === 0) {
        Alert.alert(
          "No feeds found",
          "The selected file contained no valid feed entries."
        );
        setStatus("No valid feed entries were found in that file.", true);
        return;
      }

      let added = 0;
      let skipped = 0;
      for (const feed of parsedFeeds) {
        try {
          await addFeed({
            title: feed.title,
            url: feed.url,
            description: feed.description ?? null,
            use_proxy: 0,
          });
          added++;
        } catch (err) {
          // Skip feeds that already exist; rethrow unexpected errors.
          if (!isDuplicateFeedError(err)) {
            throw err;
          }
          skipped++;
        }
      }
      Alert.alert(
        "Import Complete",
        `Added ${added} of ${parsedFeeds.length} feeds.`
      );
      setStatus(
        `Import complete. Added ${added}, skipped ${skipped} duplicates.`
      );
      const updated = await getFeeds();
      setFeeds(updated);
    } catch (err) {
      Alert.alert("Import Error", (err as Error).message);
      setStatus("Import failed: " + (err as Error).message, true);
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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isDesktopWeb ? styles.desktopContent : null,
        ]}
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
                onPress={() => navigation.goBack()}
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

          <Text style={[styles.hint, { color: colors.inkSoft }]}>
            Use OPML to move your subscriptions between feed readers.
          </Text>

          <TouchableOpacity
            style={[
              styles.btn,
              { borderColor: colors.border, backgroundColor: colors.paper },
            ]}
            onPress={handleImportOpml}
            activeOpacity={0.7}
            accessibilityLabel="Import OPML"
          >
            <Text style={[styles.btnText, { color: colors.ink }]}>
              Import OPML
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btn,
              { borderColor: colors.border, backgroundColor: colors.paper },
              feeds.length === 0 && styles.btnDisabled,
            ]}
            onPress={handleExportOpml}
            disabled={feeds.length === 0}
            activeOpacity={0.7}
            accessibilityLabel="Export OPML"
          >
            <Text style={[styles.btnText, { color: colors.ink }]}>
              Export OPML
            </Text>
          </TouchableOpacity>

          {feeds.length === 0 && (
            <Text style={[styles.disabledHint, { color: colors.inkSoft }]}>
              Add some feeds before exporting.
            </Text>
          )}

          {statusMessage ? (
            <Text
              style={[
                styles.status,
                { color: statusIsError ? colors.danger : colors.inkSoft },
              ]}
            >
              {statusMessage}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function isDuplicateFeedError(err: unknown): boolean {
  const message = (err as Error)?.message?.toLowerCase() ?? "";
  return message.includes("unique") || message.includes("already exists");
}

async function readPickedFileContent(
  asset: DocumentPicker.DocumentPickerAsset
): Promise<string> {
  const webFile = (asset as { file?: { text?: () => Promise<string> } }).file;
  if (webFile?.text) {
    return webFile.text();
  }

  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    return response.text();
  }

  return new ExpoFile(asset.uri).text();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
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
  center: { alignItems: "center", justifyContent: "center" },
  hint: {
    fontSize: fontSize.body,
    fontStyle: "italic",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  btn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    fontSize: fontSize.bodyLg,
    fontFamily: fonts.sans,
  },
  disabledHint: {
    fontSize: fontSize.body,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  status: {
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 20,
  },
});
