import React from "react";
import renderer, { act } from "react-test-renderer";
import { FeedItemContent, FeedItemContentItem } from "./FeedItemContent";

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "#faf8f3",
      paperWarm: "#efeae0",
      ink: "#1e1a3a",
      inkSoft: "#6a6487",
      inkFaint: "#b8b2cc",
      accent: "#3d358f",
      accentSoft: "#7e78c4",
      border: "#ccc8db",
      highlight: "#ffe27a",
      danger: "#b44b4b",
    },
  }),
}));

jest.mock("@react-native-vector-icons/feather", () => ({
  Feather: "Feather",
}));

jest.mock("./ExpandedFeedMedia", () => ({
  ExpandedFeedMedia: () => null,
}));

jest.mock("./SanitizedHtmlContent", () => {
  const ReactActual = require("react");
  return {
    SanitizedHtmlContent: ({ selectable }: { selectable?: boolean }) =>
      ReactActual.createElement("SanitizedHtmlContentStub", { selectable }),
  };
});

function buildItem(
  overrides: Partial<FeedItemContentItem> = {}
): FeedItemContentItem {
  return {
    itemId: 1,
    title: "A post",
    url: "https://example.com/post",
    content: "<p>Body</p>",
    imageUrl: null,
    publishedAt: Date.now(),
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss",
    read: 0,
    useProxy: false,
    nsfw: false,
    ...overrides,
  } as FeedItemContentItem;
}

function renderContent(isLive?: boolean) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <FeedItemContent
        item={buildItem()}
        bionicReading={false}
        {...(isLive === undefined ? {} : { isLive })}
      />
    );
  });
  return tree.root.findByType("SanitizedHtmlContentStub" as never).props
    .selectable;
}

describe("FeedItemContent article selection", () => {
  it("lets a passage be selected in the post the reader has settled on", () => {
    // Arrange / Act
    const selectable = renderContent(true);

    // Assert
    expect(selectable).toBe(true);
  });

  it("drops the selection when the reader moves on to another post", () => {
    // Arrange / Act — swiping moves `isLive` to the new post, and the post
    // left behind stops being selectable. That is what dismisses Android's
    // highlight, handles and action bar, so a selection made in one post can
    // never show up on top of another.
    const selectable = renderContent(false);

    // Assert
    expect(selectable).toBe(false);
  });

  it("stays selectable where there is no reader to settle, such as a post card", () => {
    // Arrange / Act — callers that never pass isLive (expanded cards, the
    // standalone item screen) keep ordinary selectable text.
    const selectable = renderContent(undefined);

    // Assert
    expect(selectable).toBe(true);
  });
});
