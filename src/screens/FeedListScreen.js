import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getFeeds, deleteFeed, addFeed } from "../database";
import { generateOpml, parseOpml } from "../opml";
import { fetchFeed, extractFeedTitle } from "../feedParser";

export default function FeedListScreen({ navigation }) {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeeds = useCallback(async () => {
    try {
      const data = await getFeeds();
      setFeeds(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load feeds: " + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeeds();
    }, [loadFeeds])
  );

  const handleDelete = (feed) => {
    Alert.alert("Remove Feed", `Remove "${feed.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteFeed(feed.id);
          setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
        },
      },
    ]);
  };

  const handleExportOpml = async () => {
    try {
      const opmlContent = generateOpml(feeds);
      const path = FileSystem.cacheDirectory + "feedme-subscriptions.opml";
      await FileSystem.writeAsStringAsync(path, opmlContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: "text/x-opml",
          dialogTitle: "Export OPML",
        });
      } else {
        Alert.alert("Exported", "OPML saved to: " + path);
      }
    } catch (err) {
      Alert.alert("Export Error", err.message);
    }
  };

  const handleImportOpml = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/xml", "text/x-opml", "application/xml", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
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
          await addFeed(feed);
          added++;
        } catch (err) {
          // Skip feeds that already exist (UNIQUE constraint); rethrow unexpected errors
          if (!err.message?.includes("UNIQUE")) {
            throw err;
          }
        }
      }
      Alert.alert(
        "Import Complete",
        `Added ${added} of ${parsedFeeds.length} feeds.`
      );
      loadFeeds();
    } catch (err) {
      Alert.alert("Import Error", err.message);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    let errors = 0;
    for (const feed of feeds) {
      try {
        await fetchFeed(feed.url);
      } catch {
        errors++;
      }
    }
    if (errors > 0) {
      Alert.alert("Refresh", `${errors} feed(s) could not be refreshed.`);
    }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={handleImportOpml}
        >
          <Text style={styles.toolbarButtonText}>Import OPML</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toolbarButton,
            feeds.length === 0 && styles.toolbarButtonDisabled,
          ]}
          onPress={handleExportOpml}
          disabled={feeds.length === 0}
        >
          <Text style={styles.toolbarButtonText}>Export OPML</Text>
        </TouchableOpacity>
      </View>

      {feeds.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No feeds yet.</Text>
          <Text style={styles.emptySubText}>Tap + to add your first feed.</Text>
        </View>
      ) : (
        <FlatList
          data={feeds}
          keyExtractor={(item) => String(item.id)}
          onRefresh={handleRefreshAll}
          refreshing={refreshing}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.feedItem}
              onPress={() => navigation.navigate("FeedItems", { feed: item })}
              onLongPress={() => handleDelete(item)}
            >
              <View style={styles.feedInfo}>
                <Text style={styles.feedTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.feedUrl} numberOfLines={1}>
                  {item.url}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddFeed")}
        accessibilityLabel="Add feed"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  toolbar: {
    flexDirection: "row",
    padding: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 8,
  },
  toolbarButton: {
    flex: 1,
    backgroundColor: "#4A90E2",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  toolbarButtonDisabled: { opacity: 0.4 },
  toolbarButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  feedItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
  },
  feedInfo: { flex: 1 },
  feedTitle: { fontSize: 16, fontWeight: "600", color: "#212121" },
  feedUrl: { fontSize: 12, color: "#757575", marginTop: 2 },
  chevron: { fontSize: 22, color: "#BDBDBD", marginLeft: 8 },
  separator: { height: 1, backgroundColor: "#E0E0E0" },
  emptyText: { fontSize: 18, color: "#616161", fontWeight: "600" },
  emptySubText: { fontSize: 14, color: "#9E9E9E", marginTop: 6 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4A90E2",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 32 },
});
