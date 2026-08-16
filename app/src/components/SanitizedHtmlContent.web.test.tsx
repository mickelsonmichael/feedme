import React from "react";
import renderer, { act } from "react-test-renderer";
import { SanitizedHtmlContent } from "./SanitizedHtmlContent.web";
import {
  articleParagraphSpacing,
  articleTypography,
  WEB_ARTICLE_FONT_SIZE,
} from "../theme";

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

/** The scoped stylesheet the component injects alongside the article markup. */
function renderScopedCss(html: string): string {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SanitizedHtmlContent html={html} />);
  });
  const style = tree.root.findByType("style" as never);
  return style.props.dangerouslySetInnerHTML.__html as string;
}

describe("SanitizedHtmlContent.web", () => {
  it("gives block elements the shared paragraph gap and no top margin", () => {
    // Arrange
    const gap = articleParagraphSpacing(WEB_ARTICLE_FONT_SIZE);

    // Act
    const css = renderScopedCss("<p>One</p><p>Two</p>");

    // Assert — margin-bottom only, so two adjacent blocks sit exactly one
    // gap apart rather than stacking both sides' margins
    expect(css).toContain(`margin: 0 0 ${gap}px;`);
  });

  it("collapses the article's outer margins against its container", () => {
    // Arrange / Act
    const css = renderScopedCss("<p>Only</p>");

    // Assert
    expect(css).toMatch(/> \*:first-child \{ margin-top: 0; \}/);
    expect(css).toMatch(/> \*:last-child \{ margin-bottom: 0; \}/);
  });

  it("applies the shared body and heading line-height ratios", () => {
    // Arrange / Act
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<SanitizedHtmlContent html="<p>Body</p>" />);
    });
    const article = tree.root.findByType("div" as never);
    const css = renderScopedCss("<h2>Heading</h2>");

    // Assert
    expect(article.props.style.fontSize).toBe(WEB_ARTICLE_FONT_SIZE);
    expect(article.props.style.lineHeight).toBe(
      articleTypography.lineHeightRatio
    );
    expect(css).toContain(
      `line-height: ${articleTypography.headingLineHeightRatio};`
    );
  });
});
