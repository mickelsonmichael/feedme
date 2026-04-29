// Small shared UI primitives used across the redesigned screens.
// Modeled on the sketch-primitives from the Claude Design wireframes
// (Avatar, pill, wordmark, etc.), but implemented for React Native.

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

export function Wordmark({
  size = fontSize.wordmark,
  style,
}: {
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize: size,
          color: colors.ink,
          transform: [{ rotate: "-1.5deg" }],
        },
        style,
      ]}
    >
      feedme
    </Text>
  );
}

export function Avatar({ label, size = 28 }: { label: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.border,
          backgroundColor: colors.paperWarm,
        },
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { fontSize: size * 0.5, color: colors.inkSoft },
        ]}
      >
        {(label || "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function Pill({
  label,
  iconName,
  variant = "soft",
  style,
}: {
  label: string;
  iconName?: React.ComponentProps<typeof Feather>["name"];
  variant?: "soft" | "accent" | "outline";
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pillStyle =
    variant === "accent"
      ? { borderColor: colors.accent, backgroundColor: colors.accent }
      : variant === "outline"
        ? { borderColor: colors.border, backgroundColor: colors.paper }
        : {
            borderColor: colors.inkSoft,
            backgroundColor: "transparent" as const,
          };
  const textColor = variant === "accent" ? colors.paper : colors.inkSoft;
  return (
    <View style={[styles.pillBase, pillStyle, style]}>
      {iconName ? (
        <Feather
          name={iconName}
          size={12}
          color={textColor}
          style={styles.pillIcon}
        />
      ) : null}
      <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.inkSoft }]}>
      {children}
    </Text>
  );
}

export function MetaText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.meta, { color: colors.inkSoft }, style]}>
      {children}
    </Text>
  );
}

export function DashedDivider() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.dashedDivider, { borderBottomColor: colors.inkFaint }]}
    />
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: fonts.brand,
    fontWeight: "700",
    lineHeight: 32,
  },
  avatar: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "600",
  },
  pillBase: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 30,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  pillIcon: {
    marginRight: 4,
  },
  pillText: {
    fontSize: fontSize.meta,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sans,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  meta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.sans,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    marginVertical: spacing.sm,
  },
});
