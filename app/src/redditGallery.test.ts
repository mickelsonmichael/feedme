import {
  extractRedditGalleryUrl,
  extractRedditPostIdFromUrl,
  extractRedditVideoPostUrl,
  fetchRedditGalleryImageUrls,
  fetchRedditPostMedia,
} from "./redditGallery";
import { fetchWithProxyFallback } from "./proxyFetch";
import { Platform } from "react-native";

jest.mock("./proxyFetch", () => ({
  fetchWithProxyFallback: jest.fn(),
}));

const mockFetchWithProxyFallback =
  fetchWithProxyFallback as jest.MockedFunction<typeof fetchWithProxyFallback>;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const setPlatformOs = (os: typeof Platform.OS) => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
};

describe("extractRedditPostIdFromUrl", () => {
  it("extracts a Reddit post id from a gallery URL", () => {
    // Arrange
    const url = "https://www.reddit.com/gallery/1sw5l42";

    // Act
    const result = extractRedditPostIdFromUrl(url);

    // Assert
    expect(result).toBe("1sw5l42");
  });

  it("extracts a Reddit post id from a comments URL", () => {
    // Arrange
    const url =
      "https://www.reddit.com/r/castiron/comments/1sw5l42/free_pan_on_side_of_the_road_fixed_gotta_love_it/";

    // Act
    const result = extractRedditPostIdFromUrl(url);

    // Assert
    expect(result).toBe("1sw5l42");
  });
});

describe("extractRedditGalleryUrl", () => {
  it("finds a gallery link inside Reddit feed content", () => {
    // Arrange
    const content =
      '<a href="https://www.reddit.com/gallery/1sw5l42">[link]</a>';

    // Act
    const result = extractRedditGalleryUrl(null, content);

    // Assert
    expect(result).toBe("https://www.reddit.com/gallery/1sw5l42");
  });
});

