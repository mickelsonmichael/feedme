import React from "react";
import { Alert, Platform, Text, TouchableOpacity } from "react-native";
import { CompositeScreenProps } from "@react-navigation/native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import renderer, { act } from "react-test-renderer";
import SettingsScreen from "../screens/SettingsScreen";
import { RootStackParamList, TabParamList } from "../types";
import { loadConfig, saveConfig } from "../storage";
import { resetStatistics } from "../database";

const mockSetMode = jest.fn();

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "#faf8f3",
      ink: "#1e1a3a",
      inkSoft: "#6a6487",
      inkFaint: "#b8b2cc",
      accent: "#3d358f",
      border: "#ccc8db",
      danger: "#b44b4b",
    },
    mode: "system",
    setMode: mockSetMode,
  }),
}));

jest.mock("../storage", () => ({
  loadConfig: jest.fn(() => ({})),
  saveConfig: jest.fn(),
}));

jest.mock("../notifications", () => ({
  updateBackgroundSyncSchedule: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../feedRefresher", () => ({
  refreshFeeds: jest.fn(),
}));

jest.mock("../database", () => ({
  getFeeds: jest.fn().mockResolvedValue([]),
  resetStatistics: jest.fn().mockResolvedValue(undefined),
}));

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Settings">,
  NativeStackScreenProps<RootStackParamList>
>;

function buildProps(): Props {
  return {
    navigation: {
      navigate: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "Settings-test",
      name: "Settings",
      params: undefined,
    } as Props["route"],
  };
}

describe("SettingsScreen", () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "ios",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    (loadConfig as jest.Mock).mockReturnValue({});
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOs,
    });
  });

  it("persists card layout when selected", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<SettingsScreen {...props} />);
    });

    const cardButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node: renderer.ReactTestInstance) => {
        const labels = node.findAllByType(Text);
        return labels.some((label) => label.props.children === "Card");
      });

    expect(cardButton).toBeTruthy();

    await act(async () => {
      await cardButton!.props.onPress();
    });

    // Assert
    expect(saveConfig).toHaveBeenCalledWith({ feedLayout: "card" });
  });

  it("persists single layout when selected", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<SettingsScreen {...props} />);
    });

    const singleButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node: renderer.ReactTestInstance) => {
        const labels = node.findAllByType(Text);
        return labels.some((label) => label.props.children === "Single");
      });

    expect(singleButton).toBeTruthy();

    await act(async () => {
      await singleButton!.props.onPress();
    });

    // Assert
    expect(saveConfig).toHaveBeenCalledWith({ feedLayout: "single" });
  });

  it("defaults to embedded and persists external link mode on mobile", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<SettingsScreen {...props} />);
    });

    const embeddedLabel = tree!.root
      .findAllByType(Text)
      .find(
        (node: renderer.ReactTestInstance) => node.props.children === "Embedded"
      );
    expect(embeddedLabel).toBeTruthy();

    const externalButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node: renderer.ReactTestInstance) => {
        const labels = node.findAllByType(Text);
        return labels.some((label) => label.props.children === "External");
      });

    expect(externalButton).toBeTruthy();

    await act(async () => {
      await externalButton!.props.onPress();
    });

    // Assert
    expect(saveConfig).toHaveBeenCalledWith({ linkOpenMode: "external" });
  });

  it("does not reset statistics until the confirmation alert is accepted", async () => {
    // Arrange
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<SettingsScreen {...props} />);
    });

    const resetButton = tree!.root
      .findAllByType(TouchableOpacity)
      .find((node: renderer.ReactTestInstance) => {
        const labels = node.findAllByType(Text);
        return labels.some((label) => label.props.children === "Reset statistics");
      });
    expect(resetButton).toBeTruthy();

    await act(async () => {
      resetButton!.props.onPress();
    });

    // Assert - confirmation is shown, but nothing is reset yet
    expect(alertSpy).toHaveBeenCalledWith(
      "Reset statistics?",
      expect.any(String),
      expect.any(Array)
    );
    expect(resetStatistics).not.toHaveBeenCalled();

    // Act - confirm via the destructive button
    const buttons = alertSpy.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const confirmButton = buttons.find((b) => b.text === "Reset");
    await act(async () => {
      await confirmButton?.onPress?.();
    });

    // Assert
    expect(resetStatistics).toHaveBeenCalledTimes(1);
  });
});
