import { parseContentAndLinks } from "./contentActions";

describe("parseContentAndLinks", () => {
  it("returns empty text and links for null input", () => {
    const result = parseContentAndLinks(null);
    expect(result).toEqual({ text: "", links: [] });
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

  it("ignores anchors that are not [link] or [comments]", () => {
    const html =
      '<a href="https://www.reddit.com/r/sub">visit the sub</a>' +
      ' <span><a href="https://www.reddit.com/r/sub/comments/abc123/">[comments]</a></span>';

    const { links } = parseContentAndLinks(html);

    expect(links).toHaveLength(1);
    expect(links[0].label).toBe("Comments");
  });
});
