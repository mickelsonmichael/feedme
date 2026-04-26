import React from "react";

type HeaderContentContextValue = {
  headerContent: React.ReactNode;
  setHeaderContent: (content: React.ReactNode) => void;
  clearHeaderContent: () => void;
};

const HeaderContentContext = React.createContext<
  HeaderContentContextValue | undefined
>(undefined);

export function HeaderContentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [headerContent, setHeaderContentState] =
    React.useState<React.ReactNode>(null);

  const setHeaderContent = React.useCallback((content: React.ReactNode) => {
    setHeaderContentState(content);
  }, []);

  const clearHeaderContent = React.useCallback(() => {
    setHeaderContentState(null);
  }, []);

  const value = React.useMemo(
    () => ({ headerContent, setHeaderContent, clearHeaderContent }),
    [headerContent, setHeaderContent, clearHeaderContent]
  );

  return (
    <HeaderContentContext.Provider value={value}>
      {children}
    </HeaderContentContext.Provider>
  );
}

export function useHeaderContent(): HeaderContentContextValue {
  const context = React.useContext(HeaderContentContext);

  if (!context) {
    throw new Error(
      "useHeaderContent must be used within HeaderContentProvider"
    );
  }

  return context;
}
