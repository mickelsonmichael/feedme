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
export function FeedIcon({ feedUrl, size = 16 }: Props) {
  const { colors } = useTheme();
  const iconUri = React.useMemo(
    () => (feedUrl ? getFeedIconUrl(feedUrl) : null),
    [feedUrl]
  );
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [iconUri]);

  if (!iconUri || failed) {
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
        source={{ uri: iconUri }}
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
