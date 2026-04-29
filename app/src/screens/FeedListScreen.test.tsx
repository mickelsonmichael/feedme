import React from "react";
import {
  FlatList,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedListScreen from "../screens/FeedListScreen";
import { RootStackParamList, TabParamList } from "../types";
import { loadConfig, saveConfig } from "../storage";
import { HeaderContentProvider } from "../context/HeaderContentContext";
import {
  getFeeds,
  getAllItems,
  markItemRead,
  markItemUnread,
  getSavedItemIds,
} from "../database";
import { refreshFeeds } from "../feedRefresher";
import { openUrlWithPreference } from "../linkOpening";

const mockExpandedFeedMedia = jest.fn(
  (_props: { imageAlignment?: string; testID?: string; blur?: boolean }) =>
    undefined
);

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  getAllItems: jest.fn(),
  markItemRead: jest.fn(),
  markItemUnread: jest.fn(),
  savePost: jest.fn(),
  unsavePost: jest.fn(),
  getSavedItemIds: jest.fn(),
}));

jest.mock("../feedRefresher", () => ({
  refreshFeeds: jest.fn(),
}));

jest.mock("../storage", () => ({
  loadConfig: jest.fn(() => ({})),
  saveConfig: jest.fn(),
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
    Pill: ({ label }: { label: string }) =>
      React.createElement(Text, null, label),
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
  useIsFocused: () => true,
}));

jest.mock("../components/ExpandedFeedMedia", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    ExpandedFeedMedia: (props: {
      imageAlignment?: string;
      testID?: string;
      blur?: boolean;
    }) => {
      mockExpandedFeedMedia(props);
      return React.createElement(View, { testID: props.testID });
    },
  };
});

jest.mock("../linkOpening", () => ({
  openUrlWithPreference: jest.fn(),
}));

type FeedScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

function renderFeedListScreen(props: FeedScreenProps) {
  return renderer.create(
    <HeaderContentProvider>
      <FeedListScreen {...props} />
    </HeaderContentProvider>
  );
}

