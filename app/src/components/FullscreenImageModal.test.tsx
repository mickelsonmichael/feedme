import React from "react";
import { Modal, TouchableOpacity } from "react-native";
import renderer, { act } from "react-test-renderer";
import { FullscreenImageModal } from "../components/FullscreenImageModal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: "Feather",
}));

jest.mock("expo-screen-orientation", () => ({
  unlockAsync: jest.fn(),
  lockAsync: jest.fn(),
  OrientationLock: { PORTRAIT_UP: "PORTRAIT_UP" },
}));

describe("FullscreenImageModal", () => {
  it("renders the modal with the image when visible", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl="https://example.com/image.jpg"
          onClose={() => {}}
        />
      );
    });

    // Assert
    const modal = tree!.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
    const image = tree!.root.findByProps({ testID: "fullscreen-image" });
    expect(image.props.source).toEqual({
      uri: "https://example.com/image.jpg",
    });
  });

  it("does not render the modal when not visible", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={false}
          imageUrl="https://example.com/image.jpg"
          onClose={() => {}}
        />
      );
    });

    // Assert
    const modal = tree!.root.findByType(Modal);
    expect(modal.props.visible).toBe(false);
  });

  it("renders nothing when imageUrl is null", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl={null}
          onClose={() => {}}
        />
      );
    });

    // Assert
    expect(tree!.toJSON()).toBeNull();
  });

  it("calls onClose when the close button is pressed", () => {
    // Arrange
    const onClose = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl="https://example.com/image.jpg"
          onClose={onClose}
        />
      );
    });

    // Act
    const closeButton = tree!.root.findByProps({
      testID: "fullscreen-image-close",
    });
    act(() => {
      closeButton.props.onPress();
    });

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the backdrop with correct accessibility props", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl="https://example.com/image.jpg"
          onClose={() => {}}
        />
      );
    });

    // Assert — backdrop exists with accessibility label so users can dismiss
    const backdrop = tree!.root.findByProps({
      testID: "fullscreen-image-backdrop",
    });
    expect(backdrop.props.accessibilityLabel).toBe("Close fullscreen image");
  });

  it("applies blur when blur prop is true", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl="https://example.com/nsfw.jpg"
          blur={true}
          onClose={() => {}}
        />
      );
    });

    // Assert
    const image = tree!.root.findByProps({ testID: "fullscreen-image" });
    expect(image.props.blurRadius).toBeGreaterThan(0);
  });

  it("renders the modal with landscape orientation support", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FullscreenImageModal
          visible={true}
          imageUrl="https://example.com/image.jpg"
          onClose={() => {}}
        />
      );
    });

    // Assert — modal must allow both portrait and landscape
    const modal = tree!.root.findByType(Modal);
    expect(modal.props.supportedOrientations).toContain("landscape");
    expect(modal.props.supportedOrientations).toContain("portrait");
  });
});
