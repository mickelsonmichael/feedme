export const SINGLE_SWIPE_DISTANCE_THRESHOLD = 60;
export const SINGLE_SWIPE_VELOCITY_THRESHOLD = 800;

export type SingleSwipeDirection = "previous" | "next" | null;

export function resolveSingleSwipeDirection(
  translationX: number,
  translationY: number,
  velocityX: number
): SingleSwipeDirection {
  if (Math.abs(translationX) < Math.abs(translationY)) {
    return null;
  }

  const passesDistance =
    Math.abs(translationX) > SINGLE_SWIPE_DISTANCE_THRESHOLD;
  const passesVelocity = Math.abs(velocityX) > SINGLE_SWIPE_VELOCITY_THRESHOLD;

  if (!passesDistance && !passesVelocity) {
    return null;
  }

  return translationX < 0 ? "next" : "previous";
}
