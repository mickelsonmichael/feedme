import React from "react";
import { StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent.native";

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    colors: {
      paper: "#111",
      paperWarm: "#222",
      ink: "#f5f5f5",
      inkSoft: "#bbb",
      inkFaint: "#999",
      accent: "#6ea8fe",
      accentSoft: "#8bb7ff",
      border: "#444",
      highlight: "#ffe27a",
      danger: "#b44b4b",
    },
  }),
}));

jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    WebView: (props: object) => React.createElement(View, props),
  };
});

describe("SanitizedHtmlContent.native", () => {
  it("forces themed colors and disables nested WebView scrolling", async () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SanitizedHtmlContent html={'<p style="color:#777">Body</p>'} />
      );
    });
    const webView = tree!.root
      .findAllByType(View)
      .find((node) => node.props.source);

    // Assert
    expect(webView).toBeTruthy();
    expect(webView!.props.javaScriptEnabled).toBe(true);
    expect(webView!.props.scrollEnabled).toBe(false);
    expect(webView!.props.nestedScrollEnabled).toBe(false);
    expect(webView!.props.source.html).toContain('id="feedme-content"');
    expect(webView!.props.source.html).toContain("color: #f5f5f5 !important");
    expect(webView!.props.source.html).toContain("color: #6ea8fe !important");
  });

  it("resizes the WebView height to match rendered HTML content", async () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<SanitizedHtmlContent html="<p>Hello</p>" />);
    });
    const getWebViewNode = () =>
      tree!.root.findAllByType(View).find((node) => node.props.source)!;
    const getHeight = () =>
      StyleSheet.flatten(getWebViewNode().props.style).height;

    // Act
    await act(async () => {
      getWebViewNode().props.onMessage({ nativeEvent: { data: "640.2" } });
    });

    // Assert
    expect(getHeight()).toBe(641);
  });
});
