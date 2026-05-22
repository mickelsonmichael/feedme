import React from "react";

type FeedScrollContextValue = {
  isFeedScrolled: boolean;
  setIsFeedScrolled: (value: boolean) => void;
};

const FeedScrollContext = React.createContext<
  FeedScrollContextValue | undefined
>(undefined);

export function FeedScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isFeedScrolled, setIsFeedScrolledState] = React.useState(false);

  const setIsFeedScrolled = React.useCallback((value: boolean) => {
    setIsFeedScrolledState((prev) => (prev === value ? prev : value));
  }, []);

  const value = React.useMemo(
    () => ({ isFeedScrolled, setIsFeedScrolled }),
    [isFeedScrolled, setIsFeedScrolled]
  );

  return (
    <FeedScrollContext.Provider value={value}>
      {children}
    </FeedScrollContext.Provider>
  );
}

export function useFeedScroll(): FeedScrollContextValue {
  const context = React.useContext(FeedScrollContext);
  if (!context) {
    // Default no-op so components used outside the provider (e.g. tests)
    // don't crash. Treats the feed as unscrolled.
    return {
      isFeedScrolled: false,
      setIsFeedScrolled: () => {},
    };
  }
  return context;
}
