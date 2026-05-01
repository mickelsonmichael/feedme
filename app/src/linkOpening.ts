import { Alert, Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { loadConfig } from "./storage";
import type { LinkOpenMode, RootStackParamList } from "./types";

function preferredLinkOpenMode(): LinkOpenMode {
  return loadConfig().linkOpenMode ?? "embedded";
}

export function openUrlWithPreference({
  url,
  navigation,
  title,
}: {
  url: string;
  navigation: Pick<NativeStackNavigationProp<RootStackParamList>, "navigate">;
  title?: string;
}): void {
  const mode = preferredLinkOpenMode();

  if (Platform.OS !== "web" && mode === "embedded") {
    // Use Chrome Custom Tabs (Android) / SFSafariViewController (iOS) so that
    // the user's existing browser session and cookies are available.
    WebBrowser.openBrowserAsync(url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
    return;
  }

  if (Platform.OS === "web" && mode === "embedded") {
    navigation.navigate("InAppBrowser", { url, title });
    return;
  }

  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Cannot open this URL.")
  );
}
