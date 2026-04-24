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
import { colors, fonts, fontSize, radii, spacing } from "./../theme";

export function Wordmark({
  size = fontSize.wordmark,
  style,
}: {
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        styles.wordmark,
        { fontSize: size, transform: [{ rotate: "-1.5deg" }] },
        style,
      ]}
    >
      feedme
    </Text>
  );
}

export function Avatar({ label, size = 28 }: { label: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.5 }]}>
        {(label || "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function Pill({
  label,
  variant = "soft",
  style,
}: {
  label: string;
  variant?: "soft" | "accent" | "outline";
  style?: StyleProp<ViewStyle>;
}) {
  const pillStyle =
    variant === "accent"
      ? styles.pillAccent
      : variant === "outline"
        ? styles.pillOutline
        : styles.pillSoft;
  const textStyle =
    variant === "accent" ? styles.pillAccentText : styles.pillText;
  return (
    <View style={[styles.pillBase, pillStyle, style]}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function MetaText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.meta, style]}>{children}</Text>;
}

export function DashedDivider() {
  return <View style={styles.dashedDivider} />;
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: fonts.brand,
    color: colors.ink,
    fontWeight: "700",
    lineHeight: 32,
  },
  avatar: {
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.paperWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.inkSoft,
    fontWeight: "600",
  },
  pillBase: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1.2,
    alignSelf: "flex-start",
  },
  pillSoft: {
    borderColor: colors.inkSoft,
    backgroundColor: "transparent",
  },
  pillOutline: {
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  pillAccent: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pillText: {
    fontSize: fontSize.meta,
    color: colors.inkSoft,
  },
  pillAccentText: {
    fontSize: fontSize.meta,
    color: colors.paper,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  meta: {
    fontSize: fontSize.meta,
    fontFamily: fonts.mono,
    color: colors.inkSoft,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.inkFaint,
    borderStyle: "dashed",
    marginVertical: spacing.sm,
  },
});
