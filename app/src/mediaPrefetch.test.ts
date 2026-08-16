import { Image as RNImage } from "react-native";
import { Image } from "expo-image";
import { prefetchItemMedia } from "./mediaPrefetch";

describe("prefetchItemMedia", () => {
  beforeEach(() => {
    // Avoids exercising RN's real (promise-based) native ImageLoader bridge,
    // which jest-expo's built-in mock doesn't model correctly — the size
    // lookup itself isn't under test here.
    jest.spyOn(RNImage, "getSize").mockImplementation((uri, success) => {
      success?.(1600, 800);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("prefetches the feed's favicon alongside the post's hero image", () => {
    // Arrange
    const prefetchSpy = jest.spyOn(Image, "prefetch").mockResolvedValue(true);

    // Act
    prefetchItemMedia({
      imageUrl: "https://example.com/hero.jpg",
      feedUrl: "https://example.com/feed.xml",
    });

    // Assert
    expect(prefetchSpy).toHaveBeenCalledWith(
      "https://example.com/hero.jpg",
      "memory-disk"
    );
    expect(prefetchSpy).toHaveBeenCalledWith(
      "https://example.com/favicon.ico",
      "memory-disk"
    );
  });

  it("still prefetches the favicon when the post has no hero image", () => {
    // Arrange
    const prefetchSpy = jest.spyOn(Image, "prefetch").mockResolvedValue(true);

    // Act
    prefetchItemMedia({ feedUrl: "https://example.com/feed.xml" });

    // Assert
    expect(prefetchSpy).toHaveBeenCalledWith(
      "https://example.com/favicon.ico",
      "memory-disk"
    );
  });

  it("still prefetches the favicon for media types that return early, e.g. YouTube embeds", () => {
    // Arrange
    const prefetchSpy = jest.spyOn(Image, "prefetch").mockResolvedValue(true);

    // Act
    prefetchItemMedia({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      feedUrl: "https://example.com/feed.xml",
    });

    // Assert
    expect(prefetchSpy).toHaveBeenCalledWith(
      "https://example.com/favicon.ico",
      "memory-disk"
    );
  });

  it("does not prefetch an icon when no feed URL is available", () => {
    // Arrange
    const prefetchSpy = jest.spyOn(Image, "prefetch").mockResolvedValue(true);

    // Act
    prefetchItemMedia({ imageUrl: "https://example.com/hero.jpg" });

    // Assert
    expect(prefetchSpy).toHaveBeenCalledTimes(1);
    expect(prefetchSpy).toHaveBeenCalledWith(
      "https://example.com/hero.jpg",
      "memory-disk"
    );
  });

  it("does not prefetch an icon when the feed URL can't produce a favicon URL", () => {
    // Arrange
    const prefetchSpy = jest.spyOn(Image, "prefetch").mockResolvedValue(true);

    // Act
    prefetchItemMedia({ feedUrl: "not-a-valid-url" });

    // Assert
    expect(prefetchSpy).not.toHaveBeenCalled();
  });
});
