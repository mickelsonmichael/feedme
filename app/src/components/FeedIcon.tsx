import React from "react";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getFeedIconUrl } from "../feedIcon";
import { useTheme } from "../context/ThemeContext";

type Props = {
  feedUrl: string | null | undefined;
  size?: number;
};

/**
 * Small favicon-style feed icon. Shows a placeholder glyph while the
 * favicon loads so switching feeds doesn't leave a blank gap. Renders
 * nothing if no URL is derivable or the image fails to load.
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
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [iconUri]);

  if (!iconUri || !source || failed) {
    return null;
  }

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
        transition={80}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
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
