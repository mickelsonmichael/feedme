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
import { prettyXml } from "../utils/prettyXml";

type Props = NativeStackScreenProps<RootStackParamList, "RawXml">;

export default function RawXmlScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const { rawXml, title } = route.params;
  const [copied, setCopied] = React.useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: title ?? "Raw XML" });
  }, [navigation, title]);

  const formatted = React.useMemo(
    () => (rawXml ? prettyXml(rawXml) : null),
    [rawXml]
  );

  const handleCopy = async () => {
    const text = formatted ?? rawXml ?? "";
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
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
          style={[styles.toolbarBtn, { borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={16} color={colors.ink} />
          <Text style={[styles.toolbarBtnText, { color: colors.ink }]}>
            Back
          </Text>
        </TouchableOpacity>

        <View style={styles.toolbarRight}>
          <TouchableOpacity
            style={[
              styles.toolbarBtn,
              {
                borderColor: copied ? colors.accent : colors.border,
                backgroundColor: copied ? colors.accent : colors.paper,
              },
            ]}
            onPress={handleCopy}
            activeOpacity={0.7}
            disabled={!rawXml}
            accessibilityLabel="Copy XML to clipboard"
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
        horizontal={false}
        showsVerticalScrollIndicator
      >
        {formatted ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.codeWrapper}
          >
            <Text
              style={[
                styles.code,
                { color: colors.ink, backgroundColor: colors.paperWarm },
              ]}
              selectable
            >
              {formatted}
            </Text>
          </ScrollView>
        ) : (
          <Text style={[styles.empty, { color: colors.inkSoft }]}>
            No raw XML available for this item.
          </Text>
        )}
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
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  toolbarBtnText: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.meta,
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
  codeWrapper: {
    flexGrow: 1,
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: fontSize.meta,
    lineHeight: 20,
    padding: spacing.md,
    borderRadius: radii.md,
    // Allow wrapping on narrow screens but prefer horizontal scroll
    flexShrink: 0,
  },
  empty: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
