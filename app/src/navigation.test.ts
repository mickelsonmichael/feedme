import { goBackOr, tabFromParam, toTab } from "./navigation";

function makeNavigation(canGoBack: boolean) {
  return {
    canGoBack: jest.fn(() => canGoBack),
    goBack: jest.fn(),
    popTo: jest.fn(),
  };
}

describe("goBackOr", () => {
  it("pops back to whatever opened the screen", () => {
    // Arrange
    const navigation = makeNavigation(true);

    // Act
    goBackOr(navigation as never, "Feeds");

    // Assert
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it("lands on the fallback tab when there is nothing to pop", () => {
    // Arrange — e.g. the screen was opened straight from a notification.
    const navigation = makeNavigation(false);

    // Act
    goBackOr(navigation as never, "Feeds");

    // Assert
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.popTo).toHaveBeenCalledWith("Tabs", {
      screen: "Feeds",
      params: undefined,
    });
  });
});

describe("toTab", () => {
  it("pops back to the tabs and selects the tab with its params", () => {
    // Arrange
    const navigation = makeNavigation(true);

    // Act
    toTab(navigation as never, "Feed", { selectedFeedId: 3 });

    // Assert
    expect(navigation.popTo).toHaveBeenCalledWith("Tabs", {
      screen: "Feed",
      params: { selectedFeedId: 3 },
    });
  });
});

describe("tabFromParam", () => {
  it.each(["Feeds", "Discover", "Settings", "Saved", "ReadLater"] as const)(
    "keeps the real tab %s",
    (tab) => {
      expect(tabFromParam(tab)).toBe(tab);
    }
  );

  it("falls back to the Feed tab for a missing or unknown origin", () => {
    expect(tabFromParam(undefined)).toBe("Feed");
    expect(tabFromParam("CustomFeedManage")).toBe("Feed");
  });
});
