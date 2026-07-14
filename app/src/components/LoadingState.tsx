// Shared loading-state components: a playful animated loader, skeleton
// placeholder rows, and a slim refresh progress bar. Built on the core
// react-native Animated API (no extra dependencies) so they work on both
// native and web.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { fonts, fontSize, radii, spacing } from "../theme";
import { useTheme } from "../context/ThemeContext";
import type { FeedRefreshProgress } from "../feedRefresher";

// react-native-web does not support the native animation driver.
const USE_NATIVE_DRIVER = Platform.OS !== "web";

/** Rotating status messages so a longer refresh feels alive rather than
 *  stuck. Kept light-hearted on purpose. */
export const LOADING_MESSAGES = [
  "Sniffing out fresh posts…",
  "Feeding the feed…",
  "Untangling the interwebs…",
  "Shaking the news tree…",
  "Herding headlines…",
  "Warming up the presses…",
  "Politely asking the servers…",
  "Fluffing your reading pile…",
] as const;

const MESSAGE_ROTATE_MS = 2_400;

/** Three little dots that bounce in a staggered wave. A friendlier stand-in
 *  for ActivityIndicator in footers and inline loading spots. */
export function PulsingDots({ size = 7 }: { size?: number }) {
  const { colors } = useTheme();
  const values = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.delay((2 - index) * 140),
        ])
      )
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [values]);

  return (
    <View style={styles.dotsRow} testID="pulsing-dots">
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accent,
            opacity: value.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 1],
            }),
            transform: [
              {
                translateY: value.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -size * 0.9],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** A gently bobbing RSS icon with rotating playful status messages and an
 *  optional per-feed progress readout. */
export function FunFeedLoader({
  progress,
}: {
  progress?: FeedRefreshProgress | null;
}) {
  const { colors } = useTheme();
  const bounce = useRef(new Animated.Value(0)).current;
  const messageOpacity = useRef(new Animated.Value(1)).current;
  // Random starting message so repeated loads don't always open on the same
  // line — tiny thing, but it keeps the loader from feeling canned.
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * LOADING_MESSAGES.length)
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 520,
          easing: Easing.in(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [bounce]);

  useEffect(() => {
    // The text swap is scheduled with a plain timeout (not the animation's
    // completion callback) so the rotation cadence never depends on the
    // animation driver — keeps behaviour identical across platforms/tests.
    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      Animated.timing(messageOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      swapTimer = setTimeout(() => {
        setMessageIndex((index) => (index + 1) % LOADING_MESSAGES.length);
        Animated.timing(messageOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      }, 220);
    }, MESSAGE_ROTATE_MS);
    return () => {
      clearInterval(interval);
      if (swapTimer !== undefined) clearTimeout(swapTimer);
    };
  }, [messageOpacity]);

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;

  return (
    <View style={styles.loaderWrap} testID="fun-feed-loader">
      <Animated.View
        style={{
          transform: [
            {
              translateY: bounce.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -10],
              }),
            },
            {
              rotate: bounce.interpolate({
                inputRange: [0, 1],
                outputRange: ["-6deg", "6deg"],
              }),
            },
          ],
        }}
      >
        <View
          style={[
            styles.loaderBadge,
            { backgroundColor: colors.paperWarm, borderColor: colors.border },
          ]}
        >
          <Feather name="rss" size={30} color={colors.accent} />
        </View>
      </Animated.View>
      <PulsingDots />
      <Animated.Text
        style={[
          styles.loaderMessage,
          { color: colors.ink, opacity: messageOpacity },
        ]}
        testID="fun-feed-loader-message"
      >
        {LOADING_MESSAGES[messageIndex]}
      </Animated.Text>
      {total > 0 ? (
        <Text style={[styles.loaderMeta, { color: colors.inkSoft }]}>
          {completed} of {total} feeds refreshed
        </Text>
      ) : null}
      {total > 0 ? <RefreshProgressBar progress={progress ?? null} /> : null}
    </View>
  );
}

/** A slim, animated determinate progress bar driven by refresh progress. */
export function RefreshProgressBar({
  progress,
}: {
  progress: FeedRefreshProgress | null;
}) {
  const { colors } = useTheme();
  const fill = useRef(new Animated.Value(0)).current;
  const fraction =
    progress && progress.total > 0 ? progress.completed / progress.total : 0;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      // scaleX is transform-based, but transformOrigin isn't supported by the
      // native driver on all platforms — keep this on the JS driver; it's a
      // single small view animating a few times per refresh.
      useNativeDriver: false,
    }).start();
  }, [fill, fraction]);

  return (
    <View
      style={[styles.progressTrack, { backgroundColor: colors.inkFaint }]}
      testID="refresh-progress-bar"
    >
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: colors.accent,
            transform: [{ scaleX: fill }],
          },
        ]}
      />
    </View>
  );
}

/** A single greyed-out placeholder row shaped like a compact feed card. */
function SkeletonRow({ pulse }: { pulse: Animated.Value }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      style={[
        styles.skeletonCard,
        {
          backgroundColor: colors.paper,
          borderColor: colors.border,
          opacity: pulse,
        },
      ]}
      testID="skeleton-row"
    >
      <View
        style={[styles.skeletonThumb, { backgroundColor: colors.inkFaint }]}
      />
      <View style={styles.skeletonBody}>
        <View
          style={[
            styles.skeletonLine,
            styles.skeletonLineShort,
            { backgroundColor: colors.inkFaint },
          ]}
        />
        <View
          style={[styles.skeletonLine, { backgroundColor: colors.inkFaint }]}
        />
        <View
          style={[
            styles.skeletonLine,
            styles.skeletonLineMedium,
            { backgroundColor: colors.inkFaint },
          ]}
        />
      </View>
    </Animated.View>
  );
}

/** A column of pulsing skeleton rows hinting at the feed list to come. */
export function SkeletonFeedList({ rows = 5 }: { rows?: number }) {
  // One shared animated value drives every row so the whole list breathes in
  // sync with a single JS-side loop.
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const rowKeys = useMemo(
    () => Array.from({ length: rows }, (_, index) => index),
    [rows]
  );

  return (
    <View style={styles.skeletonList}>
      {rowKeys.map((key) => (
        <SkeletonRow key={key} pulse={pulse} />
      ))}
    </View>
  );
}

/** Full-screen loading state: fun loader up top, skeleton feed below. */
export function FeedLoadingScreen({
  progress,
}: {
  progress?: FeedRefreshProgress | null;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.screen, { backgroundColor: colors.paper }]}
      testID="feed-loading-screen"
    >
      <FunFeedLoader progress={progress} />
      <SkeletonFeedList />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: spacing.xxl,
  },
  loaderWrap: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  loaderBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderMessage: {
    fontFamily: fonts.sans,
    fontWeight: "600",
    fontSize: fontSize.body,
    textAlign: "center",
  },
  loaderMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    height: 16,
  },
  progressTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    flex: 1,
    borderRadius: 2,
    transformOrigin: "left",
  },
  skeletonList: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  skeletonCard: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  skeletonThumb: {
    width: 100,
    alignSelf: "stretch",
    minHeight: 84,
  },
  skeletonBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    alignSelf: "stretch",
  },
  skeletonLineShort: {
    width: "35%",
    alignSelf: "flex-start",
  },
  skeletonLineMedium: {
    width: "70%",
    alignSelf: "flex-start",
  },
});
