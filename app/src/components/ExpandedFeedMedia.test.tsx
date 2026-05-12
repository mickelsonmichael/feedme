import React from "react";
import { Image as RNImage, Platform, StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { NSFW_BLUR_RADIUS } from "../theme";
import { ExpandedFeedMedia } from "./ExpandedFeedMedia";

const mockExtractRedditGalleryUrl = jest.fn();
const mockExtractRedditVideoPostUrl = jest.fn();
const mockFetchRedditPostMedia = jest.fn();
const mockExtractGifEmbedUrl = jest.fn();
const mockExtractGifEmbedUrlFromContent = jest.fn();

jest.mock("../redditGallery", () => {
  class MockRedditFetchError extends Error {
    status: number;
    constructor(status: number) {
      super(`HTTP ${status}`);
      this.name = "RedditFetchError";
      this.status = status;
    }
  }
  return {
    extractRedditGalleryUrl: (...args: unknown[]) =>
      mockExtractRedditGalleryUrl(...args),
    extractRedditVideoPostUrl: (...args: unknown[]) =>
      mockExtractRedditVideoPostUrl(...args),
    fetchRedditPostMedia: (...args: unknown[]) =>
      mockFetchRedditPostMedia(...args),
    fetchRedditPostMediaCached: (...args: unknown[]) =>
      mockFetchRedditPostMedia(...args),
    RedditFetchError: MockRedditFetchError,
  };
});

jest.mock("../gifUtils", () => ({
  extractGifEmbedUrl: (...args: unknown[]) => mockExtractGifEmbedUrl(...args),
  extractGifEmbedUrlFromContent: (...args: unknown[]) =>
    mockExtractGifEmbedUrlFromContent(...args),
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
    mockExtractGifEmbedUrlFromContent.mockReturnValue(null);
    mockExtractRedditVideoPostUrl.mockReturnValue(null);
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockFetchRedditPostMedia.mockResolvedValue({ images: [], video: null });
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
    mockFetchRedditPostMedia.mockResolvedValue({
      video: null,
      images: [
        "https://preview.redd.it/full-1.jpg",
        "https://preview.redd.it/full-2.jpg",
      ],
    });

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
    expect(mockFetchRedditPostMedia).toHaveBeenCalledWith(
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

  it("renders an inline error and the preview image when gallery loading fails", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(
      "https://www.reddit.com/gallery/1sw5l42"
    );
    mockFetchRedditPostMedia.mockRejectedValue(
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

    // Assert — inline error is rendered, with the preview thumbnail behind it.
    const errorView = tree!.root.findByProps({
      testID: "expanded-media-error",
    });
    expect(errorView.props.accessibilityLabel).toContain("gallery unavailable");
    const preview = tree!.root.findByProps({
      testID: "expanded-media-preview",
    });
    expect(preview.props.source.uri).toBe(
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
    mockFetchRedditPostMedia.mockResolvedValue({
      video: null,
      images: ["https://preview.redd.it/full-1.jpg"],
    });

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
    expect(mockFetchRedditPostMedia).toHaveBeenCalledWith(
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
    mockFetchRedditPostMedia.mockResolvedValue({
      video: null,
      images: ["https://preview.redd.it/full-1.jpg"],
    });

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

    // Assert pre-load state — fetch is invoked (via cached helper) so the
    // preview image can be rendered behind the reveal overlay, but the full
    // gallery carousel is not yet shown.
    expect(mockFetchRedditPostMedia).toHaveBeenCalledWith(
      "https://www.reddit.com/gallery/1sw5l42",
      false
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const previewImage = tree!.root.findByProps({
      testID: "expanded-media-preview",
    });
    expect(previewImage.props.source.uri).toBe(
      "https://preview.redd.it/full-1.jpg"
    );
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

  it("renders a blurred first-frame preview for deferred NSFW GIFs when imageUrl is provided", async () => {
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
          imageUrl="https://preview.redd.it/poster.jpg"
          testID="expanded-media"
          deferGifLoad
          nsfw
          blur
        />
      );
    });

    // Assert — preview image is rendered, frozen on the first frame and blurred.
    const preview = tree!.root.findByProps({
      testID: "expanded-media-preview",
    });
    expect(preview.props.source.uri).toBe("https://preview.redd.it/poster.jpg");
    expect(preview.props.blurRadius).toBe(NSFW_BLUR_RADIUS);
    expect(preview.props.autoplay).toBe(false);

    // The tap target is still present so the user can opt into loading the GIF.
    const loadButton = tree!.root.findByProps({
      accessibilityLabel: "Load GIF",
    });
    await act(async () => {
      loadButton.props.onPress();
    });

    // Assert — embed is now shown.
    const container = tree!.root.findByProps({
      accessibilityLabel: "Embedded GIF",
    });
    expect(container).toBeTruthy();
  });

  it("renders a non-blurred first-frame preview for deferred non-NSFW GIFs", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockExtractGifEmbedUrl.mockReturnValue(
      "https://giphy.com/embed/cat-jumping"
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://giphy.com/gifs/cat-jumping"
          imageUrl="https://media.giphy.com/cat.gif"
          testID="expanded-media"
          deferGifLoad
        />
      );
    });

    // Assert — preview is rendered with first frame frozen but not blurred.
    const preview = tree!.root.findByProps({
      testID: "expanded-media-preview",
    });
    expect(preview.props.blurRadius).toBe(0);
    expect(preview.props.autoplay).toBe(false);
  });

  it("detects a Redgifs embed URL from HTML content when itemUrl is not a gif host", async () => {
    // Arrange — itemUrl is a Reddit thread, but content contains a Redgifs href
    mockExtractGifEmbedUrl.mockReturnValue(null);
    mockExtractGifEmbedUrlFromContent.mockReturnValue(
      "https://www.redgifs.com/ifr/ContentGif"
    );

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.reddit.com/r/test/comments/abc123"
          content='<p><a href="https://www.redgifs.com/watch/ContentGif">view</a></p>'
          testID="expanded-media"
          deferGifLoad
        />
      );
    });

    // Assert — the GIF placeholder is shown (not a static image)
    const loadButton = tree!.root.findByProps({
      accessibilityLabel: "Load GIF",
    });
    expect(loadButton.props.testID).toBe("expanded-media");
  });

  it("renders a Reddit video play stage and switches to a player on tap", async () => {
    // Arrange
    mockExtractRedditGalleryUrl.mockReturnValue(null);
    mockExtractRedditVideoPostUrl.mockReturnValue(
      "https://www.reddit.com/comments/abc123"
    );
    mockFetchRedditPostMedia.mockResolvedValue({
      images: [],
      video: {
        mp4Url: "https://v.redd.it/abc123/DASH_720.mp4",
        hlsUrl: "https://v.redd.it/abc123/HLSPlaylist.m3u8",
        posterUrl: "https://external-preview.redd.it/poster.jpg",
        width: 1280,
        height: 720,
      },
    });

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedMedia
          itemUrl="https://www.reddit.com/r/funny/comments/abc123/funny/"
          content='<a href="https://v.redd.it/abc123">video</a>'
          imageUrl="https://b.thumbs.redditmedia.com/poster.jpg"
          testID="expanded-media"
          deferGalleryLoad={false}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Assert — play stage is shown with poster image
    const playButton = tree!.root.findByProps({
      accessibilityLabel: "Play video",
    });
    const previewImage = tree!.root.findByProps({
      testID: "expanded-media-preview",
    });
    expect(previewImage.props.source.uri).toBe(
      "https://external-preview.redd.it/poster.jpg"
    );

    // Act — tap to play
    await act(async () => {
      playButton.props.onPress();
    });

    // Assert — the video player is now mounted
    const player = tree!.root.findByProps({
      accessibilityLabel: "Reddit video player",
    });
    expect(player).toBeTruthy();
  });
});
