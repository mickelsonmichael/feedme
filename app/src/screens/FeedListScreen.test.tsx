import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NSFW_BLUR_RADIUS } from "../theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedListScreen from "../screens/FeedListScreen";
import { RootStackParamList, TabParamList } from "../types";
import { loadConfig, saveConfig } from "../storage";
import { HeaderContentProvider } from "../context/HeaderContentContext";
import {
  getFeeds,
  getItemsPage,
  markItemRead,
  markItemUnread,
  getSavedItemIds,
  getFeedsForTag,
} from "../database";
import { refreshFeeds } from "../feedRefresher";
import { openUrlWithPreference } from "../linkOpening";

const mockExpandedFeedMedia = jest.fn(
  (_props: {
    imageAlignment?: string;
    testID?: string;
    blur?: boolean;
    deferGifLoad?: boolean;
  }) => undefined
);

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  getItemsPage: jest.fn(),
  getFeedsForTag: jest.fn(() => Promise.resolve([])),
  getCustomFeedById: jest.fn(() => Promise.resolve(null)),
  getCustomFeedMembers: jest.fn(() => Promise.resolve([])),
  markItemRead: jest.fn(),
  markItemUnread: jest.fn(),
  savePost: jest.fn(),
  unsavePost: jest.fn(),
  getSavedItemIds: jest.fn(),
  addToReadLater: jest.fn(),
  removeFromReadLater: jest.fn(),
  getReadLaterItemIds: jest.fn(() => Promise.resolve(new Set())),
  startItemViewTime: jest.fn(() => Promise.resolve(1)),
  endItemViewTime: jest.fn(() => Promise.resolve()),
}));

jest.mock("../feedRefresher", () => ({
  refreshFeeds: jest.fn(),
}));

jest.mock("../storage", () => ({
  loadConfig: jest.fn(() => ({})),
  saveConfig: jest.fn(),
}));

const mockThemeColors = {
  paper: "#faf8f3",
  paperWarm: "#efeae0",
  ink: "#1e1a3a",
  inkSoft: "#6a6487",
  inkFaint: "#b8b2cc",
  accent: "#3d358f",
  accentSoft: "#7e78c4",
  highlight: "#ffe27a",
  danger: "#b44b4b",
};

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: mockThemeColors,
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
  useFocusEffect: jest.fn((callback: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      callback();
    }, [callback]);
  }),
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

jest.mock("../components/SanitizedHtmlContent", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    SanitizedHtmlContent: ({ html }: { html: string }) =>
      React.createElement(Text, null, `HTML:${html}`),
  };
});

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

// Mirrors FeedListScreen's internal PAGE_SIZE constant.
const PAGE_SIZE = 50;

