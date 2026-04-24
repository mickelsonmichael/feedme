import { parseFeed, extractFeedTitle } from "../feedParser";
import { ParsedFeedItem } from "../types";

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS Feed</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <description><![CDATA[Hello world]]></description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second</link>
      <description>Plain text description</description>
      <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <link href="https://example.com"/>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/atom-one"/>
    <content><![CDATA[Atom content here]]></content>
    <published>2024-01-01T12:00:00Z</published>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom-two"/>
    <summary>A short summary</summary>
    <updated>2024-01-02T12:00:00Z</updated>
  </entry>
</feed>`;

describe("parseFeed – RSS 2.0", () => {
  it("returns an array of items", () => {
    const items = parseFeed(RSS_FEED);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("extracts title, url, content and publishedAt", () => {
    const [first] = parseFeed(RSS_FEED);
    expect(first.title).toBe("First Post");
    expect(first.url).toBe("https://example.com/first");
    expect(first.content).toBe("Hello world");
    expect(typeof first.publishedAt).toBe("number");
  });

  it("handles plain-text descriptions", () => {
    const items = parseFeed(RSS_FEED);
    expect(items[1].content).toBe("Plain text description");
  });
});

describe("parseFeed – Atom", () => {
  it("returns an array of entries", () => {
    const items = parseFeed(ATOM_FEED);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("extracts title, url, content and publishedAt", () => {
    const [first] = parseFeed(ATOM_FEED);
    expect(first.title).toBe("Atom Entry One");
    expect(first.url).toBe("https://example.com/atom-one");
    expect(first.content).toBe("Atom content here");
    expect(typeof first.publishedAt).toBe("number");
  });

  it("falls back to <summary> when <content> is absent", () => {
    const items = parseFeed(ATOM_FEED);
    expect(items[1].content).toBe("A short summary");
  });

  it("falls back to <updated> when <published> is absent", () => {
    const items = parseFeed(ATOM_FEED);
    expect(items[1].publishedAt).not.toBeNull();
  });
});

describe("parseFeed – empty / malformed input", () => {
  it("returns an empty array for empty input", () => {
    expect(parseFeed("")).toEqual([]);
  });

  it("returns an empty array for non-XML input", () => {
    expect(parseFeed("not xml at all")).toEqual([]);
  });
});

describe("extractFeedTitle", () => {
  it("extracts the channel title from RSS", () => {
    expect(extractFeedTitle(RSS_FEED)).toBe("Test RSS Feed");
  });

  it("extracts the feed title from Atom", () => {
    expect(extractFeedTitle(ATOM_FEED)).toBe("Test Atom Feed");
  });

  it("returns 'Untitled' for empty input", () => {
    expect(extractFeedTitle("")).toBe("Untitled");
  });
});

// Ensure the return type matches ParsedFeedItem
describe("parseFeed – return type", () => {
  it("returns items conforming to ParsedFeedItem shape", () => {
    const items: ParsedFeedItem[] = parseFeed(RSS_FEED);
    items.forEach((item) => {
      expect(typeof item.title).toBe("string");
      expect(item.url === null || typeof item.url === "string").toBe(true);
      expect(item.content === null || typeof item.content === "string").toBe(
        true
      );
      expect(
        item.publishedAt === null || typeof item.publishedAt === "number"
      ).toBe(true);
    });
  });
});
