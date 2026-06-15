import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  LayoutChangeEvent,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import {
  getExpandedImageSize,
  MAX_EXPANDED_IMAGE_EDGE,
} from "../expandedImageSize";
import { proxiedImageUrl } from "../proxyFetch";
import { NSFW_BLUR_FILTER_STYLE, NSFW_BLUR_RADIUS, radii } from "../theme";
import { useTheme } from "../context/ThemeContext";
import { FullscreenImageModal } from "./FullscreenImageModal";

const PLACEHOLDER_HEIGHT = 200;

// Module-level memoization for `Image.getSize` so revisiting an item or
// re-rendering a row in the list doesn't re-issue a network HEAD per image.
type CachedSize = { width: number; height: number } | "failed";
const imageSizeCache = new Map<string, CachedSize>();
const inflightImageSizes = new Map<string, Promise<CachedSize>>();

function getCachedImageSize(url: string): Promise<CachedSize> {
  const cached = imageSizeCache.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = inflightImageSizes.get(url);
  if (inflight) return inflight;
  const promise = new Promise<CachedSize>((resolve) => {
    RNImage.getSize(
      url,
      (width, height) => {
        const result: CachedSize =
          width > 0 && height > 0 ? { width, height } : "failed";
        imageSizeCache.set(url, result);
        inflightImageSizes.delete(url);
        resolve(result);
      },
      () => {
        imageSizeCache.set(url, "failed");
        inflightImageSizes.delete(url);
        resolve("failed");
      }
    );
  });
  inflightImageSizes.set(url, promise);
  return promise;
}

type Props = {
  imageUrl: string;
  alignment?: "flex-start" | "center";
  testID?: string;
  blur?: boolean;
  useProxy?: boolean;
};

export function ExpandedFeedImage({
  imageUrl,
  alignment = "flex-start",
  testID,
  blur = false,
  useProxy = false,
}: Props) {
  const resolvedImageUrl = proxiedImageUrl(imageUrl, useProxy);
  const { colors } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const [sourceSize, setSourceSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [didMetadataLookupFail, setDidMetadataLookupFail] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  useEffect(() => {
    let active = true;

    const cached = imageSizeCache.get(resolvedImageUrl);
    if (cached) {
      if (cached === "failed") {
        setSourceSize(null);
        setDidMetadataLookupFail(true);
        setIsLoadingMetadata(false);
      } else {
        setSourceSize(cached);
        setDidMetadataLookupFail(false);
        setIsLoadingMetadata(false);
      }
      return () => {
        active = false;
      };
    }

    setSourceSize(null);
    setDidMetadataLookupFail(false);
    setIsLoadingMetadata(true);
    getCachedImageSize(resolvedImageUrl).then((result) => {
      if (!active) return;
      if (result === "failed") {
        setDidMetadataLookupFail(true);
        setIsLoadingMetadata(false);
        return;
      }
      setSourceSize(result);
      setIsLoadingMetadata(false);
    });

    return () => {
      active = false;
    };
  }, [resolvedImageUrl]);

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
      {isLoadingMetadata ? (
        <View
          style={[styles.placeholder, { backgroundColor: colors.inkFaint }]}
          testID={testID ? `${testID}-placeholder` : undefined}
        >
          <ActivityIndicator color={colors.inkSoft} />
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setIsFullscreen(true)}
          accessibilityLabel="View image fullscreen"
          testID={testID ? `${testID}-tap` : undefined}
        >
          <View
            style={[styles.imageBlurWrap, blur ? NSFW_BLUR_FILTER_STYLE : null]}
          >
            <Image
              source={{ uri: resolvedImageUrl }}
              blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
              style={[
                styles.image,
                alignment === "center"
                  ? styles.centeredImage
                  : styles.leftAlignedImage,
                constrainedSize ??
                  (didMetadataLookupFail && fallbackBoxSize !== null
                    ? {
                        width: fallbackBoxSize,
                        height: fallbackBoxSize,
                      }
                    : styles.pendingImage),
              ]}
              contentFit="contain"
              cachePolicy="memory-disk"
              autoplay={blur ? false : undefined}
              transition={120}
              testID={testID}
            />
          </View>
        </TouchableOpacity>
      )}
      <FullscreenImageModal
        visible={isFullscreen}
        imageUrl={resolvedImageUrl}
        blur={blur}
        onClose={() => setIsFullscreen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
  },
  imageBlurWrap: {
    overflow: "hidden",
    borderRadius: radii.sm,
    alignSelf: "stretch",
  },
  image: {
    borderRadius: radii.sm,
  },
  leftAlignedImage: {
    alignSelf: "flex-start",
  },
  centeredImage: {
    alignSelf: "center",
  },
  pendingImage: {
    width: 1,
    height: 1,
    opacity: 0,
  },
  placeholder: {
    alignSelf: "stretch",
    height: PLACEHOLDER_HEIGHT,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
