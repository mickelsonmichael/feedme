import React from "react";
import { Linking, StyleSheet, Text } from "react-native";
import renderer, { act, ReactTestInstance } from "react-test-renderer";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent.native";

const colors = {
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
};

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ colors }),
}));

// RNRH wraps each text leaf in a chain of nested <Text> elements, so the
// node carrying the literal string is found by walking the test-instance
// tree rather than relying on findAllByType's shallow matches.
function findTextContaining(
  root: ReactTestInstance,
  substring: string
): ReactTestInstance | undefined {
  if (
    root.children.some((c) => typeof c === "string" && c.includes(substring))
  ) {
    return root;
  }
  for (const child of root.children) {
    if (typeof child !== "string") {
      const found = findTextContaining(child, substring);
      if (found) return found;
    }
  }
  return undefined;
}

describe("SanitizedHtmlContent.native", () => {
  it("applies themed colors to body text and links", async () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SanitizedHtmlContent html='<p>Body <a href="https://example.com">link</a></p>' />
      );
    });

    // Assert
    const body = findTextContaining(tree!.root, "Body");
    const link = findTextContaining(tree!.root, "link");
    expect(StyleSheet.flatten(body!.props.style).color).toBe(colors.ink);
    expect(StyleSheet.flatten(link!.props.style).color).toBe(colors.accent);
  });

  it("ignores inline styles from feed content in favor of theme colors", async () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SanitizedHtmlContent html='<p style="color:#777">Body</p>' />
      );
    });

    // Assert
    const body = findTextContaining(tree!.root, "Body");
    expect(StyleSheet.flatten(body!.props.style).color).toBe(colors.ink);
  });

  it("renders <b> tags as bold nested text", async () => {
    // Arrange
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SanitizedHtmlContent html="<p>Hello <b>world</b></p>" />
      );
    });

    // Assert
    const bold = findTextContaining(tree!.root, "world");
    expect(StyleSheet.flatten(bold!.props.style).fontWeight).toBe("bold");
  });

  it("opens anchor links via Linking.openURL when pressed", async () => {
    // Arrange
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
    let tree: renderer.ReactTestRenderer;

    // Act
    await act(async () => {
      tree = renderer.create(
        <SanitizedHtmlContent html='<a href="https://example.com">link</a>' />
      );
    });
    const anchor = tree!.root
      .findAllByType(Text)
      .find((node) => node.props.testID === "a");
    await act(async () => {
      anchor!.props.onPress?.({});
    });

    // Assert
    expect(Linking.openURL).toHaveBeenCalledWith("https://example.com/");
  });
});
