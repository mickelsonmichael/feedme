import { parseFeed, extractFeedTitle, extractImageUrl } from "./feedParser";
import { ParsedFeedItem } from "./types";

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

const RSS_FEED_WITH_IMAGES = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Image RSS Feed</title>
    <item>
      <title>Media Content Post</title>
      <link>https://example.com/media</link>
      <media:content url="https://example.com/image1.jpg" medium="image"/>
    </item>
    <item>
      <title>Media Thumbnail Post</title>
      <link>https://example.com/thumb</link>
      <media:thumbnail url="https://example.com/thumb1.jpg"/>
    </item>
    <item>
      <title>Enclosure Post</title>
      <link>https://example.com/enclosure</link>
      <enclosure url="https://example.com/image2.jpg" type="image/jpeg" length="12345"/>
    </item>
    <item>
      <title>Img Tag Post</title>
      <link>https://example.com/img</link>
      <description><![CDATA[<p><img src="https://example.com/image3.png" alt="photo"/></p>]]></description>
    </item>
    <item>
      <title>No Image Post</title>
      <link>https://example.com/no-image</link>
      <description>Just text here</description>
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

const REDDIT_ATOM_FEED_WITH_THUMBNAIL = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Reddit Pics</title>
  <entry>
    <title>Reddit Entry</title>
    <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;a href=&quot;https://www.reddit.com/r/pics/comments/abc123/sample/&quot;&gt;&lt;img src=&quot;https://preview.redd.it/hojmv7hcahxg1.jpeg?width=640&amp;amp;crop=smart&amp;amp;auto=webp&amp;amp;s=ae2800&quot; /&gt;&lt;/a&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content>
    <media:thumbnail url="https://preview.redd.it/hojmv7hcahxg1.jpeg?width=640&amp;crop=smart&amp;auto=webp&amp;s=ae2800" />
    <link href="https://www.reddit.com/r/pics/comments/abc123/sample/" />
    <updated>2026-04-26T06:25:04+00:00</updated>
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
      expect(item.imageUrl === null || typeof item.imageUrl === "string").toBe(
        true
      );
      expect(item.rawXml === null || typeof item.rawXml === "string").toBe(
        true
      );
    });
  });
});

describe("parseFeed – image extraction (RSS)", () => {
  it("extracts image_url from media:content", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED_WITH_IMAGES);
    const item = items.find((i) => i.title === "Media Content Post")!;

    // Assert
    expect(item.imageUrl).toBe("https://example.com/image1.jpg");
  });

  it("extracts image_url from media:thumbnail", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED_WITH_IMAGES);
    const item = items.find((i) => i.title === "Media Thumbnail Post")!;

    // Assert
    expect(item.imageUrl).toBe("https://example.com/thumb1.jpg");
  });

  it("extracts image_url from enclosure with image MIME type", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED_WITH_IMAGES);
    const item = items.find((i) => i.title === "Enclosure Post")!;

    // Assert
    expect(item.imageUrl).toBe("https://example.com/image2.jpg");
  });

  it("extracts image_url from <img> tag in content", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED_WITH_IMAGES);
    const item = items.find((i) => i.title === "Img Tag Post")!;

    // Assert
    expect(item.imageUrl).toBe("https://example.com/image3.png");
  });

  it("sets imageUrl to null when no image is present", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED_WITH_IMAGES);
    const item = items.find((i) => i.title === "No Image Post")!;

    // Assert
    expect(item.imageUrl).toBeNull();
  });
});

describe("parseFeed – image extraction (Atom/Reddit)", () => {
  it("uses media:thumbnail as the preview image for Reddit Atom entries", () => {
    // Arrange
    const expectedImage =
      "https://preview.redd.it/hojmv7hcahxg1.jpeg?width=640&crop=smart&auto=webp&s=ae2800";

    // Act
    const [item] = parseFeed(REDDIT_ATOM_FEED_WITH_THUMBNAIL);

    // Assert
    expect(item.imageUrl).toBe(expectedImage);
  });
});

describe("extractImageUrl", () => {
  it("returns undefined when block has no image references", () => {
    // Arrange & Act & Assert
    expect(extractImageUrl("<item><title>Hi</title></item>")).toBeUndefined();
  });

  it("prefers media:content over media:thumbnail", () => {
    // Arrange
    const block = `
      <media:content url="https://example.com/big.jpg" medium="image"/>
      <media:thumbnail url="https://example.com/small.jpg"/>
    `;

    // Act & Assert
    expect(extractImageUrl(block)).toBe("https://example.com/big.jpg");
  });

  it("falls back to <img> in html content when no dedicated image tag exists", () => {
    // Arrange
    const block = "<item></item>";
    const htmlContent = '<p><img src="https://example.com/inline.png"/></p>';

    // Act & Assert
    expect(extractImageUrl(block, htmlContent)).toBe(
      "https://example.com/inline.png"
    );
  });
});

describe("parseFeed – rawXml field", () => {
  it("includes the full <item> block as rawXml for RSS items", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED);

    // Assert
    expect(items[0].rawXml).toContain("<item>");
    expect(items[0].rawXml).toContain("</item>");
    expect(items[0].rawXml).toContain("First Post");
  });

  it("includes the full <entry> block as rawXml for Atom entries", () => {
    // Arrange & Act
    const items = parseFeed(ATOM_FEED);

    // Assert
    expect(items[0].rawXml).toContain("<entry>");
    expect(items[0].rawXml).toContain("</entry>");
    expect(items[0].rawXml).toContain("Atom Entry One");
  });

  it("sets rawXml to a non-empty string for every parsed item", () => {
    // Arrange & Act
    const items = parseFeed(RSS_FEED);

    // Assert
    items.forEach((item) => {
      expect(typeof item.rawXml).toBe("string");
      expect((item.rawXml as string).length).toBeGreaterThan(0);
    });
  });
});
