import React from "react";
import { Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedItemsScreen from "../screens/FeedItemsScreen";
import { RootStackParamList } from "../types";
import {
  getItemsForFeed,
  upsertItems,
  markItemRead,
  markItemUnread,
  updateFeedLastFetched,
  savePost,
  unsavePost,
  getSavedItemIds,
} from "../database";
import { fetchFeed } from "../feedParser";
import { openUrlWithPreference } from "../linkOpening";

jest.mock("../database", () => ({
  getItemsForFeed: jest.fn(),
  upsertItems: jest.fn(),
  markItemRead: jest.fn(),
  markItemUnread: jest.fn(),
  updateFeedLastFetched: jest.fn(),
  savePost: jest.fn(),
  unsavePost: jest.fn(),
  getSavedItemIds: jest.fn(),
}));

jest.mock("../feedParser", () => ({
  fetchFeed: jest.fn(),
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

jest.mock("../components/ui", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    MetaText: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Feather: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock("../components/ExpandedFeedMedia", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ExpandedFeedMedia: () => React.createElement(View, null),
  };
});

jest.mock("../linkOpening", () => ({
  openUrlWithPreference: jest.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, "FeedItems">;

const mockFeed = {
  id: 1,
  title: "Test Feed",
  url: "https://example.com/feed.xml",
  description: null,
  last_fetched: null,
  error: null,
};

const mockItem = {
  id: 10,
  feed_id: 1,
  title: "Test Item Title",
  url: "https://example.com/item",
  content:
    '&lt;p&gt;Item content&lt;/p&gt; &lt;a href="https://example.com/direct"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"&gt;[comments]&lt;/a&gt;',
  image_url: null,
  raw_xml:
    "<item><title>Test Item Title</title><link>https://example.com/item</link></item>",
  published_at: Date.now(),
  read: 0,
};

function buildProps(): Props {
  return {
    navigation: {
      setOptions: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "FeedItems-test",
      name: "FeedItems",
      params: { feed: mockFeed },
    } as Props["route"],
  };
}

describe("FeedItemsScreen – View Raw", () => {
  beforeEach(() => {
    (getItemsForFeed as jest.Mock).mockResolvedValue([mockItem]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (fetchFeed as jest.Mock).mockResolvedValue([]);
    (upsertItems as jest.Mock).mockResolvedValue(undefined);
    (updateFeedLastFetched as jest.Mock).mockResolvedValue(undefined);
    (markItemRead as jest.Mock).mockResolvedValue(undefined);
    (markItemUnread as jest.Mock).mockResolvedValue(undefined);
    (savePost as jest.Mock).mockResolvedValue(undefined);
    (unsavePost as jest.Mock).mockResolvedValue(undefined);
    (openUrlWithPreference as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("renders a 'View raw XML' button for each feed item", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    const rawButton = tree!.root.findByProps({
      accessibilityLabel: "View raw XML",
    });
    expect(rawButton).toBeTruthy();

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("opens the raw XML modal when 'View raw XML' is pressed", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const rawButton = tree!.root.findByProps({
      accessibilityLabel: "View raw XML",
    });

    // Act
    await act(async () => {
      await rawButton.props.onPress();
    });

    // Assert – modal close button is now visible
    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close raw XML",
    });
    expect(closeButton).toBeTruthy();

    // Assert – raw XML content is shown
    const allText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(allText).toContain(mockItem.raw_xml);

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("closes the raw XML modal when the close button is pressed", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const rawButton = tree!.root.findByProps({
      accessibilityLabel: "View raw XML",
    });

    await act(async () => {
      await rawButton.props.onPress();
    });

    const closeButton = tree!.root.findByProps({
      accessibilityLabel: "Close raw XML",
    });

    // Act
    await act(async () => {
      await closeButton.props.onPress();
    });

    // Assert – close button is gone once modal is dismissed
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Close raw XML" })
    ).toHaveLength(0);

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("opens the in-app item view when a post is tapped", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    const navigate = jest.fn();
    props.navigation = {
      ...props.navigation,
      navigate,
    } as unknown as Props["navigation"];
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const openButton = tree!.root.findByProps({
      accessibilityLabel: "Open post: Test Item Title",
    });

    // Act
    await act(async () => {
      await openButton.props.onPress();
    });

    // Assert
    expect(navigate).toHaveBeenCalledWith("FeedItemView", {
      item: {
        itemId: 10,
        title: "Test Item Title",
        url: "https://example.com/item",
        content:
          '&lt;p&gt;Item content&lt;/p&gt; &lt;a href="https://example.com/direct"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"&gt;[comments]&lt;/a&gt;',
        imageUrl: null,
        publishedAt: mockItem.published_at,
        feedTitle: "Test Feed",
        read: 0,
        useProxy: false,
      },
    });

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("removes reddit action placeholders from preview text", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    const allText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => String(node.props.children));
    const joined = allText.join(" ");
    expect(joined).toContain("Item content");
    expect(joined).not.toContain("[link]");
    expect(joined).not.toContain("[comments]");

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("shows post and expanded action buttons and removes the link chip", async () => {
    // Arrange
    jest.useFakeTimers();
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });

    await act(async () => {
      await expandButton.props.onPress();
    });

    const openOriginalLinkButton = tree!.root.findByProps({
      accessibilityLabel: "Open original link",
    });
    const openCommentsButton = tree!.root.findByProps({
      accessibilityLabel: "Open Reddit comments",
    });
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Open Link" })
    ).toHaveLength(0);

    // Act
    await act(async () => {
      await openOriginalLinkButton.props.onPress();
      await openCommentsButton.props.onPress();
    });

    // Assert
    expect(openUrlWithPreference).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/item" })
    );
    expect(openUrlWithPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.reddit.com/r/castiron/comments/1sw5l42/post/",
      })
    );

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("marks a read post as unread from the row action", async () => {
    // Arrange
    jest.useFakeTimers();
    (getItemsForFeed as jest.Mock).mockResolvedValue([
      { ...mockItem, read: 1 },
    ]);
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const unreadButton = tree!.root.findByProps({
      accessibilityLabel: "Mark post as unread",
    });

    // Act
    await act(async () => {
      await unreadButton.props.onPress();
    });

    // Assert
    expect(markItemUnread).toHaveBeenCalledWith(10);
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Mark post as read" })
    ).toBeTruthy();

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });
});
