import React from "react";
import { Image } from "expo-image";
import { StyleSheet } from "react-native";
import { getFeedIconUrl } from "../feedIcon";

type Props = {
  feedUrl: string | null | undefined;
  size?: number;
};

/** Small favicon-style feed icon. Renders nothing if no URL is derivable or the image fails to load. */
export function FeedIcon({ feedUrl, size = 16 }: Props) {
  const iconUri = React.useMemo(
    () => (feedUrl ? getFeedIconUrl(feedUrl) : null),
    [feedUrl]
  );
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [iconUri]);

  if (!iconUri || failed) {
    return null;
  }

  return (
    <Image
      source={{ uri: iconUri }}
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 4 },
      ]}
      cachePolicy="memory-disk"
      transition={80}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