describe("fetchRedditGalleryImageUrls", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    jest.clearAllMocks();
    setPlatformOs(originalPlatform);
  });

  it("fetches ordered gallery images from Reddit post JSON", async () => {
    // Arrange
    const payload = [
      {
        data: {
          children: [
            {
              data: {
                gallery_data: {
                  items: [{ media_id: "first" }, { media_id: "second" }],
                },
                media_metadata: {
                  first: {
                    s: {
                      u: "https://preview.redd.it/first.jpg?width=1080&amp;height=720",
                    },
                  },
                  second: {
                    s: {
                      u: "https://preview.redd.it/second.jpg?width=1080&amp;height=720",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ];
    mockFetchWithProxyFallback.mockResolvedValue({
      response: new Response(JSON.stringify(payload), { status: 200 }),
      usedProxy: false,
    });

    // Act
    const result = await fetchRedditGalleryImageUrls(
      "https://www.reddit.com/gallery/1sw5l42"
    );

    // Assert
    expect(mockFetchWithProxyFallback).toHaveBeenCalledWith(
      "https://www.reddit.com/comments/1sw5l42.json?raw_json=1",
      { headers: { "User-Agent": BROWSER_UA } },
      undefined
    );
    expect(result).toEqual([
      "https://preview.redd.it/first.jpg?width=1080&height=720",
      "https://preview.redd.it/second.jpg?width=1080&height=720",
    ]);
  });

  it("omits User-Agent header on web to avoid CORS preflight", async () => {
    // Arrange
    setPlatformOs("web");
    mockFetchWithProxyFallback.mockResolvedValue({
      response: new Response(JSON.stringify([]), { status: 200 }),
      usedProxy: false,
    });

    // Act
    await fetchRedditGalleryImageUrls("https://www.reddit.com/gallery/1sw5l42");

    // Assert
    expect(mockFetchWithProxyFallback).toHaveBeenCalledWith(
      "https://www.reddit.com/comments/1sw5l42.json?raw_json=1",
      undefined,
      undefined
    );
  });

  it("forwards forceProxy when requested", async () => {
    // Arrange
    mockFetchWithProxyFallback.mockResolvedValue({
      response: new Response(JSON.stringify([]), { status: 200 }),
      usedProxy: true,
    });

    // Act
    await fetchRedditGalleryImageUrls(
      "https://www.reddit.com/gallery/1sw5l42",
      true
    );

    // Assert
    expect(mockFetchWithProxyFallback).toHaveBeenCalledWith(
      "https://www.reddit.com/comments/1sw5l42.json?raw_json=1",
      { headers: { "User-Agent": BROWSER_UA } },
      true
    );
  });
});

describe("extractRedditVideoPostUrl", () => {
  it("returns the canonical comments URL when content references v.redd.it", () => {
    // Arrange
    const itemUrl =
      "https://www.reddit.com/r/funny/comments/abc123/funny_clip/";
    const content =
      '<table><tr><td><a href="https://v.redd.it/abc123/HLSPlaylist.m3u8"><img src="https://b.thumbs.redditmedia.com/..."/></a></td></tr></table>';

    // Act
    const result = extractRedditVideoPostUrl(itemUrl, content);

    // Assert
    expect(result).toBe("https://www.reddit.com/comments/abc123");
  });

  it("returns null for gallery posts (those are handled separately)", () => {
    // Arrange
    const itemUrl = "https://www.reddit.com/r/aww/comments/xyz/cute/";
    const content =
      '<a href="https://www.reddit.com/gallery/xyz">[link]</a> v.redd.it/something';

    // Act
    const result = extractRedditVideoPostUrl(itemUrl, content);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when no video markers are present in content", () => {
    // Arrange
    const itemUrl = "https://www.reddit.com/r/pics/comments/abc/photo/";
    const content = "<p>Just a static image post</p>";

    // Act
    const result = extractRedditVideoPostUrl(itemUrl, content);

    // Assert
    expect(result).toBeNull();
  });
});

describe("fetchRedditPostMedia", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns the reddit_video fallback url and poster from secure_media", async () => {
    // Arrange
    const payload = [
      {
        data: {
          children: [
            {
              data: {
                secure_media: {
                  reddit_video: {
                    fallback_url:
                      "https://v.redd.it/abc123/DASH_720.mp4?source=fallback",
                    hls_url: "https://v.redd.it/abc123/HLSPlaylist.m3u8",
                    width: 1280,
                    height: 720,
                  },
                },
                preview: {
                  images: [
                    {
                      source: {
                        url: "https://external-preview.redd.it/poster.jpg?amp;v=1",
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ];
    mockFetchWithProxyFallback.mockResolvedValue({
      response: new Response(JSON.stringify(payload), { status: 200 }),
      usedProxy: false,
    });

    // Act
    const result = await fetchRedditPostMedia(
      "https://www.reddit.com/comments/abc123"
    );

    // Assert
    expect(result.video).toEqual({
      mp4Url: "https://v.redd.it/abc123/DASH_720.mp4",
      hlsUrl: "https://v.redd.it/abc123/HLSPlaylist.m3u8",
      posterUrl: "https://external-preview.redd.it/poster.jpg?amp;v=1",
      width: 1280,
      height: 720,
    });
    expect(result.images).toEqual([]);
  });

  it("retries through the proxy when a direct request returns a non-ok status", async () => {
    // Arrange
    const payload = [
      {
        data: {
          children: [
            {
              data: {
                gallery_data: { items: [{ media_id: "m1" }] },
                media_metadata: {
                  m1: { s: { u: "https://preview.redd.it/m1.jpg" } },
                },
              },
            },
          ],
        },
      },
    ];
    mockFetchWithProxyFallback
      .mockResolvedValueOnce({
        response: new Response("blocked", { status: 403 }),
        usedProxy: false,
      })
      .mockResolvedValueOnce({
        response: new Response(JSON.stringify(payload), { status: 200 }),
        usedProxy: true,
      });

    // Act
    const result = await fetchRedditPostMedia(
      "https://www.reddit.com/comments/abc123"
    );

    // Assert
    expect(mockFetchWithProxyFallback).toHaveBeenCalledTimes(2);
    expect(mockFetchWithProxyFallback).toHaveBeenLastCalledWith(
      expect.stringContaining("comments/abc123"),
      expect.anything(),
      true
    );
    expect(result.images).toEqual(["https://preview.redd.it/m1.jpg"]);
  });

  it("throws a RedditFetchError when both direct and proxied requests fail", async () => {
    // Arrange
    mockFetchWithProxyFallback
      .mockResolvedValueOnce({
        response: new Response("blocked", { status: 403 }),
        usedProxy: false,
      })
      .mockResolvedValueOnce({
        response: new Response("still blocked", { status: 429 }),
        usedProxy: true,
      });

    // Act / Assert
    await expect(
      fetchRedditPostMedia("https://www.reddit.com/comments/abc123")
    ).rejects.toMatchObject({ name: "RedditFetchError", status: 429 });
  });
});
