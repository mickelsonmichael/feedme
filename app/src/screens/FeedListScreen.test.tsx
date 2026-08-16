import React from "react";
import {
  Alert,
  Animated,
  AppState,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import type { AppStateStatus } from "react-native";
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
import { BackgroundSyncProvider } from "../context/BackgroundSyncContext";
import { BackgroundSyncBannerHost } from "../components/BackgroundSyncBannerHost";
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

// Mirrors App.tsx's composition: the sync banner is rendered by the navigator
// above the screen (so it survives tab switches), not by the screen itself, and
// both read the same provider.
function renderFeedListScreen(props: FeedScreenProps) {
  return renderer.create(
    <HeaderContentProvider>
      <BackgroundSyncProvider>
        <BackgroundSyncBannerHost />
        <FeedListScreen {...props} />
      </BackgroundSyncProvider>
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

// Which post the reader is actually *on*. The pager deliberately keeps
// neighbouring posts mounted either side of the active one, so "is this text
// in the tree?" no longer answers that question — several posts are always
// present by design.
function activePostTitle(tree: renderer.ReactTestRenderer): string | undefined {
  const active = tree.root
    .findAllByProps({ isActive: true })
    .find((node: renderer.ReactTestInstance) => node.props.item?.title);
  return active?.props.item?.title as string | undefined;
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

  it("refreshes remote on mobile app start (mount), and on pull-to-refresh, but not on a plain focus-regain", async () => {
    // Arrange - a mount is the app actually starting up (screens in the tab
    // navigator stay mounted for the process's whole lifetime), so it must
    // behave identically to a manual pull-to-refresh rather than silently
    // trusting whatever is left over in the local SQLite cache from the last
    // session. A later focus-regain with the same scope (e.g. switching tabs
    // away and back) is neither of those and must stay local-only.
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

    // Act - initial mount
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert - app start (the initial mount/focus) triggers a remote refresh,
    // matching a manual pull-to-refresh.
    expect(refreshFeeds).toHaveBeenCalledTimes(1);

    // Act - simulate a plain focus-regain with the same scope (e.g. switching
    // tabs away and back), not a remount and not pull-to-refresh.
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

    // Assert - a plain focus-regain does not trigger another remote refresh.
    expect(refreshFeeds).toHaveBeenCalledTimes(1);

    const list = tree!.root.findByType(FlashList);
    await act(async () => {
      await list.props.onRefresh();
    });

    // Assert - pull to refresh triggers remote refresh.
    expect(refreshFeeds).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("auto-refreshes on mobile cold start when the local cache is empty", async () => {
    // Arrange - simulates a fresh install: feeds exist, but nothing has been
    // cached to SQLite yet, so the first local page query comes back empty.
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Alpha",
        url: "https://alpha.example/rss.xml",
        description: null,
        last_fetched: null,
        error: null,
      },
    ]);
    (refreshFeeds as jest.Mock).mockResolvedValue(0);
    (getItemsPage as jest.Mock).mockResolvedValueOnce([]).mockResolvedValue(
      makeItems(1, 200, 1, "Alpha").map((item) => ({
        ...item,
        title: "Fetched after cold-start refresh",
      }))
    );
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-mobile-cold-start",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert - an empty cache on mobile triggers a remote refresh even
    // without a manual pull-to-refresh, and the refreshed items land.
    expect(refreshFeeds).toHaveBeenCalledTimes(1);
    const texts = tree!.root.findAllByType(Text);
    expect(
      texts.some((t) => t.props.children === "Fetched after cold-start refresh")
    ).toBe(true);

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
    const unreadPost = {
      id: 201,
      feed_id: 1,
      feed_title: "Alpha",
      title: "Unread post",
      url: "https://alpha.example/unread",
      content: "body",
      image_url: null,
      published_at: Date.now(),
      read: 0,
    };
    (getItemsPage as jest.Mock)
      // Mount's cached-first commit.
      .mockResolvedValueOnce([unreadPost])
      // Mount's own forced remote refresh (app start) — nothing changed yet.
      .mockResolvedValueOnce([unreadPost])
      // The user's later, explicit pull-to-refresh — the item was read
      // elsewhere in the meantime.
      .mockResolvedValueOnce([{ ...unreadPost, read: 1 }]);
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

  it("does not revert to a previous post when its delayed mark-as-read write lands after the user has moved on", async () => {
    // Arrange — the "mark as read" write for each post resolves only when
    // this test explicitly releases it, simulating a background DB write
    // that lands after further navigation (see database.ts's write-lock
    // queue, which can back writes up under rapid navigation).
    const pendingMarkReads: Array<{ id: number; resolve: () => void }> = [];
    (markItemRead as jest.Mock).mockImplementation(
      (id: number) =>
        new Promise<void>((resolve) => {
          pendingMarkReads.push({ id, resolve });
        })
    );
    const resolveMarkRead = (id: number) => {
      const pending = pendingMarkReads.find((p) => p.id === id);
      pending?.resolve();
    };

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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(3, 701));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-layout-delayed-mark-read",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    // Act — land on the first post, then advance twice before its
    // mark-as-read write ever resolves.
    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(markItemRead).toHaveBeenCalledWith(701);

    const nextButtons = () =>
      tree!.root.findAllByProps({ accessibilityLabel: "Next post" });

    await act(async () => {
      await nextButtons()[0].props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      await nextButtons()[0].props.onPress();
      await Promise.resolve();
    });

    expect(activePostTitle(tree!)).toBe("Post 703");

    // Act — the first post's delayed write finally lands, well after the
    // user moved on twice.
    await act(async () => {
      resolveMarkRead(701);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert — still on the third post; the stale write must not yank the
    // reader back to the first. (Post 701 is still *mounted* — it's two
    // slots back, inside the pager's window — but it is not the active
    // post, which is the thing that must not change.)
    expect(activePostTitle(tree!)).toBe("Post 703");

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

  it("slides the post card with the finger while dragging in single layout on native", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(2, 1001));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-swipe-drag",
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
      handlers: {
        onBegin: () => void;
        onUpdate: (event: unknown) => void;
      };
    };
    const getTranslateX = () => {
      const style = gestureDetector.findByType(Animated.View).props
        .style as Array<{
        transform?: Array<{ translateX: { __getValue: () => number } }>;
      }>;
      const withTransform = style.find((s) => s?.transform);
      return withTransform!.transform![0].translateX.__getValue();
    };

    // Assert — every post has a permanent absolute position (post i at
    // i * viewportWidth), so the track rests at -index * viewportWidth: zero
    // on the first post. The drag then tracks the finger exactly on top of
    // that resting offset.
    const restX = 0;
    expect(getTranslateX()).toBe(restX);

    await act(async () => {
      gesture.handlers.onBegin();
      gesture.handlers.onUpdate({ translationX: -45, translationY: 0 });
    });
    expect(getTranslateX()).toBe(restX - 45);

    await act(async () => {
      gesture.handlers.onUpdate({ translationX: -12, translationY: 0 });
    });
    expect(getTranslateX()).toBe(restX - 12);

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

  it("keeps single layout on the current post during a pull-to-refresh, then jumps to the first unread when the banner is tapped", async () => {
    // Arrange - a pull used to yank the reader to the first unread the instant
    // the sync finished, while pinning it under RefreshControl's spinner for
    // the whole fetch. The sync is now entirely background: the post being
    // read stays put and navigable, and the feed only moves on an explicit tap.
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
      // Initial mount: cached-first query
      .mockResolvedValueOnce(initialPage)
      // Initial mount: app-start forced refresh query (unchanged)
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

    // Assert - the fetch ran (forced, so backed-off feeds are not skipped) but
    // the reader has not been moved and nothing was committed underneath it.
    expect(refreshFeeds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true })
    );
    const duringRefresh = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(duringRefresh).toContain("Initially selected");
    expect(duringRefresh).not.toContain("Unread after refresh");
    expect(duringRefresh).toContain("New posts available. Tap to reload");

    // Act - the user accepts the new posts.
    await act(async () => {
      await tree!.root
        .findByProps({ accessibilityLabel: "Show new posts" })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert - now it lands on the first unread of the refreshed page.
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

  it("navigates to Edit Feed from the single layout overflow menu", async () => {
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
    (getItemsPage as jest.Mock).mockResolvedValue(makeItems(1, 701));
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-single-edit-feed",
      name: "Feed",
      params: undefined,
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
    });

    const moreButton = tree!.root.findByProps({
      accessibilityLabel: "More options",
    });

    await act(async () => {
      moreButton.props.onPress();
    });

    const editFeedButton = tree!.root.findByProps({
      accessibilityLabel: "Edit Feed",
    });

    // Act
    await act(async () => {
      editFeedButton.props.onPress();
    });

    // Assert
    expect(navigation.navigate).toHaveBeenCalledWith(
      "FeedDetail",
      expect.objectContaining({
        feedId: 1,
        returnToItem: expect.objectContaining({
          itemId: 701,
          title: "Post 701",
          feedTitle: "Alpha",
        }),
      })
    );

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
      // Initial mount: cached-first query, newest-first is A, B, C.
      .mockResolvedValueOnce([postA, postB, postC])
      // Initial mount: app-start forced refresh query (unchanged).
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

  it("keeps the reader on the post they are reading when a silent reload drops it from the query", async () => {
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
      // Initial mount: cached-first query.
      .mockResolvedValueOnce([postA, postB])
      // Initial mount: app-start forced refresh query (unchanged).
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

    expect(activePostTitle(tree!)).toBe("Post B");

    // Act: silent refocus where the active post is no longer in the query
    // results.
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

    // Assert: the reader does not move. This is a deliberate behaviour
    // change — this test previously asserted the opposite, that the reader
    // would land on "a still-valid post". That fallback *was* the bug: a
    // background refresh silently teleported the reader to whatever now sat
    // at index 0, mid-read, with no user action. The reading sequence is
    // frozen while the user is in it, so a post vanishing from a requery no
    // longer moves them; genuinely new posts arrive via the existing "New
    // posts available" button instead.
    expect(activePostTitle(tree!)).toBe("Post B");

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
      // Must keep the same tree shape as renderFeedListScreen: dropping a
      // provider here changes FeedListScreen's position and remounts it,
      // which would reset the very state this test is checking survives.
      tree!.update(
        <HeaderContentProvider>
          <BackgroundSyncProvider>
            <BackgroundSyncBannerHost />
            <FeedListScreen
              {...({ navigation, route: returnRoute } as FeedScreenProps)}
            />
          </BackgroundSyncProvider>
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
    // Keyed by offset rather than call order: the app-start forced refresh
    // (see [[feedme-verification-environment]]) means page 0 may now be
    // queried more than once before pagination kicks in, so a positional
    // mockResolvedValueOnce chain would be call-order-fragile here.
    (getItemsPage as jest.Mock).mockImplementation(
      ({ offset }: { offset: number }) =>
        Promise.resolve(
          offset === 0 ? makeItems(PAGE_SIZE, 1) : makeItems(1, PAGE_SIZE + 1)
        )
    );
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
      await Promise.resolve();
    });

    // Assert
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
    const callCountAfterMount = (getItemsPage as jest.Mock).mock.calls.length;
    const list = tree!.root.findByType(FlashList);
    await act(async () => {
      await list.props.onEndReached();
    });

    expect(getItemsPage).toHaveBeenCalledTimes(callCountAfterMount);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("re-queries every page it already has on a background refresh, not just the first", async () => {
    // Arrange — a full first page plus a short second page, so the screen
    // ends up holding more items than a single page's worth.
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
    (getItemsPage as jest.Mock).mockImplementation(
      ({ offset }: { offset: number }) =>
        Promise.resolve(
          offset === 0 ? makeItems(PAGE_SIZE, 1) : makeItems(5, PAGE_SIZE + 1)
        )
    );
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

    const navigation = {
      navigate: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      isFocused: jest.fn(() => true),
    } as unknown as FeedScreenProps["navigation"];
    const route = {
      key: "Feed-refresh-keeps-pages",
      name: "Feed",
      params: { selectedFeedId: 1, selectedFeedTitle: "Alpha" },
    } as FeedScreenProps["route"];
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Act — a background refresh re-queries page 0 and commits the result
    // over the top of the whole list.
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

    // Assert — that commit asks for everything already loaded. Asking for
    // only PAGE_SIZE would silently discard every item past the first page,
    // which in the single-post reader deletes the post being read and drops
    // the reader back to the top of the list.
    const pageZeroLimits = (getItemsPage as jest.Mock).mock.calls
      .map(([args]: [{ offset: number; limit: number }]) => args)
      .filter((args: { offset: number }) => args.offset === 0)
      .map((args: { limit: number }) => args.limit);
    expect(pageZeroLimits[pageZeroLimits.length - 1]).toBe(PAGE_SIZE + 5);

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

    // Two calls from the initial mount (cached-first query, then the
    // app-start forced refresh's post-refresh query) — the short page means
    // hasMore stays false throughout, so onEndReached never fetches a third.
    expect(getItemsPage).toHaveBeenCalledTimes(2);

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
    // Keyed by offset rather than call order — see the "loads additional
    // pages" test above for why a positional mockResolvedValueOnce chain is
    // fragile now that mount always does its own app-start refresh pass.
    (getItemsPage as jest.Mock).mockImplementation(
      ({ offset }: { offset: number }) =>
        Promise.resolve(
          offset === 0 ? makeItems(PAGE_SIZE, 1) : makeItems(5, PAGE_SIZE + 1)
        )
    );
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
      await Promise.resolve();
    });

    const callCountAfterMount = (getItemsPage as jest.Mock).mock.calls.length;

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
    expect(getItemsPage).toHaveBeenCalledTimes(callCountAfterMount);

    const visibleText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);
    expect(visibleText).toContain("Post 1");

    await act(async () => {
      tree!.unmount();
    });
  });

  describe("background sync banners", () => {
    const feed = {
      id: 1,
      title: "Alpha",
      url: "https://alpha.example/rss.xml",
      description: null,
      last_fetched: Date.now(),
      error: null,
    };

    /** Drains the microtask queue enough times for loadData's chain of awaits
     *  (feeds -> cached page -> refresh -> feeds -> refreshed page) to settle. */
    const flush = async () => {
      for (let i = 0; i < 16; i += 1) {
        await Promise.resolve();
      }
    };

    const makeNavigation = () =>
      ({
        navigate: jest.fn(),
        addListener: jest.fn(() => jest.fn()),
        isFocused: jest.fn(() => true),
      }) as unknown as FeedScreenProps["navigation"];

    const textContents = (tree: renderer.ReactTestRenderer) =>
      tree.root
        .findAllByType(Text)
        .map((node: renderer.ReactTestInstance) => node.props.children);

    const hasBanner = (tree: renderer.ReactTestRenderer) =>
      tree.root.findAllByProps({ testID: "background-sync-banner" }).length > 0;

    it("keeps cached posts readable behind a sync banner on cold start, then offers a tap-to-reset banner", async () => {
      // Arrange - the cache holds one post; the network refresh brings a newer
      // one. The user must keep reading the cached post throughout, and the
      // new one must not appear until they ask for it.
      const cached = [
        {
          id: 1101,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Already cached",
          url: "https://alpha.example/cached",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];
      const refreshed = [
        {
          ...cached[0],
          id: 1102,
          title: "Arrived during sync",
          url: "https://alpha.example/new",
          published_at: 2_000,
        },
        ...cached,
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock)
        .mockResolvedValueOnce(cached)
        .mockResolvedValue(refreshed);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (markItemRead as jest.Mock).mockResolvedValue(undefined);

      let releaseRefresh: (errors: number) => void = () => {};
      (refreshFeeds as jest.Mock).mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            releaseRefresh = resolve;
          })
      );

      const route = {
        key: "Feed-bg-sync",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      // Act - mount (app start) and let the cached page commit while the
      // network refresh is still in flight.
      await act(async () => {
        tree = renderFeedListScreen({
          navigation: makeNavigation(),
          route,
        } as FeedScreenProps);
        await flush();
      });

      // Assert - cached post is on screen, sync is announced, not taken over.
      expect(hasBanner(tree!)).toBe(true);
      expect(textContents(tree!)).toContain("Already cached");
      expect(
        tree!.root.findAllByProps({ testID: "feed-loading-screen" })
      ).toHaveLength(0);

      // Act - the network refresh lands.
      await act(async () => {
        releaseRefresh(0);
        await flush();
      });

      // Assert - the sync banner is replaced by the tap-to-reset banner, and
      // the new post is still held back.
      expect(hasBanner(tree!)).toBe(false);
      const afterSync = textContents(tree!);
      expect(afterSync).toContain("New posts available. Tap to reload");
      expect(afterSync).toContain("Already cached");
      expect(afterSync).not.toContain("Arrived during sync");

      // Act - the user taps it.
      await act(async () => {
        await tree!.root
          .findByProps({ accessibilityLabel: "Show new posts" })
          .props.onPress();
        await flush();
      });

      // Assert - the feed resets onto the freshly synced posts.
      const afterReset = textContents(tree!);
      expect(afterReset).toContain("Arrived during sync");
      expect(afterReset).not.toContain("New posts available. Tap to reload");

      await act(async () => {
        tree!.unmount();
      });
    });

    it("keeps the banner and the sync alive across a tab switch away and back", async () => {
      // Arrange - the banner is rendered by the navigator (BackgroundSyncBannerHost)
      // rather than by the screen, so leaving the Feed tab for Feeds/Discover/
      // Settings must not make an in-flight sync look like it stopped. The
      // focus-regain on the way back must also leave the running sync alone:
      // it is a non-deferred load, so without a guard it would clear the banner
      // and bump the load generation, silently discarding the sync's result.
      const cached = [
        {
          id: 1301,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Cached while away",
          url: "https://alpha.example/cached",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];
      const refreshed = [
        {
          ...cached[0],
          id: 1302,
          title: "Synced while away",
          url: "https://alpha.example/new",
          published_at: 2_000,
        },
        ...cached,
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock)
        .mockResolvedValueOnce(cached)
        .mockResolvedValue(refreshed);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());

      let releaseRefresh: (errors: number) => void = () => {};
      (refreshFeeds as jest.Mock).mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            releaseRefresh = resolve;
          })
      );

      const route = {
        key: "Feed-bg-sync-tabswitch",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      // Act - cold start; the cached page commits, the sync stays in flight.
      await act(async () => {
        tree = renderFeedListScreen({
          navigation: makeNavigation(),
          route,
        } as FeedScreenProps);
        await flush();
      });
      expect(hasBanner(tree!)).toBe(true);

      const refreshCallsDuringSync = (refreshFeeds as jest.Mock).mock.calls
        .length;

      // Act - the user switches to another tab and comes back mid-sync. The
      // screen stays mounted, so this surfaces as the focus effect re-firing.
      const focusEffectCalls = (useFocusEffect as jest.Mock).mock.calls;
      const focusCallback = focusEffectCalls[
        focusEffectCalls.length - 1
      ][0] as () => void;
      await act(async () => {
        focusCallback();
        await flush();
      });

      // Assert - the banner is still up and no competing load was kicked off.
      expect(hasBanner(tree!)).toBe(true);
      expect((refreshFeeds as jest.Mock).mock.calls.length).toBe(
        refreshCallsDuringSync
      );

      // Act - the sync finally lands, after the round trip.
      await act(async () => {
        releaseRefresh(0);
        await flush();
      });

      // Assert - its result was not discarded by the focus-regain: the user
      // still gets the tap-to-reset banner, with the new post held back.
      expect(hasBanner(tree!)).toBe(false);
      const afterSync = textContents(tree!);
      expect(afterSync).toContain("New posts available. Tap to reload");
      expect(afterSync).toContain("Cached while away");
      expect(afterSync).not.toContain("Synced while away");

      await act(async () => {
        tree!.unmount();
      });
    });

    it("runs the same deferred sync in single layout and resets to the newest post when tapped", async () => {
      // Arrange - the single-post reader is where an unannounced mid-read list
      // swap hurts most, so it gets the banner flow too rather than having new
      // items pushed under the reader.
      (loadConfig as jest.Mock).mockReturnValue({
        feedLayout: "single",
        defaultSort: "newest",
      });
      const cached = [
        {
          id: 1201,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Being read now",
          url: "https://alpha.example/reading",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];
      const refreshed = [
        {
          ...cached[0],
          id: 1202,
          title: "Newest synced post",
          url: "https://alpha.example/newest",
          published_at: 2_000,
          read: 0,
        },
        { ...cached[0], read: 1 },
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock)
        .mockResolvedValueOnce(cached)
        .mockResolvedValue(refreshed);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (markItemRead as jest.Mock).mockResolvedValue(undefined);

      let releaseRefresh: (errors: number) => void = () => {};
      (refreshFeeds as jest.Mock).mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            releaseRefresh = resolve;
          })
      );

      const route = {
        key: "Feed-bg-sync-single",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      // Act
      await act(async () => {
        tree = renderFeedListScreen({
          navigation: makeNavigation(),
          route,
        } as FeedScreenProps);
        await flush();
      });

      // Assert - the post stays put and swipeable while the sync runs.
      expect(hasBanner(tree!)).toBe(true);
      expect(textContents(tree!)).toContain("Being read now");

      await act(async () => {
        releaseRefresh(0);
        await flush();
      });

      // Assert - the reader is not moved off the post they were on.
      const afterSync = textContents(tree!);
      expect(afterSync).toContain("New posts available. Tap to reload");
      expect(afterSync).toContain("Being read now");
      expect(afterSync).not.toContain("Newest synced post");

      await act(async () => {
        await tree!.root
          .findByProps({ accessibilityLabel: "Show new posts" })
          .props.onPress();
        await flush();
      });

      // Assert - tapping resets the reader onto the newest synced post.
      expect(textContents(tree!)).toContain("Newest synced post");

      await act(async () => {
        tree!.unmount();
      });
    });

    it("shows the sync banner for a manual pull-to-refresh in the single-post reader", async () => {
      // Arrange - the banner used to be tied to the deferred (cold-start) path
      // only, so pulling to refresh in single layout surfaced nothing beyond
      // the pull spinner. Any refresh running over live content announces
      // itself.
      (loadConfig as jest.Mock).mockReturnValue({
        feedLayout: "single",
        defaultSort: "newest",
      });
      const posts = [
        {
          id: 1501,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Reader post",
          url: "https://alpha.example/reader",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];
      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock).mockResolvedValue(posts);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (markItemRead as jest.Mock).mockResolvedValue(undefined);
      (refreshFeeds as jest.Mock).mockResolvedValue(0);

      const route = {
        key: "Feed-single-manual-refresh",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      await act(async () => {
        tree = renderFeedListScreen({
          navigation: makeNavigation(),
          route,
        } as FeedScreenProps);
        await flush();
      });

      // Cold-start sync has settled; the banner should be gone.
      expect(hasBanner(tree!)).toBe(false);

      // Act - hold the refresh open so the in-flight state is observable.
      let releaseRefresh: (errors: number) => void = () => {};
      (refreshFeeds as jest.Mock).mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            releaseRefresh = resolve;
          })
      );
      const scrollView = tree!.root.findAllByType(ScrollView)[0];
      await act(async () => {
        scrollView.props.refreshControl.props.onRefresh();
        await flush();
      });

      // Assert - banner up, post still readable underneath.
      expect(hasBanner(tree!)).toBe(true);
      expect(textContents(tree!)).toContain("Reader post");
      // An explicit pull must bypass adaptive scheduling, or feeds still in
      // backoff from the cold-start sync are all skipped and it fetches
      // nothing.
      expect(refreshFeeds).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ force: true })
      );

      await act(async () => {
        releaseRefresh(0);
        await flush();
      });
      expect(hasBanner(tree!)).toBe(false);

      await act(async () => {
        tree!.unmount();
      });
    });

    it("does not flash the loading screen while the cached page is still being read", async () => {
      // Arrange - on a restart the first local read costs real time (schema
      // init + the page query). Rendering the full loader across that window
      // makes a restart look like the app is loading from scratch, which is
      // the takeover the background banner exists to replace. It must hold
      // quietly instead, and only escalate if the read genuinely drags.
      jest.useFakeTimers();
      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (refreshFeeds as jest.Mock).mockResolvedValue(0);

      let releaseItems: (rows: unknown[]) => void = () => {};
      (getItemsPage as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseItems = resolve;
          })
      );

      const route = {
        key: "Feed-restart-hold",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      // Act - mount with the page read still outstanding.
      await act(async () => {
        tree = renderFeedListScreen({
          navigation: makeNavigation(),
          route,
        } as FeedScreenProps);
        await flush();
      });

      // Assert - quiet hold, no loading screen.
      expect(
        tree!.root.findAllByProps({ testID: "feed-loading-screen" })
      ).toHaveLength(0);
      expect(
        tree!.root.findAllByProps({ testID: "initial-load-hold" }).length
      ).toBeGreaterThan(0);

      // Act - the read outlives the grace window.
      await act(async () => {
        jest.advanceTimersByTime(1_500);
        await flush();
      });

      // Assert - now the loader is warranted (this is the empty/slow case).
      expect(
        tree!.root.findAllByProps({ testID: "feed-loading-screen" }).length
      ).toBeGreaterThan(0);

      // Act - the cached page finally lands.
      await act(async () => {
        releaseItems([
          {
            id: 1401,
            feed_id: 1,
            feed_title: "Alpha",
            title: "Cached after all",
            url: "https://alpha.example/cached",
            content: "body",
            image_url: null,
            published_at: 1_000,
            read: 0,
          },
        ]);
        await flush();
      });

      // Assert - content replaces the loader.
      expect(textContents(tree!)).toContain("Cached after all");

      await act(async () => {
        tree!.unmount();
        jest.runOnlyPendingTimers();
      });
    });

    it("syncs behind the banner when the app returns from the background", async () => {
      // Arrange - the tab navigator keeps this screen mounted, so returning to
      // the app fires no focus effect. Without an AppState listener a resumed
      // app would show whatever was cached at launch and never sync.
      const cached = [
        {
          id: 1301,
          feed_id: 1,
          feed_title: "Alpha",
          title: "From before backgrounding",
          url: "https://alpha.example/before",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];
      const refreshed = [
        {
          ...cached[0],
          id: 1302,
          title: "Synced on resume",
          url: "https://alpha.example/resume",
          published_at: 2_000,
        },
        ...cached,
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock)
        .mockResolvedValueOnce(cached)
        .mockResolvedValue(refreshed);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (markItemRead as jest.Mock).mockResolvedValue(undefined);
      (refreshFeeds as jest.Mock).mockResolvedValue(0);

      const appStateHandlers: Array<(state: AppStateStatus) => void> = [];
      const addEventListenerSpy = jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((_event, handler) => {
          appStateHandlers.push(handler as (state: AppStateStatus) => void);
          return { remove: jest.fn() } as never;
        });
      // The resume sync is gated behind an idle window (see
      // RESUME_REFRESH_IDLE_MS) — advance the clock past it before resuming so
      // this test exercises a resume that is actually due, not one the idle
      // gate would swallow.
      const realDateNow = Date.now;
      let mockNow = realDateNow();
      const dateNowSpy = jest
        .spyOn(Date, "now")
        .mockImplementation(() => mockNow);

      const route = {
        key: "Feed-bg-sync-resume",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      try {
        // Act - launch, then let the cold-start sync settle.
        await act(async () => {
          tree = renderFeedListScreen({
            navigation: makeNavigation(),
            route,
          } as FeedScreenProps);
          await flush();
        });
        await act(async () => {
          await tree!.root
            .findByProps({ accessibilityLabel: "Show new posts" })
            .props.onPress();
          await flush();
        });
        const refreshCallsAfterStart = (refreshFeeds as jest.Mock).mock.calls
          .length;

        // Act - background the app, wait past the debounce window, then return.
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("background"));
          await flush();
        });
        mockNow += 16 * 60 * 1_000;
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("active"));
          await flush();
        });

        // Assert - resuming syncs again, without a loading takeover.
        expect((refreshFeeds as jest.Mock).mock.calls.length).toBeGreaterThan(
          refreshCallsAfterStart
        );
        expect(
          tree!.root.findAllByProps({ testID: "feed-loading-screen" })
        ).toHaveLength(0);
        expect(textContents(tree!)).toContain("Synced on resume");

        await act(async () => {
          tree!.unmount();
        });
      } finally {
        addEventListenerSpy.mockRestore();
        dateNowSpy.mockRestore();
      }
    });

    it("does not sync again when the app briefly loses and regains foreground", async () => {
      // Arrange - leaving the app for a moment (switching apps, or opening a
      // link in the external browser) and coming straight back used to fire
      // an entire new refresh every time. Nothing can plausibly be new that
      // quickly, so a resume within RESUME_REFRESH_IDLE_MS of the last
      // automatic refresh should be a no-op.
      const cached = [
        {
          id: 1301,
          feed_id: 1,
          feed_title: "Alpha",
          title: "From before backgrounding",
          url: "https://alpha.example/before",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock).mockResolvedValue(cached);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (refreshFeeds as jest.Mock).mockResolvedValue(0);

      const appStateHandlers: Array<(state: AppStateStatus) => void> = [];
      const addEventListenerSpy = jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((_event, handler) => {
          appStateHandlers.push(handler as (state: AppStateStatus) => void);
          return { remove: jest.fn() } as never;
        });

      const route = {
        key: "Feed-bg-sync-debounced",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      try {
        // Act - launch, then let the cold-start sync settle.
        await act(async () => {
          tree = renderFeedListScreen({
            navigation: makeNavigation(),
            route,
          } as FeedScreenProps);
          await flush();
        });
        const refreshCallsAfterStart = (refreshFeeds as jest.Mock).mock.calls
          .length;

        // Act - background the app for only a moment, then return to it.
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("background"));
          await flush();
        });
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("active"));
          await flush();
        });

        // Assert - no additional sync was triggered.
        expect((refreshFeeds as jest.Mock).mock.calls.length).toBe(
          refreshCallsAfterStart
        );

        await act(async () => {
          tree!.unmount();
        });
      } finally {
        addEventListenerSpy.mockRestore();
      }
    });

    it("does not sync on resume if the user was reading a post moments before backgrounding", async () => {
      // Arrange - the idle gate is keyed off activity, not just the last
      // refresh (see RESUME_REFRESH_IDLE_MS / lastActiveAtRef). Opening a
      // post's external link backgrounds and immediately re-foregrounds the
      // app; without folding activity into the gate, that would look exactly
      // like "the user was away" even though the last sync was long ago, and
      // yank the feed out from under whatever they were just reading.
      const cached = [
        {
          id: 1301,
          feed_id: 1,
          feed_title: "Alpha",
          title: "Read while away",
          url: "https://alpha.example/read-while-away",
          content: "body",
          image_url: null,
          published_at: 1_000,
          read: 0,
        },
      ];

      (getFeeds as jest.Mock).mockResolvedValue([feed]);
      (getItemsPage as jest.Mock).mockResolvedValue(cached);
      (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
      (refreshFeeds as jest.Mock).mockResolvedValue(0);

      const appStateHandlers: Array<(state: AppStateStatus) => void> = [];
      const addEventListenerSpy = jest
        .spyOn(AppState, "addEventListener")
        .mockImplementation((_event, handler) => {
          appStateHandlers.push(handler as (state: AppStateStatus) => void);
          return { remove: jest.fn() } as never;
        });
      const mockNavigate = jest.fn();
      const navigation = {
        navigate: mockNavigate,
        addListener: jest.fn(() => jest.fn()),
        isFocused: jest.fn(() => true),
      } as unknown as FeedScreenProps["navigation"];
      const realDateNow = Date.now;
      let currentTime = realDateNow();
      const mockNow = jest
        .spyOn(Date, "now")
        .mockImplementation(() => currentTime);

      const route = {
        key: "Feed-bg-sync-activity-extends-idle",
        name: "Feed",
        params: undefined,
      } as FeedScreenProps["route"];
      let tree: renderer.ReactTestRenderer;

      try {
        // Act - launch, then let the cold-start sync settle.
        await act(async () => {
          tree = renderFeedListScreen({ navigation, route } as FeedScreenProps);
          await flush();
        });
        const refreshCallsAfterStart = (refreshFeeds as jest.Mock).mock.calls
          .length;

        // Act - well past the idle window, the user opens a post (activity).
        currentTime += 20 * 60 * 1_000;
        await act(async () => {
          tree!.root
            .findByProps({
              accessibilityLabel: "Open post: Read while away",
            })
            .props.onPress();
          await flush();
        });
        expect(mockNavigate).toHaveBeenCalledWith(
          "FeedItemView",
          expect.anything()
        );

        // Act - moments later, background the app (e.g. to open the post's
        // link externally) and return right away.
        currentTime += 5_000;
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("background"));
          await flush();
        });
        await act(async () => {
          appStateHandlers.forEach((handler) => handler("active"));
          await flush();
        });

        // Assert - no additional sync was triggered, because the recent
        // activity (opening the post) reset the idle clock.
        expect((refreshFeeds as jest.Mock).mock.calls.length).toBe(
          refreshCallsAfterStart
        );

        await act(async () => {
          tree!.unmount();
        });
      } finally {
        addEventListenerSpy.mockRestore();
        mockNow.mockRestore();
      }
    });
  });
});
