import React from "react";
import { Image } from "expo-image";
import renderer, { act } from "react-test-renderer";
import { FeedIcon, resetFeedIconOutcomes } from "../components/FeedIcon";

describe("FeedIcon", () => {
  beforeEach(() => {
    resetFeedIconOutcomes();
  });

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

  it("keeps the same image source across a re-render, so it does not re-fade", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedIcon feedUrl="https://example.com/rss" />);
    });
    const sourceBefore = tree!.root.findByType(Image).props.source;

    // Act — the post around it re-renders with the same feed.
    act(() => {
      tree!.update(<FeedIcon feedUrl="https://example.com/rss" />);
    });

    // Assert — same source object. A fresh one replays expo-image's
    // `transition`, which made the favicon visibly re-fade on every swipe.
    expect(tree!.root.findByType(Image).props.source).toBe(sourceBefore);
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

  it("discards the previous native icon and shows the placeholder again when the feed URL changes", () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedIcon feedUrl="https://example.com/rss" />);
    });
    act(() => {
      tree!.root.findByType(Image).props.onLoad();
    });
    expect(tree!.root.findAllByProps({ name: "rss" })).toHaveLength(0);
    const firstInstance = tree!.root.findByType(Image).instance;

    // Act
    act(() => {
      tree!.update(<FeedIcon feedUrl="https://other-example.com/rss" />);
    });

    // Assert — placeholder is visible again immediately, before the new
    // icon loads, and a brand-new native image instance was mounted (old
    // bitmap discarded) rather than the same instance reused with an
    // updated `source`.
    expect(tree!.root.findAllByProps({ name: "rss" }).length).toBeGreaterThan(
      0
    );
    const secondInstance = tree!.root.findByType(Image).instance;
    expect(secondInstance).not.toBe(firstInstance);
  });

  it("renders nothing from the first frame for an icon already known to fail", () => {
    // Arrange — the feed's favicon failed on an earlier post.
    let first!: renderer.ReactTestRenderer;
    act(() => {
      first = renderer.create(<FeedIcon feedUrl="https://dead.example/rss" />);
    });
    act(() => {
      first.root.findByType(Image).props.onError();
    });

    // Act — the reader moves on to another post from the same feed.
    let next!: renderer.ReactTestRenderer;
    act(() => {
      next = renderer.create(<FeedIcon feedUrl="https://dead.example/rss" />);
    });

    // Assert — no placeholder reserves a slot that would then disappear.
    expect(next.toJSON()).toBeNull();
  });

  it("skips the placeholder for an icon already known to load", () => {
    // Arrange
    let first!: renderer.ReactTestRenderer;
    act(() => {
      first = renderer.create(<FeedIcon feedUrl="https://good.example/rss" />);
    });
    act(() => {
      first.root.findByType(Image).props.onLoad();
    });

    // Act
    let next!: renderer.ReactTestRenderer;
    act(() => {
      next = renderer.create(<FeedIcon feedUrl="https://good.example/rss" />);
    });

    // Assert
    expect(next.root.findAllByProps({ name: "rss" })).toHaveLength(0);
    expect(next.root.findByType(Image).props.source).toEqual({
      uri: "https://good.example/favicon.ico",
    });
  });
});
