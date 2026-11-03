import { addFeed, deleteFeed, getFeedByUrl } from "./database";
import {
  followRedditAuthor,
  redditAuthorFeedUrl,
  toggleRedditAuthorFollow,
} from "./redditFollow";
import type { Feed } from "./types";

jest.mock("./database", () => ({
  addFeed: jest.fn().mockResolvedValue(42),
  deleteFeed: jest.fn().mockResolvedValue(undefined),
  getFeedByUrl: jest.fn(),
}));

const mockAddFeed = addFeed as jest.MockedFunction<typeof addFeed>;
const mockDeleteFeed = deleteFeed as jest.MockedFunction<typeof deleteFeed>;
const mockGetFeedByUrl = getFeedByUrl as jest.MockedFunction<
  typeof getFeedByUrl
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("redditAuthorFeedUrl", () => {
  it("points at the user's submitted posts, not their comments", () => {
    expect(redditAuthorFeedUrl("spez")).toBe(
      "https://www.reddit.com/user/spez/submitted.rss"
    );
  });
});

describe("followRedditAuthor", () => {
  it("adds the user's feed and returns its id", async () => {
    await expect(followRedditAuthor("spez", false)).resolves.toBe(42);
    expect(mockAddFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reddit - u/spez",
        url: redditAuthorFeedUrl("spez"),
        nsfw: 0,
        show_only_in_tag: 0,
        show_only_in_custom_feed: 0,
      })
    );
  });

  it("marks the follow NSFW when the author came from an NSFW feed", async () => {
    await followRedditAuthor("spez", true);
    expect(mockAddFeed).toHaveBeenCalledWith(
      expect.objectContaining({ nsfw: 1 })
    );
  });
});

describe("toggleRedditAuthorFollow", () => {
  it("follows an author who isn't followed yet, inheriting NSFW", async () => {
    mockGetFeedByUrl.mockResolvedValue(null);
    await toggleRedditAuthorFollow("spez", true);
    expect(mockGetFeedByUrl).toHaveBeenCalledWith(redditAuthorFeedUrl("spez"));
    expect(mockAddFeed).toHaveBeenCalledWith(
      expect.objectContaining({ url: redditAuthorFeedUrl("spez"), nsfw: 1 })
    );
    expect(mockDeleteFeed).not.toHaveBeenCalled();
  });

  it("unfollows an author who is already followed", async () => {
    mockGetFeedByUrl.mockResolvedValue({ id: 7 } as Feed);
    await toggleRedditAuthorFollow("spez", false);
    expect(mockDeleteFeed).toHaveBeenCalledWith(7);
    expect(mockAddFeed).not.toHaveBeenCalled();
  });
});
