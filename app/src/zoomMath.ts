// Geometry for the fullscreen image viewer's gestures. Pure functions, all
// worklets, so the gestures can call them on the UI thread and tests can call
// them directly.
//
// The image view fills the screen. Its transform is
// `[{ translateX }, { translateY }, { scale }]`, so a point `p` of the image
// (measured from the view's centre) lands on screen at `centre + t + s·p`.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const DOUBLE_TAP_ZOOM = 2.5;

/** How far a swipe-down at normal zoom has to travel to close the viewer. */
export const DISMISS_DISTANCE = 120;
/** …or how fast it has to be moving when the finger lifts. */
export const DISMISS_VELOCITY = 900;

export function clampZoom(scale: number): number {
  "worklet";
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/**
 * The translation that keeps the image point under `focal` fixed while the
 * zoom changes from `fromScale` to `toScale` — so a pinch zooms into the
 * spot between the fingers rather than into the middle of the screen.
 * `focal` and `fromTranslate` are measured from the view's centre.
 */
export function translateForZoom(
  focal: number,
  fromTranslate: number,
  fromScale: number,
  toScale: number
): number {
  "worklet";
  return focal - (toScale / fromScale) * (focal - fromTranslate);
}

/**
 * Keeps a zoomed image covering the view: it can be panned until its edge
 * meets the view's edge, and no further. At 1× there is nothing to pan.
 */
export function clampTranslate(
  translate: number,
  scale: number,
  viewSize: number
): number {
  "worklet";
  const limit = Math.max(0, (viewSize * scale - viewSize) / 2);
  return Math.min(limit, Math.max(-limit, translate));
}

/** Whether a swipe at normal zoom should close the viewer. */
export function shouldDismiss(
  translationY: number,
  velocityY: number
): boolean {
  "worklet";
  return (
    Math.abs(translationY) > DISMISS_DISTANCE ||
    Math.abs(velocityY) > DISMISS_VELOCITY
  );
}

/** Backdrop opacity while the image is being dragged away, fading out over
 *  about twice the dismiss distance. */
export function dismissBackdropOpacity(translationY: number): number {
  "worklet";
  return Math.max(0, 1 - Math.abs(translationY) / (DISMISS_DISTANCE * 2.5));
}
