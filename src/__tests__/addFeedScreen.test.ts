import { buildRedditFeedUrl } from "../redditUtils";

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

  it("strips leading 'r/' even when subreddit has trailing whitespace", () => {
    // Arrange
    const subreddit = "r/gaming ";

    // Act
    const result = buildRedditFeedUrl(subreddit);

    // Assert
    expect(result).toBe("https://www.reddit.com/r/gaming.rss");
  });
});
