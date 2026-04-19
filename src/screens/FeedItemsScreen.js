import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getItemsForFeed, upsertItems, markItemRead, updateFeedLastFetched } from "../database";
import { fetchFeed } from "../feedParser";

export default function FeedItemsScreen({ route, navigation }) {
  const { feed } = route.params;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: feed.title });
  }, [navigation, feed.title]);

  const loadItems = useCallback(async () => {
    try {
      const data = await getItemsForFeed(feed.id);
      setItems(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load items: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [feed.id]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fetched = await fetchFeed(feed.url);
      await upsertItems(feed.id, fetched);
      await updateFeedLastFetched(feed.id);
      await loadItems();
    } catch (err) {
      Alert.alert("Refresh Error", err.message);
    } finally {
      setRefreshing(false);
    }
  }, [feed, loadItems]);

  const handleOpenItem = async (item) => {
    await markItemRead(item.id);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, read: 1 } : i))
    );
    if (item.url) {
      Linking.openURL(item.url).catch(() =>
        Alert.alert("Error", "Cannot open this URL.")
      );
    }
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No items yet.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>Fetch Items</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, item.read ? styles.itemRead : null]}
              onPress={() => handleOpenItem(item)}
            >
              <View style={styles.itemContent}>
                <Text
                  style={[styles.itemTitle, item.read && styles.itemTitleRead]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                {item.published_at ? (
                  <Text style={styles.itemDate}>{formatDate(item.published_at)}</Text>
                ) : null}
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 16, color: "#757575", marginBottom: 16 },
  refreshButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  refreshButtonText: { color: "#fff", fontWeight: "600" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
  },
  itemRead: { backgroundColor: "#FAFAFA" },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "600", color: "#212121" },
  itemTitleRead: { color: "#9E9E9E", fontWeight: "400" },
  itemDate: { fontSize: 12, color: "#9E9E9E", marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
    marginLeft: 8,
  },
  separator: { height: 1, backgroundColor: "#E0E0E0" },
});
