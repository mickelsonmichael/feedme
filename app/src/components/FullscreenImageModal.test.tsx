import React from "react";
import { Modal, TouchableOpacity } from "react-native";
import renderer, { act } from "react-test-renderer";
import { FullscreenImageModal } from "../components/FullscreenImageModal";

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

  it("calls onClose when the backdrop is pressed", () => {
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
    const backdrop = tree!.root.findByProps({
      testID: "fullscreen-image-backdrop",
    });
    act(() => {
      backdrop.props.onPress();
    });

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
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
});
