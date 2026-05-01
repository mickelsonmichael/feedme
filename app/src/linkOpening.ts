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

  if (Platform.OS === "android" && mode === "embedded") {
    // On Android, use Chrome Custom Tabs so existing browser session/cookies
    // are available while keeping the app context.
    WebBrowser.openBrowserAsync(url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
    return;
  }

  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Cannot open this URL.")
  );
}
