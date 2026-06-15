import React, { useCallback, useEffect } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import {
  NSFW_BLUR_FILTER_STYLE,
  NSFW_BLUR_RADIUS,
  radii,
  spacing,
} from "../theme";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  imageUrl: string | null;
  blur?: boolean;
  onClose: () => void;
};

export function FullscreenImageModal({
  visible,
  imageUrl,
  blur = false,
  onClose,
}: Props) {
  const { colors } = useTheme();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      if (e.key === "Escape") handleClose();
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).addEventListener?.("keydown", handler);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).removeEventListener?.("keydown", handler);
    };
  }, [visible, handleClose]);

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      testID="fullscreen-image-modal"
    >
      {/* Tap backdrop to close */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityLabel="Close fullscreen image"
        testID="fullscreen-image-backdrop"
      >
        {/* Inner view stops propagation so tapping image doesn't dismiss */}
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.imageWrap, blur ? NSFW_BLUR_FILTER_STYLE : null]}
          onPress={handleClose}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
            testID="fullscreen-image"
          />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Close button always on top */}
      <TouchableOpacity
        style={[
          styles.closeButton,
          {
            backgroundColor: `${colors.ink}cc`,
            borderColor: colors.paper,
          },
        ]}
        onPress={handleClose}
        accessibilityLabel="Close fullscreen image"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID="fullscreen-image-close"
      >
        <Feather name="x" size={20} color={colors.paper} />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    top: spacing.xl,
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 10,
  },
});
