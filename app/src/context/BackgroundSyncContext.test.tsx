import React from "react";
import renderer, { act } from "react-test-renderer";
import {
  BackgroundSyncProvider,
  useBackgroundSync,
  useBackgroundSyncActions,
  useBackgroundSyncing,
  useBackgroundSyncProgress,
} from "./BackgroundSyncContext";

const progressOf = (completed: number, total = 4) => ({
  total,
  completed,
  loading: total - completed,
  succeeded: completed,
  failed: 0,
  skipped: 0,
});

function renderWithProbes() {
  const renders = { syncingReader: 0, progressReader: 0 };
  let actions!: ReturnType<typeof useBackgroundSyncActions>;
  let latest!: ReturnType<typeof useBackgroundSync>;

  const SyncingReader = React.memo(function SyncingReader() {
    useBackgroundSyncing();
    renders.syncingReader += 1;
    return null;
  });
  const ProgressReader = React.memo(function ProgressReader() {
    useBackgroundSyncProgress();
    renders.progressReader += 1;
    return null;
  });
  const Writer = React.memo(function Writer() {
    actions = useBackgroundSyncActions();
    latest = useBackgroundSync();
    return null;
  });

  act(() => {
    renderer.create(
      <BackgroundSyncProvider>
        <SyncingReader />
        <ProgressReader />
        <Writer />
      </BackgroundSyncProvider>
    );
  });

  return { renders, actions: () => actions, latest: () => latest };
}

describe("BackgroundSyncContext", () => {
  it("does not re-render a syncing-only reader when progress ticks", () => {
    // Arrange
    const { renders, actions } = renderWithProbes();
    act(() => actions().setSyncing(true));
    const before = renders.syncingReader;

    // Act — a sync reporting each of its feeds in turn.
    act(() => actions().setProgress(progressOf(1)));
    act(() => actions().setProgress(progressOf(2)));
    act(() => actions().setProgress(progressOf(3)));

    // Assert
    expect(renders.syncingReader).toBe(before);
  });

  it("re-renders a progress reader once per changed count", () => {
    // Arrange
    const { renders, actions } = renderWithProbes();
    const before = renders.progressReader;

    // Act — the second call repeats the same counts.
    act(() => actions().setProgress(progressOf(1)));
    act(() => actions().setProgress(progressOf(1)));
    act(() => actions().setProgress(progressOf(2)));

    // Assert
    expect(renders.progressReader - before).toBe(2);
  });

  it("keeps the setters referentially stable across updates", () => {
    // Arrange
    const { actions } = renderWithProbes();
    const first = actions();

    // Act
    act(() => first.setSyncing(true));
    act(() => first.setProgress(progressOf(1)));

    // Assert
    expect(actions().setSyncing).toBe(first.setSyncing);
    expect(actions().setProgress).toBe(first.setProgress);
  });

  it("still exposes the combined state for components that show all of it", () => {
    // Arrange
    const { actions, latest } = renderWithProbes();

    // Act
    act(() => actions().setSyncing(true));
    act(() => actions().setProgress(progressOf(3)));

    // Assert
    expect(latest().syncing).toBe(true);
    expect(latest().progress).toEqual(progressOf(3));
  });
});
