import React from "react";
import {
  Insets,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number | Insets;
  testID?: string;
};

/**
 * A small icon-only button with the platform's own press feedback: a
 * borderless ripple on Android, the way system apps answer a tap, rather
 * than TouchableOpacity's fade, which reads as web-like on Android. Other
 * platforms keep the fade.
 */
export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  disabled = false,
  style,
  hitSlop = 8,
  testID,
}: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      android_ripple={{ color: colors.inkFaint, borderless: true, radius: 20 }}
      style={({ pressed }) => [
        styles.base,
        style,
        pressed && Platform.OS !== "android" ? styles.pressed : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
