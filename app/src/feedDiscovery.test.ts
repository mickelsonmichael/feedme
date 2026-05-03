import {
  discoverFeeds,
  isFeedContentType,
  looksLikeFeedBody,
  parseHtmlForFeedLinks,
} from "./feedDiscovery";
import * as proxyFetch from "./proxyFetch";

jest.mock("./proxyFetch", () => ({
  fetchWithProxyFallback: jest.fn(),
}));

const mockFetch = proxyFetch.fetchWithProxyFallback as jest.MockedFunction<
  typeof proxyFetch.fetchWithProxyFallback
>;

function makeResponse(
  body: string,
  options: { contentType?: string; url?: string; ok?: boolean } = {}
): Response {
  const headers = new Headers();
  if (options.contentType) {
    headers.set("content-type", options.contentType);
  }
  return {
    ok: options.ok ?? true,
    url: options.url ?? "",
    headers,
    text: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("isFeedContentType", () => {
  it("recognises common feed content types", () => {
    // Arrange + Act + Assert
    expect(isFeedContentType("application/rss+xml")).toBe(true);
    expect(isFeedContentType("application/atom+xml; charset=utf-8")).toBe(true);
    expect(isFeedContentType("text/xml")).toBe(true);
  });

  it("rejects non-feed content types", () => {
    // Arrange + Act + Assert
    expect(isFeedContentType("text/html")).toBe(false);
    expect(isFeedContentType(null)).toBe(false);
  });
});

describe("looksLikeFeedBody", () => {
  it("recognises RSS markup", () => {
    // Arrange + Act + Assert
    expect(looksLikeFeedBody("<?xml version='1.0'?><rss><channel></channel></rss>")).toBe(true);
  });

  it("recognises Atom markup", () => {
    // Arrange + Act + Assert
    expect(
      looksLikeFeedBody('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>')
    ).toBe(true);
  });

  it("rejects HTML markup", () => {
    // Arrange + Act + Assert
    expect(looksLikeFeedBody("<!doctype html><html><body></body></html>")).toBe(false);
  });
});

describe("parseHtmlForFeedLinks", () => {
  it("extracts RSS and Atom alternate links", () => {
    // Arrange
    const html = `
      <html><head>
        <link rel="alternate" type="application/rss+xml" title="Main RSS" href="/feed.xml">
        <link rel="alternate" type="application/atom+xml" href="https://other.example/atom" />
        <link rel="stylesheet" href="/styles.css">
      </head></html>
    `;

    // Act
    const result = parseHtmlForFeedLinks(html, "https://example.com/page");

    // Assert
    expect(result).toEqual([
      { url: "https://example.com/feed.xml", title: "Main RSS" },
      { url: "https://other.example/atom", title: null },
    ]);
  });

  it("ignores non-alternate links", () => {
    // Arrange
    const html = `<link rel="canonical" type="application/rss+xml" href="/feed">`;

    // Act
    const result = parseHtmlForFeedLinks(html, "https://example.com");

    // Assert
    expect(result).toEqual([]);
  });

  it("deduplicates repeated feed urls", () => {
    // Arrange
    const html = `
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="/feed.xml">
    `;

    // Act
    const result = parseHtmlForFeedLinks(html, "https://example.com");

    // Assert
    expect(result).toHaveLength(1);
  });
});

describe("discoverFeeds", () => {
  it("returns the input URL itself when it is already a feed", async () => {
    // Arrange
    const feedXml =
      "<?xml version='1.0'?><rss><channel><title>Direct Feed</title></channel></rss>";
    mockFetch.mockResolvedValueOnce({
      response: makeResponse(feedXml, {
        contentType: "application/rss+xml",
        url: "https://example.com/feed.xml",
      }),
      usedProxy: false,
    });

    // Act
    const result = await discoverFeeds("https://example.com/feed.xml");

    // Assert
    expect(result.feeds).toEqual([
      {
        url: "https://example.com/feed.xml",
        title: "Direct Feed",
        source: "direct",
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("finds feeds advertised in HTML link tags", async () => {
    // Arrange
    const html = `
      <html><head>
        <link rel="alternate" type="application/rss+xml" title="Site Feed" href="/feed.xml">
      </head></html>
    `;
    mockFetch.mockResolvedValueOnce({
      response: makeResponse(html, {
        contentType: "text/html",
        url: "https://example.com/",
      }),
      usedProxy: false,
    });

    // Act
    const result = await discoverFeeds("https://example.com");

    // Assert
    expect(result.feeds).toEqual([
      {
        url: "https://example.com/feed.xml",
        title: "Site Feed",
        source: "html",
      },
    ]);
  });

  it("falls back to common-path probing when no link tags are found", async () => {
    // Arrange
    const html = "<html><head></head><body>no feed links</body></html>";
    mockFetch.mockResolvedValueOnce({
      response: makeResponse(html, {
        contentType: "text/html",
        url: "https://example.com/",
      }),
      usedProxy: false,
    });
    // All path probes — only `/feed.xml` succeeds.
    mockFetch.mockImplementation(async (url) => {
      if (url === "https://example.com/feed.xml") {
        return {
          response: makeResponse(
            "<?xml version='1.0'?><rss><channel><title>Probed</title></channel></rss>",
            {
              contentType: "application/rss+xml",
              url: "https://example.com/feed.xml",
            }
          ),
          usedProxy: false,
        };
      }
      return {
        response: makeResponse("not a feed", {
          contentType: "text/html",
          url,
          ok: false,
        }),
        usedProxy: false,
      };
    });

    // Act
    const result = await discoverFeeds("https://example.com");

    // Assert
    expect(result.feeds).toContainEqual({
      url: "https://example.com/feed.xml",
      title: "Probed",
      source: "common-path",
    });
  });

  it("rejects invalid URLs", async () => {
    // Arrange + Act + Assert
    await expect(discoverFeeds("   ")).rejects.toThrow(/URL/);
    await expect(discoverFeeds("ftp://example.com")).rejects.toThrow(
      /http/
    );
  });

  it("prefixes https:// when no scheme is supplied", async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      response: makeResponse("<html></html>", {
        contentType: "text/html",
        url: "https://example.com/",
      }),
      usedProxy: false,
    });
    mockFetch.mockResolvedValue({
      response: makeResponse("nope", {
        contentType: "text/html",
        ok: false,
      }),
      usedProxy: false,
    });

    // Act
    await discoverFeeds("example.com");

    // Assert
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/");
  });

  it("ignores response.url when the proxy was used (so relative hrefs resolve against the original origin)", async () => {
    // Arrange
    const html = `
      <html><head>
        <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
      </head></html>
    `;
    mockFetch.mockResolvedValueOnce({
      response: makeResponse(html, {
        contentType: "text/html",
        // Proxy worker rewrote the response URL to its own host.
        url: "https://proxy.example.workers.dev/?u=https%3A%2F%2Fxkcd.com",
      }),
      usedProxy: true,
    });

    // Act
    const result = await discoverFeeds("https://xkcd.com");

    // Assert
    expect(result.finalUrl).toBe("https://xkcd.com/");
    expect(result.feeds.map((f) => f.url)).toEqual([
      "https://xkcd.com/atom.xml",
    ]);
  });
});
