import { parseContentAndLinks } from "./contentActions";

describe("parseContentAndLinks", () => {
  it("returns empty text, links and paragraphs for null input", () => {
    const result = parseContentAndLinks(null);
    expect(result).toEqual({ text: "", links: [], paragraphs: [] });
  });

  it("extracts a [comments] link from a standard image post", () => {
    // Image posts have [link] pointing to the gallery and [comments] to the thread
    const html =
      '<span><a href="https://www.reddit.com/gallery/abc123">[link]</a></span>' +
      ' <span><a href="https://www.reddit.com/r/sub/comments/abc123/title/">[comments]</a></span>';

    const { links } = parseContentAndLinks(html);

    expect(links).toEqual([
      { label: "Link", url: "https://www.reddit.com/gallery/abc123" },
      {
        label: "Comments",
        url: "https://www.reddit.com/r/sub/comments/abc123/title/",
      },
    ]);
  });

  it("upgrades [link] to Comments when text post has [link] and [comments] pointing to the same URL", () => {
    // Text posts on Reddit have [link] and [comments] both pointing to the comments URL
    const commentsUrl =
      "https://www.reddit.com/r/castiron/comments/1sw9pia/some_title/";
    const html =
      `<span><a href="${commentsUrl}">[link]</a></span>` +
      ` <span><a href="${commentsUrl}">[comments]</a></span>`;

    const { links } = parseContentAndLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ label: "Comments", url: commentsUrl });
  });

  it("strips HTML tags from content text", () => {
    const html =
      "<p>Hello <strong>world</strong></p>" +
      '<a href="https://example.com/page">not an action link</a>';

    const { text } = parseContentAndLinks(html);

    expect(text).toContain("Hello");
    expect(text).toContain("world");
  });

  it("splits plain text into paragraphs on blank lines", () => {
    // Arrange — a feed that ships plain text with blank-line paragraph breaks
    const content = "First para.\n\nSecond para.\n\n\n   \nThird para.";

    // Act
    const { paragraphs } = parseContentAndLinks(content);

    // Assert
    expect(paragraphs).toEqual(["First para.", "Second para.", "Third para."]);
  });

  it("keeps a single newline inside the same paragraph", () => {
    // Arrange — a soft wrap is not a paragraph break
    const content = "Line one\nline two";

    // Act
    const { paragraphs } = parseContentAndLinks(content);

    // Assert
    expect(paragraphs).toEqual(["Line one line two"]);
  });

  it("splits on </p> and on runs of two or more <br>", () => {
    // Arrange
    const html = "<p>One</p><p>Two<br><br>Three</p>";

    // Act
    const { paragraphs } = parseContentAndLinks(html);

    // Assert
    expect(paragraphs).toEqual(["One", "Two", "Three"]);
  });

  it("leaves text as one paragraph when there are no paragraph breaks", () => {
    // Arrange
    const content = "Just one continuous sentence.";

    // Act
    const { text, paragraphs } = parseContentAndLinks(content);

    // Assert
    expect(paragraphs).toEqual([text]);
  });

  it("still collapses the whole body into a single line for text previews", () => {
    // Arrange — card previews rely on `text` staying one whitespace-collapsed
    // line, so paragraph support must not leak into it
    const content = "First para.\n\nSecond para.";

    // Act
    const { text } = parseContentAndLinks(content);

    // Assert
    expect(text).toBe("First para. Second para.");
  });

  it("ignores anchors that are not [link] or [comments]", () => {
    const html =
      '<a href="https://www.reddit.com/r/sub">visit the sub</a>' +
      ' <span><a href="https://www.reddit.com/r/sub/comments/abc123/">[comments]</a></span>';

    const { links } = parseContentAndLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Comments");
  });
});
