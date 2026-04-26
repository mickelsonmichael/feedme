import React, { useCallback, useEffect, useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
  getExpandedImageSize,
  MAX_EXPANDED_IMAGE_EDGE,
} from "../expandedImageSize";
import { radii } from "../theme";

type Props = {
  imageUrl: string;
  testID?: string;
};

export function ExpandedFeedImage({ imageUrl, testID }: Props) {
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const [sourceSize, setSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [didMetadataLookupFail, setDidMetadataLookupFail] = useState(false);

  useEffect(() => {
    let active = true;

    setSourceSize(null);
    setDidMetadataLookupFail(false);
    Image.getSize(
      imageUrl,
      (width, height) => {
        if (!active) {
          return;
        }

        if (width <= 0 || height <= 0) {
          setDidMetadataLookupFail(true);
          return;
        }

        setSourceSize({ width, height });
      },
      () => {
        if (active) {
          setDidMetadataLookupFail(true);
        }
      }
    );

    return () => {
      active = false;
    };
  }, [imageUrl]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContentWidth((prev) =>
      prev !== null && Math.abs(prev - nextWidth) < 1 ? prev : nextWidth
    );
  }, []);

  const constrainedSize =
    sourceSize === null || contentWidth === null
      ? null
      : getExpandedImageSize(sourceSize.width, sourceSize.height, contentWidth);
  const fallbackBoxSize =
    contentWidth === null
      ? null
      : Math.max(1, Math.min(contentWidth, MAX_EXPANDED_IMAGE_EDGE));

  return (
    <View
      style={styles.wrapper}
      onLayout={handleLayout}
      testID={testID ? `${testID}-wrapper` : undefined}
    >
      <Image
        source={{ uri: imageUrl }}
        style={[
          styles.image,
          constrainedSize ??
            (didMetadataLookupFail && fallbackBoxSize !== null
              ? {
                  width: fallbackBoxSize,
                  height: fallbackBoxSize,
                }
              : styles.pendingImage),
        ]}
        resizeMode="contain"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
  },
  image: {
    alignSelf: "flex-start",
    borderRadius: radii.sm,
  },
  pendingImage: {
    width: 1,
    height: 1,
    opacity: 0,
  },
});
