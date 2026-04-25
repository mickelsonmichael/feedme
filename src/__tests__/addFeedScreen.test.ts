import { buildRedditFeedUrl, getSubreddit } from "../redditUtils";

describe("getSubreddit", () => {
  it("returns a plain subreddit name unchanged", () => {
    // Arrange + Act + Assert
    expect(getSubreddit("pics")).toBe("pics");
  });

  it("strips a leading 'r/' prefix", () => {
    // Arrange
    const raw = "r/worldnews";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("worldnews");
  });

  it("trims surrounding whitespace", () => {
    // Arrange
    const raw = "  AskReddit  ";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("AskReddit");
  });

  it("extracts the name from a https://www.reddit.com/r/ URL", () => {
    // Arrange
    const raw = "https://www.reddit.com/r/gaming";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("gaming");
  });

  it("extracts the name from a https://reddit.com/r/ URL", () => {
    // Arrange
    const raw = "https://reddit.com/r/pics";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("pics");
  });

  it("extracts the name from a https://old.reddit.com/r/ URL", () => {
    // Arrange
    const raw = "https://old.reddit.com/r/ProgrammerHumor";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("ProgrammerHumor");
  });

  it("ignores trailing path segments in a URL", () => {
    // Arrange
    const raw = "https://www.reddit.com/r/science/top";

    // Act
    const result = getSubreddit(raw);

    // Assert
    expect(result).toBe("science");
  });
});

describe("buildRedditFeedUrl", () => {
  it("builds the correct Reddit RSS URL for a plain subreddit name", () => {
    // Arrange
    const subreddit = "pics";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/pics.rss");
  });

  it("strips a leading 'r/' prefix from the subreddit name", () => {
    // Arrange
    const subreddit = "r/worldnews";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/worldnews.rss");
  });

  it("trims whitespace from the subreddit name", () => {
    // Arrange
    const subreddit = "  AskReddit  ";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/AskReddit.rss");
  });

  it("handles subreddit names with mixed case", () => {
    // Arrange
    const subreddit = "ProgrammerHumor";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/ProgrammerHumor.rss");
  });

  it("builds from a full reddit.com URL", () => {
    // Arrange
    const subreddit = "https://www.reddit.com/r/gaming";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/gaming.rss");
  });

  it("builds from an old.reddit.com URL", () => {
    // Arrange
    const subreddit = "https://old.reddit.com/r/science";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/science.rss");
  });
});
