import {
  extractRedditGalleryUrl,
  extractRedditPostIdFromUrl,
  fetchRedditGalleryImageUrls,
} from "./redditGallery";
import { fetchWithProxyFallback } from "./proxyFetch";

jest.mock("./proxyFetch", () => ({
  fetchWithProxyFallback: jest.fn(),
}));

const mockFetchWithProxyFallback =
  fetchWithProxyFallback as jest.MockedFunction<typeof fetchWithProxyFallback>;

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
  afterEach(() => {
    jest.clearAllMocks();
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
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)",
          Accept: "application/json",
        },
      },
      undefined
    );
    expect(result).toEqual([
      "https://preview.redd.it/first.jpg?width=1080&height=720",
      "https://preview.redd.it/second.jpg?width=1080&height=720",
    ]);
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
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RSSReader/1.0)",
          Accept: "application/json",
        },
      },
      true
    );
  });
});
