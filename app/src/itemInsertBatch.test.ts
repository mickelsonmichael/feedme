import {
  buildItemInsertSql,
  buildItemInsertValues,
  chunkForInsert,
  ITEM_INSERT_BATCH_SIZE,
  ITEM_INSERT_COLUMNS,
} from "./itemInsertBatch";
import { ParsedFeedItem } from "./types";

function makeItem(overrides: Partial<ParsedFeedItem> = {}): ParsedFeedItem {
  return {
    title: "Title",
    url: "https://example.com/a",
    content: "<p>body</p>",
    imageUrl: "https://example.com/a.png",
    publishedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("chunkForInsert", () => {
  it("returns no batches for an empty list", () => {
    // Arrange / Act
    const batches = chunkForInsert([], 25);

    // Assert
    expect(batches).toEqual([]);
  });

  it("splits a full feed into batches that each stay under the bind limit", () => {
    // Arrange — the cap upsertItems applies per feed
    const items = Array.from({ length: 100 }, (_, i) => i);

    // Act
    const batches = chunkForInsert(items, ITEM_INSERT_BATCH_SIZE);

    // Assert
    expect(batches).toHaveLength(4);
    for (const batch of batches) {
      expect(batch.length * ITEM_INSERT_COLUMNS.length).toBeLessThan(999);
    }
    expect(batches.flat()).toEqual(items);
  });

  it("puts the remainder in a final short batch", () => {
    // Arrange
    const items = Array.from({ length: 7 }, (_, i) => i);

    // Act
    const batches = chunkForInsert(items, 3);

    // Assert
    expect(batches).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
  });

  it("rejects a batch size that would never make progress", () => {
    // Arrange / Act / Assert
    expect(() => chunkForInsert([1, 2], 0)).toThrow();
  });
});

describe("buildItemInsertSql", () => {
  it("emits one placeholder group per row", () => {
    // Arrange / Act
    const sql = buildItemInsertSql(3);

    // Assert
    const groups = sql.match(/\(\?(?:, \?)*\)/g) ?? [];
    expect(groups).toHaveLength(3);
    expect(groups[0]?.split("?")).toHaveLength(ITEM_INSERT_COLUMNS.length + 1);
  });

  it("upserts on the (feed_id, url) uniqueness constraint", () => {
    // Arrange / Act
    const sql = buildItemInsertSql(1);

    // Assert
    expect(sql).toContain("ON CONFLICT (feed_id, url) DO UPDATE SET");
  });

  it("refreshes published_at on conflict so cadence learning sees revisions", () => {
    // Arrange / Act
    const sql = buildItemInsertSql(1);

    // Assert
    expect(sql).toContain("published_at = excluded.published_at");
  });

  it("rejects a statement with no rows", () => {
    // Arrange / Act / Assert
    expect(() => buildItemInsertSql(0)).toThrow();
  });
});

describe("buildItemInsertValues", () => {
  it("binds each row in column order", () => {
    // Arrange
    const item = makeItem();

    // Act
    const values = buildItemInsertValues(42, [item]);

    // Assert
    expect(values).toEqual([
      42,
      "Title",
      "https://example.com/a",
      "<p>body</p>",
      "https://example.com/a.png",
      0,
      1_700_000_000_000,
    ]);
  });

  it("produces exactly the number of binds the SQL expects", () => {
    // Arrange
    const batch = [makeItem(), makeItem(), makeItem()];

    // Act
    const values = buildItemInsertValues(1, batch);
    const placeholders = (buildItemInsertSql(batch.length).match(/\?/g) ?? [])
      .length;

    // Assert
    expect(values).toHaveLength(placeholders);
  });

  it("normalises missing optional fields to null rather than undefined", () => {
    // Arrange — expo-sqlite rejects undefined binds
    const item = makeItem({
      url: null,
      content: null,
      imageUrl: undefined,
      publishedAt: null,
    });

    // Act
    const values = buildItemInsertValues(7, [item]);

    // Assert
    expect(values).toEqual([7, "Title", null, null, null, 0, null]);
    expect(values).not.toContain(undefined);
  });

  it("flags Reddit comment entries from their raw XML", () => {
    // Arrange — Reddit's Atom <id> uses the t1_ fullname prefix for comments
    const comment = makeItem({ rawXml: "<entry><id>t1_abc</id></entry>" });
    const post = makeItem({ rawXml: "<entry><id>t3_xyz</id></entry>" });

    // Act
    const commentValues = buildItemInsertValues(1, [comment]);
    const postValues = buildItemInsertValues(1, [post]);

    // Assert
    const flagIndex = ITEM_INSERT_COLUMNS.indexOf("is_reddit_comment");
    expect(commentValues[flagIndex]).toBe(1);
    expect(postValues[flagIndex]).toBe(0);
  });

  it("treats an item with no raw XML as a non-comment", () => {
    // Arrange — raw XML is never persisted, so re-upserts arrive without it
    const item = makeItem({ rawXml: undefined });

    // Act
    const values = buildItemInsertValues(1, [item]);

    // Assert
    expect(values[ITEM_INSERT_COLUMNS.indexOf("is_reddit_comment")]).toBe(0);
  });
});
