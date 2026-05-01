import React from "react";
import { Image as RNImage, Platform, StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";

const mockExtractRedditGalleryUrl = jest.fn();
const mockFetchRedditGalleryImageUrls = jest.fn();
const mockExtractGifEmbedUrl = jest.fn();

jest.mock("../redditGallery", () => ({
  extractRedditGalleryUrl: (...args: unknown[]) =>
    mockExtractRedditGalleryUrl(...args),
  fetchRedditGalleryImageUrls: (...args: unknown[]) =>
    mockFetchRedditGalleryImageUrls(...args),
}));

jest.mock("../gifUtils", () => ({
  extractGifEmbedUrl: (...args: unknown[]) => mockExtractGifEmbedUrl(...args),
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
    jest.spyOn(RNImage, "getSize").mockImplementation((_uri, success) => {
      success(1080, 1080);
    });
    mockExtractGifEmbedUrl.mockReturnValue(null);
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
          deferGalleryLoad={false}
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
      "https://www.reddit.com/gallery/1sw5l42",
      false
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
          deferGalleryLoad={false}
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

  it("forwards useProxy when fetching gallery metadata and routes images through the proxy", async () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hostname: "feedme.app" },
    });
    process.env.EXPO_PUBLIC_FEED_PROXY_TARGET = "live";
    process.env.EXPO_PUBLIC_FEED_PROXY_LIVE_URL =
      "https://proxy.example.workers.dev";

    mockExtractRedditGalleryUrl.mockReturnValue(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    mockFetchRedditGalleryImageUrls.mockResolvedValue([
      "https://preview.redd.it/full-1.jpg",
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
          deferGalleryLoad={false}
          useProxy
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const activeImage = tree!.root.findByProps({
      testID: "expanded-media-image-0",
    });

    // Assert
    expect(mockFetchRedditGalleryImageUrls).toHaveBeenCalledWith(
      "https://www.reddit.com/gallery/1sw5l42",
      true
    );
    expect(activeImage.props.source.uri).toBe(
      "https://proxy.example.workers.dev/?url=https%3A%2F%2Fpreview.redd.it%2Ffull-1.jpg"
    );

    // Cleanup
    Reflect.deleteProperty(globalThis, "location");
    delete process.env.EXPO_PUBLIC_FEED_PROXY_TARGET;
    delete process.env.EXPO_PUBLIC_FEED_PROXY_LIVE_URL;
  });

  it("defers loading Reddit gallery until user taps load", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    mockFetchRedditGalleryImageUrls.mockResolvedValue([
      "https://preview.redd.it/full-1.jpg",
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
          nsfw
        />
      );
    });

    // Assert pre-load state
    expect(mockFetchRedditGalleryImageUrls).not.toHaveBeenCalled();
    const loadButton = tree!.root.findByProps({
      accessibilityLabel: "Load Images",
    });

    // Act
    await act(async () => {
      loadButton.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert post-load state
    expect(mockFetchRedditGalleryImageUrls).toHaveBeenCalledWith(
      "https://www.reddit.com/gallery/1sw5l42",
      false
    );
    expect(
      tree!.root.findByProps({ testID: "expanded-media-image-0" }).props.source
        .uri
    ).toBe("https://preview.redd.it/full-1.jpg");
  });

  it("renders an embedded GIF iframe when itemUrl is a GIF host URL", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockExtractGifEmbedUrl.mockReturnValue(
      "https://www.redgifs.com/ifr/TightGif"
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.redgifs.com/watch/TightGif"
          testID="expanded-media"
        />
      );
    });

    // Assert
    const container = tree!.root.findByProps({
      accessibilityLabel: "Embedded GIF",
    });
    expect(container.props.testID).toBe("expanded-media");
  });

  it("defers GIF load when deferGifLoad is true and shows placeholder", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockExtractGifEmbedUrl.mockReturnValue(
      "https://giphy.com/embed/xT9IgG50Lg7KXYNX8I"
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://giphy.com/gifs/cat-jumping-xT9IgG50Lg7KXYNX8I"
          testID="expanded-media"
          deferGifLoad
        />
      );
    });

    // Assert placeholder is shown before load
    const loadButton = tree!.root.findByProps({
      accessibilityLabel: "Load GIF",
    });
    expect(loadButton.props.testID).toBe("expanded-media");

    // Act — tap to load
    await act(async () => {
      loadButton.props.onPress();
    });

    // Assert embed is now shown
    const container = tree!.root.findByProps({
      accessibilityLabel: "Embedded GIF",
    });
    expect(container).toBeTruthy();
  });

  it("shows NSFW label on GIF placeholder when nsfw is true", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockExtractGifEmbedUrl.mockReturnValue(
      "https://www.redgifs.com/ifr/NsfwGif"
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.redgifs.com/watch/NsfwGif"
          testID="expanded-media"
          deferGifLoad
          nsfw
        />
      );
    });

    // Assert
    const subtleTexts = tree!.root.findAllByProps({
      children: "NSFW GIF. Tap to load.",
    });
    expect(subtleTexts.length).toBeGreaterThan(0);
  });
});
