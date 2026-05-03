import React from "react";
import { Image } from "expo-image";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedsScreen from "../screens/FeedsScreen";
import { RootStackParamList, TabParamList } from "../types";
import { getFeeds } from "../database";

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  getTagsWithFeedCounts: jest.fn(() => Promise.resolve([])),
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
      border: "#ccc8db",
      danger: "#b44b4b",
    },
  }),
}));

jest.mock("../components/ui", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    DashedDivider: () => React.createElement(View),
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

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Feeds">,
  NativeStackScreenProps<RootStackParamList>
>;

function buildProps(): Props {
  return {
    navigation: {
      navigate: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "Feeds-test",
      name: "Feeds",
      params: undefined,
    } as Props["route"],
  };
}

describe("FeedsScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders a feed icon when feed URL has a valid web origin", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Example",
        url: "https://example.com/rss.xml",
        description: null,
        last_fetched: null,
        error: null,
      },
    ]);
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source.uri).toBe("https://example.com/favicon.ico");

    await act(async () => {
      tree!.unmount();
    });
  });

  it("does not render a feed icon for invalid feed URLs", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Broken",
        url: "not-a-url",
        description: null,
        last_fetched: null,
        error: null,
      },
    ]);
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert
    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(0);

    await act(async () => {
      tree!.unmount();
    });
  });

  it("navigates to a selected feed when feed row is pressed", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 7,
        title: "Tech News",
        url: "https://example.com/rss.xml",
        description: null,
        last_fetched: null,
        error: null,
      },
    ]);

    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const openButton = tree!.root.findByProps({
      accessibilityLabel: "Open Tech News",
    });

    await act(async () => {
      openButton.props.onPress();
    });

    // Assert
    expect(props.navigation.navigate).toHaveBeenCalledWith("Feed", {
      selectedFeedId: 7,
      selectedFeedTitle: "Tech News",
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("shows quick links for all feeds and saved", async () => {
    // Arrange
    (getFeeds as jest.Mock).mockResolvedValue([]);

    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<FeedsScreen {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const allFeedsLink = tree!.root.findByProps({
      accessibilityLabel: "Go to all feeds",
    });
    const savedLink = tree!.root.findByProps({
      accessibilityLabel: "Go to saved",
    });

    await act(async () => {
      allFeedsLink.props.onPress();
      savedLink.props.onPress();
    });

    // Assert
    expect(props.navigation.navigate).toHaveBeenCalledWith("Feed", {});
    expect(props.navigation.navigate).toHaveBeenCalledWith("Saved");

    await act(async () => {
      tree!.unmount();
    });
  });
});
