import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import {
  extractRedditGalleryUrl,
  fetchRedditGalleryImageUrls,
  fetchRedditGalleryImageUrlsCached,
} from "../redditGallery";
import { extractGifEmbedUrl } from "../gifUtils";
import { proxiedImageUrl } from "../proxyFetch";
import { useTheme } from "../context/ThemeContext";
import {
  extractYouTubeVideoId,
  extractYouTubeVideoIdFromThumbnailUrl,
  getYouTubeEmbedUrl,
} from "../youtubeUtils";
import { MAX_EXPANDED_IMAGE_EDGE } from "../expandedImageSize";
import { fontSize, fonts, NSFW_BLUR_FILTER_STYLE, NSFW_BLUR_RADIUS, radii, spacing } from "../theme";
import { ExpandedFeedImage } from "./ExpandedFeedImage";

type Props = {
  itemUrl?: string | null;
  imageUrl?: string | null;
  content?: string | null;
  imageAlignment?: "flex-start" | "center";
  testID?: string;
  blur?: boolean;
  nsfw?: boolean;
  deferGalleryLoad?: boolean;
  deferGifLoad?: boolean;
  useProxy?: boolean;
};

/**
 * Renders embedded media for expanded/post views.
 * For YouTube entries, this embeds the playable video.
 * For all other entries, it falls back to the expanded image.
 */
