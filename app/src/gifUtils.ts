/**
 * Extracts the video ID from a Redgifs URL.
 * Supports:
 *   - https://www.redgifs.com/watch/{id}
 *   - https://redgifs.com/watch/{id}
 * Returns the ID, or null if not a Redgifs watch URL.
 *
 * Example: extractRedgifsId("https://www.redgifs.com/watch/TightGif") → "TightGif"
 */
export function extractRedgifsId(
  url: string | null | undefined
): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "redgifs.com" && hostname !== "www.redgifs.com") {
      return null;
    }
    const match = parsed.pathname.match(/^\/watch\/([a-z0-9]+)$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Returns the embed URL for a Redgifs video ID.
 *
 * Example: getRedgifsEmbedUrl("TightGif") → "https://www.redgifs.com/ifr/TightGif"
 */
export function getRedgifsEmbedUrl(id: string): string {
  return `https://www.redgifs.com/ifr/${id}`;
}

/**
 * Extracts the GIF ID from a Giphy URL.
 * Supports:
 *   - https://giphy.com/gifs/{slug}-{id}
 *   - https://giphy.com/clips/{slug}-{id}
 *   - https://media.giphy.com/media/{id}/giphy.gif
 * Returns the ID, or null if not a recognised Giphy URL.
 *
 * Example: extractGiphyId("https://giphy.com/gifs/cat-jumping-xT9IgG50Lg7KXYNX8I") → "xT9IgG50Lg7KXYNX8I"
 */
export function extractGiphyId(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith("giphy.com")) {
      return null;
    }

    // media.giphy.com/media/{id}/...
    const mediaMatch = parsed.pathname.match(/^\/media\/([a-z0-9]+)\//i);
    if (mediaMatch) {
      return mediaMatch[1];
    }

    // giphy.com/gifs/{slug}-{id} or /clips/{slug}-{id}
    // The ID is the last dash-delimited token (or the full slug if no dash)
    const slugMatch = parsed.pathname.match(
      /^\/(?:gifs|clips)\/(?:[^/]+-)?([a-z0-9]+)\/?$/i
    );
    if (slugMatch) {
      return slugMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the embed URL for a Giphy GIF ID.
 *
 * Example: getGiphyEmbedUrl("xT9IgG50Lg7KXYNX8I") → "https://giphy.com/embed/xT9IgG50Lg7KXYNX8I"
 */
export function getGiphyEmbedUrl(id: string): string {
  return `https://giphy.com/embed/${id}`;
}

/**
 * Returns the embed URL for a GIF-hosting post (Redgifs or Giphy), or null
 * if the URL is not from a recognised GIF host.
 */
export function extractGifEmbedUrl(
  url: string | null | undefined
): string | null {
  const redgifsId = extractRedgifsId(url);
  if (redgifsId) {
    return getRedgifsEmbedUrl(redgifsId);
  }

  const giphyId = extractGiphyId(url);
  if (giphyId) {
    return getGiphyEmbedUrl(giphyId);
  }

  return null;
}
