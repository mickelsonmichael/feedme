import React from "react";
import renderer, { act } from "react-test-renderer";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import ImportExportScreen from "./ImportExportScreen";
import { RootStackParamList } from "../types";
import { addFeed, getFeeds } from "../database";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";

jest.mock("../database", () => ({
  getFeeds: jest.fn(),
  addFeed: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    text() {
      return Promise.resolve("<opml></opml>");
    }

    write() {
      return undefined;
    }
  },
  Paths: { cache: "/tmp" },
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  shareAsync: jest.fn(),
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

type Props = NativeStackScreenProps<RootStackParamList, "ImportExport">;

function buildProps(): Props {
  return {
    navigation: {
      goBack: jest.fn(),
      navigate: jest.fn(),
    } as unknown as Props["navigation"],
    route: {
      key: "ImportExport-test",
      name: "ImportExport",
      params: undefined,
    } as Props["route"],
  };
}

describe("ImportExportScreen web", () => {
  beforeEach(() => {
    (getFeeds as jest.Mock).mockResolvedValue([]);
    (addFeed as jest.Mock).mockResolvedValue(1);
    jest.clearAllMocks();
  });

  it("renders the updated OPML action labels", async () => {
    // Arrange
    const props = buildProps();
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(<ImportExportScreen {...props} />);
      await Promise.resolve();
    });

    const importLabel = tree!.root.findByProps({ children: "Import OPML" });
    const exportLabel = tree!.root.findByProps({ children: "Export OPML" });

    // Assert
    expect(importLabel).toBeDefined();
    expect(exportLabel).toBeDefined();
  });

  it("imports feeds from an OPML file and skips duplicates", async () => {
    // Arrange
    const props = buildProps();
    const opml = `<?xml version="1.0"?><opml><body>
      <outline title="Feed One" xmlUrl="https://example.com/1.xml"/>
      <outline title="Feed Two" xmlUrl="https://example.com/2.xml"/>
    </body></opml>`;
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "blob:feedme",
          file: { text: jest.fn().mockResolvedValue(opml) },
        },
      ],
    });
    (addFeed as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("Feed with url already exists"));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ImportExportScreen {...props} />);
      await Promise.resolve();
    });

    const importButton = tree!.root.findByProps({
      accessibilityLabel: "Import OPML",
    });

    // Act
    await act(async () => {
      await importButton.props.onPress();
      await Promise.resolve();
    });

    // Assert
    expect(addFeed).toHaveBeenCalledTimes(2);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: [".opml", "text/x-opml", "application/xml", "text/xml", "*/*"],
      copyToCacheDirectory: true,
    });
    const status = tree!.root.findByProps({
      children: "Import complete. Added 1, skipped 1 duplicates.",
    });
    expect(status).toBeDefined();
  });

  it("exports OPML and shows completion status", async () => {
    // Arrange
    const props = buildProps();
    (getFeeds as jest.Mock).mockResolvedValue([
      {
        id: 1,
        title: "Feed One",
        url: "https://example.com/feed.xml",
        description: null,
        last_fetched: null,
        error: null,
        use_proxy: 0,
      },
    ]);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ImportExportScreen {...props} />);
      await Promise.resolve();
    });

    const exportButton = tree!.root.findByProps({
      accessibilityLabel: "Export OPML",
    });

    // Act
    await act(async () => {
      await exportButton.props.onPress();
      await Promise.resolve();
    });

    // Assert
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    const status = tree!.root.findByProps({
      children: "Exported OPML successfully.",
    });
    expect(status).toBeDefined();
  });
});
