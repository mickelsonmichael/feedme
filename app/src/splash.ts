import * as SplashScreen from "expo-splash-screen";

// Hold the native splash until the Feed screen has something to show, so a
// cold start goes splash → posts instead of splash → blank paper → posts. The
// first local read waits on the database opening, which a plain-paper hold
// (FeedListScreen's INITIAL_LOAD_GRACE_MS) used to cover with an empty screen.
//
// The hold is capped: if the Feed screen never reports in (a crash caught by
// the error boundary, a launch that lands somewhere else), the splash still
// lifts on its own rather than leaving the app looking frozen.
export const SPLASH_MAX_HOLD_MS = 2_500;

let released = false;

SplashScreen.setOptions({ duration: 200, fade: true });
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (e.g. after a Fast Refresh) — nothing to hold.
});
const fallbackTimer = setTimeout(releaseSplash, SPLASH_MAX_HOLD_MS);

/** Lifts the native splash. Safe to call any number of times. */
export function releaseSplash(): void {
  if (released) return;
  released = true;
  clearTimeout(fallbackTimer);
  SplashScreen.hideAsync().catch(() => {});
}