export function ExpandedFeedMedia({
  itemUrl,
  imageUrl,
  content,
  imageAlignment = "flex-start",
  testID,
  blur = false,
  nsfw = false,
  deferGalleryLoad = true,
  deferGifLoad = false,
  useProxy = false,
}: Props) {
  const { colors } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const maxGalleryWidth = Math.max(1, viewportWidth - spacing.lg * 2);
  const galleryScrollRef = useRef<ScrollView | null>(null);
  const [galleryImageUrls, setGalleryImageUrls] = useState<string[] | null>(
    null
  );
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [galleryContainerSize, setGalleryContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [hasRequestedGalleryLoad, setHasRequestedGalleryLoad] =
    useState(!deferGalleryLoad);
  const [hasRequestedGifLoad, setHasRequestedGifLoad] = useState(!deferGifLoad);
  const youtubeVideoId = useMemo(
    () =>
      extractYouTubeVideoId(itemUrl) ??
      extractYouTubeVideoIdFromThumbnailUrl(imageUrl),
    [itemUrl, imageUrl]
  );
  const redditGalleryUrl = useMemo(
    () => extractRedditGalleryUrl(itemUrl, content),
    [itemUrl, content]
  );
  const gifEmbedUrl = useMemo(() => extractGifEmbedUrl(itemUrl), [itemUrl]);
  const shouldLoadGallery =
    Boolean(redditGalleryUrl) && hasRequestedGalleryLoad;

  useEffect(() => {
    setHasRequestedGalleryLoad(!deferGalleryLoad);
  }, [deferGalleryLoad, redditGalleryUrl]);

  useEffect(() => {
    setHasRequestedGifLoad(!deferGifLoad);
  }, [deferGifLoad, gifEmbedUrl]);

  useEffect(() => {
    let active = true;

    if (!redditGalleryUrl) {
      setGalleryImageUrls(null);
      setGalleryContainerSize(null);
      setIsLoadingGallery(false);
      return () => {
        active = false;
      };
    }

    setGalleryImageUrls(null);
    setGalleryContainerSize(null);
    // Only show the loading spinner when the user has actually requested
    // the carousel; otherwise the placeholder owns the visible UI and the
    // fetch is just resolving the preview image.
    setIsLoadingGallery(shouldLoadGallery);
    setActiveGalleryIndex(0);

    const fetcher = shouldLoadGallery
      ? fetchRedditGalleryImageUrls
      : fetchRedditGalleryImageUrlsCached;
    fetcher(redditGalleryUrl, useProxy)
      .then((urls) => {
        if (!active) {
          return;
        }

        const proxiedUrls = urls
          .map((url) => proxiedImageUrl(url, useProxy))
          .filter((url): url is string => Boolean(url));
        setGalleryImageUrls(proxiedUrls.length ? proxiedUrls : null);
        setIsLoadingGallery(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setGalleryImageUrls(null);
        setIsLoadingGallery(false);
      });

    return () => {
      active = false;
    };
  }, [redditGalleryUrl, shouldLoadGallery, useProxy]);

  useEffect(() => {
    if (!galleryImageUrls?.length) {
      return;
    }

    let active = true;
    const url = galleryImageUrls[0];

    const apply = (width: number, height: number) => {
      if (!active) return;
      if (width > 0 && height > 0) {
        const scale = Math.min(
          1,
          MAX_EXPANDED_IMAGE_EDGE / width,
          MAX_EXPANDED_IMAGE_EDGE / height
        );

        const scaledWidth = Math.max(1, Math.round(width * scale));
        const scaledHeight = Math.max(1, Math.round(height * scale));
        const viewportScale = Math.min(1, maxGalleryWidth / scaledWidth);

        setGalleryContainerSize({
          width: Math.max(1, Math.round(scaledWidth * viewportScale)),
          height: Math.max(1, Math.round(scaledHeight * viewportScale)),
        });
      } else {
        setGalleryContainerSize({
          width: maxGalleryWidth,
          height: maxGalleryWidth,
        });
      }
    };

    RNImage.getSize(
      url,
      (w, h) => apply(w, h),
      () => {
        if (!active) return;
        setGalleryContainerSize({
          width: maxGalleryWidth,
          height: maxGalleryWidth,
        });
      }
    );

    return () => {
      active = false;
    };
  }, [galleryImageUrls, maxGalleryWidth]);

  const handleGalleryMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const slideWidth = galleryContainerSize?.width;
      if (!slideWidth) {
        return;
      }

      const nextIndex = Math.round(
        event.nativeEvent.contentOffset.x / slideWidth
      );
      setActiveGalleryIndex(nextIndex);
    },
    [galleryContainerSize]
  );

  const scrollToGalleryIndex = useCallback(
    (nextIndex: number) => {
      const totalImages = galleryImageUrls?.length ?? 0;
      if (!totalImages) {
        return;
      }

      const boundedIndex = Math.max(0, Math.min(nextIndex, totalImages - 1));
      setActiveGalleryIndex(boundedIndex);

      const slideWidth = galleryContainerSize?.width;
      if (!slideWidth) {
        return;
      }

      galleryScrollRef.current?.scrollTo({
        x: boundedIndex * slideWidth,
        y: 0,
        animated: true,
      });
    },
    [galleryImageUrls, galleryContainerSize]
  );

  if (gifEmbedUrl && !hasRequestedGifLoad) {
    const previewUri = imageUrl ? proxiedImageUrl(imageUrl, useProxy) : null;
    // When the parent is rendering its own reveal overlay (blur=true), skip
    // the placeholder pill so we don't stack two redundant CTAs.
    const showPlaceholderPill = !blur;
    return (
      <View style={styles.previewWrap}>
        {previewUri ? (
          <View
            style={[
              styles.previewBlurClip,
              nsfw && blur ? NSFW_BLUR_FILTER_STYLE : null,
            ]}
          >
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              blurRadius={nsfw && blur ? NSFW_BLUR_RADIUS : 0}
              autoplay={false}
              transition={120}
              testID={testID ? `${testID}-preview` : undefined}
            />
          </View>
        ) : null}
        <TouchableOpacity
          style={[
            previewUri ? styles.placeholderOverlay : styles.galleryPlaceholder,
            previewUri || !showPlaceholderPill
              ? null
              : {
                  borderColor: colors.border,
                  backgroundColor: colors.paperWarm,
                },
          ]}
          onPress={() => setHasRequestedGifLoad(true)}
          activeOpacity={0.85}
          accessibilityLabel="Load GIF"
          testID={testID}
        >
          {showPlaceholderPill ? (
            <View
              style={[
                styles.placeholderPill,
                { backgroundColor: `${colors.ink}d9` },
              ]}
            >
              <Feather name="film" size={18} color={colors.paper} />
              <Text style={[styles.placeholderPillTitle, { color: colors.paper }]}>
                Load GIF
              </Text>
              <Text
                style={[
                  styles.placeholderPillSubtle,
                  { color: colors.paper },
                ]}
              >
                {nsfw ? "NSFW GIF. Tap to load." : "Tap to load GIF."}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  }

  if (gifEmbedUrl) {
    if (Platform.OS === "web") {
      return (
        <View
          style={styles.videoContainer}
          testID={testID}
          accessibilityLabel="Embedded GIF"
        >
          <iframe
            src={gifEmbedUrl}
            title="Embedded GIF"
            style={styles.iframe as unknown as React.CSSProperties}
            allow="autoplay"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </View>
      );
    }

    const { WebView } =
      require("react-native-webview") as typeof import("react-native-webview");
    return (
      <View
        style={styles.videoContainer}
        testID={testID}
        accessibilityLabel="Embedded GIF"
      >
        <WebView
          source={{ uri: gifEmbedUrl }}
          style={styles.video}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          testID={testID ? `${testID}-webview` : undefined}
        />
      </View>
    );
  }

  if (youtubeVideoId) {
    if (Platform.OS === "web") {
      return (
        <View
          style={styles.videoContainer}
          testID={testID}
          accessibilityLabel="Embedded YouTube video"
        >
          <iframe
            src={getYouTubeEmbedUrl(youtubeVideoId)}
            title="YouTube video"
            style={styles.iframe as unknown as React.CSSProperties}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </View>
      );
    }

    const { WebView } =
      require("react-native-webview") as typeof import("react-native-webview");
    return (
      <View
        style={styles.videoContainer}
        testID={testID}
        accessibilityLabel="Embedded YouTube video"
      >
        <WebView
          source={{ uri: getYouTubeEmbedUrl(youtubeVideoId) }}
          style={styles.video}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          testID={testID ? `${testID}-webview` : undefined}
        />
      </View>
    );
  }

  if (redditGalleryUrl && !shouldLoadGallery) {
    const previewUri =
      galleryImageUrls?.[0] ??
      (imageUrl ? proxiedImageUrl(imageUrl, useProxy) : null);
    // When the parent is rendering its own reveal overlay (blur=true), skip
    // the placeholder pill so we don't stack two redundant CTAs.
    const showPlaceholderPill = !blur;
    return (
      <View style={styles.previewWrap}>
        {previewUri ? (
          <View
            style={[
              styles.previewBlurClip,
              nsfw && blur ? NSFW_BLUR_FILTER_STYLE : null,
            ]}
          >
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              blurRadius={nsfw && blur ? NSFW_BLUR_RADIUS : 0}
              autoplay={false}
              transition={120}
              testID={testID ? `${testID}-preview` : undefined}
            />
          </View>
        ) : null}
        <TouchableOpacity
          style={[
            previewUri ? styles.placeholderOverlay : styles.galleryPlaceholder,
            previewUri || !showPlaceholderPill
              ? null
              : {
                  borderColor: colors.border,
                  backgroundColor: colors.paperWarm,
                },
          ]}
          onPress={() => setHasRequestedGalleryLoad(true)}
          activeOpacity={0.85}
          accessibilityLabel="Load Images"
        >
          {showPlaceholderPill ? (
            <View
              style={[
                styles.placeholderPill,
                { backgroundColor: `${colors.ink}d9` },
              ]}
            >
              <Feather name="image" size={18} color={colors.paper} />
              <Text style={[styles.placeholderPillTitle, { color: colors.paper }]}>
                Load Images
              </Text>
              <Text
                style={[
                  styles.placeholderPillSubtle,
                  { color: colors.paper },
                ]}
              >
                {nsfw ? "NSFW gallery. Tap to load." : "Tap to load gallery images."}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  }

  if (galleryImageUrls?.length) {
    if (!galleryContainerSize) {
      return (
        <View
          style={styles.galleryLoadingState}
          testID={testID}
          accessibilityLabel="Loading Reddit gallery"
        >
          <ActivityIndicator />
        </View>
      );
    }

    const { width: slideW, height: slideH } = galleryContainerSize;

    const galleryDots =
      galleryImageUrls.length > 1 ? (
        <View style={styles.galleryDots}>
          {galleryImageUrls.map((galleryImageUrl, index) => (
            <View
              key={`${galleryImageUrl}:dot:${index}`}
              style={[
                styles.galleryDot,
                {
                  backgroundColor:
                    index === activeGalleryIndex ? colors.ink : colors.inkFaint,
                },
              ]}
              testID={testID ? `${testID}-dot-${index}` : undefined}
            />
          ))}
        </View>
      ) : null;

    // On web, render a single controlled slide with overlaid edge controls.
    if (Platform.OS === "web") {
      return (
        <View
          style={[
            styles.galleryContainer,
            { width: slideW, height: slideH, alignSelf: imageAlignment },
          ]}
          testID={testID}
          accessibilityLabel="Reddit gallery"
        >
          <View
            style={[
              { width: slideW, height: slideH },
              styles.galleryBlurClip,
              blur ? NSFW_BLUR_FILTER_STYLE : null,
            ]}
          >
            <Image
              source={{ uri: galleryImageUrls[activeGalleryIndex] }}
              style={styles.galleryImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
              transition={120}
              testID={
                testID ? `${testID}-image-${activeGalleryIndex}` : undefined
              }
            />
          </View>
          {galleryImageUrls.length > 1 ? (
            <>
              <TouchableOpacity
                accessibilityLabel="Previous gallery image"
                disabled={activeGalleryIndex === 0}
                onPress={() => scrollToGalleryIndex(activeGalleryIndex - 1)}
                style={[
                  styles.mobileGalleryControlButton,
                  styles.mobileGalleryControlLeft,
                  {
                    backgroundColor: `${colors.ink}cc`,
                    borderColor: colors.paper,
                    opacity: activeGalleryIndex === 0 ? 0.35 : 0.95,
                  },
                ]}
                testID={testID ? `${testID}-previous` : undefined}
              >
                <Feather name="chevron-left" size={18} color={colors.paper} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel="Next gallery image"
                disabled={activeGalleryIndex === galleryImageUrls.length - 1}
                onPress={() => scrollToGalleryIndex(activeGalleryIndex + 1)}
                style={[
                  styles.mobileGalleryControlButton,
                  styles.mobileGalleryControlRight,
                  {
                    backgroundColor: `${colors.ink}cc`,
                    borderColor: colors.paper,
                    opacity:
                      activeGalleryIndex === galleryImageUrls.length - 1
                        ? 0.35
                        : 0.95,
                  },
                ]}
                testID={testID ? `${testID}-next` : undefined}
              >
                <Feather name="chevron-right" size={18} color={colors.paper} />
              </TouchableOpacity>
            </>
          ) : null}
          {galleryDots}
        </View>
      );
    }

    return (
      <View
        style={[
          styles.galleryContainer,
          { width: slideW, height: slideH, alignSelf: imageAlignment },
        ]}
        testID={testID}
        accessibilityLabel="Reddit gallery"
      >
        <ScrollView
          ref={galleryScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleGalleryMomentumEnd}
          testID={testID ? `${testID}-carousel` : undefined}
        >
          {galleryImageUrls.map((galleryImageUrl, index) => (
            <View
              key={`${galleryImageUrl}:${index}`}
              style={[
                { width: slideW, height: slideH },
                styles.galleryBlurClip,
                blur ? NSFW_BLUR_FILTER_STYLE : null,
              ]}
            >
              <Image
                source={{ uri: galleryImageUrl }}
                style={styles.galleryImage}
                contentFit="contain"
                cachePolicy="memory-disk"
                blurRadius={blur ? NSFW_BLUR_RADIUS : 0}
                transition={120}
                testID={testID ? `${testID}-image-${index}` : undefined}
              />
            </View>
          ))}
        </ScrollView>
        {galleryImageUrls.length > 1 ? (
          <>
            <TouchableOpacity
              accessibilityLabel="Previous gallery image"
              disabled={activeGalleryIndex === 0}
              onPress={() => scrollToGalleryIndex(activeGalleryIndex - 1)}
              style={[
                styles.mobileGalleryControlButton,
                styles.mobileGalleryControlLeft,
                {
                  backgroundColor: `${colors.ink}cc`,
                  borderColor: colors.paper,
                  opacity: activeGalleryIndex === 0 ? 0.35 : 0.95,
                },
              ]}
              testID={testID ? `${testID}-previous` : undefined}
            >
              <Feather name="chevron-left" size={18} color={colors.paper} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Next gallery image"
              disabled={activeGalleryIndex === galleryImageUrls.length - 1}
              onPress={() => scrollToGalleryIndex(activeGalleryIndex + 1)}
              style={[
                styles.mobileGalleryControlButton,
                styles.mobileGalleryControlRight,
                {
                  backgroundColor: `${colors.ink}cc`,
                  borderColor: colors.paper,
                  opacity:
                    activeGalleryIndex === galleryImageUrls.length - 1
                      ? 0.35
                      : 0.95,
                },
              ]}
              testID={testID ? `${testID}-next` : undefined}
            >
              <Feather name="chevron-right" size={18} color={colors.paper} />
            </TouchableOpacity>
          </>
        ) : null}
        {galleryDots}
      </View>
    );
  }

  if (isLoadingGallery) {
    return (
      <View
        style={styles.galleryLoadingState}
        testID={testID}
        accessibilityLabel="Loading Reddit gallery"
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (imageUrl) {
    return (
      <ExpandedFeedImage
        imageUrl={imageUrl}
        alignment={imageAlignment}
        testID={testID}
        blur={blur}
        useProxy={useProxy}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  videoContainer: {
    alignSelf: "center",
    width: "100%",
    maxWidth: MAX_EXPANDED_IMAGE_EDGE,
    maxHeight: MAX_EXPANDED_IMAGE_EDGE,
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
  },
  video: {
    flex: 1,
    backgroundColor: "#000",
  },
  iframe: {
    borderWidth: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  galleryContainer: {
    overflow: "hidden",
  },
  mobileGalleryControlButton: {
    position: "absolute",
    top: "50%",
    marginTop: -44,
    width: 24,
    height: 88,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 4,
  },
  mobileGalleryControlLeft: {
    left: 0,
  },
  mobileGalleryControlRight: {
    right: 0,
  },
  galleryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  galleryImage: {
    flex: 1,
  },
  galleryDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  galleryDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  galleryControlButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryLoadingState: {
    alignSelf: "center",
    width: "100%",
    maxWidth: MAX_EXPANDED_IMAGE_EDGE,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryPlaceholder: {
    alignSelf: "center",
    width: "100%",
    maxWidth: MAX_EXPANDED_IMAGE_EDGE,
    borderWidth: 1,
    borderRadius: radii.md,
    borderStyle: "dashed",
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  galleryPlaceholderTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "600",
  },
  galleryPlaceholderSubtle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    textAlign: "center",
  },
  previewWrap: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: MAX_EXPANDED_IMAGE_EDGE,
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: radii.md,
    position: "relative",
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewBlurClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  galleryBlurClip: {
    overflow: "hidden",
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderPill: {
    flexDirection: "column",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    gap: spacing.xs,
  },
  placeholderPillTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    fontWeight: "700",
  },
  placeholderPillSubtle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.meta,
    textAlign: "center",
    opacity: 0.85,
  },
});
