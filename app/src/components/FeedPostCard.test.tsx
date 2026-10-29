import React from "react";
import renderer, { act } from "react-test-renderer";
import { Image } from "expo-image";
import { FeedPostCard } from "./FeedPostCard";
import { prepareArticleHtml } from "../utils/articleHtml";
import { fetchRedditGalleryImageUrlsCached } from "../redditGallery";

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

jest.mock("@react-native-vector-icons/feather", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Feather: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});

jest.mock("./ExpandedFeedMedia", () => {
  const React = require("react");
  const { View } = require("react-native");
  return { ExpandedFeedMedia: () => React.createElement(View, null) };
});

jest.mock("./SanitizedHtmlContent", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    SanitizedHtmlContent: ({ html }: { html: string }) =>
      React.createElement(Text, { testID: "article-html" }, html),
  };
});

jest.mock("../utils/articleHtml", () => ({
  prepareArticleHtml: jest.fn((html: string) => `prepared:${html}`),
}));

jest.mock("../redditGallery", () => ({
  ...jest.requireActual("../redditGallery"),
  fetchRedditGalleryImageUrlsCached: jest.fn(),
}));

const noop = () => {};

function makeItem(id: number, content: string, url: string | null = null) {
  return {
    id,
    title: `Post ${id}`,
    url,
    content,
    image_url: null,
    published_at: null,
    read: 0,
  };
}

function compactCard(
  item: ReturnType<typeof makeItem>,
  overrides: Partial<React.ComponentProps<typeof FeedPostCard>> = {}
) {
  return (
    <FeedPostCard
      item={item}
      feedTitle="Feed"
      layout="compact"
      saved={false}
      showExpand
      onOpenItem={noop}
      onToggleExpand={noop}
      onToggleRead={noop}
      onToggleSave={noop}
      onOpenOriginalLink={noop}
      onOpenContentLink={noop}
      {...overrides}
    />
  );
}

function thumbnailUris(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Image)
    .map((node) => (node.props.source as { uri: string }).uri);
}

describe("FeedPostCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("article body", () => {
    it("does not prepare the article HTML for a collapsed row", () => {
      // Arrange / Act
      act(() => {
        renderer.create(compactCard(makeItem(1, "<p>Hello <b>world</b></p>")));
      });

      // Assert
      expect(prepareArticleHtml).not.toHaveBeenCalled();
    });

    it("prepares and renders the article HTML once the row is expanded", () => {
      // Arrange
      const item = makeItem(1, "<p>Hello <b>world</b></p>");
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(compactCard(item));
      });

      // Act
      act(() => {
        tree.update(compactCard(item, { expanded: true }));
      });

      // Assert
      expect(prepareArticleHtml).toHaveBeenCalledTimes(1);
      expect(
        tree.root.findByProps({ testID: "article-html" }).props.children
      ).toBe("prepared:<p>Hello <b>world</b></p>");
    });

    it("never prepares the article HTML in card layout", () => {
      // Arrange / Act
      act(() => {
        renderer.create(
          compactCard(makeItem(1, "<p>Hello</p>"), {
            layout: "card",
            showExpand: false,
            cardWidth: 300,
          })
        );
      });

      // Assert
      expect(prepareArticleHtml).not.toHaveBeenCalled();
    });
  });

  describe("expand panel", () => {
    const panel = (tree: renderer.ReactTestRenderer) =>
      tree.root.find(
        (node) =>
          "entering" in node.props &&
          typeof node.type !== "string" &&
          node.findAll((n) => n.props.testID === "article-html").length > 0
      );

    it("fades in when the user expands the post", () => {
      // Arrange
      const item = makeItem(1, "<p>Hello</p>");
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(compactCard(item));
      });

      // Act
      act(() => {
        tree.update(compactCard(item, { expanded: true }));
      });

      // Assert
      expect(panel(tree).props.entering).toBeDefined();
    });

    it("appears without a fade when a recycled row lands on an already-expanded post", () => {
      // Arrange — the cell is showing post 1, collapsed.
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(compactCard(makeItem(1, "<p>One</p>")));
      });

      // Act — FlashList reuses it for post 2, which the user expanded earlier.
      act(() => {
        tree.update(compactCard(makeItem(2, "<p>Two</p>"), { expanded: true }));
      });

      // Assert
      expect(panel(tree).props.entering).toBeUndefined();
    });
  });

  describe("Reddit gallery thumbnail", () => {
    const galleryA = makeItem(
      1,
      '<a href="https://www.reddit.com/gallery/aaa111">[link]</a>'
    );
    const galleryB = makeItem(
      2,
      '<a href="https://www.reddit.com/gallery/bbb222">[link]</a>'
    );

    it("shows the gallery's first image as the thumbnail once resolved", async () => {
      // Arrange
      (fetchRedditGalleryImageUrlsCached as jest.Mock).mockResolvedValue([
        "https://i.redd.it/a-first.jpg",
      ]);
      let tree!: renderer.ReactTestRenderer;

      // Act
      await act(async () => {
        tree = renderer.create(compactCard(galleryA));
      });

      // Assert
      expect(thumbnailUris(tree)).toEqual(["https://i.redd.it/a-first.jpg"]);
    });

    it("never shows the previous post's thumbnail when a cell is recycled onto another gallery", async () => {
      // Arrange — the cell has resolved post A's thumbnail.
      (fetchRedditGalleryImageUrlsCached as jest.Mock).mockResolvedValueOnce([
        "https://i.redd.it/a-first.jpg",
      ]);
      let tree!: renderer.ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(compactCard(galleryA));
      });
      // Post B's lookup is still in flight.
      (fetchRedditGalleryImageUrlsCached as jest.Mock).mockReturnValueOnce(
        new Promise(() => {})
      );

      // Act — FlashList reuses the same component instance for post B.
      await act(async () => {
        tree.update(compactCard(galleryB));
      });

      // Assert
      expect(thumbnailUris(tree)).not.toContain(
        "https://i.redd.it/a-first.jpg"
      );
    });
  });
});
