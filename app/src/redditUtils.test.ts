import {
  extractRedditAuthor,
  filterExcludedRedditComments,
  isRedditCommentRawXml,
  shouldExcludeRedditComments,
} from "./redditUtils";
import { ParsedFeedItem } from "./types";

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

describe("isRedditCommentRawXml", () => {
  it("returns false for null/undefined raw XML", () => {
    expect(isRedditCommentRawXml(null)).toBe(false);
    expect(isRedditCommentRawXml(undefined)).toBe(false);
  });

  it("returns false for empty raw XML", () => {
    expect(isRedditCommentRawXml("")).toBe(false);
  });

  it("returns true for an entry whose <id> uses the t1_ comment prefix", () => {
    // Arrange — real shape of a comment entry in Reddit's user overview feed
    const rawXml =
      '<entry><id>t1_os0o1vi</id><link href="https://www.reddit.com/r/u_spez/comments/1u7hraf/21_years_of_reddit/os0o1vi/"/></entry>';

    // Act + Assert
    expect(isRedditCommentRawXml(rawXml)).toBe(true);
  });

  it("returns false for an entry whose <id> uses the t3_ post prefix", () => {
    // Arrange — real shape of a submitted-post entry
    const rawXml = "<entry><id>t3_1u7hraf</id></entry>";

    // Act + Assert
    expect(isRedditCommentRawXml(rawXml)).toBe(false);
  });

  it("returns false for non-Reddit XML with no <id> element", () => {
    const rawXml = "<item><title>Some other feed item</title></item>";
    expect(isRedditCommentRawXml(rawXml)).toBe(false);
  });
});

describe("shouldExcludeRedditComments", () => {
  it("returns true for a Reddit user feed with comments not included", () => {
    expect(
      shouldExcludeRedditComments({
        url: "https://www.reddit.com/user/spez.rss",
        reddit_include_comments: 0,
      })
    ).toBe(true);
  });

  it("returns true when reddit_include_comments is undefined (default)", () => {
    expect(
      shouldExcludeRedditComments({
        url: "https://www.reddit.com/user/spez.rss",
        reddit_include_comments: undefined,
      })
    ).toBe(true);
  });

  it("returns false when the feed's comments toggle is explicitly on", () => {
    expect(
      shouldExcludeRedditComments({
        url: "https://www.reddit.com/user/spez.rss",
        reddit_include_comments: 1,
      })
    ).toBe(false);
  });

  it("returns false for a subreddit feed regardless of the flag", () => {
    expect(
      shouldExcludeRedditComments({
        url: "https://www.reddit.com/r/pics.rss",
        reddit_include_comments: 0,
      })
    ).toBe(false);
  });

  it("returns false for a non-Reddit feed", () => {
    expect(
      shouldExcludeRedditComments({
        url: "https://example.com/feed.xml",
        reddit_include_comments: 0,
      })
    ).toBe(false);
  });
});

describe("filterExcludedRedditComments", () => {
  const commentItem: ParsedFeedItem = {
    title: "/u/spez on 21 years of Reddit",
    url: "https://www.reddit.com/r/u_spez/comments/1u7hraf/21_years_of_reddit/os0o1vi/",
    content: "You were the ride",
    rawXml: "<entry><id>t1_os0jtt9</id></entry>",
    publishedAt: 1000,
  };
  const postItem: ParsedFeedItem = {
    title: "21 years of Reddit",
    url: "https://www.reddit.com/r/u_spez/comments/1u7hraf/21_years_of_reddit/",
    content: "Hi everyone,",
    rawXml: "<entry><id>t3_1u7hraf</id></entry>",
    publishedAt: 900,
  };

  it("drops comment items for a Reddit user feed with comments excluded", () => {
    // Arrange
    const feed = {
      url: "https://www.reddit.com/user/spez.rss",
      reddit_include_comments: 0,
    };

    // Act
    const result = filterExcludedRedditComments(feed, [commentItem, postItem]);

    // Assert — only the submitted post survives
    expect(result).toEqual([postItem]);
  });

  it("keeps comment items when the feed's toggle explicitly includes them", () => {
    // Arrange
    const feed = {
      url: "https://www.reddit.com/user/spez.rss",
      reddit_include_comments: 1,
    };

    // Act
    const result = filterExcludedRedditComments(feed, [commentItem, postItem]);

    // Assert
    expect(result).toEqual([commentItem, postItem]);
  });

  it("is a no-op for a subreddit feed even without an explicit flag", () => {
    // Arrange
    const feed = {
      url: "https://www.reddit.com/r/pics.rss",
      reddit_include_comments: 0,
    };

    // Act
    const result = filterExcludedRedditComments(feed, [commentItem, postItem]);

    // Assert
    expect(result).toEqual([commentItem, postItem]);
  });
});
