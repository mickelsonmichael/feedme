import React from "react";
import renderer, { act } from "react-test-renderer";
import {
  FeedLoadingScreen,
  FunFeedLoader,
  LOADING_MESSAGES,
  PulsingDots,
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

describe("PulsingDots", () => {
  it("renders three dots", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PulsingDots />);
    });

    // Assert — the wrapper row exists and contains three animated children
    const row = tree.root.findByProps({ testID: "pulsing-dots" });
    expect(React.Children.count(row.props.children)).toBe(3);
    act(() => tree.unmount());
  });
});
