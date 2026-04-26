import React from "react";
import renderer, { act } from "react-test-renderer";
import { Alert, Switch, Text, TextInput, TouchableOpacity } from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import AddFeedScreen from "./AddFeedScreen";
import { RootStackParamList, TabParamList } from "../types";
import { addFeed } from "../database";

jest.mock("../feedParser", () => ({
  extractFeedTitle: jest.fn(() => ""),
}));

jest.mock("../proxyFetch", () => ({
  fetchWithProxyFallback: jest.fn(async () => ({
    response: {
      ok: true,
      status: 200,
      text: async () => "",
    },
    usedProxy: false,
  })),
}));

jest.mock("../database", () => ({
  addFeed: jest.fn(),
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

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "AddFeed">,
  NativeStackScreenProps<RootStackParamList>
>;

function buildProps(): Props {
  return {
    navigation: {
      goBack: jest.fn(),
      navigate: jest.fn(),
      jumpTo: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "AddFeed-test",
      name: "AddFeed",
      params: undefined,
    } as Props["route"],
  };
}

describe("AddFeedScreen web", () => {
  beforeEach(() => {
    (addFeed as jest.Mock).mockResolvedValue(1);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("opens ImportExport from OPML link", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<AddFeedScreen {...props} />);
      await Promise.resolve();
    });

    const opmlLink = tree!.root.findByProps({
      accessibilityLabel: "Open OPML Import Export",
    });

    await act(async () => {
      opmlLink.props.onPress();
    });

    // Assert
    expect(props.navigation.navigate).toHaveBeenCalledWith("ImportExport");
  });

  it("includes nsfw=1 when adding a feed with NSFW enabled", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<AddFeedScreen {...props} />);
      await Promise.resolve();
    });

    const urlInput = tree!.root.findByProps({
      placeholder: "https://example.com/feed.xml",
    }) as renderer.ReactTestInstance;

    await act(async () => {
      await urlInput.props.onChangeText("https://example.com/feed.xml");
    });

    const allTextInputs = tree!.root.findAllByType(TextInput);
    const titleInput = allTextInputs[1] as renderer.ReactTestInstance;

    await act(async () => {
      await titleInput.props.onChangeText("Example Feed");
    });

    const nsfwSwitch = tree!.root.findAllByType(Switch)[0];

    await act(async () => {
      await nsfwSwitch.props.onValueChange(true);
    });

    const addButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node) =>
        node
          .findAllByType(Text)
          .some((label) => label.props.children === "Add Feed")
      ) as renderer.ReactTestInstance;

    // Act
    await act(async () => {
      await addButton.props.onPress();
    });

    // Assert
    expect(addFeed).toHaveBeenCalledWith({
      title: "Example Feed",
      url: "https://example.com/feed.xml",
      description: null,
      use_proxy: 0,
      nsfw: 1,
    });
  });
});
