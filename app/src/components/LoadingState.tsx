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

/** One bite of the jaws, and how many bites make up a full turn of the
 *  animation clock. Three per cycle puts three dots on the runway at once,
 *  each swallowed on its own beat. */
const CHOMP_MS = 420;
const CHOMPS_PER_CYCLE = 3;
const CHOMP_CYCLE_MS = CHOMP_MS * CHOMPS_PER_CYCLE;

/** How far the jaws swing open, in degrees, measured from shut. */
const JAW_MAX_ANGLE = 45;

/** Base geometry in px for the default head; every other size scales from it. */
const BASE_HEAD = 14;
const BASE_WIDTH = 32;
const BASE_RUNWAY = 18;
const BASE_DOT = 3.5;
/** Where a dot's travel ends: inside the head, between the rim and the mouth's
 *  hinge, so a dot is eaten rather than winking out short of the mouth. */
const BASE_DOT_REST = 10;
/** How far each half-head reaches *past* the hinge. Butted exactly edge to
 *  edge, the two halves leave a hairline of background showing along the
 *  diameter whenever the mouth is shut. Overlapping them hides it, at the cost
 *  of a slightly blunt vertex where the jaws meet — which reads as a hinge. */
const BASE_OVERLAP = 0.5;

/** The jaw swing sampled as a raised cosine, so a linear clock still yields an
 *  eased bite. Built once at module load: interpolation takes plain arrays and
 *  these never depend on props. */
const [JAW_INPUT, JAW_TOP_OUTPUT, JAW_BOTTOM_OUTPUT] = (() => {
  const samples = 10 * CHOMPS_PER_CYCLE + 1;
  const input: number[] = [];
  const top: string[] = [];
  const bottom: string[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    const openness = (1 - Math.cos(2 * Math.PI * CHOMPS_PER_CYCLE * t)) / 2;
    const angle = Number((JAW_MAX_ANGLE * openness).toFixed(2));
    input.push(t);
    top.push(`${-angle}deg`);
    bottom.push(`${angle}deg`);
  }
  return [input, top, bottom] as const;
})();

/** Each dot's head start, spread evenly so exactly one reaches the mouth per
 *  bite. */
const DOT_PHASES = Array.from(
  { length: CHOMPS_PER_CYCLE },
  (_, index) => index / CHOMPS_PER_CYCLE
);

/**
 * A little head chewing its way through a queue of dots — the loading
 * indicator for anywhere posts are being fetched.
 *
 * Every moving part interpolates off a *single* looping clock. The three-dot
 * loader this replaces gave each dot its own `Animated.loop`, and independent
 * loops drift: once one falls behind there is nothing to pull it back, so the
 * stagger decays into noise the longer a sync runs. One clock makes that
 * impossible by construction rather than merely unlikely.
 *
 * @param size - Head diameter in px. All other geometry scales with it.
 */
export function ChompingLoader({ size = BASE_HEAD }: { size?: number }) {
  const { colors } = useTheme();
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: CHOMP_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [clock]);

  const geometry = useMemo(() => {
    const unit = size / BASE_HEAD;
    const halfHeight = size / 2 + BASE_OVERLAP * unit;
    const dotSize = BASE_DOT * unit;
    return {
      width: BASE_WIDTH * unit,
      halfHeight,
      radius: size / 2,
      // Distance from a half's own centre to the head's centre, where both
      // halves hinge. `transformOrigin` would say this more directly, but it is
      // not honoured by the native animation driver on every platform (see
      // RefreshProgressBar below), so the pivot moves the portable way:
      // translate onto it, rotate, translate back.
      pivotOffset: size / 2 - halfHeight / 2,
      dotSize,
      dotLeft: BASE_DOT_REST * unit,
      dotTop: (size - dotSize) / 2,
      runway: BASE_RUNWAY * unit,
    };
  }, [size]);

  // Each dot rides the same clock, offset and wrapped — so they share one
  // timeline instead of racing three of their own.
  const dotProgress = useMemo(
    () =>
      DOT_PHASES.map((phase) => Animated.modulo(Animated.add(clock, phase), 1)),
    [clock]
  );

  const jaw = {
    position: "absolute" as const,
    left: 0,
    width: size,
    height: geometry.halfHeight,
    backgroundColor: colors.accent,
  };

  return (
    <View
      style={[styles.chompWrap, { width: geometry.width, height: size }]}
      testID="chomping-loader"
    >
      {/* Dots come first so the jaws paint over them: a dot is covered by the
          closing mouth rather than fading out on top of it. */}
      {dotProgress.map((progress, index) => (
        <Animated.View
          key={index}
          testID="chomping-loader-dot"
          style={{
            position: "absolute",
            top: geometry.dotTop,
            left: geometry.dotLeft,
            width: geometry.dotSize,
            height: geometry.dotSize,
            borderRadius: geometry.dotSize / 2,
            backgroundColor: colors.accentSoft,
            opacity: progress.interpolate({
              inputRange: [0, 0.1, 0.97, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [geometry.runway, 0],
                }),
              },
            ],
          }}
        />
      ))}
      <Animated.View
        testID="chomping-loader-jaw"
        style={[
          jaw,
          {
            top: 0,
            borderTopLeftRadius: geometry.radius,
            borderTopRightRadius: geometry.radius,
            transform: [
              { translateY: geometry.pivotOffset },
              {
                rotate: clock.interpolate({
                  inputRange: JAW_INPUT,
                  outputRange: JAW_TOP_OUTPUT,
                }),
              },
              { translateY: -geometry.pivotOffset },
            ],
          },
        ]}
      />
      <Animated.View
        testID="chomping-loader-jaw"
        style={[
          jaw,
          {
            top: size - geometry.halfHeight,
            borderBottomLeftRadius: geometry.radius,
            borderBottomRightRadius: geometry.radius,
            transform: [
              { translateY: -geometry.pivotOffset },
              {
                rotate: clock.interpolate({
                  inputRange: JAW_INPUT,
                  outputRange: JAW_BOTTOM_OUTPUT,
                }),
              },
              { translateY: geometry.pivotOffset },
            ],
          },
        ]}
      />
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
      <ChompingLoader size={20} />
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

/** Slim banner for a refresh that runs *behind* already-visible content: the
 *  posts on screen stay readable and swipeable while new ones are fetched, so
 *  a sync never takes the screen away from the user. */
export function BackgroundSyncBanner({
  label = "Fetching new posts in the background…",
  progress,
}: {
  label?: string;
  progress?: FeedRefreshProgress | null;
}) {
  const { colors } = useTheme();
  const total = progress?.total ?? 0;
  return (
    <View
      style={[
        styles.syncBanner,
        {
          borderBottomColor: colors.inkFaint,
          backgroundColor: colors.paperWarm,
        },
      ]}
      testID="background-sync-banner"
    >
      <ChompingLoader />
      <Text style={[styles.syncBannerText, { color: colors.inkSoft }]}>
        {label}
      </Text>
      {/* Counts rather than a bar: the banner sits in a tight single-line
          strip above live content, and RefreshProgressBar's track is a fixed
          200px that would overflow it on narrow screens. */}
      {total > 0 ? (
        <Text style={[styles.syncBannerCount, { color: colors.inkSoft }]}>
          {progress?.completed ?? 0}/{total}
        </Text>
      ) : null}
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
  chompWrap: {
    position: "relative",
  },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  syncBannerText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    flexShrink: 1,
  },
  syncBannerCount: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    marginLeft: "auto",
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
