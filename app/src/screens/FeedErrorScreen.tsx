import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "FeedError">;

export default function FeedErrorScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { error, feedTitle } = route.params;
  const [copied, setCopied] = React.useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: feedTitle ? `Error — ${feedTitle}` : "Feed Error",
    });
  }, [navigation, feedTitle]);

  const handleCopy = async () => {
    if (!error) return;
    try {
      await Clipboard.setStringAsync(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Close"
        >
          <Feather name="x" size={16} color={colors.ink} />
          <Text style={[styles.toolbarBtnText, { color: colors.ink }]}>
            Close
          </Text>
        </TouchableOpacity>

        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={[
              styles.toolbarBtn,
              { backgroundColor: copied ? colors.accent : "transparent" },
            ]}
            onPress={handleCopy}
            activeOpacity={0.7}
            accessibilityLabel="Copy error to clipboard"
          >
            <Feather
              name={copied ? "check" : "copy"}
              size={16}
              color={copied ? colors.paper : colors.ink}
            />
            <Text
              style={[
                styles.toolbarBtnText,
                { color: copied ? colors.paper : colors.ink },
              ]}
            >
              {copied ? "Copied!" : "Copy"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.OS === "web" ? styles.contentWeb : null,
        ]}
        showsVerticalScrollIndicator
      >
        <Text
          style={[
            styles.errorText,
            { color: colors.ink, backgroundColor: colors.paperWarm },
          ]}
          selectable
        >
          {error}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  toolbarRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    gap: 4,
  },
  toolbarBtnText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.body,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  contentWeb: {
    maxWidth: 1200,
  },
  errorText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
    lineHeight: 20,
    padding: spacing.md,
    borderRadius: radii.md,
  },
});
