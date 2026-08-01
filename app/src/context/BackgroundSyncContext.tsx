import React from "react";

import type { FeedRefreshProgress } from "../feedRefresher";

type BackgroundSyncContextValue = {
  /** True while a deferred refresh is running behind the cached posts. */
  syncing: boolean;
  setSyncing: (value: boolean) => void;
  /** Per-feed completed/total counts, or null when no refresh is running. */
  progress: FeedRefreshProgress | null;
  setProgress: (value: FeedRefreshProgress | null) => void;
};

const BackgroundSyncContext = React.createContext<
  BackgroundSyncContextValue | undefined
>(undefined);

/**
 * Holds background-sync state above the tab navigator.
 *
 * The sync itself is owned by FeedListScreen, but the banner has to outlive
 * that screen's visibility: switching to Feeds/Discover/Settings must not make
 * an in-flight refresh look like it stopped. Lifting the state here lets the
 * navigator render one banner for every tab while the Feed screen stays the
 * only writer.
 */
export function BackgroundSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [syncing, setSyncingState] = React.useState(false);
  const [progress, setProgressState] =
    React.useState<FeedRefreshProgress | null>(null);

  const setSyncing = React.useCallback((value: boolean) => {
    setSyncingState((prev) => (prev === value ? prev : value));
  }, []);

  const setProgress = React.useCallback((value: FeedRefreshProgress | null) => {
    setProgressState((prev) => {
      if (prev === value) return prev;
      // onProgress fires once per feed, so bail out on equal counts rather than
      // re-rendering every tab 44 times for a banner whose text didn't change.
      if (
        prev &&
        value &&
        prev.completed === value.completed &&
        prev.total === value.total
      ) {
        return prev;
      }
      return value;
    });
  }, []);

  const value = React.useMemo(
    () => ({ syncing, setSyncing, progress, setProgress }),
    [syncing, setSyncing, progress, setProgress]
  );

  return (
    <BackgroundSyncContext.Provider value={value}>
      {children}
    </BackgroundSyncContext.Provider>
  );
}

export function useBackgroundSync(): BackgroundSyncContextValue {
  const context = React.useContext(BackgroundSyncContext);
  if (!context) {
    // Default no-op so screens rendered outside the provider (e.g. unit tests
    // mounting FeedListScreen directly) don't crash. Reports "not syncing".
    return {
      syncing: false,
      setSyncing: () => {},
      progress: null,
      setProgress: () => {},
    };
  }
  return context;
}
