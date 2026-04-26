import React from "react";
import { Linking } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import FeedItemScreen from "../screens/FeedItemScreen";
import { RootStackParamList } from "../types";
import {
  getSavedItemIds,
  markItemRead,
  markItemUnread,
  savePost,
  unsavePost,
} from "../database";

jest.mock("../database", () => ({
  getSavedItemIds: jest.fn(),
  markItemRead: jest.fn(),
  markItemUnread: jest.fn(),
  savePost: jest.fn(),
  unsavePost: jest.fn(),
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

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Feather: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});

jest.mock("../components/ExpandedFeedMedia", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ExpandedFeedMedia: () => React.createElement(View, null),
  };
});

type Props = NativeStackScreenProps<RootStackParamList, "FeedItemView">;

function buildProps(read = 0): Props {
  return {
    navigation: {
      goBack: jest.fn(),
      setOptions: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "FeedItemView-test",
      name: "FeedItemView",
      params: {
        item: {
          itemId: 22,
          title: "Test title",
          url: "https://example.com/item",
          content: "<p>Test content</p>",
          imageUrl: null,
          publishedAt: 1_700_000_000_000,
          feedTitle: "Test Feed",
          read,
        },
      },
    } as Props["route"],
  };
}

function buildPropsWithContent(content: string): Props {
  const props = buildProps();
  return {
    ...props,
    route: {
      ...props.route,
      params: {
        ...props.route.params,
        item: {
          ...props.route.params.item,
          content,
        },
      },
    },
  };
}

describe("FeedItemScreen", () => {
  beforeEach(() => {
    (getSavedItemIds as jest.Mock).mockResolvedValue(new Set<number>());
    (markItemRead as jest.Mock).mockResolvedValue(undefined);
    (markItemUnread as jest.Mock).mockResolvedValue(undefined);
    (savePost as jest.Mock).mockResolvedValue(undefined);
    (unsavePost as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("marks an unread item as read on mount", async () => {
    // Arrange
    const props = buildProps(0);

    // Act
    await act(async () => {
      renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    // Assert
    expect(markItemRead).toHaveBeenCalledWith(22);
  });

  it("does not mark an already-read item again", async () => {
    // Arrange
    const props = buildProps(1);

    // Act
    await act(async () => {
      renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    // Assert
    expect(markItemRead).not.toHaveBeenCalled();
  });

  it("opens the external url from the action button", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    const openExternalButton = tree!.root.findByProps({
      accessibilityLabel: "Open External",
    });

    // Act
    await act(async () => {
      await openExternalButton.props.onPress();
    });

    // Assert
    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com/item");

    await act(async () => {
      tree!.unmount();
    });
  });

  it("saves when save button is pressed", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    const saveButton = tree!.root.findByProps({ accessibilityLabel: "Save" });

    // Act
    await act(async () => {
      await saveButton.props.onPress();
    });

    // Assert
    expect(savePost).toHaveBeenCalledTimes(1);
    expect(unsavePost).not.toHaveBeenCalled();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("marks a read item as unread when the action is pressed", async () => {
    // Arrange
    const props = buildProps(1);
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    const unreadButton = tree!.root.findByProps({
      accessibilityLabel: "Mark as unread",
    });

    // Act
    await act(async () => {
      await unreadButton.props.onPress();
    });

    // Assert
    expect(markItemUnread).toHaveBeenCalledWith(22);
    expect(
      tree!.root.findByProps({ accessibilityLabel: "Mark as read" })
    ).toBeTruthy();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("renders reddit comments in the action row and removes the link button", async () => {
    // Arrange
    const props = buildPropsWithContent(
      '&lt;table&gt;&lt;tr&gt;&lt;td&gt;&amp;#32; submitted by &amp;#32; &lt;a href="https://i.redd.it/9tn836q5uixg1.jpeg"&gt;[link]&lt;/a&gt; &amp;#32; &lt;a href="https://www.reddit.com/r/EarthPorn/comments/1sw5nrw/grand_canyon_of_the_yellowstone_and_the_lower/"&gt;[comments]&lt;/a&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;'
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<FeedItemScreen {...props} />);
      await Promise.resolve();
    });

    expect(
      tree!.root.findAllByProps({ accessibilityLabel: "Open Link" })
    ).toHaveLength(0);
    const openCommentsButton = tree!.root.findByProps({
      accessibilityLabel: "Open Reddit comments",
    });

    // Act
    await act(async () => {
      await openCommentsButton.props.onPress();
    });

    // Assert
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://www.reddit.com/r/EarthPorn/comments/1sw5nrw/grand_canyon_of_the_yellowstone_and_the_lower/"
    );

    await act(async () => {
      tree!.unmount();
    });
  });
});
