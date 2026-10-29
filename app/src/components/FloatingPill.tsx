import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { radii, spacing } from "../theme";

type Props = {
  /** `neutral` for passive status, `accent` for something to act on. */
  tone: "neutral" | "accent";
  /** Distance from the bottom of the parent that the pill floats at. */
  bottom: number;
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * A status pill that floats over the content instead of sitting in the
 * layout. The background-sync status and the "new posts" prompt both used to
 * be full-width rows above the feed, so every sync shoved the whole list down
 * when it started, again when its counter wrapped onto a second line, and back
 * up when it finished — moving whatever the user was about to tap. Floating
 * over the bottom of the content, nothing underneath ever moves.
 *
 * A passive pill lets touches through to the content beneath it.
 */
export function FloatingPill({
  tone,
  bottom,
  children,
  onPress,
  accessibilityLabel,
  testID,
}: Props) {
  const { colors } = useTheme();
  const pillStyle = [
    styles.pill,
    tone === "accent"
      ? { backgroundColor: colors.accent }
      : {
          backgroundColor: colors.paperWarm,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
  ];

  return (
    <View
      style={[styles.lane, { bottom }]}
      pointerEvents={onPress ? "box-none" : "none"}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          android_ripple={{ color: colors.paper, borderless: false }}
          style={({ pressed }) => [pillStyle, pressed && styles.pressed]}
        >
          {children}
        </Pressable>
      ) : (
        <View
          style={pillStyle}
          accessibilityLabel={accessibilityLabel}
          accessibilityLiveRegion="polite"
          testID={testID}
        >
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    overflow: "hidden",
    maxWidth: "100%",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: {
    opacity: 0.9,
  },
});
