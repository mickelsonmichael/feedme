import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
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
import {
  getFeeds,
  addFeed,
  getCustomFeedsWithMemberCounts,
  getFeedsForCustomFeed,
  addCustomFeed,
  setCustomFeedMembers,
} from "../database";
import { generateOpml, parseOpml } from "../opml";
import { CustomFeedWithMemberCount, Feed, RootStackParamList } from "../types";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { resolveCustomFeedIcon } from "../customFeedIcons";

type Props = NativeStackScreenProps<RootStackParamList, "ImportExport">;

export default function ImportExportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 768;
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [customFeeds, setCustomFeeds] = useState<CustomFeedWithMemberCount[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [importAsCustom, setImportAsCustom] = useState(false);
  const [customFeedName, setCustomFeedName] = useState("");

  const setStatus = (message: string | null, isError = false) => {
    setStatusMessage(message);
    setStatusIsError(isError);
  };

  const reloadAll = useCallback(async () => {
    const [feedList, cfs] = await Promise.all([
      getFeeds(),
      getCustomFeedsWithMemberCounts(),
    ]);
    setFeeds(feedList);
    setCustomFeeds(cfs);
  }, []);

  useEffect(() => {
    reloadAll()
      .catch((err: Error) => {
        Alert.alert("Error", "Failed to load feeds: " + err.message);
        setStatus(`Failed to load feeds: ${err.message}`, true);
      })
      .finally(() => setLoading(false));
  }, [reloadAll]);

  const writeOpmlFile = async (
    opmlContent: string,
    filename: string,
    successMessage: string
  ) => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([opmlContent], {
        type: "text/x-opml;charset=utf-8",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      setStatus(successMessage);
      return;
    }
    const file = new ExpoFile(Paths.cache, filename);
    file.write(opmlContent);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/x-opml",
        dialogTitle: "Export OPML",
      });
      setStatus(successMessage);
    } else {
      Alert.alert("Exported", "OPML saved to: " + file.uri);
      setStatus(`OPML saved to: ${file.uri}`);
    }
  };

  const handleExportOpml = async () => {
    setStatus(null);
    if (feeds.length === 0) {
      setStatus("Add some feeds before exporting.", true);
      return;
    }
    try {
      const opml = generateOpml(feeds);
      await writeOpmlFile(
        opml,
        "feedme-subscriptions.opml",
        "Exported OPML successfully."
      );
    } catch (err) {
      Alert.alert("Export Error", (err as Error).message);
      setStatus("Export failed: " + (err as Error).message, true);
    }
  };

  const handleExportCustomFeed = async (cf: CustomFeedWithMemberCount) => {
    setStatus(null);
    try {
      const members = await getFeedsForCustomFeed(cf.id);
      if (members.length === 0) {
        setStatus(
          `"${cf.name}" has no subscriptions yet — nothing to export.`,
          true
        );
        return;
      }
      const opml = generateOpml(members);
      const safe = cf.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      await writeOpmlFile(
        opml,
        `feedme-${safe || "custom-feed"}.opml`,
        `Exported "${cf.name}" with ${members.length} subscription(s).`
      );
    } catch (err) {
      Alert.alert("Export Error", (err as Error).message);
      setStatus("Export failed: " + (err as Error).message, true);
    }
  };

  const handleImportOpml = async () => {
    setStatus(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
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
      const allMemberIds: number[] = [];
      const existingByUrl = new Map(feeds.map((f) => [f.url, f.id]));

      for (const feed of parsedFeeds) {
        try {
          const newId = await addFeed({
            title: feed.title,
            url: feed.url,
            description: feed.description ?? null,
            use_proxy: 0,
          });
          allMemberIds.push(newId);
          added++;
        } catch (err) {
          if (!isDuplicateFeedError(err)) {
            throw err;
          }
          const existingId = existingByUrl.get(feed.url);
          if (existingId !== undefined) {
            allMemberIds.push(existingId);
          }
          skipped++;
        }
      }

      const updatedFeeds = await getFeeds();
      setFeeds(updatedFeeds);

      let customFeedSummary = "";
      if (importAsCustom) {
        const trimmed = customFeedName.trim();
        if (!trimmed) {
          Alert.alert(
            "Custom feed",
            "Imports added, but the custom feed name was empty — no custom feed was created."
          );
        } else {
          // Re-resolve member ids after fresh getFeeds() in case any were
          // freshly inserted with newly assigned ids.
          const urlToId = new Map(updatedFeeds.map((f) => [f.url, f.id]));
          const memberIds = parsedFeeds
            .map((p) => urlToId.get(p.url))
            .filter((id): id is number => typeof id === "number");
          const cfId = await addCustomFeed({
            name: trimmed,
            icon: "list",
            nsfw: 0,
          });
          await setCustomFeedMembers(cfId, memberIds);
          setCustomFeedName("");
          setImportAsCustom(false);
          customFeedSummary = ` Created custom feed "${trimmed}" with ${memberIds.length} member(s).`;
          setCustomFeeds(await getCustomFeedsWithMemberCounts());
        }
      }

      Alert.alert(
        "Import Complete",
        `Added ${added} of ${parsedFeeds.length} feeds.${customFeedSummary}`
      );
      setStatus(
        `Import complete. Added ${added}, skipped ${skipped} duplicates.${customFeedSummary}`
      );
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

          <View style={styles.importRow}>
            <View style={styles.importLabelWrap}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                IMPORT AS CUSTOM FEED
              </Text>
              <Text style={[styles.hintSmall, { color: colors.inkFaint }]}>
                When on, the imported subscriptions are also grouped into a new
                custom feed with the name below.
              </Text>
            </View>
            <Switch
              value={importAsCustom}
              onValueChange={setImportAsCustom}
              accessibilityLabel="Import as custom feed"
              testID="import-as-custom-feed-switch"
            />
          </View>
          {importAsCustom ? (
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.paper,
                  borderColor: colors.border,
                  color: colors.ink,
                },
              ]}
              placeholder="Custom feed name"
              placeholderTextColor={colors.inkFaint}
              value={customFeedName}
              onChangeText={setCustomFeedName}
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Custom feed name for import"
            />
          ) : null}

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

          {customFeeds.length > 0 ? (
            <View style={styles.customSection}>
              <Text style={[styles.label, { color: colors.inkSoft }]}>
                EXPORT A CUSTOM FEED
              </Text>
              <Text style={[styles.hintSmall, { color: colors.inkFaint }]}>
                Export just the subscriptions in a specific custom feed.
              </Text>
              {customFeeds.map((cf) => (
                <TouchableOpacity
                  key={cf.id}
                  style={[
                    styles.customRow,
                    { borderColor: colors.border },
                    cf.member_count === 0 && styles.btnDisabled,
                  ]}
                  onPress={() => handleExportCustomFeed(cf)}
                  disabled={cf.member_count === 0}
                  activeOpacity={0.7}
                  accessibilityLabel={`Export ${cf.name}`}
                >
                  <Feather
                    name={resolveCustomFeedIcon(cf.icon)}
                    size={16}
                    color={colors.inkSoft}
                  />
                  <Text style={[styles.customRowText, { color: colors.ink }]}>
                    {cf.name}
                  </Text>
                  <Text
                    style={[styles.customRowCount, { color: colors.inkFaint }]}
                  >
                    {cf.member_count}
                  </Text>
                  <Feather name="download" size={16} color={colors.inkSoft} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

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
  label: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  hintSmall: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
    marginBottom: spacing.sm,
  },
  importRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  importLabelWrap: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    marginBottom: spacing.md,
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
  customSection: {
    marginTop: spacing.lg,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  customRowText: {
    flex: 1,
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
  },
  customRowCount: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  status: {
    marginTop: spacing.md,
    textAlign: "center",
    fontSize: fontSize.body,
    fontFamily: fonts.sans,
    lineHeight: 20,
  },
});
