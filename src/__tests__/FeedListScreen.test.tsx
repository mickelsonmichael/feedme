import React from "react";
import { Text } from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedListScreen from "../screens/FeedListScreen";
import { RootStackParamList, TabParamList } from "../types";
import {
  getFeeds,
  getAllItems,
  markItemRead,
  getSavedItemIds,
} from "../database";
import { refreshFeeds } from "../feedRefresher";

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  getAllItems: jest.fn(),
  markItemRead: jest.fn(),
  savePost: jest.fn(),
  unsavePost: jest.fn(),
  getSavedItemIds: jest.fn(),
}));

jest.mock("../feedRefresher", () => ({
  refreshFeeds: jest.fn(),
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
}));

type FeedScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

describe("FeedListScreen", () => {
  afterEach(() => {
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
      tree = renderer.create(
        <FeedListScreen navigation={navigation} route={route} />
      );
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
      tree = renderer.create(
        <FeedListScreen navigation={navigation} route={route} />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const allText = tree!.root
      .findAllByType(Text)
      .map((node: renderer.ReactTestInstance) => node.props.children);

    // Assert
    expect(allText).toContain("Alpha post");
    expect(allText).not.toContain("Beta post");
    expect(allText).toContain("newest");
    expect(allText).not.toContain("stacked");

    await act(async () => {
      tree!.unmount();
    });
  });
});
