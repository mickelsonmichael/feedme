import React from "react";
import { Image } from "expo-image";
import renderer, { act } from "react-test-renderer";
import { FeedIcon } from "../components/FeedIcon";

describe("FeedIcon", () => {
  it("renders the feed's favicon derived from its URL", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedIcon feedUrl="https://example.com/rss" />);
    });

    // Assert
    const image = tree!.root.findByType(Image);
    expect(image.props.source).toEqual({
      uri: "https://example.com/favicon.ico",
    });
  });

  it("renders nothing when no feed URL is provided", () => {
    // Arrange & Act
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedIcon feedUrl={null} />);
    });

    // Assert
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders nothing when the icon fails to load", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedIcon feedUrl="https://example.com/rss" />);
    });

    // Act
    act(() => {
      tree!.root.findByType(Image).props.onError();
    });

    // Assert
    expect(tree!.toJSON()).toBeNull();
  });
});