function makeItems(
  count: number,
  startId: number,
  feedId = 1,
  feedTitle = "Alpha"
) {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    feed_id: feedId,
    feed_title: feedTitle,
    title: `Post ${startId + i}`,
    url: `https://alpha.example/${startId + i}`,
    content: "body",
    image_url: null,
    published_at: 1_700_000_000_000 - i * 1000,
    read: 0,
  }));
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
            node.props.children === "HTML:<p>Expanded copy</p>"
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
    expect(getItemsPage).toHaveBeenCalledWith(
      expect.objectContaining({ feedIds: [1] })
    );
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
        feedUrl: "https://alpha.example/rss.xml",
        read: 0,
        useProxy: false,
        nsfw: false,
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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

    const list = tree!.root.findByType(FlashList);
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
    (getItemsPage as jest.Mock)
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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

    const filterTrigger = tree!.root
      .findAllByProps({ accessibilityLabel: "Filter posts" })
      .find(
        (node: renderer.ReactTestInstance) =>
          typeof node.props.onPress === "function"
      );
    await act(async () => {
      await filterTrigger!.props.onPress();
    });
    const unreadOption = tree!.root
      .findAllByProps({
        accessibilityLabel: "Unread",
        accessibilityRole: "menuitem",
      })
      .find(
        (node: renderer.ReactTestInstance) =>
          typeof node.props.onPress === "function"
      );
    await act(async () => {
      await unreadOption!.props.onPress();
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

    const list = tree!.root.findByType(FlashList);
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

  it("shows a toast with the failed-feed count after a refresh, instead of a modal alert", async () => {
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
    (refreshFeeds as jest.Mock).mockResolvedValue(2);
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 301,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Some post",
        url: "https://alpha.example/post",
        content: "body",
        image_url: null,
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-toast",
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

    const list = tree!.root.findByType(FlashList);
    await act(async () => {
      await list.props.onRefresh();
    });

    // Assert - a toast carries the count, no modal alert is shown
    const toast = tree!.root.findByProps({ testID: "toast" });
    expect(toast.findByType(Text).props.children).toBe(
      "2 feeds could not be refreshed."
    );
    expect(alertSpy).not.toHaveBeenCalled();

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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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

    const list = tree!.root.findByType(FlashList);
    expect(list.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alignItems: "center" }),
      ])
    );

    await act(async () => {
      tree!.unmount();
    });
  });

  it("renders single layout one post at a time and advances with Next", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 501,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Single first",
        url: "https://alpha.example/first",
        content: "<p>First body</p>",
        image_url: null,
        published_at: 2_000,
        read: 0,
      },
      {
        id: 502,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Single second",
        url: "https://alpha.example/second",
        content: "<p>Second body</p>",
        image_url: null,
        published_at: 1_000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-layout",
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

    // Assert initial post
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Single first"
        )
    ).toBe(true);
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Move one post at a time"
        )
    ).toBe(false);
    expect(
      tree!.root
        .findAllByType(Text)
        .some((node: renderer.ReactTestInstance) =>
          typeof node.props.children === "string"
            ? /^\d+ of \d+\+?$/.test(node.props.children)
            : false
        )
    ).toBe(false);
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Open post link" })
    ).toBeTruthy();
    expect(markItemRead).toHaveBeenCalledWith(501);

    const nextButtons = tree!.root.findAllByProps({
      accessibilityLabel: "Next post",
    });

    await act(async () => {
      await nextButtons[0].props.onPress();
      await Promise.resolve();
    });

    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Single second"
        )
    ).toBe(true);
    expect(markItemRead).toHaveBeenCalledWith(502);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("shows the feed's icon next to the feed name in single layout", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 501,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Single first",
        url: "https://alpha.example/first",
        content: "<p>First body</p>",
        image_url: null,
        published_at: 2_000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-layout-icon",
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
    const image = tree!.root.findByType(Image);
    expect(image.props.source).toEqual({
      uri: "https://alpha.example/favicon.ico",
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("advances to the next post when swiping left in single layout on native", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(2, 601));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-swipe-native",
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

    const gestureDetector = tree!.root.findByType(GestureDetector);
    const gesture = gestureDetector.props.gesture as {
      handlers: { onEnd: (event: unknown) => void };
    };

    await act(async () => {
      gesture.handlers.onEnd({
        translationX: -100,
        translationY: 0,
        velocityX: -900,
      });
      await Promise.resolve();
    });

    // Assert
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Post 602"
        )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("returns to the previous post when swiping right in single layout on native", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(2, 701));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-swipe-native-prev",
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

    const gestureDetectorForward = tree!.root.findByType(GestureDetector);

    await act(async () => {
      (
        gestureDetectorForward.props.gesture as {
          handlers: { onEnd: (event: unknown) => void };
        }
      ).handlers.onEnd({
        translationX: -100,
        translationY: 0,
        velocityX: -900,
      });
      await Promise.resolve();
    });

    const gestureDetectorBack = tree!.root.findByType(GestureDetector);

    await act(async () => {
      (
        gestureDetectorBack.props.gesture as {
          handlers: { onEnd: (event: unknown) => void };
        }
      ).handlers.onEnd({ translationX: 100, translationY: 0, velocityX: 900 });
      await Promise.resolve();
    });

    // Assert
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Post 701"
        )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("ignores a mostly-vertical drag in single layout on native", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(2, 801));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-swipe-vertical",
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

    const gestureDetector = tree!.root.findByType(GestureDetector);

    await act(async () => {
      (
        gestureDetector.props.gesture as {
          handlers: { onEnd: (event: unknown) => void };
        }
      ).handlers.onEnd({
        translationX: -100,
        translationY: 200,
        velocityX: -900,
      });
      await Promise.resolve();
    });

    // Assert
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Post 801"
        )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not render a swipe GestureDetector in single layout on web", async () => {
    // Arrange
    const originalPlatformOS = Platform.OS;
    Platform.OS = "web";
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(2, 901));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-swipe-web",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    try {
      // Act
      await act(async () => {
        tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Assert
      expect(tree!.root.findAllByType(GestureDetector)).toHaveLength(0);

      await act(async () => {
        tree!.unmount();
      });
    } finally {
      Platform.OS = originalPlatformOS;
    }
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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
          thumb.props.blurRadius === NSFW_BLUR_RADIUS
        );
      })
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("hides compact thumbnail when post is expanded so the image is not shown twice", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: Date.now(),
        error: null,
        nsfw: 0,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 701,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Image post",
        url: "https://alpha.example/post",
        content: null,
        image_url: "https://alpha.example/image.jpg",
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-compact-expand-image",
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

    // Assert: thumbnail is visible before expanding
    const thumbnailsBefore = tree!.root
      .findAllByType(Image)
      .filter(
        (img) => img.props.source?.uri === "https://alpha.example/image.jpg"
      );
    expect(thumbnailsBefore.length).toBeGreaterThan(0);

    // Act: expand the post
    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });
    await act(async () => {
      await expandButton.props.onPress();
    });

    // Assert: thumbnail Image is hidden (no longer rendered), full media shown via ExpandedFeedMedia
    const thumbnailsAfter = tree!.root
      .findAllByType(Image)
      .filter(
        (img) => img.props.source?.uri === "https://alpha.example/image.jpg"
      );
    expect(thumbnailsAfter.length).toBe(0);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("strips img tags from HTML content when expanded to avoid duplicate of image shown by ExpandedFeedMedia", async () => {
    // Arrange – a Reddit-style post whose content HTML has an image <td> and a "submitted by" <td>
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Reddit",
        url: "https://www.reddit.com/r/pics/.rss",
        description: null,
        last_fetched: Date.now(),
        error: null,
        nsfw: 0,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 702,
        feed_id: 1,
        feed_title: "Reddit",
        title: "Cool photo",
        url: "https://reddit.com/r/pics/comments/abc/cool_photo/",
        content:
          '<table><tr><td><a href="https://i.redd.it/abc.jpg"><img src="https://alpha.example/thumb.jpg" /></a></td><td>&#32; submitted by &#32; /u/user <a href="https://reddit.com/r/pics/comments/abc/cool_photo/">[comments]</a></td></tr></table>',
        image_url: "https://alpha.example/thumb.jpg",
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-compact-expand-img-strip",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Act: expand the post
    const expandButton = tree!.root.findByProps({
      accessibilityLabel: "Expand post",
    });
    await act(async () => {
      await expandButton.props.onPress();
    });

    // Assert: the HTML rendered by SanitizedHtmlContent has no <img>, empty <a>, or empty <td>
    const { Text: RNText } = require("react-native");
    const htmlNodes = tree!.root
      .findAllByType(RNText)
      .filter(
        (node) =>
          typeof node.props.children === "string" &&
          (node.props.children as string).startsWith("HTML:")
      );
    expect(htmlNodes.length).toBeGreaterThan(0);
    for (const node of htmlNodes) {
      const html = node.props.children as string;
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/<a\b[^>]*>\s*<\/a>/i);
      expect(html).not.toMatch(/<td\b[^>]*>\s*<\/td>/i);
    }

    await act(async () => {
      tree!.unmount();
    });
  });

  it("shows reveal overlay for NSFW GIFs in card layout and shows Load GIF pill after reveal", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue([
      {
        id: 701,
        feed_id: 1,
        feed_title: "Alpha",
        title: "NSFW GIF post",
        url: "https://www.redgifs.com/watch/TightGif",
        content: null,
        image_url: "https://alpha.example/thumb.jpg",
        published_at: Date.now(),
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-nsfw-gif-card",
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

    // Assert: reveal overlay is shown and GIF is deferred
    expect(
      mockExpandedFeedMedia.mock.calls.some(
        ([props]) =>
          props.testID === "card-media-701" &&
          props.blur === true &&
          props.deferGifLoad === true
      )
    ).toBe(true);

    const revealButton = tree!.root.findByProps({
      accessibilityLabel: "Reveal NSFW media",
    });
    expect(revealButton).toBeTruthy();

    // Act — tap reveal
    await act(async () => {
      await revealButton.props.onPress();
    });

    // Assert: overlay is gone and GIF is still deferred (user must tap "Load GIF")
    expect(
      mockExpandedFeedMedia.mock.calls.some(
        ([props]) =>
          props.testID === "card-media-701" &&
          props.blur === false &&
          props.deferGifLoad === true
      )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("refreshes single layout to the first unread post", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({ feedLayout: "single" });
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
    const initialPage = [
      {
        id: 601,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Initially selected",
        url: "https://alpha.example/initial",
        content: "<p>Initial body</p>",
        image_url: null,
        published_at: 3_000,
        read: 0,
      },
    ];
    (getItemsPage as jest.Mock)
      // Initial mount query
      .mockResolvedValueOnce(initialPage)
      // Pull-to-refresh: immediate stale-while-revalidate query (unchanged)
      .mockResolvedValueOnce(initialPage)
      // Pull-to-refresh: post-refresh query returning the new items
      .mockResolvedValueOnce([
        {
          id: 602,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Read after refresh",
          url: "https://alpha.example/read",
          content: "<p>Read body</p>",
          image_url: null,
          published_at: 4_000,
          read: 1,
        },
        {
          id: 603,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Unread after refresh",
          url: "https://alpha.example/unread",
          content: "<p>Unread body</p>",
          image_url: null,
          published_at: 2_000,
          read: 0,
        },
      ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-refresh",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const scrollView = tree!.root.findByType(ScrollView);

    // Act
    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(refreshFeeds).toHaveBeenCalled();
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Unread after refresh"
        )
    ).toBe(true);
    expect(markItemRead).toHaveBeenCalledWith(603);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("keeps the same post active in single layout after a silent reload reorders the list", async () => {
    // Arrange: "newest" sort keeps ordering fully deterministic from
    // published_at, isolating this test from sortStacked's own behavior.
    (loadConfig as jest.Mock).mockReturnValue({
      feedLayout: "single",
      defaultSort: "newest",
    });
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
    const postA = {
      id: 701,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post A",
      url: "https://alpha.example/a",
      content: "<p>A</p>",
      image_url: null,
      published_at: 3_000,
      read: 0,
    };
    const postB = {
      id: 702,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post B",
      url: "https://alpha.example/b",
      content: "<p>B</p>",
      image_url: null,
      published_at: 2_000,
      read: 0,
    };
    const postC = {
      id: 703,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post C",
      url: "https://alpha.example/c",
      content: "<p>C</p>",
      image_url: null,
      published_at: 1_000,
      read: 0,
    };
    const postD = {
      id: 704,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post D",
      url: "https://alpha.example/d",
      content: "<p>D</p>",
      image_url: null,
      published_at: 5_000,
      read: 0,
    };
    (getItemsPage as jest.Mock)
      // Initial mount query: newest-first is A, B, C.
      .mockResolvedValueOnce([postA, postB, postC])
      // Silent focus-regain re-query: a new post (D) landed in the feed
      // (e.g. a background sync write), pushing B from index 1 to index 2.
      .mockResolvedValueOnce([postD, postA, postB, postC]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-silent-reload",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act: mount, then advance to post B (index 1).
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const nextButtons = tree!.root.findAllByProps({
      accessibilityLabel: "Next post",
    });
    await act(async () => {
      await nextButtons[0].props.onPress();
      await Promise.resolve();
    });

    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) => node.props.children === "Post B"
        )
    ).toBe(true);
    (markItemRead as jest.Mock).mockClear();

    // Act: simulate a real focus-regain (e.g. switching tabs away and back)
    // firing with the *same* scope, exactly like the emulator repro — not a
    // route/filter/sort change, and not the explicit pull-to-refresh path.
    const focusEffectCalls = (useFocusEffect as jest.Mock).mock.calls;
    const focusCallback = focusEffectCalls[
      focusEffectCalls.length - 1
    ][0] as () => void;
    await act(async () => {
      focusCallback();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert: still on post B, even though it moved from index 1 to index 2
    // in the reloaded/reordered list.
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) => node.props.children === "Post B"
        )
    ).toBe(true);
    // Post C (formerly at index 2, now at index 3) must never have been the
    // committed "current" item — proof there was no one-frame flash of the
    // wrong post before the resync applied.
    expect(markItemRead).not.toHaveBeenCalledWith(postC.id);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("falls back to a nearby valid index when the active post disappears in a silent reload", async () => {
    // Arrange
    (loadConfig as jest.Mock).mockReturnValue({
      feedLayout: "single",
      defaultSort: "newest",
    });
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
    const postA = {
      id: 801,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post A",
      url: "https://alpha.example/a2",
      content: "<p>A</p>",
      image_url: null,
      published_at: 2_000,
      read: 0,
    };
    const postB = {
      id: 802,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post B",
      url: "https://alpha.example/b2",
      content: "<p>B</p>",
      image_url: null,
      published_at: 1_000,
      read: 0,
    };
    const postE = {
      id: 803,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Post E",
      url: "https://alpha.example/e2",
      content: "<p>E</p>",
      image_url: null,
      published_at: 500,
      read: 0,
    };
    (getItemsPage as jest.Mock)
      // Initial mount query.
      .mockResolvedValueOnce([postA, postB])
      // Silent focus-regain re-query: post B (the active one) is gone.
      .mockResolvedValueOnce([postA, postE]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-silent-reload-gone",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act: mount, then advance to post B (index 1).
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const nextButtons = tree!.root.findAllByProps({
      accessibilityLabel: "Next post",
    });
    await act(async () => {
      await nextButtons[0].props.onPress();
      await Promise.resolve();
    });

    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) => node.props.children === "Post B"
        )
    ).toBe(true);

    // Act: silent refocus where the active post is no longer present.
    const focusEffectCalls = (useFocusEffect as jest.Mock).mock.calls;
    const focusCallback = focusEffectCalls[
      focusEffectCalls.length - 1
    ][0] as () => void;
    await act(async () => {
      focusCallback();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert: no crash, and it lands on a still-valid post rather than a
    // blank screen — the clamp effect's existing fallback behavior.
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) => node.props.children === "Post B"
        )
    ).toBe(false);
    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          (node: renderer.ReactTestInstance) =>
            node.props.children === "Post A" || node.props.children === "Post E"
        )
    ).toBe(true);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("searches within the current feed scope", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
        id: 503,
        feed_id: 1,
        feed_title: "Alpha",
        title: "Cookware review",
        url: "https://alpha.example/cookware",
        content: "Cast iron skillet care tips",
        image_url: null,
        published_at: Date.now() - 1000,
        read: 0,
      },
    ]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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

    expect(getItemsPage).toHaveBeenCalledWith(
      expect.objectContaining({ feedIds: [1] })
    );

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
    expect(visibleText).toContain("Cookware review");
    expect(visibleText).not.toContain("Local update");
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(1);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("searches across all feeds and post content when no scope is selected", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue([
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
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-search-all",
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

    expect(getItemsPage).toHaveBeenCalledWith(
      expect.objectContaining({ feedIds: null })
    );

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

  it("keeps a navigated post visible in unread filter until manual refresh", async () => {
    // Arrange: a single unread item in a single feed.  The user is on the
    // unread-filtered view, taps the post title (handleOpenItem), which adds
    // the post to retainedUnreadIds.  When the screen re-focuses (simulated by
    // a non-remote loadData call via tree.update) and the DB now reports the
    // item as read=1, the post must STILL appear because it is retained.  Only
    // an explicit pull-to-refresh (which clears retainedUnreadIds) should hide it.
    const now = Date.now();
    const feed = {
      id: 1,
      title: "Alpha",
      url: "https://alpha.example/rss.xml",
      description: null,
      last_fetched: now,
      error: null,
    };
    (getFeeds as jest.Mock).mockResolvedValue([feed]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    const unreadItem = {
      id: 801,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Retained post",
      url: "https://alpha.example/retained",
      content: null,
      image_url: null,
      published_at: now - 1000,
      read: 0,
    };
    (getItemsPage as jest.Mock).mockResolvedValue([unreadItem]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-retain-nav",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act – initial render
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Activate the unread filter.
    const filterTrigger = tree!.root
      .findAllByProps({ accessibilityLabel: "Filter posts" })
      .find(
        (node: renderer.ReactTestInstance) =>
          typeof node.props.onPress === "function"
      );
    await act(async () => {
      await filterTrigger!.props.onPress();
    });
    const unreadOption = tree!.root
      .findAllByProps({
        accessibilityLabel: "Unread",
        accessibilityRole: "menuitem",
      })
      .find(
        (node: renderer.ReactTestInstance) =>
          typeof node.props.onPress === "function"
      );
    await act(async () => {
      await unreadOption!.props.onPress();
    });

    // Item should be visible in the unread filter.
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Open post: Retained post" })
    ).toBeTruthy();

    // User taps the post title – this is the handleOpenItem path.
    // It adds the item to retainedUnreadIds and calls navigation.navigate.
    await act(async () => {
      tree!.root
        .findByProps({ accessibilityLabel: "Open post: Retained post" })
        .props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith(
      "FeedItemView",
      expect.objectContaining({
        item: expect.objectContaining({ itemId: 801 }),
      })
    );

    // The item was marked read in FeedItemScreen (simulated here by updating
    // the mock so the next getItemsPage call returns read=1).
    (getItemsPage as jest.Mock).mockResolvedValue([{ ...unreadItem, read: 1 }]);
    // Scope the re-focus to the tag containing this feed, so that loadData's
    // selectedTagId branch still includes the item when the focus-return
    // loadData call fires.
    (getFeedsForTag as jest.Mock).mockResolvedValue([feed]);

    // Simulate the screen re-focusing after navigation.back().  Changing
    // selectedTagId mutates loadData's dependency array, which causes the
    // useFocusEffect callback (mocked as useEffect) to re-fire with
    // refreshRemote=false – the same as on a native focus return.
    const returnRoute = {
      key: "Feed-retain-nav-2",
      name: "Feed",
      params: { selectedTagId: 1 },
    } as FeedScreenProps["route"];
    await act(async () => {
      tree!.update(
        <HeaderContentProvider>
          <FeedListScreen
            {...({ navigation, route: returnRoute } as FeedScreenProps)}
          />
        </HeaderContentProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Even though the DB now reports the item as read, it must still be
    // visible because retainedUnreadIds was not cleared on a focus return.
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Open post: Retained post" })
    ).toBeTruthy();

    // An explicit pull-to-refresh clears retainedUnreadIds and reloads data,
    // at which point the now-read item must disappear from the unread filter.
    const list = tree!.root.findByType(FlashList);
    await act(async () => {
      await list.props.onRefresh();
    });

    expect(refreshFeeds).toHaveBeenCalled();
    expect(() =>
      tree!.root.findByProps({ accessibilityLabel: "Open post: Retained post" })
    ).toThrow();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not render a feed layout toggle button", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue([]);
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
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

    // Assert: no toggle button present
    expect(() =>
      tree!.root.findByProps({ accessibilityLabel: "Toggle feed layout" })
    ).toThrow();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("loads additional pages until the scope is exhausted", async () => {
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
    (getItemsPage as jest.Mock)
      .mockResolvedValueOnce(makeItems(PAGE_SIZE, 1))
      .mockResolvedValueOnce(makeItems(1, PAGE_SIZE + 1));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-load-more",
      name: "Feed",
      params: { selectedFeedId: 1, selectedFeedTitle: "Alpha" },
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act: a full first page (PAGE_SIZE items) leaves hasMore=true, so
    // FlashList's onEndReached fires once on mount and fetches page two.
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    expect(getItemsPage).toHaveBeenCalledTimes(2);
    expect(getItemsPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        feedIds: [1],
        offset: PAGE_SIZE,
        limit: PAGE_SIZE,
      })
    );

    const allText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(allText).toContain("Post 1");
    expect(allText).toContain(`Post ${PAGE_SIZE + 1}`);

    // The second page was short, so hasMore is now false and a further
    // onEndReached does not fetch a third page.
    const list = tree!.root.findByType(FlashList);
    await act(async () => {
      await list.props.onEndReached();
    });

    expect(getItemsPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not request another page or render a footer once the scope is fully loaded", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(3, 1));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-no-more",
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

    const list = tree!.root.findByType(FlashList);

    // Assert: a short first page means no footer and onEndReached is a no-op
    expect(list.props.ListFooterComponent).toBeNull();

    await act(async () => {
      await list.props.onEndReached();
    });

    expect(getItemsPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not request additional pages while searching once the scope is fully loaded", async () => {
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
    (getItemsPage as jest.Mock)
      .mockResolvedValueOnce(makeItems(PAGE_SIZE, 1))
      .mockResolvedValueOnce(makeItems(5, PAGE_SIZE + 1));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-search-exhausted",
      name: "Feed",
      params: { selectedFeedId: 1, selectedFeedTitle: "Alpha" },
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act: FlashList's onEndReached drains both pages on mount, leaving
    // hasMore=false once the short second page comes back.
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getItemsPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      await tree!.root
        .findByProps({ accessibilityLabel: "Open search" })
        .props.onPress();
    });

    const searchInput = tree!.root.findByProps({
      accessibilityLabel: "Search feeds and posts",
    }) as renderer.ReactTestInstance;

    await act(async () => {
      await searchInput.props.onChangeText("post 1");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert: the search auto-loader effect sees hasMore=false and does not
    // fetch a third page.
    expect(getItemsPage).toHaveBeenCalledTimes(2);

    const visibleText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(visibleText).toContain("Post 1");

    await act(async () => {
      tree!.unmount();
    });
  });
});
