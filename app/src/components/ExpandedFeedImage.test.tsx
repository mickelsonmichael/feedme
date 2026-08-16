import React from "react";
import { Image as RNImage, StyleSheet } from "react-native";
import { Image } from "expo-image";
import renderer, { act } from "react-test-renderer";
import {
  ExpandedFeedImage,
  primeImageSizeCache,
} from "../components/ExpandedFeedImage";

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
      highlight: "#ffe27a",
      danger: "#b44b4b",
    },
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: "Feather",
}));

// ExpandedFeedImage always renders FullscreenImageModal, which reads
// useSafeAreaInsets — without a provider (or this) every render in the file
// throws "No safe area value available".
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("ExpandedFeedImage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("left-aligns the image and constrains it to the available width while preserving aspect ratio", async () => {
    // Arrange
    const getSizeSpy = jest
      .spyOn(RNImage, "getSize")
      .mockImplementation((uri, success) => {
        success?.(1600, 800);
      });

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/hero.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });
    const image = tree!.root.findByType(Image);

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: {
          layout: {
            width: 500,
            height: 0,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const style = StyleSheet.flatten(image.props.style);

    // Assert
    expect(getSizeSpy).toHaveBeenCalledWith(
      "https://example.com/hero.jpg",
      expect.any(Function),
      expect.any(Function)
    );
    expect(style.alignSelf).toBe("flex-start");
    expect(style.width).toBe(500);
    expect(style.height).toBe(250);
  });

  it("falls back to a bounded square box when image metadata cannot be read", async () => {
    // Arrange
    jest
      .spyOn(RNImage, "getSize")
      .mockImplementation((uri, success, failure) => {
        failure?.(new Error("metadata failed"));
      });

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/fallback.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: {
          layout: {
            width: 420,
            height: 0,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const image = tree!.root.findByType(Image);
    const style = StyleSheet.flatten(image.props.style);

    // Assert
    expect(style.alignSelf).toBe("flex-start");
    expect(style.width).toBe(420);
    expect(style.height).toBe(420);
  });

  it("falls back when image metadata resolves to non-positive dimensions", async () => {
    // Arrange
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(0, 0);
    });

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/empty.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: {
          layout: {
            width: 300,
            height: 0,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const image = tree!.root.findByType(Image);
    const style = StyleSheet.flatten(image.props.style);

    // Assert
    expect(style.alignSelf).toBe("flex-start");
    expect(style.width).toBe(300);
    expect(style.height).toBe(300);
  });

  it("shows a loading placeholder while image metadata is being fetched", async () => {
    // Arrange
    let resolveSize: ((width: number, height: number) => void) | null = null;
    let rejectSize: ((error: Error) => void) | null = null;
    jest
      .spyOn(RNImage, "getSize")
      .mockImplementation((uri, success, failure) => {
        resolveSize = success ?? null;
        rejectSize = failure ?? null;
      });

    let tree: renderer.ReactTestRenderer;

    // Act – render without resolving metadata yet
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/slow.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
      });
    });

    // Assert – placeholder visible with reserved height
    const placeholder = tree!.root.findByProps({
      testID: "expanded-image-placeholder",
    });
    const placeholderStyle = StyleSheet.flatten(placeholder.props.style);
    expect(placeholderStyle.height).toBe(200);

    // Act – resolve metadata
    await act(async () => {
      resolveSize?.(800, 400);
    });

    // Assert – placeholder gone, image visible with correct dimensions
    expect(
      tree!.root.findAllByProps({ testID: "expanded-image-placeholder" })
    ).toHaveLength(0);
    const image = tree!.root.findByType(Image);
    const imageStyle = StyleSheet.flatten(image.props.style);
    expect(imageStyle.width).toBe(400);
    expect(imageStyle.height).toBe(200);

    // Suppress unused variable lint warning – rejectSize is captured for completeness
    void rejectSize;
  });

  it("replaces placeholder with fallback box when metadata fetch fails", async () => {
    // Arrange
    let rejectSize: ((error: Error) => void) | null = null;
    jest
      .spyOn(RNImage, "getSize")
      .mockImplementation((uri, _success, failure) => {
        rejectSize = failure ?? null;
      });

    let tree: renderer.ReactTestRenderer;

    // Act – render without resolving metadata yet
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/slow-fail.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: { layout: { width: 300, height: 0, x: 0, y: 0 } },
      });
    });

    // Assert – placeholder visible while loading
    expect(
      tree!.root.findByProps({ testID: "expanded-image-placeholder" })
    ).toBeTruthy();

    // Act – fail metadata fetch
    await act(async () => {
      rejectSize?.(new Error("network error"));
    });

    // Assert – placeholder gone, fallback square box rendered
    expect(
      tree!.root.findAllByProps({ testID: "expanded-image-placeholder" })
    ).toHaveLength(0);
    const image = tree!.root.findByType(Image);
    const imageStyle = StyleSheet.flatten(image.props.style);
    expect(imageStyle.width).toBe(300);
    expect(imageStyle.height).toBe(300);
  });

  it("centers the image when card mode requests centered alignment", async () => {
    // Arrange
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(1200, 600);
    });

    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/card.jpg"
          alignment="center"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: {
          layout: {
            width: 360,
            height: 0,
            x: 0,
            y: 0,
          },
        },
      });
    });

    const image = tree!.root.findByType(Image);
    const style = StyleSheet.flatten(image.props.style);

    // Assert
    expect(style.alignSelf).toBe("center");
    expect(style.width).toBe(360);
    expect(style.height).toBe(180);
  });

  it("opens the fullscreen modal when the image is tapped", async () => {
    // Arrange
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(800, 400);
    });

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/tap.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
      });
    });

    // Assert modal is initially closed
    const modalBefore = tree!.root.findByProps({
      testID: "fullscreen-image-modal",
    });
    expect(modalBefore.props.visible).toBe(false);

    // Act – tap the image
    const tap = tree!.root.findByProps({ testID: "expanded-image-tap" });
    await act(async () => {
      tap.props.onPress();
    });

    // Assert modal is now open
    const modalAfter = tree!.root.findByProps({
      testID: "fullscreen-image-modal",
    });
    expect(modalAfter.props.visible).toBe(true);
  });

  it("closes the fullscreen modal when onClose is triggered", async () => {
    // Arrange
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(800, 400);
    });

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage
          imageUrl="https://example.com/close.jpg"
          testID="expanded-image"
        />
      );
    });

    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });

    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
      });
    });

    // Open the modal
    const tap = tree!.root.findByProps({ testID: "expanded-image-tap" });
    await act(async () => {
      tap.props.onPress();
    });

    expect(
      tree!.root.findByProps({ testID: "fullscreen-image-modal" }).props.visible
    ).toBe(true);

    // Act – press close button
    const closeBtn = tree!.root.findByProps({
      testID: "fullscreen-image-close",
    });
    await act(async () => {
      closeBtn.props.onPress();
    });

    // Assert modal is closed
    expect(
      tree!.root.findByProps({ testID: "fullscreen-image-modal" }).props.visible
    ).toBe(false);
  });

  it("keeps the same image source across a re-render, so it does not re-fade", async () => {
    // Arrange — metadata already cached, as it is for a post the reader has
    // had mounted since before the swipe.
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(1200, 600);
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage imageUrl="https://example.com/hero.jpg" />
      );
    });
    const sourceBefore = tree!.root.findByType(Image).props.source;

    // Act — the post around it re-renders (a swipe flipping isActive/isLive,
    // or a mark-as-read write landing), handing over identical props.
    await act(async () => {
      tree!.update(
        <ExpandedFeedImage imageUrl="https://example.com/hero.jpg" />
      );
    });

    // Assert — same source object. expo-image treats a new `source` as a new
    // image and replays `transition`, which is what made the image visibly
    // reload every time a swipe completed.
    expect(tree!.root.findByType(Image).props.source).toBe(sourceBefore);
  });

  it("discards the previous native image instance when swapping to an already-cached URL", async () => {
    // Arrange
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(1600, 800);
    });

    const urlA = "https://example.com/stale-a.jpg";
    const urlB = "https://example.com/stale-b.jpg";

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ExpandedFeedImage imageUrl={urlA} testID="expanded-image" />
      );
    });
    const wrapper = tree!.root.findByProps({
      testID: "expanded-image-wrapper",
    });
    await act(async () => {
      wrapper.props.onLayout({
        nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
      });
    });

    // Mirrors mediaPrefetch warming the *next* post's hero image ahead of a
    // swipe — the exact condition that lets the isLoadingMetadata gate be
    // skipped on the URL swap below.
    await act(async () => {
      primeImageSizeCache(urlB);
    });

    const firstInstance = tree!.root.findByType(Image).instance;

    // Act
    await act(async () => {
      tree!.update(
        <ExpandedFeedImage imageUrl={urlB} testID="expanded-image" />
      );
    });

    // Assert — the loading placeholder never reappears (cache hit)...
    expect(
      tree!.root.findAllByProps({ testID: "expanded-image-placeholder" })
    ).toHaveLength(0);
    // ...yet the native image was still remounted rather than reusing the
    // old node with the previous bitmap.
    const secondInstance = tree!.root.findByType(Image).instance;
    expect(secondInstance).not.toBe(firstInstance);
  });
});
