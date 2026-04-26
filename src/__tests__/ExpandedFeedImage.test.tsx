import React from "react";
import { Image, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ExpandedFeedImage } from "../components/ExpandedFeedImage";

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
});
