import { Platform } from "react-native";
import { fetchWithProxyFallback } from "./proxyFetch";

type JsonRecord = Record<string, unknown>;

export type RedditVideoMedia = {
  // Direct MP4 fallback URL (works in <video> on web and WebView on native).
  mp4Url: string;
  // HLS playlist URL (preferred on native; gracefully falls back to mp4).
  hlsUrl: string | null;
  // Poster image URL to display before the user taps play.
  posterUrl: string | null;
  width: number;
  height: number;
};

export type RedditPostMedia = {
  images: string[];
  video: RedditVideoMedia | null;
};

// Use a realistic browser User-Agent on native. Reddit's JSON endpoints return
// 403/429 to obvious bot UAs (including any UA containing app/library names),
// so we identify as a recent Chrome build like a normal browser would.
const NATIVE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class RedditFetchError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Reddit request failed with HTTP ${status}`);
    this.name = "RedditFetchError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function ensureUrlHasScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function isRedditHostname(hostname: string): boolean {
  return hostname === "reddit.com" || hostname.endsWith(".reddit.com");
}

function decodeRedditImageUrl(url: string): string {
  return url.replace(/&amp;/g, "&");
}

function getPostData(payload: unknown): JsonRecord | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const listing = payload[0];
  if (!isRecord(listing)) {
    return null;
  }

  const data = listing.data;
  if (!isRecord(data) || !Array.isArray(data.children)) {
    return null;
  }

  const firstChild = data.children[0];
  if (!isRecord(firstChild) || !isRecord(firstChild.data)) {
    return null;
  }

  return firstChild.data;
}

function getGalleryItemMediaIds(postData: JsonRecord): string[] {
  const galleryData = postData.gallery_data;
  if (!isRecord(galleryData) || !Array.isArray(galleryData.items)) {
    return [];
  }

  return galleryData.items
    .map((item) => {
      if (!isRecord(item) || typeof item.media_id !== "string") {
        return null;
      }

      return item.media_id;
    })
    .filter((mediaId): mediaId is string => Boolean(mediaId));
}

function getGalleryImageUrl(
  mediaMetadata: JsonRecord,
  mediaId: string
): string | null {
  const item = mediaMetadata[mediaId];
  if (!isRecord(item) || !isRecord(item.s)) {
    return null;
  }

  const source = item.s;
  const candidates = [source.u, source.gif, source.mp4];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return decodeRedditImageUrl(candidate);
    }
  }

  return null;
}

function getGalleryImages(postData: JsonRecord): string[] {
  if (!isRecord(postData.media_metadata)) {
    return [];
  }

  return getGalleryItemMediaIds(postData)
    .map((mediaId) =>
      getGalleryImageUrl(postData.media_metadata as JsonRecord, mediaId)
    )
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
}

function getRedditVideoPayload(postData: JsonRecord): JsonRecord | null {
  for (const key of ["secure_media", "media"]) {
    const container = postData[key];
    if (isRecord(container) && isRecord(container.reddit_video)) {
      return container.reddit_video;
    }
  }

  // Crossposted videos live on the parent post.
  const crosspost = postData.crosspost_parent_list;
  if (Array.isArray(crosspost) && crosspost.length > 0) {
    const parent = crosspost[0];
    if (isRecord(parent)) {
      return getRedditVideoPayload(parent);
    }
  }

  return null;
}

function getPostThumbnailUrl(postData: JsonRecord): string | null {
  const preview = postData.preview;
  if (isRecord(preview) && Array.isArray(preview.images)) {
    const first = preview.images[0];
    if (isRecord(first) && isRecord(first.source)) {
      const url = first.source.url;
      if (typeof url === "string" && url.trim()) {
        return decodeRedditImageUrl(url);
      }
    }
  }

  const thumbnail = postData.thumbnail;
  if (typeof thumbnail === "string" && /^https?:\/\//i.test(thumbnail)) {
    return thumbnail;
  }

  return null;
}

function getVideoMedia(postData: JsonRecord): RedditVideoMedia | null {
  const payload = getRedditVideoPayload(postData);
  if (!payload) {
    return null;
  }

  const fallbackUrl = payload.fallback_url;
  if (typeof fallbackUrl !== "string" || !fallbackUrl.trim()) {
    return null;
  }

  const hls = typeof payload.hls_url === "string" ? payload.hls_url : null;
  const width = typeof payload.width === "number" ? payload.width : 0;
  const height = typeof payload.height === "number" ? payload.height : 0;
  // The fallback URL often contains a query string `?source=fallback` which
  // doesn't load reliably in all WebView/<video> contexts — strip it.
  const cleanMp4 = fallbackUrl.split("?")[0];

  return {
    mp4Url: cleanMp4,
    hlsUrl: hls,
    posterUrl: getPostThumbnailUrl(postData),
    width,
    height,
  };
}

export function extractRedditPostIdFromUrl(
  url: string | null | undefined
): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(ensureUrlHasScheme(url));
    if (!isRedditHostname(parsedUrl.hostname.toLowerCase())) {
      return null;
    }

    const pathSegments = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);

    const galleryIndex = pathSegments.indexOf("gallery");
    if (galleryIndex >= 0) {
      return pathSegments[galleryIndex + 1] ?? null;
    }

    const commentsIndex = pathSegments.indexOf("comments");
    if (commentsIndex >= 0) {
      return pathSegments[commentsIndex + 1] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

export function extractRedditGalleryUrl(
  itemUrl?: string | null,
  content?: string | null
): string | null {
  const galleryMatch = content?.match(
    /(?:https?:\/\/)?(?:(?:www|old)\.)?reddit\.com\/gallery\/([a-z0-9]+)(?:[/?#][^\s"'<>]*)?/i
  );
  if (galleryMatch?.[1]) {
    return `https://www.reddit.com/gallery/${galleryMatch[1].toLowerCase()}`;
  }

  const galleryPostId = itemUrl?.includes("/gallery/")
    ? extractRedditPostIdFromUrl(itemUrl)
    : null;

  return galleryPostId
    ? `https://www.reddit.com/gallery/${galleryPostId}`
    : null;
}

