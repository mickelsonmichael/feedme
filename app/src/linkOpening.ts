import { Alert, Linking, Platform } from "react-native";
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
  const shouldUseEmbedded =
    Platform.OS !== "web" && preferredLinkOpenMode() === "embedded";

  if (shouldUseEmbedded) {
    navigation.navigate("InAppBrowser", { url, title });
    return;
  }

  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Cannot open this URL.")
  );
}
