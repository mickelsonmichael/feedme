import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  LayoutChangeEvent,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image } from "expo-image";
import { Feather } from "@react-native-vector-icons/feather";
import * as ScreenOrientation from "expo-screen-orientation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NSFW_BLUR_FILTER_STYLE,
  NSFW_BLUR_RADIUS,
  radii,
  spacing,
} from "../theme";
import {
  clampTranslate,
  clampZoom,
  dismissBackdropOpacity,
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  shouldDismiss,
  translateForZoom,
} from "../zoomMath";

const SETTLE_SPRING = { damping: 24, stiffness: 240, mass: 1 };
const DISMISS_OUT_MS = 160;

type Props = {
  visible: boolean;
  imageUrl: string | null;
  blur?: boolean;
  onClose: () => void;
};

/**
 * Full-screen image viewer: pinch to zoom around the fingers, pan while
 * zoomed (never past the image's edges), double-tap to zoom in or back out,
 * swipe down at normal size to dismiss, tap to dismiss (or to undo a zoom).
 *
 * Every gesture runs on the UI thread through Reanimated. The previous viewer
 * did its maths in raw JS touch handlers, so zooming and panning stuttered
 * whenever JavaScript was busy, and it zoomed around the screen's centre
 * rather than the fingers.
 */
export function FullscreenImageModal({
  visible,
  imageUrl,
  blur = false,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Gesture start values, so a gesture applies on top of where the last one
  // left the image.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // A swipe-down at normal size drags the image away rather than panning it.
  const dismissY = useSharedValue(0);
  const viewWidth = useSharedValue(1);
  const viewHeight = useSharedValue(1);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewWidth.value = event.nativeEvent.layout.width;
      viewHeight.value = event.nativeEvent.layout.height;
    },
    [viewHeight, viewWidth]
  );

  // Every opening starts at 1×.
  useEffect(() => {
    if (!visible) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      dismissY.value = 0;
    }
  }, [visible, scale, translateX, translateY, dismissY]);

  // Unlock orientation while open so the image can be viewed in landscape,
  // and restore the portrait lock once it closes. Only on an actual change:
  // every image in a feed mounts one of these closed, and this used to fire a
  // native lock call for each of them as they scrolled into view.
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web" || visible === wasVisibleRef.current) return;
    wasVisibleRef.current = visible;
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
      scale.value = clampZoom(scale.value * factor);
      if (scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
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

  const gesture = useMemo(() => {
    // Animates back inside the image's bounds, or to rest below 1×.
    const settle = () => {
      "worklet";
      if (scale.value <= MIN_ZOOM) {
        scale.value = withSpring(MIN_ZOOM, SETTLE_SPRING);
        translateX.value = withSpring(0, SETTLE_SPRING);
        translateY.value = withSpring(0, SETTLE_SPRING);
        return;
      }
      translateX.value = withSpring(
        clampTranslate(translateX.value, scale.value, viewWidth.value),
        SETTLE_SPRING
      );
      translateY.value = withSpring(
        clampTranslate(translateY.value, scale.value, viewHeight.value),
        SETTLE_SPRING
      );
    };

    const resetZoom = () => {
      "worklet";
      scale.value = withSpring(1, SETTLE_SPRING);
      translateX.value = withSpring(0, SETTLE_SPRING);
      translateY.value = withSpring(0, SETTLE_SPRING);
    };

    const pinch = Gesture.Pinch()
      .onStart(() => {
        startScale.value = scale.value;
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((e) => {
        // A little give below 1× while the fingers are down; settle()
        // springs it back on release.
        const next = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM * 0.75, startScale.value * e.scale)
        );
        const focalX = e.focalX - viewWidth.value / 2;
        const focalY = e.focalY - viewHeight.value / 2;
        translateX.value = translateForZoom(
          focalX,
          startX.value,
          startScale.value,
          next
        );
        translateY.value = translateForZoom(
          focalY,
          startY.value,
          startScale.value,
          next
        );
        scale.value = next;
      })
      .onEnd(() => {
        settle();
      });

    const pan = Gesture.Pan()
      .maxPointers(2)
      .onStart(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((e) => {
        if (scale.value > MIN_ZOOM) {
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        } else if (e.numberOfPointers === 1) {
          dismissY.value = e.translationY;
        }
      })
      .onEnd((e) => {
        if (scale.value > MIN_ZOOM) {
          settle();
          return;
        }
        if (shouldDismiss(dismissY.value, e.velocityY)) {
          const direction = dismissY.value < 0 ? -1 : 1;
          dismissY.value = withTiming(
            direction * viewHeight.value,
            { duration: DISMISS_OUT_MS },
            (finished) => {
              if (finished) scheduleOnRN(handleClose);
            }
          );
          return;
        }
        dismissY.value = withSpring(0, SETTLE_SPRING);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (scale.value > MIN_ZOOM) {
          resetZoom();
          return;
        }
        const focalX = e.x - viewWidth.value / 2;
        const focalY = e.y - viewHeight.value / 2;
        scale.value = withSpring(DOUBLE_TAP_ZOOM, SETTLE_SPRING);
        translateX.value = withSpring(
          clampTranslate(
            translateForZoom(focalX, 0, 1, DOUBLE_TAP_ZOOM),
            DOUBLE_TAP_ZOOM,
            viewWidth.value
          ),
          SETTLE_SPRING
        );
        translateY.value = withSpring(
          clampTranslate(
            translateForZoom(focalY, 0, 1, DOUBLE_TAP_ZOOM),
            DOUBLE_TAP_ZOOM,
            viewHeight.value
          ),
          SETTLE_SPRING
        );
      });

    // A single tap undoes a zoom, or closes the viewer at normal size.
    const singleTap = Gesture.Tap().onEnd(() => {
      if (scale.value > MIN_ZOOM) {
        resetZoom();
      } else {
        scheduleOnRN(handleClose);
      }
    });

    return Gesture.Simultaneous(
      Gesture.Simultaneous(pinch, pan),
      Gesture.Exclusive(doubleTap, singleTap)
    );
  }, [
    dismissY,
    handleClose,
    scale,
    startScale,
    startX,
    startY,
    translateX,
    translateY,
    viewHeight,
    viewWidth,
  ]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissY.value },
      { scale: scale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: dismissBackdropOpacity(dismissY.value),
  }));

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
      {/* A Modal is a separate native window on Android, outside the app's
          root view, so it needs its own gesture root. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdropFill, backdropStyle]} />
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.stage}
            onLayout={handleLayout}
            testID="fullscreen-image-backdrop"
            accessibilityLabel="Close fullscreen image"
          >
            <Animated.View
              style={[
                styles.imageWrap,
                blur ? NSFW_BLUR_FILTER_STYLE : null,
                imageStyle,
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
        </GestureDetector>

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
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  stage: {
    flex: 1,
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
