// A brief, self-dismissing notice for lightweight feedback (e.g. "3 feeds
// could not be refreshed") that shouldn't interrupt the user the way a modal
// Alert does. Built on the core Animated API to match LoadingState.tsx.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text } from "react-native";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";

const USE_NATIVE_DRIVER = Platform.OS !== "web";
const DEFAULT_DURATION_MS = 3_000;
const FADE_MS = 200;

/** Renders `message` as a floating banner near the bottom of the screen,
 *  fading in, holding for `duration`, then fading out and calling `onHide`.
 *  Renders nothing when `message` is null. Meant to sit as an absolutely
 *  positioned sibling inside a `flex: 1` container. */
export function Toast({
  message,
  onHide,
  duration = DEFAULT_DURATION_MS,
}: {
  message: string | null;
  onHide: () => void;
  duration?: number;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    const hideTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) onHide();
      });
    }, duration);

    return () => clearTimeout(hideTimer);
  }, [message, duration, opacity, onHide]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { backgroundColor: colors.ink, opacity }]}
      testID="toast"
    >
      <Text style={[styles.text, { color: colors.paper }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
    textAlign: "center",
  },
});