/**
 * Returns a canonical `https://www.reddit.com/comments/{id}` URL when the
 * provided post might host playable Reddit video media. Detection is based on
 * markers in the feed content (a `v.redd.it` link or an inline `<video>` tag)
 * combined with a Reddit comments URL on the item. Galleries are excluded —
 * those are handled by `extractRedditGalleryUrl`.
 */
export function extractRedditVideoPostUrl(
  itemUrl?: string | null,
  content?: string | null
): string | null {
  if (extractRedditGalleryUrl(itemUrl, content)) {
    return null;
  }

  const hasVideoMarker =
    typeof content === "string" &&
    (/v\.redd\.it\//i.test(content) || /<video[\s>]/i.test(content));

  if (!hasVideoMarker) {
    return null;
  }

  const postId = extractRedditPostIdFromUrl(itemUrl);
  if (!postId) {
    return null;
  }

  return `https://www.reddit.com/comments/${postId}`;
}

// Process-level cache to avoid duplicate Reddit API calls when the same
// post is requested by multiple components (e.g. compact thumbnail +
// expanded carousel/video stage). Cached promises are reused once resolved.
const postMediaCache = new Map<string, Promise<RedditPostMedia>>();

export function clearRedditGalleryCache(): void {
  postMediaCache.clear();
}

export function fetchRedditPostMediaCached(
  postUrl: string,
  forceProxy?: boolean
): Promise<RedditPostMedia> {
  const cacheKey = `${postUrl}|${forceProxy ? "1" : "0"}`;
  const cached = postMediaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = fetchRedditPostMedia(postUrl, forceProxy).catch((error) => {
    // Do not cache failures so a future attempt can retry.
    postMediaCache.delete(cacheKey);
    throw error;
  });
  postMediaCache.set(cacheKey, promise);
  return promise;
}

export async function fetchRedditPostMedia(
  postUrl: string,
  forceProxy?: boolean
): Promise<RedditPostMedia> {
  const postId = extractRedditPostIdFromUrl(postUrl);
  if (!postId) {
    return { images: [], video: null };
  }

  // On web, setting a custom User-Agent triggers a CORS preflight (OPTIONS),
  // which we skip — the proxy worker sets its own UA when it forwards the
  // request, and direct browser fetches use the browser's own UA. We only
  // need this header on native runtimes.
  const init: RequestInit | undefined =
    Platform.OS === "web"
      ? undefined
      : { headers: { "User-Agent": NATIVE_USER_AGENT } };

  const { response } = await fetchWithProxyFallback(
    `https://www.reddit.com/comments/${postId}.json?raw_json=1`,
    init,
    forceProxy
  );

  if (!response.ok) {
    // If a direct-from-Reddit request was rejected (e.g. 403/429 from a UA
    // block), retry once via the proxy which presents a different UA and
    // origin to Reddit. This keeps web/native happy without surfacing a
    // transient error to the user.
    if (!forceProxy) {
      const { response: retried } = await fetchWithProxyFallback(
        `https://www.reddit.com/comments/${postId}.json?raw_json=1`,
        init,
        true
      );
      if (retried.ok) {
        return parseRedditPostJson(await retried.json());
      }
      throw new RedditFetchError(retried.status);
    }
    throw new RedditFetchError(response.status);
  }

  return parseRedditPostJson(await response.json());
}

function parseRedditPostJson(payload: unknown): RedditPostMedia {
  const postData = getPostData(payload);
  if (!postData) {
    return { images: [], video: null };
  }

  return {
    images: getGalleryImages(postData),
    video: getVideoMedia(postData),
  };
}

export function fetchRedditGalleryImageUrlsCached(
  galleryUrl: string,
  forceProxy?: boolean
): Promise<string[]> {
  return fetchRedditPostMediaCached(galleryUrl, forceProxy).then(
    (media) => media.images
  );
}

export async function fetchRedditGalleryImageUrls(
  galleryUrl: string,
  forceProxy?: boolean
): Promise<string[]> {
  const media = await fetchRedditPostMedia(galleryUrl, forceProxy);
  return media.images;
}