describe("FeedListScreen", () => {
  beforeEach(() => {
    (loadConfig as jest.Mock).mockReturnValue({});
    (openUrlWithPreference as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("renders an expand button on the aggregated feed list and expands inline content", async () => {
    // Arrange
    jest.useFakeTimers();

    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "NYT",
        url: "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 10,
        feed_id: 1,
        feed_title: "NYT",
        title: "Inline expand button is visible",
        url: "https://example.com/story",
        content: "<p>Expanded copy</p>",
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-test",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });

    await act(async () => {
      await expandButton.props.onPress();
    });

    // Assert
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Collapse post" })
    ).toBeTruthy();
    expect(markItemRead).toHaveBeenCalledWith(10);
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Expanded copy"
        )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
      jest.runOnlyPendingTimers();
    });
  });

  it("filters to a selected feed and hides stacked sort in feed mode", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
      {
        id: 2,
        title: "Beta",
        url: "https://beta.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 11,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Alpha post",
        url: "https://alpha.example/1",
        content: "one",
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
      {
        id: 12,
        feed_id: 2,
        feed_title: "Beta",
        title: "Beta post",
        url: "https://beta.example/1",
        content: "two",
        image_url: null,
        published_at: Date.now() - 1000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-selected",
      name: "Feed",
      params: { selectedFeedId: 1, selectedFeedTitle: "Alpha" },
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const allText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);

    // Assert
    expect(allText).toContain("Alpha post");
    expect(allText).not.toContain("Beta post");
    expect(allText).toContain("Alpha");
    expect(allText).toContain("Newest");
    expect(allText).not.toContain("Stacked");

    await act(async () => {
      tree!.unmount();
    });
  });

  it("opens the in-app item view when a post is tapped", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 101,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Open me",
        url: "https://alpha.example/open-me",
        content: "body",
        image_url: null,
        published_at: 1_700_000_000_000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-open",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const openButton = tree!.root.findByProps({
      accessibilityLabel: "Open post: Open me",
    });

    await act(async () => {
      await openButton.props.onPress();
    });

    // Assert
    expect(navigation.navigate).toHaveBeenCalledWith("FeedItemView", {
      item: {
        itemId: 101,
        title: "Open me",
        url: "https://alpha.example/open-me",
        content: "body",
        imageUrl: null,
        publishedAt: 1_700_000_000_000,
        feedTitle: "Alpha",
        read: 0,
        useProxy: false,
      },
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not refresh on mobile focus and refreshes only on pull-to-refresh", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 103,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Manual refresh only",
        url: "https://alpha.example/manual-refresh-only",
        content: "body",
        image_url: null,
        published_at: 1_700_000_000_000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-mobile-refresh",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert - focus load on mobile does not trigger remote refresh
    expect(refreshFeeds).not.toHaveBeenCalled();

    const list = tree!.root.findByType(FlatList);
    await act(async () => {
      await list.props.onRefresh();
    });

    // Assert - pull to refresh triggers remote refresh
    expect(refreshFeeds).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("opens the original post from the main feed row action", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 102,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Open original",
        url: "https://alpha.example/original",
        content: "body",
        image_url: null,
        published_at: 1_700_000_000_000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-open-original",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const openOriginalLinkButton = tree!.root.findByProps({
      accessibilityLabel: "Open original link",
    });

    await act(async () => {
      await openOriginalLinkButton.props.onPress();
    });

    // Assert
    expect(openUrlWithPreference).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://alpha.example/original" })
    );

    await act(async () => {
      tree!.unmount();
    });
  });

  it("keeps an unread item visible until manual refresh when unread filter is active", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 201,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Unread post",
          url: "https://alpha.example/unread",
          content: "body",
          image_url: null,
          published_at: Date.now(),
          read: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 201,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Unread post",
          url: "https://alpha.example/unread",
          content: "body",
          image_url: null,
          published_at: Date.now(),
          read: 1,
        },
      ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-unread",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const unreadFilter = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node: renderer.ReactTestInstance) => {
        const labels = node.findAllByType(Text);
        return labels.some((label) => label.props.children === "Unread");
      });
    expect(unreadFilter).toBeTruthy();

    await act(async () => {
      await unreadFilter!.props.onPress();
    });

    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });

    await act(async () => {
      await expandButton.props.onPress();
    });

    // Assert - item remains visible while still on unread filter
    const textBeforeRefresh = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(textBeforeRefresh).toContain("Unread post");

    const list = tree!.root.findByType(FlatList);
    await act(async () => {
      await list.props.onRefresh();
    });

    // Assert - manual refresh removes it from unread list
    const textAfterRefresh = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(textAfterRefresh).not.toContain("Unread post");
    expect(markItemRead).toHaveBeenCalledWith(201);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("marks a read aggregated post as unread from the row action", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 301,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Already read",
        url: "https://alpha.example/read",
        content: "body",
        image_url: null,
        published_at: Date.now(),
        read: 1,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemUnread as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-read-toggle",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const unreadButton = tree!.root.findByProps({
      accessibilityLabel: "Mark post as unread",
    });

    await act(async () => {
      await unreadButton.props.onPress();
    });

    // Assert
    expect(markItemUnread).toHaveBeenCalledWith(301);
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Mark post as read" })
    ).toBeTruthy();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("removes reddit action placeholders and keeps comments action only", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 301,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Photo post",
        url: "https://alpha.example/photo",
        content:
          '&lt;table&gt;&lt;tr&gt;&lt;td&gt;&amp;#32; submitted by &amp;#32; /u/SingingSkyPhoto &lt;a href="https://example.com/direct"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"&gt;[comments]&lt;/a&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;',
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-reddit",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert preview text is cleaned
    const previewText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => String(node.props.children))
      .join(" ");
    expect(previewText).toContain("submitted by /u/SingingSkyPhoto");
    expect(previewText).not.toContain("[link]");
    expect(previewText).not.toContain("[comments]");

    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });
    await act(async () => {
      await expandButton.props.onPress();
    });

    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Open Link" })
    ).toHaveLength(0);
    const openCommentsButton = tree!.root.findByProps({
      accessibilityLabel: "Open Reddit comments",
    });

    await act(async () => {
      await openCommentsButton.props.onPress();
    });

    // Assert expanded action chips open links
    expect(openUrlWithPreference).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://www.reddit.com/r/castiron/comments/1sw5l42/post/",
      })
    );

    await act(async () => {
      tree!.unmount();
    });
  });

  it("uses card layout from settings config and renders centered media-first cards", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "card" });
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
        nsfw: 1,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 401,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Card item",
        url: "https://alpha.example/post",
        content:
          '&lt;p&gt;Card content&lt;/p&gt; &lt;a href="https://example.com/direct"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/castiron/comments/1sw5l42/post/"&gt;[comments]&lt;/a&gt;',
        image_url: "https://alpha.example/image.jpg",
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-card",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Expand post" })
    ).toHaveLength(0);
    expect(tree!.root.findByProps({ testID: "card-media-401" })).toBeTruthy();
    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Open Link" })
    ).toHaveLength(0);
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Open original link" })
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Open Reddit comments" })
    ).toBeTruthy();
    expect(
      mockExpandedFeedMedia.mock.calls.some(
        ([props]) =>
          props.testID === "card-media-401" &&
          props.imageAlignment === "center" &&
          props.blur === true
      )
    ).toBe(true);

    const revealNsfwButton = tree!.root.findByProps({
      accessibilityLabel: "Reveal NSFW media",
    });

    await act(async () => {
      await revealNsfwButton.props.onPress();
    });

    expect(
      mockExpandedFeedMedia.mock.calls.some(
        ([props]) => props.testID === "card-media-401" && props.blur === false
      )
    ).toBe(true);

    const list = tree!.root.findByType(FlatList);
    expect(list.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alignItems: "center" }),
      ])
    );

    await act(async () => {
      tree!.unmount();
    });
  });

  it("blurs compact thumbnails for NSFW feeds", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
        nsfw: 1,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 601,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Sensitive image",
        url: "https://alpha.example/sensitive",
        content: "preview",
        image_url: "https://alpha.example/sensitive.jpg",
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-nsfw-compact",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    const thumbnails = tree!.root.findAllByType(Image);
    expect(thumbnails.length).toBeGreaterThan(0);
    expect(
      thumbnails.some((thumb) => {
        const sourceUri =
          thumb.props.source && typeof thumb.props.source === "object"
            ? thumb.props.source.uri
            : undefined;
        return (
          sourceUri === "https://alpha.example/sensitive.jpg" &&
          thumb.props.blurRadius === 24
        );
      })
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("searches across all feeds and post content", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: "General tech",
        last_fetched: Date.now(),
        error: null,
      },
      {
        id: 2,
        title: "Beta",
        url: "https://beta.example/rss.xml",
        description: "Coffee",
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 501,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Local update",
        url: "https://alpha.example/local",
        content: "A local roundup",
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
      {
        id: 502,
        feed_id: 2,
        feed_title: "Beta",
        title: "Brew notes",
        url: "https://beta.example/brew",
        content: "Cast iron kettle tips",
        image_url: null,
        published_at: Date.now() - 1000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-search",
      name: "Feed",
      params: { selectedFeedId: 1, selectedFeedTitle: "Alpha" },
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await tree!.root
        .findByProps({ accessibilityLabel: "Open search" })
        .props.onPress();
    });

    const searchInput = tree!.root.findByProps({
      accessibilityLabel: "Search feeds and posts",
    }) as renderer.ReactTestInstance;

    await act(async () => {
      await searchInput.props.onChangeText("cast iron");
    });

    const visibleText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);

    // Assert
    expect(visibleText).toContain("Brew notes");
    expect(visibleText).not.toContain("Local update");
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(1);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("toggles feed layout between compact and card and persists the selection", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getAllItems as jest.Mock).mockResolvedValue([
      {
        id: 701,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Toggle test post",
        url: "https://alpha.example/toggle",
        content: "body",
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-layout-toggle",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const toggleButton = tree!.root.findByProps({
      accessibilityLabel: "Toggle feed layout",
    });
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      await toggleButton.props.onPress();
    });

    // Assert: layout persisted as card
    expect(saveConfig).toHaveBeenCalledWith({ feedLayout: "card" });

    // Toggle back to compact
    await act(async () => {
      await toggleButton.props.onPress();
    });

    expect(saveConfig).toHaveBeenCalledWith({ feedLayout: "compact" });

    await act(async () => {
      tree!.unmount();
    });
  });
});
