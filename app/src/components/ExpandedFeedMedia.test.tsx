import React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";

const mockExtractRedditGalleryUrl = jest.fn();
const mockFetchRedditGalleryImageUrls = jest.fn();

jest.mock("../redditGallery", () => ({
  extractRedditGalleryUrl: (...args: unknown[]) =>
    mockExtractRedditGalleryUrl(...args),
  fetchRedditGalleryImageUrls: (...args: unknown[]) =>
    mockFetchRedditGalleryImageUrls(...args),
}));

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

jest.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { name });
  },
}));

jest.mock("./ExpandedFeedImage", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    ExpandedFeedImage: ({
      imageUrl,
      testID,
    }: {
      imageUrl: string;
      testID?: string;
    }) => React.createElement(View, { imageUrl, testID }),
  };
});

describe("ExpandedFeedMedia", () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    jest.spyOn(Image, "getSize").mockImplementation((_uri, success) => {
      success(1080, 1080);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("renders a horizontal carousel when Reddit gallery metadata loads", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    mockFetchRedditGalleryImageUrls.mockResolvedValue([
      "https://preview.redd.it/full-1.jpg",
      "https://preview.redd.it/full-2.jpg",
    ]);

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"
          content='<a href="https://www.reddit.com/gallery/1sw5l42">[link]</a>'
          imageUrl="https://preview.redd.it/thumb.jpg?width=140"
          testID="expanded-media"
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Flush the Image.getSize effect that runs after gallery URLs are set.
    await act(async () => {
      await Promise.resolve();
    });

    // On web the gallery renders a single controlled slide — no ScrollView.
    const nextButton = tree!.root.findByProps({
      testID: "expanded-media-next",
    });
    const previousButton = tree!.root.findByProps({
      testID: "expanded-media-previous",
    });
    const activeImage = tree!.root.findByProps({
      testID: "expanded-media-image-0",
    });
    const firstDot = tree!.root.findByProps({ testID: "expanded-media-dot-0" });
    const secondDot = tree!.root.findByProps({
      testID: "expanded-media-dot-1",
    });

    // Assert initial state
    expect(mockFetchRedditGalleryImageUrls).toHaveBeenCalledWith(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    expect(previousButton.props.disabled).toBe(true);
    expect(nextButton.props.disabled).toBe(false);
    expect(activeImage.props.source.uri).toBe(
      "https://preview.redd.it/full-1.jpg"
    );
    expect(StyleSheet.flatten(firstDot.props.style).backgroundColor).toBe(
      "#1e1a3a"
    );
    expect(StyleSheet.flatten(secondDot.props.style).backgroundColor).toBe(
      "#b8b2cc"
    );

    // Act — advance to next slide
    await act(async () => {
      nextButton.props.onPress();
    });

    // Assert updated state
    expect(
      tree!.root.findByProps({ testID: "expanded-media-next" }).props.disabled
    ).toBe(true);
    expect(
      tree!.root.findByProps({ testID: "expanded-media-previous" }).props
        .disabled
    ).toBe(false);
    expect(
      tree!.root.findByProps({ testID: "expanded-media-image-1" }).props.source
        .uri
    ).toBe("https://preview.redd.it/full-2.jpg");
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({ testID: "expanded-media-dot-0" }).props.style
      ).backgroundColor
    ).toBe("#b8b2cc");
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({ testID: "expanded-media-dot-1" }).props.style
      ).backgroundColor
    ).toBe("#1e1a3a");
  });

  it("falls back to the single preview image when gallery loading fails", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    mockFetchRedditGalleryImageUrls.mockRejectedValue(
      new Error("gallery unavailable")
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"
          content='<a href="https://www.reddit.com/gallery/1sw5l42">[link]</a>'
          imageUrl="https://preview.redd.it/thumb.jpg?width=140"
          testID="expanded-media"
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const fallbackImage = tree!.root.findByProps({ testID: "expanded-media" });

    // Assert
    expect(fallbackImage.props.imageUrl).toBe(
      "https://preview.redd.it/thumb.jpg?width=140"
    );
  });
});
