import React from "react";

import type { FeedRefreshProgress } from "../feedRefresher";

type BackgroundSyncActions = {
  setSyncing: (value: boolean) => void;
  setProgress: (value: FeedRefreshProgress | null) => void;
};

type BackgroundSyncContextValue = BackgroundSyncActions & {
  /** True while a deferred refresh is running behind the cached posts. */
  syncing: boolean;
  /** Per-feed completed/total counts, or null when no refresh is running. */
  progress: FeedRefreshProgress | null;
};

const NOOP_ACTIONS: BackgroundSyncActions = {
  setSyncing: () => {},
  setProgress: () => {},
};

// Three contexts rather than one, so each consumer re-renders only for what it
// reads. Progress ticks once per feed during a sync; with a single context
// every one of those ticks re-rendered FeedListScreen — the whole feed — even
// though it only writes progress and reads `syncing`. The defaults are no-ops
// so screens rendered outside the provider (unit tests mounting FeedListScreen
// directly) report "not syncing" instead of crashing.
const ActionsContext = React.createContext<BackgroundSyncActions>(NOOP_ACTIONS);
const SyncingContext = React.createContext(false);
const ProgressContext = React.createContext<FeedRefreshProgress | null>(null);

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

  const actions = React.useMemo<BackgroundSyncActions>(
    () => ({
      setSyncing: (value) =>
        setSyncingState((prev) => (prev === value ? prev : value)),
      setProgress: (value) =>
        setProgressState((prev) => {
          if (prev === value) return prev;
          // onProgress fires once per feed, so bail out on equal counts rather
          // than re-rendering the banner for text that didn't change.
          if (
            prev &&
            value &&
            prev.completed === value.completed &&
            prev.total === value.total
          ) {
            return prev;
          }
          return value;
        }),
    }),
    []
  );

  return (
    <ActionsContext.Provider value={actions}>
      <SyncingContext.Provider value={syncing}>
        <ProgressContext.Provider value={progress}>
          {children}
        </ProgressContext.Provider>
      </SyncingContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The stable setters. Never causes a re-render on its own. */
export function useBackgroundSyncActions(): BackgroundSyncActions {
  return React.useContext(ActionsContext);
}

/** Whether a deferred refresh is running. Re-renders only when it flips. */
export function useBackgroundSyncing(): boolean {
  return React.useContext(SyncingContext);
}

/** Per-feed progress. Re-renders on every completed feed — read it only in
 *  the small components that display it. */
export function useBackgroundSyncProgress(): FeedRefreshProgress | null {
  return React.useContext(ProgressContext);
}

/** Everything at once, for components that show the whole sync state. */
export function useBackgroundSync(): BackgroundSyncContextValue {
  const actions = useBackgroundSyncActions();
  const syncing = useBackgroundSyncing();
  const progress = useBackgroundSyncProgress();
  return { ...actions, syncing, progress };
}
