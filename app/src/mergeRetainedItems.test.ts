import { mergeRetainedItems } from "./mergeRetainedItems";
import { FeedItemWithFeed } from "./types";

function item(id: number, read = 0): FeedItemWithFeed {
  return {
    id,
    feed_id: 1,
    feed_title: "Alpha",
    title: `Post ${id}`,
    url: `https://alpha.example/${id}`,
    content: "body",
    image_url: null,
    published_at: 1_700_000_000_000 - id,
    read,
    raw_xml: null,
  };
}

describe("mergeRetainedItems", () => {
  it("carries retained posts missing from the page back in", () => {
    // Arrange - post 2 was read a moment ago, so the unread-only re-query
    // dropped it, but it is still being held on screen.
    const page = [item(1), item(3)];
    const previous = [item(1), item(2, 1), item(3)];

    // Act
    const merged = mergeRetainedItems(page, previous, new Set([2]));

    // Assert
    expect(merged.map((i) => i.id)).toEqual([1, 3, 2]);
  });

  it("returns the page unchanged when nothing is retained", () => {
    // Arrange
    const page = [item(1), item(2)];

    // Act
    const merged = mergeRetainedItems(page, [item(9, 1)], new Set());

    // Assert
    expect(merged).toBe(page);
  });

  it("does not duplicate a retained post that is still in the page", () => {
    // Arrange - the post is retained but the query returned it anyway.
    const page = [item(1), item(2)];

    // Act
    const merged = mergeRetainedItems(page, [item(2)], new Set([2]));

    // Assert
    expect(merged.map((i) => i.id)).toEqual([1, 2]);
    expect(merged).toBe(page);
  });

  it("ignores retained ids with no corresponding committed post", () => {
    // Arrange - the id was retained but its post is no longer committed.
    const page = [item(1)];

    // Act
    const merged = mergeRetainedItems(page, [], new Set([42]));

    // Assert
    expect(merged.map((i) => i.id)).toEqual([1]);
  });

  it("prefers the page's copy of a post over the committed one", () => {
    // Arrange - the page holds a newer copy (edited title) of post 2.
    const fresh = { ...item(2), title: "Edited" };
    const stale = { ...item(2, 1), title: "Stale" };

    // Act
    const merged = mergeRetainedItems([fresh], [stale], new Set([2]));

    // Assert
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Edited");
  });
});
