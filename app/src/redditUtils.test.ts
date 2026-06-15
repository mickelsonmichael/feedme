import { extractRedditAuthor } from "./redditUtils";

describe("extractRedditAuthor", () => {
  it("returns null for null content", () => {
    expect(extractRedditAuthor(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractRedditAuthor("")).toBeNull();
  });

  it("returns null for content with no Reddit user link", () => {
    // Arrange
    const content = "<p>Some post content without any user link</p>";

    // Act + Assert
    expect(extractRedditAuthor(content)).toBeNull();
  });

  it("extracts username from the standard Reddit RSS HTML pattern", () => {
    // Arrange — matches what Reddit's Atom feed encodes as author attribution
    const content =
      '<table><tr><td>&#32; submitted by &#32; <a href="https://www.reddit.com/user/wafwot10">/u/wafwot10</a></td></tr></table>';

    // Act
    const result = extractRedditAuthor(content);

    // Assert
    expect(result).toBe("wafwot10");
  });

  it("extracts username from www.reddit.com/user/ URL", () => {
    // Arrange
    const content = '<a href="https://www.reddit.com/user/spez">u/spez</a>';

    // Act + Assert
    expect(extractRedditAuthor(content)).toBe("spez");
  });

  it("extracts username from old.reddit.com/user/ URL", () => {
    // Arrange
    const content =
      '<a href="https://old.reddit.com/user/testuser">u/testuser</a>';

    // Act + Assert
    expect(extractRedditAuthor(content)).toBe("testuser");
  });

  it("returns only the first matched username when multiple are present", () => {
    // Arrange
    const content =
      '<a href="https://www.reddit.com/user/alice">u/alice</a> and <a href="https://www.reddit.com/user/bob">u/bob</a>';

    // Act
    const result = extractRedditAuthor(content);

    // Assert
    expect(result).toBe("alice");
  });

  it("does not extract a subreddit URL as a user", () => {
    // Arrange — /r/ path should not match
    const content = '<a href="https://www.reddit.com/r/pics">/r/pics</a>';

    // Act + Assert
    expect(extractRedditAuthor(content)).toBeNull();
  });
});
