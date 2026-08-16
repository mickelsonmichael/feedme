import React from "react";
import { Image } from "expo-image";
import renderer, { act } from "react-test-renderer";
import {
  SingleViewPost,
  SingleViewPostHandle,
} from "../components/SingleViewPost";
import { FeedItemContentItem } from "../components/FeedItemContent";

const mockStartItemViewTime = jest.fn();
const mockEndItemViewTime = jest.fn();

jest.mock("../database", () => ({
  startItemViewTime: (...args: unknown[]) => mockStartItemViewTime(...args),
  endItemViewTime: (...args: unknown[]) => mockEndItemViewTime(...args),
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
  Feather: "Feather",
}));

let feedItemContentMountCount = 0;

jest.mock("./FeedItemContent", () => {
  const actual = jest.requireActual("./FeedItemContent");
  const React = require("react");
  return {
    ...actual,
    FeedItemContent: ({ isLive }: { isLive?: boolean }) => {
      React.useEffect(() => {
        feedItemContentMountCount += 1;
      }, []);
      return React.createElement("FeedItemContentStub", { isLive });
    },
  };
});

function buildItem(
  overrides: Partial<FeedItemContentItem> = {}
): FeedItemContentItem {
  return {
    itemId: 1,
    title: "A post",
    url: "https://example.com/post",
    content: "<p>Body</p>",
    imageUrl: "https://example.com/hero.jpg",
    publishedAt: Date.now(),
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss",
    read: 0,
    useProxy: false,
    nsfw: false,
    ...overrides,
  };
}

describe("SingleViewPost", () => {
  beforeEach(() => {
    feedItemContentMountCount = 0;
    mockStartItemViewTime.mockResolvedValue(42);
    mockEndItemViewTime.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not remount the feed icon or body when promoted from inactive to active", async () => {
    // Arrange
    const item = buildItem();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SingleViewPost
          item={item}
          feedId={7}
          isActive={false}
          isLive={false}
          bionicReading={false}
        />
      );
    });
    const iconBefore = tree!.root.findByType(Image).instance;
    const iconSourceBefore = tree!.root.findByType(Image).props.source;
    expect(feedItemContentMountCount).toBe(1);

    // Act — promote this pre-mounted slot to active, as happens when a
    // swipe-neighbor becomes the current post.
    await act(async () => {
      tree!.update(
        <SingleViewPost
          item={item}
          feedId={7}
          isActive
          isLive
          bionicReading={false}
        />
      );
    });

    // Assert — same native icon instance, FeedItemContent never remounted,
    // and crucially the icon's `source` object is unchanged. A fresh source
    // replays expo-image's transition, so the favicon re-fades on every
    // completed swipe even though it never left the cache and never
    // remounted — which is exactly what "the image reloads" looked like.
    const iconAfter = tree!.root.findByType(Image).instance;
    expect(iconAfter).toBe(iconBefore);
    expect(tree!.root.findByType(Image).props.source).toBe(iconSourceBefore);
    expect(feedItemContentMountCount).toBe(1);
  });

  it("starts the view-time timer once live, and ends it via the imperative handle", async () => {
    // Arrange
    const item = buildItem({ itemId: 5 });
    const ref = React.createRef<SingleViewPostHandle>();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SingleViewPost
          ref={ref}
          item={item}
          feedId={9}
          isActive={false}
          isLive={false}
          bionicReading={false}
        />
      );
    });
    expect(mockStartItemViewTime).not.toHaveBeenCalled();

    // Act
    await act(async () => {
      tree!.update(
        <SingleViewPost
          ref={ref}
          item={item}
          feedId={9}
          isActive
          isLive
          bionicReading={false}
        />
      );
    });

    // Assert
    expect(mockStartItemViewTime).toHaveBeenCalledWith(5, 9);

    // Act — parent calls this right before advancing to the next post.
    act(() => {
      ref.current?.endViewTimeForNext();
    });

    // Assert
    expect(mockEndItemViewTime).toHaveBeenCalledWith(42);
  });

  it("does not start the view-time timer for an NSFW post until revealed", async () => {
    // Arrange
    const item = buildItem({ itemId: 3, nsfw: true });
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SingleViewPost
          item={item}
          feedId={2}
          isActive
          isLive
          bionicReading={false}
        />
      );
    });

    // Assert — not started yet, placeholder shown instead of the body.
    expect(mockStartItemViewTime).not.toHaveBeenCalled();
    expect(feedItemContentMountCount).toBe(0);
    const revealButton = tree!.root.findByProps({
      accessibilityLabel: "Reveal NSFW content",
    });

    // Act
    await act(async () => {
      revealButton.props.onPress();
    });

    // Assert
    expect(mockStartItemViewTime).toHaveBeenCalledWith(3, 2);
    expect(feedItemContentMountCount).toBe(1);
  });
});
