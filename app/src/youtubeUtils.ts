/**
 * Converts a raw user-supplied value into a full YouTube channel URL.
 * Accepts any of:
 *   - A plain channel handle:          "atrioc"
 *   - An @-prefixed handle:            "@atrioc"
 *   - A channel ID:                    "UCgv4dPk_qZNAbUW9WkuLPSA"
 *   - A full youtube.com channel URL:  "https://www.youtube.com/@atrioc"
 *   - A full youtube.com /c/ URL:      "https://www.youtube.com/c/atrioc"
 *   - A full youtube.com /channel/ URL:"https://www.youtube.com/channel/UCgv4dPk_qZNAbUW9WkuLPSA"
 * Whitespace is trimmed automatically.
 *
 * Example: getYouTubeChannelUrl("atrioc") → "https://www.youtube.com/@atrioc"
 * Example: getYouTubeChannelUrl("UCgv4dPk_qZNAbUW9WkuLPSA") → "https://www.youtube.com/channel/UCgv4dPk_qZNAbUW9WkuLPSA"
 */
export function getYouTubeChannelUrl(rawValue: string): string {
  const trimmed = rawValue.trim();

  // Already a full URL — ensure https
  if (trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:\/\//, "https://");
  }

  // Looks like a channel ID (starts with "UC" and is 24 chars)
  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }

  // @-prefixed handle
  if (trimmed.startsWith("@")) {
    return `https://www.youtube.com/${trimmed}`;
  }

  // Plain handle — prepend @
  return `https://www.youtube.com/@${trimmed}`;
}

/**
 * Parses the raw HTML of a YouTube channel page and extracts the RSS feed URL
 * from the embedded <link rel="alternate" type="application/rss+xml"> element.
 *
 * Returns the feed URL string, or null if no such link is found.
 *
 * Example return value:
 *   "https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA"
 */
export function extractYouTubeRssFeedUrl(html: string): string | null {
  // First, isolate any <link> tag that contains type="application/rss+xml"
  const tagMatch = html.match(/<link[^>]+type="application\/rss\+xml"[^>]*>/i);
  if (!tagMatch) return null;

  // Then extract the href attribute from that tag
  const hrefMatch = tagMatch[0].match(/href="([^"]+)"/i);
  return hrefMatch ? hrefMatch[1] : null;
}

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  );
}

function normalizeVideoId(videoId: string | null | undefined): string | null {
  if (!videoId) return null;
  const trimmed = videoId.trim();
  return YOUTUBE_VIDEO_ID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Extracts a YouTube video ID from common YouTube URL variants.
 * Examples:
 *   - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   - https://youtu.be/dQw4w9WgXcQ
 *   - https://www.youtube.com/shorts/dQw4w9WgXcQ
 *   - https://www.youtube.com/embed/dQw4w9WgXcQ
 */
export function extractYouTubeVideoId(
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (!isYouTubeHost(url.hostname)) return null;

    if (url.hostname.toLowerCase().includes("youtu.be")) {
      return normalizeVideoId(url.pathname.slice(1).split("/")[0]);
    }

    if (url.pathname === "/watch") {
      return normalizeVideoId(url.searchParams.get("v"));
    }

    const pathMatch = url.pathname.match(
      /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/i
    );
    if (pathMatch) {
      return normalizeVideoId(pathMatch[1]);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a YouTube video ID from standard YouTube thumbnail URLs.
 * Example: https://i4.ytimg.com/vi/_4DUW_RsbFw/hqdefault.jpg
 */
export function extractYouTubeVideoIdFromThumbnailUrl(
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl) return null;
  const match = rawUrl.match(/\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i);
  if (!match) return null;
  return normalizeVideoId(match[1]);
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}
