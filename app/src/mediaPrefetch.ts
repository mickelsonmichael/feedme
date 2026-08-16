import { Image } from "expo-image";
import {
  extractRedditGalleryUrl,
  extractRedditVideoPostUrl,
  fetchRedditPostMediaCached,
} from "./redditGallery";
import { extractGifEmbedUrl, extractGifEmbedUrlFromContent } from "./gifUtils";
import {
  extractYouTubeVideoId,
  extractYouTubeVideoIdFromThumbnailUrl,
} from "./youtubeUtils";
import { proxiedImageUrl } from "./proxyFetch";
import { primeImageSizeCache } from "./components/ExpandedFeedImage";
import { getFeedIconUrl } from "./feedIcon";

// How many posts ahead of the active single-view index get their media
// warmed. Post text/HTML is already local (read from SQLite up front), so
// this is the only thing that can still stall a swipe.
export const SINGLE_VIEW_PREFETCH_AHEAD = 3;

export type PrefetchableItem = {
  url?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  feedUrl?: string | null;
  useProxy?: boolean;
};

/**
 * Warms the same caches ExpandedFeedMedia/ExpandedFeedImage read from
 * (postMediaCache, imageSizeCache, expo-image's own disk cache) for a post
 * that isn't on screen yet. Fire-and-forget — callers don't need the result,
 * only the side effect of having the data ready by the time the user swipes
 * there. Mirrors the media-type detection/priority in ExpandedFeedMedia.
 */
export function prefetchItemMedia(item: PrefetchableItem): void {
  const useProxy = item.useProxy ?? false;
  const thumbnailUrl = item.imageUrl
    ? proxiedImageUrl(item.imageUrl, useProxy)
    : null;

  if (thumbnailUrl) {
    Image.prefetch(thumbnailUrl, "memory-disk").catch(() => {});
  }

  // Warmed unconditionally (ahead of the type-specific branches below) since
  // the feed icon renders regardless of what kind of media the post has.
  const iconUrl = item.feedUrl ? getFeedIconUrl(item.feedUrl) : null;
  if (iconUrl) {
    Image.prefetch(iconUrl, "memory-disk").catch(() => {});
  }

  const gifEmbedUrl =
    extractGifEmbedUrl(item.url) ?? extractGifEmbedUrlFromContent(item.content);
  const youtubeVideoId =
    extractYouTubeVideoId(item.url) ??
    extractYouTubeVideoIdFromThumbnailUrl(item.imageUrl);
  if (gifEmbedUrl || youtubeVideoId) {
    // These render as an embedded WebView/iframe page rather than a
    // fetchable asset — the thumbnail prefetch above is all we can warm.
    return;
  }

  const redditPostUrl =
    extractRedditGalleryUrl(item.url, item.content) ??
    extractRedditVideoPostUrl(item.url, item.content);
  if (redditPostUrl) {
    fetchRedditPostMediaCached(redditPostUrl, useProxy)
      .then((media) => {
        const firstImage = media.images[0]
          ? proxiedImageUrl(media.images[0], useProxy)
          : null;
        if (firstImage) {
          Image.prefetch(firstImage, "memory-disk").catch(() => {});
        }
        const posterUrl = media.video?.posterUrl
          ? proxiedImageUrl(media.video.posterUrl, useProxy)
          : null;
        if (posterUrl) {
          Image.prefetch(posterUrl, "memory-disk").catch(() => {});
        }
      })
      .catch(() => {
        // Non-critical — the real ExpandedFeedMedia fetch will retry on view.
      });
    return;
  }

  if (thumbnailUrl) {
    primeImageSizeCache(thumbnailUrl);
  }
}
