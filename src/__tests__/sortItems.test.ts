import { sortNewest, sortStacked, applySortMode } from "../sortItems";
import { FeedItemWithFeed } from "../types";

function makeItem(
  id: number,
  feedId: number,
  publishedAt: number | null,
  feedTitle = `Feed ${feedId}`
): FeedItemWithFeed {
  return {
    id,
    feed_id: feedId,
    title: `Item ${id}`,
    url: `https://example.com/item/${id}`,
    content: null,
    image_url: null,
    published_at: publishedAt,
    read: 0,
    feed_title: feedTitle,
  };
}

describe("sortNewest", () => {
  it("returns items sorted by published_at descending", () => {
    // Arrange
    const items = [
      makeItem(1, 1, 100),
      makeItem(2, 1, 300),
      makeItem(3, 1, 200),
    ];

    // Act
    const result = sortNewest(items);

    // Assert
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("treats null published_at as 0 (sorts to end)", () => {
    // Arrange
    const items = [makeItem(1, 1, null), makeItem(2, 1, 100)];

    // Act
    const result = sortNewest(items);

    // Assert
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = [makeItem(1, 1, 200), makeItem(2, 1, 100)];
    const originalOrder = items.map((i) => i.id);

    // Act
    sortNewest(items);

    // Assert
    expect(items.map((i) => i.id)).toEqual(originalOrder);
  });

  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = sortNewest([]);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("sortStacked", () => {
  it("returns all items without duplicates", () => {
    // Arrange
    const items = [
      makeItem(1, 1, 100),
      makeItem(2, 2, 200),
      makeItem(3, 1, 300),
      makeItem(4, 2, 400),
    ];

    // Act
    const result = sortStacked(items);

    // Assert
    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty array for empty input", () => {
    // Arrange & Act
    const result = sortStacked([]);

    // Assert
    expect(result).toEqual([]);
  });

  it("returns single-feed items in newest-first order", () => {
    // Arrange
    const items = [
      makeItem(1, 1, 100),
      makeItem(2, 1, 300),
      makeItem(3, 1, 200),
    ];

    // Act
    const result = sortStacked(items);

    // Assert
    expect(result.map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("interleaves items from multiple feeds using the provided random function", () => {
    // Arrange — always pick index 0 (first available feed)
    const alwaysFirst = () => 0;
    const items = [
      makeItem(1, 1, 300), // feed 1 newest
      makeItem(2, 1, 100), // feed 1 oldest
      makeItem(3, 2, 400), // feed 2 newest
      makeItem(4, 2, 200), // feed 2 oldest
    ];

    // Act
    // With alwaysFirst: call 1 picks feed[0]=feed1 → item1; call 2 picks feed[0]=feed1 → item2,
    // feed1 exhausted; call 3 only feed2 left → append items 3,4
    const result = sortStacked(items, alwaysFirst);

    // Assert
    expect(result.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });

  it("items within each feed are consumed in newest-first order", () => {
    // Arrange — deterministic: alternate between feeds
    let call = 0;
    const alternate = () => (call++ % 2 === 0 ? 0 : 0.99);
    const items = [
      makeItem(1, 1, 300), // feed 1 newest
      makeItem(2, 1, 100), // feed 1 oldest
      makeItem(3, 2, 400), // feed 2 newest
      makeItem(4, 2, 200), // feed 2 oldest
    ];

    // Act
    const result = sortStacked(items, alternate);

    // Assert — feeds alternate; each feed's items appear newest-first
    // call 0 → 0 % 2 === 0 → idx 0 → feed1[0] = item1
    // call 1 → 1 % 2 !== 0 → idx 1 → feed2[0] = item3
    // call 2 → 2 % 2 === 0 → idx 0 → feed1[0] = item2, feed1 exhausted
    // only feed2 left → append item4
    expect(result.map((i) => i.id)).toEqual([1, 3, 2, 4]);
  });

  it("appends all remaining items from the last feed in newest-first order", () => {
    // Arrange — pick the second feed first, then only the first remains
    let call = 0;
    const pickSecondFirst = () => (call++ === 0 ? 0.99 : 0);
    const items = [
      makeItem(1, 1, 300),
      makeItem(2, 1, 100),
      makeItem(3, 2, 400), // single item in feed 2
    ];

    // Act
    const result = sortStacked(items, pickSecondFirst);

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe(3); // feed 2 item taken first
    // Remaining feed 1 items appended in newest-first order
    expect(result[1].id).toBe(1);
    expect(result[2].id).toBe(2);
  });

  it("does not mutate the original array", () => {
    // Arrange
    const items = [makeItem(1, 1, 200), makeItem(2, 2, 100)];
    const snapshot = JSON.stringify(items);

    // Act
    sortStacked(items);

    // Assert
    expect(JSON.stringify(items)).toBe(snapshot);
  });
});

describe("applySortMode", () => {
  it("delegates to sortNewest when mode is 'newest'", () => {
    // Arrange
    const items = [makeItem(1, 1, 100), makeItem(2, 1, 300)];

    // Act
    const result = applySortMode(items, "newest");

    // Assert
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it("delegates to sortStacked when mode is 'stacked'", () => {
    // Arrange
    const items = [makeItem(1, 1, 100), makeItem(2, 2, 200)];

    // Act
    const result = applySortMode(items, "stacked");

    // Assert
    expect(result).toHaveLength(2);
  });

  it("passes the custom random function through to sortStacked", () => {
    // Arrange — predictable random always picks idx 0
    const alwaysFirst = () => 0;
    const items = [
      makeItem(1, 1, 300),
      makeItem(2, 1, 100),
      makeItem(3, 2, 400),
      makeItem(4, 2, 200),
    ];

    // Act
    const result = applySortMode(items, "stacked", alwaysFirst);

    // Assert — same deterministic order as the sortStacked "alwaysFirst" test
    expect(result.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });
});
