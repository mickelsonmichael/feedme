import { getFeedIconUrl } from "./feedIcon";

describe("getFeedIconUrl", () => {
  it("returns the site favicon URL for https feeds", () => {
    expect(getFeedIconUrl("https://example.com/feed.xml")).toBe(
      "https://example.com/favicon.ico"
    );
  });

  it("preserves non-default ports", () => {
    expect(getFeedIconUrl("http://localhost:8080/rss")).toBe(
      "http://localhost:8080/favicon.ico"
    );
  });

  it("returns null for invalid URLs", () => {
    expect(getFeedIconUrl("not-a-url")).toBeNull();
  });

  it("returns null for unsupported protocols", () => {
    expect(getFeedIconUrl("ftp://example.com/feed.xml")).toBeNull();
  });
});
