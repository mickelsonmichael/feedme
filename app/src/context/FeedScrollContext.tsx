import React from "react";

type FeedScrollActions = {
  setIsFeedScrolled: (value: boolean) => void;
  /** The current value, for event handlers that must not re-render on it. */
  getIsFeedScrolled: () => boolean;
};

const NOOP_ACTIONS: FeedScrollActions = {
  setIsFeedScrolled: () => {},
  getIsFeedScrolled: () => false,
};

// Split like BackgroundSyncContext: the Feed screen writes this on scroll and
// the tab navigator reads it in a tabPress handler, and neither should
// re-render when it flips — only the tab icon/label that display it. The
// defaults are no-ops so components rendered outside the provider (e.g. tests)
// treat the feed as unscrolled instead of crashing.
const ActionsContext = React.createContext<FeedScrollActions>(NOOP_ACTIONS);
const ScrolledContext = React.createContext(false);

export function FeedScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isFeedScrolled, setIsFeedScrolledState] = React.useState(false);
  const isFeedScrolledRef = React.useRef(false);

  const actions = React.useMemo<FeedScrollActions>(
    () => ({
      setIsFeedScrolled: (value) => {
        isFeedScrolledRef.current = value;
        setIsFeedScrolledState((prev) => (prev === value ? prev : value));
      },
      getIsFeedScrolled: () => isFeedScrolledRef.current,
    }),
    []
  );

  return (
    <ActionsContext.Provider value={actions}>
      <ScrolledContext.Provider value={isFeedScrolled}>
        {children}
      </ScrolledContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The stable setter and getter. Never causes a re-render on its own. */
export function useFeedScrollActions(): FeedScrollActions {
  return React.useContext(ActionsContext);
}

/** Whether the feed is scrolled past the "To Top" threshold. Re-renders when
 *  it flips — read it only where it's displayed. */
export function useIsFeedScrolled(): boolean {
  return React.useContext(ScrolledContext);
}
