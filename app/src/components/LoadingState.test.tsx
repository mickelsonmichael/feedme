import React from "react";
import { Animated, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import {
  ChompingLoader,
  FeedLoadingScreen,
  FunFeedLoader,
  LOADING_MESSAGES,
  SkeletonFeedList,
} from "./LoadingState";

jest.mock("@expo/vector-icons", () => ({
  Feather: "Feather",
}));

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "#faf8f3",
      paperWarm: "#f5f1e8",
      ink: "#1e1a3a",
      inkSoft: "#6a6487",
      inkFaint: "#b8b2cc",
      accent: "#3d358f",
      accentSoft: "#7e78c4",
      border: "#ccc8db",
    },
  }),
}));

/** Counts host (native) elements with the given testID, so composite
 *  wrappers with the same forwarded prop are not double-counted. */
function countHostNodes(
  tree: renderer.ReactTestRenderer,
  testID: string
): number {
  return tree.root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === testID
  ).length;
}

describe("FeedLoadingScreen", () => {
  it("renders the fun loader and a skeleton list", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedLoadingScreen />);
    });

    // Assert
    expect(
      tree.root.findAllByProps({ testID: "fun-feed-loader" }).length
    ).toBeGreaterThan(0);
    expect(countHostNodes(tree, "skeleton-row")).toBe(5);
    act(() => tree.unmount());
  });

  it("shows refresh progress counts and a progress bar when supplied", () => {
    // Arrange
    const progress = {
      total: 12,
      completed: 4,
      loading: 8,
      succeeded: 4,
      failed: 0,
      skipped: 0,
    };

    // Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FeedLoadingScreen progress={progress} />);
    });

    // Assert
    const texts = tree.root
      .findAllByType(require("react-native").Text)
      .map((node) => node.props.children);
    expect(
      texts.some(
        (children) =>
          Array.isArray(children) &&
          children.join("") === "4 of 12 feeds refreshed"
      )
    ).toBe(true);
    expect(
      tree.root.findAllByProps({ testID: "refresh-progress-bar" }).length
    ).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});

describe("FunFeedLoader", () => {
  it("shows one of the rotating loading messages", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FunFeedLoader />);
    });

    // Assert
    const message = tree.root.findByProps({
      testID: "fun-feed-loader-message",
    });
    expect(LOADING_MESSAGES).toContain(message.props.children);
    act(() => tree.unmount());
  });

  it("rotates to a different message over time", () => {
    // Arrange
    jest.useFakeTimers();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FunFeedLoader />);
    });
    const first = tree.root.findByProps({ testID: "fun-feed-loader-message" })
      .props.children;

    // Act — advance beyond the rotation interval plus fade duration
    act(() => {
      jest.advanceTimersByTime(3_000);
    });

    // Assert
    const second = tree.root.findByProps({ testID: "fun-feed-loader-message" })
      .props.children;
    expect(second).not.toBe(first);
    expect(LOADING_MESSAGES).toContain(second);
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});

describe("SkeletonFeedList", () => {
  it("renders the requested number of skeleton rows", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<SkeletonFeedList rows={3} />);
    });

    // Assert
    expect(countHostNodes(tree, "skeleton-row")).toBe(3);
    act(() => tree.unmount());
  });
});

describe("ChompingLoader", () => {
  it("renders one dot per bite, plus both jaws", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ChompingLoader />);
    });

    // Assert — three dots on the runway, one for each bite in the cycle, and
    // an upper and lower jaw to eat them.
    expect(countHostNodes(tree, "chomping-loader-dot")).toBe(3);
    expect(countHostNodes(tree, "chomping-loader-jaw")).toBe(2);
    act(() => tree.unmount());
  });

  it("scales its geometry with the requested size", () => {
    // Arrange — twice the default head diameter.
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ChompingLoader size={28} />);
    });

    // Act
    const wrap = tree.root.find(
      (node) =>
        typeof node.type === "string" && node.props.testID === "chomping-loader"
    );
    const style = StyleSheet.flatten(wrap.props.style);

    // Assert — the 32x14 base box scales as a whole, so the loader keeps its
    // proportions at any size rather than stretching.
    expect(style.height).toBe(28);
    expect(style.width).toBe(64);
    act(() => tree.unmount());
  });

  it("drives every moving part from a single animation loop", () => {
    // Arrange — the loader this replaced ran one loop per dot, and independent
    // loops drift apart with nothing to resynchronise them. Guarding the loop
    // count is what keeps that regression from creeping back in.
    const loop = jest.spyOn(Animated, "loop");
    let tree!: renderer.ReactTestRenderer;

    // Act
    act(() => {
      tree = renderer.create(<ChompingLoader />);
    });

    // Assert
    expect(loop).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    loop.mockRestore();
  });

  it("stops animating once unmounted", () => {
    // Arrange
    const stop = jest.fn();
    const loop = jest
      .spyOn(Animated, "loop")
      .mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() } as never);
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ChompingLoader />);
    });

    // Act
    act(() => tree.unmount());

    // Assert — a loop left running after unmount would tick forever.
    expect(stop).toHaveBeenCalled();
    loop.mockRestore();
  });
});
