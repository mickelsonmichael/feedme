import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  GestureResponderEvent,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NSFW_BLUR_FILTER_STYLE,
  NSFW_BLUR_RADIUS,
  radii,
  spacing,
} from "../theme";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_MOVEMENT_PX = 10;

function getTouchDistance(
  t0: { pageX: number; pageY: number },
  t1: { pageX: number; pageY: number }
) {
  const dx = t0.pageX - t1.pageX;
  const dy = t0.pageY - t1.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

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
  const insets = useSafeAreaInsets();

  // Animated values for zoom + pan
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Raw ref copies so gesture callbacks can read current values synchronously
  const scaleRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);

  // Per-gesture tracking
  const touchStartTime = useRef(0);
  const gestureHadTwoFingers = useRef(false);
  const gestureHadMovement = useRef(false);
  // Base values at the start of the current gesture
  const baseScale = useRef(1);
  const baseTX = useRef(0);
  const baseTY = useRef(0);
  const baseStartX = useRef(0);
  const baseStartY = useRef(0);
  // Pinch: initial distance when a second finger is added
  const pinchInitialDistance = useRef<number | null>(null);
  const prevTouchCount = useRef(0);

  const setScale = useCallback(
    (v: number) => {
      scale.setValue(v);
      scaleRef.current = v;
    },
    [scale]
  );
  const setTX = useCallback(
    (v: number) => {
      translateX.setValue(v);
      translateXRef.current = v;
    },
    [translateX]
  );
  const setTY = useCallback(
    (v: number) => {
      translateY.setValue(v);
      translateYRef.current = v;
    },
    [translateY]
  );

  const resetZoom = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start(() => {
      scaleRef.current = 1;
      translateXRef.current = 0;
      translateYRef.current = 0;
    });
  }, [scale, translateX, translateY]);

  // Reset zoom when modal closes
  useEffect(() => {
    if (!visible) {
      setScale(1);
      setTX(0);
      setTY(0);
    }
  }, [visible, setScale, setTX, setTY]);

  // Unlock screen orientation while the modal is open (native only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (visible) {
      ScreenOrientation.unlockAsync();
    } else {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Keyboard dismiss on web
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

  // Ctrl+wheel zoom for web desktop
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, scaleRef.current * factor)
      );
      scale.setValue(newScale);
      scaleRef.current = newScale;
      if (newScale <= 1) {
        translateX.setValue(0);
        translateY.setValue(0);
        translateXRef.current = 0;
        translateYRef.current = 0;
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).addEventListener?.("wheel", handler, {
      passive: false,
    });
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).removeEventListener?.("wheel", handler);
    };
  }, [visible, scale, translateX, translateY]);

  // Direct touch handlers — more reliable than PanResponder for multi-touch
  // in React Native's new architecture where nativeEvent.touches can be
  // unreliable inside PanResponder callbacks.

  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    const touches = e.nativeEvent.touches;
    touchStartTime.current = Date.now();
    gestureHadTwoFingers.current = touches.length >= 2;
    gestureHadMovement.current = false;
    prevTouchCount.current = touches.length;
    pinchInitialDistance.current = null;
    baseScale.current = scaleRef.current;
    baseTX.current = translateXRef.current;
    baseTY.current = translateYRef.current;
    baseStartX.current = touches[0]?.pageX ?? 0;
    baseStartY.current = touches[0]?.pageY ?? 0;
    if (touches.length >= 2) {
      pinchInitialDistance.current = getTouchDistance(touches[0], touches[1]);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const touches = e.nativeEvent.touches;

      if (touches.length >= 2 && prevTouchCount.current < 2) {
        // Second finger added mid-gesture
        gestureHadTwoFingers.current = true;
        pinchInitialDistance.current = getTouchDistance(touches[0], touches[1]);
        baseScale.current = scaleRef.current;
        baseTX.current = translateXRef.current;
        baseTY.current = translateYRef.current;
      } else if (touches.length === 1 && prevTouchCount.current >= 2) {
        // One finger lifted from a pinch — reset pan base for smooth continuation
        baseStartX.current = touches[0]?.pageX ?? 0;
        baseStartY.current = touches[0]?.pageY ?? 0;
        baseTX.current = translateXRef.current;
        baseTY.current = translateYRef.current;
        pinchInitialDistance.current = null;
      }
      prevTouchCount.current = touches.length;

      if (touches.length >= 2 && pinchInitialDistance.current !== null) {
        // Pinch-to-zoom
        const currentDist = getTouchDistance(touches[0], touches[1]);
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(
            MAX_SCALE,
            baseScale.current * (currentDist / pinchInitialDistance.current)
          )
        );
        scaleRef.current = newScale;
        scale.setValue(newScale);
        gestureHadMovement.current = true;
      } else if (touches.length === 1 && scaleRef.current > 1) {
        // Pan when zoomed in
        const dx = (touches[0]?.pageX ?? 0) - baseStartX.current;
        const dy = (touches[0]?.pageY ?? 0) - baseStartY.current;
        const newTX = baseTX.current + dx;
        const newTY = baseTY.current + dy;
        translateXRef.current = newTX;
        translateYRef.current = newTY;
        translateX.setValue(newTX);
        translateY.setValue(newTY);
        if (
          Math.abs(dx) > TAP_MAX_MOVEMENT_PX ||
          Math.abs(dy) > TAP_MAX_MOVEMENT_PX
        ) {
          gestureHadMovement.current = true;
        }
      }
    },
    [scale, translateX, translateY]
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const remainingTouches = e.nativeEvent.touches;

      if (remainingTouches.length === 0) {
        // All fingers lifted — check for tap or snap
        const elapsed = Date.now() - touchStartTime.current;
        const changedTouches = e.nativeEvent.changedTouches;
        const lastTouch = changedTouches[0];
        const dx = lastTouch ? lastTouch.pageX - baseStartX.current : 0;
        const dy = lastTouch ? lastTouch.pageY - baseStartY.current : 0;
        const moved =
          Math.abs(dx) > TAP_MAX_MOVEMENT_PX ||
          Math.abs(dy) > TAP_MAX_MOVEMENT_PX;

        const isTap =
          !gestureHadTwoFingers.current &&
          !gestureHadMovement.current &&
          !moved &&
          elapsed < TAP_MAX_DURATION_MS;

        if (isTap) {
          if (scaleRef.current > 1) {
            resetZoom();
          } else {
            handleClose();
          }
        }

        // Snap back to scale=1 if pinch released below threshold
        if (scaleRef.current < 1.1 && !isTap) {
          resetZoom();
        }

        prevTouchCount.current = 0;
        pinchInitialDistance.current = null;
        gestureHadTwoFingers.current = false;
        gestureHadMovement.current = false;
      } else if (remainingTouches.length === 1 && prevTouchCount.current >= 2) {
        // One finger lifted from pinch — reset pan base
        baseStartX.current = remainingTouches[0]?.pageX ?? 0;
        baseStartY.current = remainingTouches[0]?.pageY ?? 0;
        baseTX.current = translateXRef.current;
        baseTY.current = translateYRef.current;
        prevTouchCount.current = 1;
        pinchInitialDistance.current = null;
      } else {
        prevTouchCount.current = remainingTouches.length;
      }
    },
    [resetZoom, handleClose]
  );

  const handleTouchCancel = useCallback(() => {
    prevTouchCount.current = 0;
    pinchInitialDistance.current = null;
    gestureHadTwoFingers.current = false;
    gestureHadMovement.current = false;
  }, []);

  if (!imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
      testID="fullscreen-image-modal"
    >
      <Animated.View
        style={styles.backdrop}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        testID="fullscreen-image-backdrop"
        accessibilityLabel="Close fullscreen image"
      >
        <Animated.View
          style={[
            styles.imageWrap,
            blur ? NSFW_BLUR_FILTER_STYLE : null,
            { transform: [{ scale }, { translateX }, { translateY }] },
          ]}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
            testID="fullscreen-image"
          />
        </Animated.View>
      </Animated.View>

      {/* Close button — positioned below the status bar / notch */}
      <TouchableOpacity
        style={[
          styles.closeButton,
          {
            backgroundColor: "rgba(0,0,0,0.55)",
            top: insets.top + spacing.sm,
          },
        ]}
        onPress={handleClose}
        accessibilityLabel="Close fullscreen image"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID="fullscreen-image-close"
      >
        <Feather name="x" size={22} color="#fff" />
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
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 10,
  },
});
