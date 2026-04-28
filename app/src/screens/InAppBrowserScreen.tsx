import React from "react";
import {
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "InAppBrowser">;

export default function InAppBrowserScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { url, title } = route.params;

  const openExternal = React.useCallback(() => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Cannot open this URL.")
    );
  }, [url]);

  React.useEffect(() => {
    navigation.setOptions({ title: title ?? "Browser" });
  }, [navigation, title]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: colors.paper }]}>
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            accessibilityLabel="Close browser"
          >
            <Feather name="x" size={18} color={colors.ink} />
            <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
              Close
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolbarButton}
            onPress={openExternal}
            activeOpacity={0.7}
            accessibilityLabel="Open in external browser"
          >
            <Feather name="external-link" size={18} color={colors.ink} />
            <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
              External
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.webFallback}>
          <Text style={[styles.webFallbackTitle, { color: colors.ink }]}>
            Open in browser
          </Text>
          <Text style={[styles.webFallbackUrl, { color: colors.inkSoft }]}>
            {url}
          </Text>
        </View>
      </View>
    );
  }

  const { WebView } =
    require("react-native-webview") as typeof import("react-native-webview");

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Close browser"
        >
          <Feather name="x" size={18} color={colors.ink} />
          <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
            Close
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={openExternal}
          activeOpacity={0.7}
          accessibilityLabel="Open in external browser"
        >
          <Feather name="external-link" size={18} color={colors.ink} />
          <Text style={[styles.toolbarButtonLabel, { color: colors.ink }]}>
            External
          </Text>
        </TouchableOpacity>
      </View>
      <WebView source={{ uri: url }} style={styles.webview} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  toolbarButtonLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
  },
  webview: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  webFallbackTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.title,
    fontWeight: "600",
  },
  webFallbackUrl: {
    fontFamily: fonts.mono,
    fontSize: fontSize.body,
    textAlign: "center",
  },
});
