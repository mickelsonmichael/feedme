import React from "react";
import { Platform } from "react-native";
import renderer, { act } from "react-test-renderer";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import FeedDetailScreen from "./FeedDetailScreen";
import { RootStackParamList, TabParamList } from "../types";
import { getFeeds, getTags, getTagsForFeed } from "../database";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RN = require("react-native");

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  deleteFeed: jest.fn(),
  updateFeed: jest.fn(),
  updateFeedLastFetched: jest.fn(),
  recordFeedFetchOutcome: jest.fn(),
  setFeedError: jest.fn(),
  upsertItems: jest.fn(),
  getTags: jest.fn(),
  getTagsForFeed: jest.fn(),
  getOrCreateTag: jest.fn(),
  setFeedTags: jest.fn(),
  getAllPublishedAtForFeed: jest.fn(),
  getAverageViewTimeForFeed: jest.fn(),
}));

jest.mock("../feedParser", () => ({
  fetchFeedWithMeta: jest.fn(),
}));

jest.mock("../redditUtils", () => ({
  isRedditUserFeedUrl: jest.fn(() => false),
  setRedditIncludeComments: jest.fn((url: string) => url),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require("react");
    React.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Feather: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});

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

jest.mock("../components/NotificationSettingsSection", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: () => React.createElement(View, null),
  };
});

jest.mock("../components/FeedStatsSection", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: () => React.createElement(View, null),
    FeedStatusBadge: () => React.createElement(View, null),
  };
});

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "FeedDetail">,
  NativeStackScreenProps<RootStackParamList>
>;

const RETURN_ITEM = {
  itemId: 22,
  title: "Test title",
  url: "https://example.com/item",
  content: "<p>Test content</p>",
  imageUrl: null,
  publishedAt: 1_700_000_000_000,
  feedTitle: "Test Feed",
  read: 1,
};

function buildProps(returnToItem?: typeof RETURN_ITEM): Props {
  return {
    navigation: {
      goBack: jest.fn(),
      navigate: jest.fn(),
      setOptions: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "FeedDetail-test",
      name: "FeedDetail",
      params: { feedId: 5, returnToItem },
    } as Props["route"],
  };
}

describe("FeedDetailScreen", () => {
  beforeEach(() => {
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 5,
        title: "Test Feed",
        url: "https://example.com/feed.xml",
        description: null,
        last_fetched: null,
        error: null,
      },
    ]);
    (getTags as jest.Mock).mockResolvedValue([]);
    (getTagsForFeed as jest.Mock).mockResolvedValue([]);
    const database = require("../database");
    (database.getAllPublishedAtForFeed as jest.Mock).mockResolvedValue([]);
    (database.getAverageViewTimeForFeed as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns to the Feeds tab when opened without a post to return to", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedDetailScreen {...props} />);
      await Promise.resolve();
    });

    const backButton = tree!.root.findByProps({
      accessibilityLabel: "Go back",
    });

    // Act
    await act(async () => {
      backButton.props.onPress();
    });

    // Assert
    expect(props.navigation.navigate).toHaveBeenCalledWith("Feeds");

    await act(async () => {
      tree!.unmount();
    });
  });

  it("returns to the originating post when opened from View Post", async () => {
    // Arrange
    const props = buildProps(RETURN_ITEM);
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedDetailScreen {...props} />);
      await Promise.resolve();
    });

    const backButton = tree!.root.findByProps({
      accessibilityLabel: "Go back",
    });

    // Act
    await act(async () => {
      backButton.props.onPress();
    });

    // Assert
    expect(props.navigation.navigate).toHaveBeenCalledWith("FeedItemView", {
      item: RETURN_ITEM,
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("returns to the originating post after deleting the feed from within the post scenario", async () => {
    // Arrange
    (getFeeds as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 5,
          title: "Test Feed",
          url: "https://example.com/feed.xml",
          description: null,
          last_fetched: null,
          error: null,
        },
      ])
      .mockResolvedValue([]);
    const { deleteFeed } = require("../database");
    (deleteFeed as jest.Mock).mockResolvedValue(undefined);
    const originalPlatformOS = Platform.OS;
    Platform.OS = "web";
    (window as unknown as { confirm: () => boolean }).confirm = jest.fn(
      () => true
    );
    const props = buildProps(RETURN_ITEM);
    let tree: renderer.ReactTestRenderer;

    try {
      await act(async () => {
        tree = renderer.create(<FeedDetailScreen {...props} />);
        await Promise.resolve();
      });

      const deleteButton = tree!.root.findByProps({
        accessibilityLabel: "Delete feed",
      });

      // Act
      await act(async () => {
        await deleteButton.props.onPress();
      });

      // Assert
      expect(deleteFeed).toHaveBeenCalledWith(5);
      expect(props.navigation.navigate).toHaveBeenCalledWith("FeedItemView", {
        item: RETURN_ITEM,
      });

      await act(async () => {
        tree!.unmount();
      });
    } finally {
      Platform.OS = originalPlatformOS;
    }
  });

  it("returns to the originating post via the desktop-web back button", async () => {
    // Arrange
    const originalPlatformOS = Platform.OS;
    Platform.OS = "web";
    const windowDimensionsSpy = jest
      .spyOn(RN, "useWindowDimensions")
      .mockReturnValue({ width: 1024, height: 768, scale: 1, fontScale: 1 });
    const props = buildProps(RETURN_ITEM);
    let tree: renderer.ReactTestRenderer;

    try {
      await act(async () => {
        tree = renderer.create(<FeedDetailScreen {...props} />);
        await Promise.resolve();
      });

      const backButton = tree!.root.findByProps({ accessibilityLabel: "Back" });

      // Act
      await act(async () => {
        backButton.props.onPress();
      });

      // Assert
      expect(props.navigation.navigate).toHaveBeenCalledWith("FeedItemView", {
        item: RETURN_ITEM,
      });

      await act(async () => {
        tree!.unmount();
      });
    } finally {
      Platform.OS = originalPlatformOS;
      windowDimensionsSpy.mockRestore();
    }
  });
});
