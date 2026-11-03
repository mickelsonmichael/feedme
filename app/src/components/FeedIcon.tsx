import React from "react";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Feather } from "@react-native-vector-icons/feather";
import { getFeedIconUrl } from "../feedIcon";
import { useTheme } from "../context/ThemeContext";

type Props = {
  feedUrl: string | null | undefined;
  size?: number;
};

// What each icon URL did the last time it was shown, for the life of the app.
// Without this every mount started from scratch: the placeholder glyph held
// the slot, then a dead favicon removed it and the byline jumped sideways —
// on every post from that feed, every time the reader swiped onto one.
const failedIconUris = new Set<string>();
const loadedIconUris = new Set<string>();

/** Forgets every remembered icon outcome. For tests. */
export function resetFeedIconOutcomes(): void {
  failedIconUris.clear();
  loadedIconUris.clear();
}

/**
 * Small favicon-style feed icon. Shows a placeholder glyph while the
 * favicon loads so switching feeds doesn't leave a blank gap. Renders
 * nothing if no URL is derivable or the image fails to load — and, once an
 * icon is known to fail, renders nothing from the first frame on.
 */
function FeedIconImpl({ feedUrl, size = 16 }: Props) {
  const { colors } = useTheme();
  const iconUri = React.useMemo(
    () => (feedUrl ? getFeedIconUrl(feedUrl) : null),
    [feedUrl]
  );
  // Held stable across renders. expo-image treats a new `source` object as a
  // new image and replays `transition`, so passing an object literal here
  // makes the favicon visibly re-fade on every render of the post around it
  // — even though the bitmap never left the cache.
  const source = React.useMemo(
    () => (iconUri ? { uri: iconUri } : null),
    [iconUri]
  );
  // What this instance has seen its icon do, tagged with the URL it was for.
  // Held as state rather than re-read from the sets above on a forced
  // re-render: the render has to depend on it, or the React Compiler (which
  // treats module-level values as constant) replays the pre-load output.
  const [learned, setLearned] = React.useState<{
    uri: string;
    status: "loaded" | "failed";
  } | null>(null);

  if (!iconUri || !source) {
    return null;
  }
  const status =
    learned?.uri === iconUri
      ? learned.status
      : failedIconUris.has(iconUri)
        ? "failed"
        : loadedIconUris.has(iconUri)
          ? "loaded"
          : "pending";
  if (status === "failed") {
    return null;
  }
  const loaded = status === "loaded";

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {!loaded ? (
        <Feather
          name="rss"
          size={size * 0.75}
          color={colors.inkFaint}
          style={styles.placeholder}
        />
      ) : null}
      <Image
        key={iconUri}
        source={source}
        style={[
          styles.icon,
          { width: size, height: size, borderRadius: size / 4 },
        ]}
        cachePolicy="memory-disk"
        transition={loaded ? null : 80}
        onLoad={() => {
          if (loaded) return;
          loadedIconUris.add(iconUri);
          setLearned({ uri: iconUri, status: "loaded" });
        }}
        onError={() => {
          failedIconUris.add(iconUri);
          setLearned({ uri: iconUri, status: "failed" });
        }}
      />
    </View>
  );
}

// Memoised on top of the stable source above: `feedUrl` is a plain string, so
// the icon is skipped entirely when the post around it re-renders (a swipe
// flipping isActive/isLive, a mark-as-read write landing) rather than
// re-running its load-and-fade.
export const FeedIcon = React.memo(FeedIconImpl);

const styles = StyleSheet.create({
  container: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    position: "absolute",
  },
  icon: {
    flexShrink: 0,
  },
});
