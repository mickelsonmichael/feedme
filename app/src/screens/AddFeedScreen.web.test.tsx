import React from "react";
import renderer, { act } from "react-test-renderer";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import AddFeedScreen from "./AddFeedScreen";
import { RootStackParamList, TabParamList } from "../types";

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
});
