import { toggleExpandedId } from "../expandItemIds";

describe("toggleExpandedId", () => {
  describe("when the id is NOT in the set", () => {
    it("adds the id and returns a new set", () => {
      // Arrange
      const original = new Set<number>([1, 2]);

      // Act
      const result = toggleExpandedId(original, 3);

      // Assert
      expect(result.has(3)).toBe(true);
      expect(result.size).toBe(3);
    });

    it("does not mutate the original set", () => {
      // Arrange
      const original = new Set<number>([1]);

      // Act
      toggleExpandedId(original, 2);

      // Assert
      expect(original.has(2)).toBe(false);
      expect(original.size).toBe(1);
    });
  });

  describe("when the id IS in the set", () => {
    it("removes the id and returns a new set", () => {
      // Arrange
      const original = new Set<number>([1, 2, 3]);

      // Act
      const result = toggleExpandedId(original, 2);

      // Assert
      expect(result.has(2)).toBe(false);
      expect(result.size).toBe(2);
    });

    it("does not mutate the original set", () => {
      // Arrange
      const original = new Set<number>([1, 2]);

      // Act
      toggleExpandedId(original, 1);

      // Assert
      expect(original.has(1)).toBe(true);
      expect(original.size).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("works on an empty set by adding the id", () => {
      // Arrange
      const original = new Set<number>();

      // Act
      const result = toggleExpandedId(original, 5);

      // Assert
      expect(result.has(5)).toBe(true);
      expect(result.size).toBe(1);
    });

    it("toggling the same id twice returns a set equal to the original", () => {
      // Arrange
      const original = new Set<number>([10]);

      // Act
      const afterFirst = toggleExpandedId(original, 10);
      const afterSecond = toggleExpandedId(afterFirst, 10);

      // Assert
      expect(afterSecond.has(10)).toBe(true);
      expect(afterSecond.size).toBe(1);
    });

    it("multiple items can be expanded independently", () => {
      // Arrange
      let set = new Set<number>();

      // Act
      set = toggleExpandedId(set, 1);
      set = toggleExpandedId(set, 2);

      // Assert
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.size).toBe(2);
    });
  });
});
