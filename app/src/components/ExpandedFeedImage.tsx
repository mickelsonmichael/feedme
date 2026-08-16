import React, { useCallback, useEffect, useMemo, useState } from "react";
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

// Warms imageSizeCache for a URL that isn't rendered yet (see mediaPrefetch),
// so ExpandedFeedImage finds a cache hit and skips its loading placeholder
// once the item is actually swiped into view.
export function primeImageSizeCache(url: string): void {
  void getCachedImageSize(url);
}

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

function ExpandedFeedImageImpl({
  imageUrl,
  alignment = "flex-start",
  testID,
  blur = false,
  useProxy = false,
}: Props) {
  const resolvedImageUrl = proxiedImageUrl(imageUrl, useProxy);
  // Held stable across renders. expo-image treats a new `source` object as a
  // new image and replays `transition`, so an object literal here makes the
  // post image visibly re-fade whenever anything around it re-renders — which
  // reads as the image reloading on every swipe, despite it being cached.
  const source = useMemo(() => ({ uri: resolvedImageUrl }), [resolvedImageUrl]);
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

  // The box the image will occupy, or null while it is still unknown.
  const boxSize =
    constrainedSize ??
    (didMetadataLookupFail && fallbackBoxSize !== null
      ? { width: fallbackBoxSize, height: fallbackBoxSize }
      : null);

  // Keep the placeholder up until the box is known, and mount <Image> only
  // then. Rendering it at a stand-in size first is not merely a cosmetic
  // flicker: expo-image hands Glide the view's measured size as the decode
  // target, and Glide never re-decodes at a larger size when the view later
  // grows. A single frame at 1x1 therefore permanently pinned the post to a
  // one-pixel bitmap, which `contentFit="contain"` then stretched into a
  // square patch of flat colour — the "image is a blank colour or blurry"
  // report. It needs both `sourceSize` and `contentWidth`, and those arrive
  // from independent sources (a network/cache lookup, and layout), so
  // whichever loses the race must not be papered over with a fake size.
  const showPlaceholder = isLoadingMetadata || boxSize === null;

  return (
    <View
      style={styles.wrapper}
      onLayout={handleLayout}
      testID={testID ? `${testID}-wrapper` : undefined}
    >
      {showPlaceholder ? (
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
              key={resolvedImageUrl}
              source={source}
              blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
              style={[
                styles.image,
                alignment === "center"
                  ? styles.centeredImage
                  : styles.leftAlignedImage,
                boxSize,
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

// Memoised: every prop is a primitive, so the image is skipped entirely when
// the post around it re-renders (a swipe flipping isActive/isLive, a
// mark-as-read write landing) instead of re-running its load-and-fade.
export const ExpandedFeedImage = React.memo(ExpandedFeedImageImpl);

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
  placeholder: {
    alignSelf: "stretch",
    height: PLACEHOLDER_HEIGHT,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
