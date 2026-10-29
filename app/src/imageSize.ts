import { Image } from "expo-image";
import { MAX_EXPANDED_IMAGE_EDGE } from "./expandedImageSize";

export type ImageSize = { width: number; height: number };
/** A measured size, or "failed" when the image couldn't be decoded. */
export type CachedImageSize = ImageSize | "failed";

// Memoised per URL for the app's lifetime, so revisiting a post or recycling a
// row onto it never measures the same image twice.
const sizeCache = new Map<string, CachedImageSize>();
const inflight = new Map<string, Promise<CachedImageSize>>();

/** The size already known for `url`, if any — for a first render that can
 *  skip the loading placeholder entirely. */
export function getKnownImageSize(url: string): CachedImageSize | undefined {
  return sizeCache.get(url);
}

/**
 * Measures an image through expo-image, the same pipeline (and on Android,
 * the same Glide disk cache) that later displays it.
 *
 * This used to be React Native's `Image.getSize`, which on Android downloads
 * the entire file through Fresco — a separate cache from expo-image's — so
 * every post image crossed the network twice: once to learn its shape, once
 * to show it.
 *
 * The decode is capped at the largest edge the app ever displays. A bigger
 * source is scaled down with its aspect ratio intact, and the layout caps it
 * at that same edge anyway (getExpandedImageSize), so the box comes out the
 * same while the decode costs a fraction of the memory.
 */
export function measureImage(url: string): Promise<CachedImageSize> {
  const cached = sizeCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = Image.loadAsync(
    { uri: url },
    { maxWidth: MAX_EXPANDED_IMAGE_EDGE, maxHeight: MAX_EXPANDED_IMAGE_EDGE }
  )
    .then((ref): CachedImageSize => {
      const size: CachedImageSize =
        ref.width > 0 && ref.height > 0
          ? { width: ref.width, height: ref.height }
          : "failed";
      // Only the dimensions were wanted; let the native bitmap go now
      // rather than whenever the garbage collector gets to it.
      ref.release?.();
      return size;
    })
    .catch((): CachedImageSize => "failed")
    .then((size) => {
      sizeCache.set(url, size);
      inflight.delete(url);
      return size;
    });
  inflight.set(url, promise);
  return promise;
}

/** Forgets every measured size. For tests. */
export function resetImageSizeCache(): void {
  sizeCache.clear();
  inflight.clear();
}
