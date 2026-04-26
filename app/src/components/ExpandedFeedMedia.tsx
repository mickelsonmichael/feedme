import React, { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  extractYouTubeVideoId,
  extractYouTubeVideoIdFromThumbnailUrl,
  getYouTubeEmbedUrl,
} from "../youtubeUtils";
import { MAX_EXPANDED_IMAGE_EDGE } from "../expandedImageSize";
import { ExpandedFeedImage } from "./ExpandedFeedImage";

type Props = {
  itemUrl?: string | null;
  imageUrl?: string | null;
  imageAlignment?: "flex-start" | "center";
  testID?: string;
};

/**
 * Renders embedded media for expanded/post views.
 * For YouTube entries, this embeds the playable video.
 * For all other entries, it falls back to the expanded image.
 */
export function ExpandedFeedMedia({
  itemUrl,
  imageUrl,
  imageAlignment = "flex-start",
  testID,
}: Props) {
  const youtubeVideoId = useMemo(
    () =>
      extractYouTubeVideoId(itemUrl) ??
      extractYouTubeVideoIdFromThumbnailUrl(imageUrl),
    [itemUrl, imageUrl]
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

  if (imageUrl) {
    return (
      <ExpandedFeedImage
        imageUrl={imageUrl}
        alignment={imageAlignment}
        testID={testID}
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
});
