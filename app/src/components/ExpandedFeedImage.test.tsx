import React from "react";
import { Image, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ExpandedFeedImage } from "../components/ExpandedFeedImage";

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

describe("ExpandedFeedImage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("left-aligns the image and constrains it to the available width while preserving aspect ratio", async () => {
    // Arrange
    const getSizeSpy = jest
      .spyOn(Image, "getSize")
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
    jest.spyOn(Image, "getSize").mockImplementation((uri, success, failure) => {
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
    jest.spyOn(Image, "getSize").mockImplementation((uri, success) => {
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
    jest.spyOn(Image, "getSize").mockImplementation((uri, success, failure) => {
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
      .spyOn(Image, "getSize")
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
    jest.spyOn(Image, "getSize").mockImplementation((uri, success) => {
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
});
