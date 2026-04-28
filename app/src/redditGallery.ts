import { fetchWithProxyFallback } from "./proxyFetch";

type JsonRecord = Record<string, unknown>;

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

export async function fetchRedditGalleryImageUrls(
  galleryUrl: string,
  forceProxy?: boolean
): Promise<string[]> {
  const postId = extractRedditPostIdFromUrl(galleryUrl);
  if (!postId) {
    return [];
  }

  const { response } = await fetchWithProxyFallback(
    `https://www.reddit.com/comments/${postId}.json?raw_json=1`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)",
        Accept: "application/json",
      },
    },
    forceProxy
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as unknown;
  const postData = getPostData(payload);
  if (!postData || !isRecord(postData.media_metadata)) {
    return [];
  }

  return getGalleryItemMediaIds(postData)
    .map((mediaId) =>
      getGalleryImageUrl(postData.media_metadata as JsonRecord, mediaId)
    )
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
}
