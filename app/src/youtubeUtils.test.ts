import { extractYouTubeRssFeedUrl, getYouTubeChannelUrl } from "./youtubeUtils";

describe("getYouTubeChannelUrl", () => {
  it("prepends @ and domain for a plain channel handle", () => {
    // Arrange
    const raw = "atrioc";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@atrioc");
  });

  it("prepends domain for an @-prefixed handle", () => {
    // Arrange
    const raw = "@atrioc";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@atrioc");
  });

  it("passes through a full https://www.youtube.com URL unchanged", () => {
    // Arrange
    const raw = "https://www.youtube.com/@atrioc";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@atrioc");
  });

  it("passes through a full https://youtube.com URL unchanged", () => {
    // Arrange
    const raw = "https://youtube.com/c/atrioc";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://youtube.com/c/atrioc");
  });

  it("upgrades an http:// URL to https://", () => {
    // Arrange
    const raw = "http://www.youtube.com/@atrioc";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@atrioc");
  });

  it("builds a /channel/ URL for a channel ID (starts with UC, 24 chars)", () => {
    // Arrange
    const raw = "UCgv4dPk_qZNAbUW9WkuLPSA";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe(
      "https://www.youtube.com/channel/UCgv4dPk_qZNAbUW9WkuLPSA"
    );
  });

  it("trims surrounding whitespace", () => {
    // Arrange
    const raw = "  @MrBeast  ";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@MrBeast");
  });

  it("does not double-prepend @ for a handle that already has @", () => {
    // Arrange
    const raw = "@mkbhd";

    // Act
    const result = getYouTubeChannelUrl(raw);

    // Assert
    expect(result).toBe("https://www.youtube.com/@mkbhd");
  });
});

describe("extractYouTubeRssFeedUrl", () => {
  it("extracts the feed URL from a standard YouTube channel page snippet", () => {
    // Arrange
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA">
    </head>`;

    // Act
    const result = extractYouTubeRssFeedUrl(html);

    // Assert
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA"
    );
  });

  it("returns null when no RSS link is present", () => {
    // Arrange
    const html = "<head><title>Some page</title></head>";

    // Act
    const result = extractYouTubeRssFeedUrl(html);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    // Arrange & Act
    const result = extractYouTubeRssFeedUrl("");

    // Assert
    expect(result).toBeNull();
  });

  it("handles href attribute appearing before type attribute", () => {
    // Arrange
    const html = `<link href="https://www.youtube.com/feeds/videos.xml?channel_id=UCtest123456789012345" type="application/rss+xml" rel="alternate" title="RSS">`;

    // Act
    const result = extractYouTubeRssFeedUrl(html);

    // Assert
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCtest123456789012345"
    );
  });

  it("is case-insensitive for the type attribute value", () => {
    // Arrange
    const html = `<link rel="alternate" type="Application/RSS+XML" title="RSS" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA">`;

    // Act
    const result = extractYouTubeRssFeedUrl(html);

    // Assert
    expect(result).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCgv4dPk_qZNAbUW9WkuLPSA"
    );
  });
});
