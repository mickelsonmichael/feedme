import React from "react";
import { StyleSheet, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ArticleText } from "./ArticleText";
import { articleLineHeight, articleParagraphSpacing, fontSize } from "../theme";

const INK = "#1e1a3a";

function render(element: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree;
}

describe("ArticleText", () => {
  it("renders one text block per paragraph", () => {
    // Arrange
    const paragraphs = ["First para.", "Second para.", "Third para."];

    // Act
    const tree = render(
      <ArticleText paragraphs={paragraphs} bionicReading={false} color={INK} />
    );

    // Assert
    const texts = tree.root
      .findAllByType(Text)
      .filter((node) => typeof node.props.children === "string");
    expect(texts.map((node) => node.props.children)).toEqual(paragraphs);
  });

  it("separates paragraphs by the shared article paragraph gap", () => {
    // Arrange
    const size = fontSize.bodyLg;

    // Act
    const tree = render(
      <ArticleText
        paragraphs={["One", "Two"]}
        bionicReading={false}
        color={INK}
      />
    );

    // Assert — the gap must be visibly larger than the line height, or a
    // paragraph break reads as an ordinary line wrap
    const gap = StyleSheet.flatten(tree.root.findByType(View).props.style).gap;
    expect(gap).toBe(articleParagraphSpacing(size));
    expect(gap).toBeGreaterThan(articleLineHeight(size));
  });

  it("derives line height from the requested font size", () => {
    // Arrange
    const size = 20;

    // Act
    const tree = render(
      <ArticleText
        paragraphs={["Body"]}
        bionicReading={false}
        color={INK}
        size={size}
      />
    );

    // Assert
    const style = StyleSheet.flatten(
      tree.root.findAllByType(Text)[0].props.style
    );
    expect(style.fontSize).toBe(size);
    expect(style.lineHeight).toBe(articleLineHeight(size));
  });

  it("falls back to the placeholder when there are no paragraphs", () => {
    // Arrange / Act
    const tree = render(
      <ArticleText
        paragraphs={[]}
        bionicReading={false}
        color={INK}
        fallbackText="No content available."
      />
    );

    // Assert
    expect(tree.root.findAllByType(Text)[0].props.children).toBe(
      "No content available."
    );
  });

  it("renders nothing when there are no paragraphs and no fallback", () => {
    // Arrange / Act
    const tree = render(
      <ArticleText paragraphs={[]} bionicReading={false} color={INK} />
    );

    // Assert
    expect(tree.toJSON()).toBeNull();
  });

  it("boldes the leading characters of each word when bionic reading is on", () => {
    // Arrange / Act
    const tree = render(
      <ArticleText paragraphs={["reading"]} bionicReading color={INK} />
    );

    // Assert
    const bold = tree.root
      .findAllByType(Text)
      .find(
        (node) =>
          StyleSheet.flatten(node.props.style)?.fontWeight === "700" &&
          node.props.children === "read"
      );
    expect(bold).toBeDefined();
  });
});
