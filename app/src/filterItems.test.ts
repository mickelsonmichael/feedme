import { applyFilter } from "./filterItems";
import { FeedItemWithFeed } from "./types";

function makeItem(id: number, read: 0 | 1 = 0, feedId = 1): FeedItemWithFeed {
  return {
    id,
    feed_id: feedId,
    title: `Item ${id}`,
    url: `https://example.com/item/${id}`,
    content: null,
    image_url: null,
    raw_xml: null,
    published_at: id * 1000,
    read,
    feed_title: `Feed ${feedId}`,
  };
}

describe("applyFilter", () => {
  describe("filter = 'all'", () => {
    it("returns all items regardless of read status", () => {
      // Arrange
      const items = [makeItem(1, 0), makeItem(2, 1), makeItem(3, 0)];
      const savedIds = new Set<number>();

      // Act
      const result = applyFilter(items, "all", savedIds);

      // Assert
      expect(result).toHaveLength(3);
      expect(result.map((i) => i.id)).toEqual([1, 2, 3]);
    });

    it("returns all items regardless of saved status", () => {
      // Arrange
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const savedIds = new Set<number>([2]);

      // Act
      const result = applyFilter(items, "all", savedIds);

      // Assert
      expect(result).toHaveLength(3);
    });

    it("returns an empty array when given no items", () => {
      // Arrange & Act
      const result = applyFilter([], "all", new Set());

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("filter = 'unread'", () => {
    it("returns only unread items (read === 0)", () => {
      // Arrange
      const items = [makeItem(1, 0), makeItem(2, 1), makeItem(3, 0)];
      const savedIds = new Set<number>();

      // Act
      const result = applyFilter(items, "unread", savedIds);

      // Assert
      expect(result.map((i) => i.id)).toEqual([1, 3]);
    });

    it("returns an empty array when all items are read", () => {
      // Arrange
      const items = [makeItem(1, 1), makeItem(2, 1)];

      // Act
      const result = applyFilter(items, "unread", new Set());

      // Assert
      expect(result).toEqual([]);
    });

    it("returns all items when none are read", () => {
      // Arrange
      const items = [makeItem(1, 0), makeItem(2, 0), makeItem(3, 0)];

      // Act
      const result = applyFilter(items, "unread", new Set());

      // Assert
      expect(result).toHaveLength(3);
    });

    it("does not mutate the original array", () => {
      // Arrange
      const items = [makeItem(1, 0), makeItem(2, 1)];
      const snapshot = [...items];

      // Act
      applyFilter(items, "unread", new Set());

      // Assert
      expect(items).toEqual(snapshot);
    });
  });

  describe("filter = 'starred'", () => {
    it("returns only items whose id is in savedIds", () => {
      // Arrange
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const savedIds = new Set<number>([1, 3]);

      // Act
      const result = applyFilter(items, "starred", savedIds);

      // Assert
      expect(result.map((i) => i.id)).toEqual([1, 3]);
    });

    it("returns an empty array when savedIds is empty", () => {
      // Arrange
      const items = [makeItem(1), makeItem(2)];

      // Act
      const result = applyFilter(items, "starred", new Set());

      // Assert
      expect(result).toEqual([]);
    });

    it("returns all items when all ids are in savedIds", () => {
      // Arrange
      const items = [makeItem(1), makeItem(2), makeItem(3)];
      const savedIds = new Set<number>([1, 2, 3]);

      // Act
      const result = applyFilter(items, "starred", savedIds);

      // Assert
      expect(result).toHaveLength(3);
    });

    it("does not mutate the original array", () => {
      // Arrange
      const items = [makeItem(1), makeItem(2)];
      const snapshot = [...items];

      // Act
      applyFilter(items, "starred", new Set([1]));

      // Assert
      expect(items).toEqual(snapshot);
    });
  });
});
