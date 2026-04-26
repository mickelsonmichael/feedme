import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  extractRedditGalleryUrl,
  fetchRedditGalleryImageUrls,
} from "../redditGallery";
import { proxiedImageUrl } from "../proxyFetch";
import { useTheme } from "../context/ThemeContext";
import {
  extractYouTubeVideoId,
  extractYouTubeVideoIdFromThumbnailUrl,
  getYouTubeEmbedUrl,
} from "../youtubeUtils";
import { MAX_EXPANDED_IMAGE_EDGE } from "../expandedImageSize";
import { radii, spacing } from "../theme";
import { ExpandedFeedImage } from "./ExpandedFeedImage";

const GALLERY_MIN_EDGE = 480;

type Props = {
  itemUrl?: string | null;
  imageUrl?: string | null;
  content?: string | null;
  imageAlignment?: "flex-start" | "center";
  testID?: string;
  blur?: boolean;
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
  useProxy = false,
}: Props) {
  const { colors } = useTheme();
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
    setIsLoadingGallery(true);
    setActiveGalleryIndex(0);

    fetchRedditGalleryImageUrls(redditGalleryUrl, useProxy)
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
  }, [redditGalleryUrl, useProxy]);

  useEffect(() => {
    if (!galleryImageUrls?.length) {
      return;
    }

    let active = true;

    Image.getSize(
      galleryImageUrls[0],
      (width, height) => {
        if (!active) {
          return;
        }
        if (width > 0 && height > 0) {
          const scale = Math.min(
            1,
            MAX_EXPANDED_IMAGE_EDGE / width,
            MAX_EXPANDED_IMAGE_EDGE / height
          );
          setGalleryContainerSize({
            width: Math.max(GALLERY_MIN_EDGE, Math.round(width * scale)),
            height: Math.max(GALLERY_MIN_EDGE, Math.round(height * scale)),
          });
        } else {
          setGalleryContainerSize({
            width: GALLERY_MIN_EDGE,
            height: GALLERY_MIN_EDGE,
          });
        }
      },
      () => {
        if (!active) {
          return;
        }
        setGalleryContainerSize({
          width: GALLERY_MIN_EDGE,
          height: GALLERY_MIN_EDGE,
        });
      }
    );

    return () => {
      active = false;
    };
  }, [galleryImageUrls]);

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

    // On web, render a single controlled slide with navigation buttons placed
    // beside the image (not overlaid), and no ScrollView.
    if (Platform.OS === "web") {
      return (
        <View style={{ alignSelf: imageAlignment }}>
          <View style={styles.galleryRow}>
            {galleryImageUrls.length > 1 ? (
              <TouchableOpacity
                accessibilityLabel="Previous gallery image"
                disabled={activeGalleryIndex === 0}
                onPress={() => scrollToGalleryIndex(activeGalleryIndex - 1)}
                style={[
                  styles.galleryControlButton,
                  {
                    backgroundColor: colors.paperWarm,
                    borderColor: colors.border,
                    opacity: activeGalleryIndex === 0 ? 0.45 : 0.96,
                  },
                ]}
                testID={testID ? `${testID}-previous` : undefined}
              >
                <Feather name="chevron-left" size={18} color={colors.ink} />
              </TouchableOpacity>
            ) : null}
            <View
              style={{ width: slideW, height: slideH }}
              testID={testID}
              accessibilityLabel="Reddit gallery"
            >
              <Image
                source={{ uri: galleryImageUrls[activeGalleryIndex] }}
                style={styles.galleryImage}
                resizeMode="contain"
                blurRadius={blur ? 14 : 0}
                testID={
                  testID ? `${testID}-image-${activeGalleryIndex}` : undefined
                }
              />
            </View>
            {galleryImageUrls.length > 1 ? (
              <TouchableOpacity
                accessibilityLabel="Next gallery image"
                disabled={activeGalleryIndex === galleryImageUrls.length - 1}
                onPress={() => scrollToGalleryIndex(activeGalleryIndex + 1)}
                style={[
                  styles.galleryControlButton,
                  {
                    backgroundColor: colors.paperWarm,
                    borderColor: colors.border,
                    opacity:
                      activeGalleryIndex === galleryImageUrls.length - 1
                        ? 0.45
                        : 0.96,
                  },
                ]}
                testID={testID ? `${testID}-next` : undefined}
              >
                <Feather name="chevron-right" size={18} color={colors.ink} />
              </TouchableOpacity>
            ) : null}
          </View>
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
              style={{ width: slideW, height: slideH }}
            >
              <Image
                source={{ uri: galleryImageUrl }}
                style={styles.galleryImage}
                resizeMode="contain"
                blurRadius={blur ? 14 : 0}
                testID={testID ? `${testID}-image-${index}` : undefined}
              />
            </View>
          ))}
        </ScrollView>
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
});
