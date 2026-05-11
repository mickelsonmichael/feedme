import React from "react";
import { Switch, Text, TouchableOpacity } from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import { RootStackParamList, TabParamList } from "../types";
import {
  getFeeds,
  getFeedsForTag,
  getMaxItemIdForFeed,
  getTags,
  setFeedNotificationCheckpoint,
  setFeedNotificationSettings,
  setTagNotificationEnabled,
} from "../database";
import { ensureNotificationPermissions } from "../notifications";

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

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  getFeedsForTag: jest.fn(async () => [{ id: 1 }]),
  getTags: jest.fn(),
  getMaxItemIdForFeed: jest.fn(),
  setFeedNotificationCheckpoint: jest.fn(),
  setFeedNotificationSettings: jest.fn(),
  setFeedDailyNotificationSentAt: jest.fn(),
  setTagNotificationEnabled: jest.fn(),
}));

jest.mock("../notifications", () => ({
  ensureNotificationPermissions: jest.fn(),
  getNotificationPermissionGranted: jest.fn(async () => true),
}));

type FeedProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "NotificationSettings">,
  NativeStackScreenProps<RootStackParamList>
>;

function buildFeedProps(): FeedProps {
  return {
    navigation: {
      navigate: jest.fn(),
    } as unknown as FeedProps["navigation"],
    route: {
      key: "notify-feed",
      name: "NotificationSettings",
      params: { source: "feed", feedId: 1 },
    } as FeedProps["route"],
  };
}

function buildTagProps(): FeedProps {
  return {
    navigation: {
      navigate: jest.fn(),
    } as unknown as FeedProps["navigation"],
    route: {
      key: "notify-tag",
      name: "NotificationSettings",
      params: { source: "tag", tagId: 2 },
    } as FeedProps["route"],
  };
}

describe("NotificationSettingsScreen", () => {
  beforeEach(() => {
    (getFeeds as jest.Mock).mockResolvedValue([
      { id: 1, title: "Feed One", notify_enabled: 0, notify_frequency: "off" },
    ]);
    (getTags as jest.Mock).mockResolvedValue([
      { id: 2, name: "News", notify_enabled: 0 },
    ]);
    (getFeedsForTag as jest.Mock).mockResolvedValue([{ id: 1 }]);
    (getMaxItemIdForFeed as jest.Mock).mockResolvedValue(42);
    (ensureNotificationPermissions as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("enables feed notifications and sets initial checkpoint", async () => {
    // Arrange
    const props = buildFeedProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<NotificationSettingsScreen {...props} />);
    });

    const toggle = tree!.root.findAllByType(Switch)[0];
    await act(async () => {
      await toggle.props.onValueChange(true);
    });

    // Assert
    expect(setFeedNotificationCheckpoint).toHaveBeenCalledWith(1, 42);
    expect(setFeedNotificationSettings).toHaveBeenCalledWith(1, {
      enabled: true,
      frequency: "immediate",
    });
  });

  it("enables tag notifications", async () => {
    // Arrange
    const props = buildTagProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<NotificationSettingsScreen {...props} />);
    });

    const toggle = tree!.root.findAllByType(Switch)[0];
    await act(async () => {
      await toggle.props.onValueChange(true);
    });

    // Assert
    expect(setTagNotificationEnabled).toHaveBeenCalledWith(2, true);
  });

  it("sets daily digest when selected", async () => {
    // Arrange
    const props = buildFeedProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<NotificationSettingsScreen {...props} />);
    });

    const dailyButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node) =>
        node.findAllByType(Text).some((label) => label.props.children === "Daily digest")
      );
    expect(dailyButton).toBeTruthy();

    await act(async () => {
      await dailyButton!.props.onPress();
    });

    // Assert
    expect(setFeedNotificationSettings).toHaveBeenCalledWith(1, {
      enabled: true,
      frequency: "daily",
    });
  });
});
