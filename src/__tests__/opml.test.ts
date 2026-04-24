import { generateOpml, parseOpml } from "../opml";

const SAMPLE_FEEDS = [
  {
    title: "Feed One",
    url: "https://example.com/feed1.xml",
    description: "A great feed",
  },
  {
    title: "Feed Two",
    url: "https://example.org/feed2.xml",
    description: null,
  },
];

const SAMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test subscriptions</title></head>
  <body>
    <outline type="rss" title="Feed One" xmlUrl="https://example.com/feed1.xml" description="A great feed"/>
    <outline type="rss" title="Feed Two" xmlUrl="https://example.org/feed2.xml"/>
  </body>
</opml>`;

describe("generateOpml", () => {
  it("produces a valid OPML XML string", () => {
    const output = generateOpml(SAMPLE_FEEDS);
    expect(output).toContain('<?xml version="1.0"');
    expect(output).toContain("<opml");
    expect(output).toContain("<body>");
    expect(output).toContain("</body>");
  });

  it("includes an outline for each feed", () => {
    const output = generateOpml(SAMPLE_FEEDS);
    expect(output).toContain('xmlUrl="https://example.com/feed1.xml"');
    expect(output).toContain('xmlUrl="https://example.org/feed2.xml"');
  });

  it("includes the title for each feed", () => {
    const output = generateOpml(SAMPLE_FEEDS);
    expect(output).toContain('title="Feed One"');
    expect(output).toContain('title="Feed Two"');
  });

  it("includes description when present", () => {
    const output = generateOpml(SAMPLE_FEEDS);
    expect(output).toContain('description="A great feed"');
  });

  it("omits description attribute when null", () => {
    const output = generateOpml(SAMPLE_FEEDS);
    const lines = output.split("\n").filter((l) => l.includes("Feed Two"));
    expect(lines[0]).not.toContain("description=");
  });

  it("escapes XML special characters in title and url", () => {
    const feeds = [
      { title: "A & B <test>", url: "https://example.com/feed?a=1&b=2" },
    ];
    const output = generateOpml(feeds);
    expect(output).toContain("A &amp; B &lt;test&gt;");
    expect(output).toContain("a=1&amp;b=2");
  });

  it("returns valid output for an empty feed list", () => {
    const output = generateOpml([]);
    expect(output).toContain("<opml");
    expect(output).toContain("</opml>");
  });
});

describe("parseOpml", () => {
  it("returns an array of feed objects", () => {
    const feeds = parseOpml(SAMPLE_OPML);
    expect(Array.isArray(feeds)).toBe(true);
    expect(feeds).toHaveLength(2);
  });

  it("extracts title and url for each feed", () => {
    const [first] = parseOpml(SAMPLE_OPML);
    expect(first.title).toBe("Feed One");
    expect(first.url).toBe("https://example.com/feed1.xml");
  });

  it("extracts description when present", () => {
    const [first] = parseOpml(SAMPLE_OPML);
    expect(first.description).toBe("A great feed");
  });

  it("sets description to null when absent", () => {
    const feeds = parseOpml(SAMPLE_OPML);
    expect(feeds[1].description).toBeNull();
  });

  it("round-trips through generateOpml → parseOpml", () => {
    const original = [
      {
        title: "Round Trip",
        url: "https://example.com/rt.xml",
        description: "desc",
      },
    ];
    const opml = generateOpml(original);
    const parsed = parseOpml(opml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Round Trip");
    expect(parsed[0].url).toBe("https://example.com/rt.xml");
    expect(parsed[0].description).toBe("desc");
  });

  it("returns an empty array for empty input", () => {
    expect(parseOpml("")).toEqual([]);
  });

  it("ignores outlines without xmlUrl", () => {
    const opml = `<opml><body>
      <outline title="No URL" text="no url"/>
      <outline title="Has URL" xmlUrl="https://example.com/feed.xml"/>
    </body></opml>`;
    const feeds = parseOpml(opml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].url).toBe("https://example.com/feed.xml");
  });
});
