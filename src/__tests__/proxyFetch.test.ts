import {
  buildProxyRequestUrl,
  fetchWithProxyFallback,
  getProxyBaseUrl,
  isLikelyCorsBlockedError,
} from "../proxyFetch";

describe("getProxyBaseUrl", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "location");
  });

  it("prefers local proxy when target is local", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "localhost" },
      configurable: true,
    });
    const env = {
      EXPO_PUBLIC_FEED_PROXY_TARGET: "local",
      EXPO_PUBLIC_FEED_PROXY_LOCAL_URL: "http://localhost:8787",
    };

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBe("http://localhost:8787");
  });

  it("uses live proxy when target is live", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "feedme.app" },
      configurable: true,
    });
    const env = {
      EXPO_PUBLIC_FEED_PROXY_TARGET: "live",
      EXPO_PUBLIC_FEED_PROXY_LIVE_URL: "https://proxy.example.workers.dev",
    };

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBe("https://proxy.example.workers.dev");
  });

  it("returns null when proxy is explicitly disabled", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "localhost" },
      configurable: true,
    });
    const env = {
      EXPO_PUBLIC_FEED_PROXY_ENABLED: "false",
      EXPO_PUBLIC_FEED_PROXY_TARGET: "local",
      EXPO_PUBLIC_FEED_PROXY_LOCAL_URL: "http://localhost:8787",
    };

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBeNull();
  });

  it("defaults to local proxy when running on localhost", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "127.0.0.1" },
      configurable: true,
    });
    const env = {};

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBe("http://127.0.0.1:8787");
  });

  it("defaults to deployed live proxy when not running locally", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "feedme.app" },
      configurable: true,
    });
    const env = {};

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBe("https://worker.mickelsonmichael.workers.dev");
  });

  it("returns null when not running on web", () => {
    // Arrange
    const env = {
      EXPO_PUBLIC_FEED_PROXY_TARGET: "live",
      EXPO_PUBLIC_FEED_PROXY_LIVE_URL: "https://proxy.example.workers.dev",
    };

    // Act
    const result = getProxyBaseUrl(env);

    // Assert
    expect(result).toBeNull();
  });
});

describe("buildProxyRequestUrl", () => {
  it("builds a proxy URL with the target url encoded", () => {
    // Arrange
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "localhost" },
      configurable: true,
    });
    const env = {
      EXPO_PUBLIC_FEED_PROXY_TARGET: "local",
      EXPO_PUBLIC_FEED_PROXY_LOCAL_URL: "http://localhost:8787",
    };

    // Act
    const result = buildProxyRequestUrl("https://example.com/feed.xml", env);

    // Assert
    expect(result).toBe(
      "http://localhost:8787/?url=https%3A%2F%2Fexample.com%2Ffeed.xml"
    );
  });
});

describe("isLikelyCorsBlockedError", () => {
  it("detects common browser CORS fetch failures", () => {
    // Arrange
    const error = new TypeError("Failed to fetch");

    // Act
    const result = isLikelyCorsBlockedError(error);

    // Assert
    expect(result).toBe(true);
  });

  it("does not classify unrelated errors as CORS", () => {
    // Arrange
    const error = new Error("Request timed out");

    // Act
    const result = isLikelyCorsBlockedError(error);

    // Assert
    expect(result).toBe(false);
  });
});

describe("fetchWithProxyFallback", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "location", {
      value: { hostname: "localhost" },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "location");
    delete process.env.EXPO_PUBLIC_FEED_PROXY_ENABLED;
    delete process.env.EXPO_PUBLIC_FEED_PROXY_TARGET;
    delete process.env.EXPO_PUBLIC_FEED_PROXY_LOCAL_URL;
    delete process.env.EXPO_PUBLIC_FEED_PROXY_LIVE_URL;
    delete process.env.EXPO_PUBLIC_FEED_PROXY_URL;
  });

  it("falls back to proxy after a CORS-like fetch failure", async () => {
    // Arrange
    process.env.EXPO_PUBLIC_FEED_PROXY_TARGET = "local";
    process.env.EXPO_PUBLIC_FEED_PROXY_LOCAL_URL = "http://localhost:8787";

    const upstreamResponse = new Response("<rss />", {
      status: 200,
      headers: { "Content-Type": "application/rss+xml" },
    });

    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(upstreamResponse);

    // Act
    const result = await fetchWithProxyFallback("https://example.com/feed.xml");

    // Assert
    expect(result.usedProxy).toBe(true);
    expect(result.response).toBe(upstreamResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8787/?url=https%3A%2F%2Fexample.com%2Ffeed.xml",
      { method: "GET", headers: undefined }
    );
  });

  it("rethrows non-CORS failures", async () => {
    // Arrange
    const networkError = new Error("DNS lookup failed");
    jest.spyOn(globalThis, "fetch").mockRejectedValue(networkError);

    // Act + Assert
    await expect(
      fetchWithProxyFallback("https://example.com/feed.xml")
    ).rejects.toThrow("DNS lookup failed");
  });

  it("does not fallback when direct request succeeds", async () => {
    // Arrange
    process.env.EXPO_PUBLIC_FEED_PROXY_TARGET = "local";
    process.env.EXPO_PUBLIC_FEED_PROXY_LOCAL_URL = "http://localhost:8787";

    const directResponse = new Response("<rss />", {
      status: 200,
      headers: { "Content-Type": "application/rss+xml" },
    });

    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(directResponse);

    // Act
    const result = await fetchWithProxyFallback(
      "https://www.reddit.com/r/pics.rss"
    );

    // Assert
    expect(result.usedProxy).toBe(false);
    expect(result.response).toBe(directResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
