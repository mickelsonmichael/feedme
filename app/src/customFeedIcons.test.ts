import {
  CUSTOM_FEED_ICON_OPTIONS,
  DEFAULT_CUSTOM_FEED_ICON,
  filterCustomFeedIcons,
  resolveCustomFeedIcon,
} from "./customFeedIcons";

describe("customFeedIcons", () => {
  it("returns the full list for an empty query", () => {
    expect(filterCustomFeedIcons("")).toHaveLength(
      CUSTOM_FEED_ICON_OPTIONS.length
    );
    expect(filterCustomFeedIcons("   ")).toHaveLength(
      CUSTOM_FEED_ICON_OPTIONS.length
    );
  });

  it("matches by alias (podcast → mic / headphones)", () => {
    const names = filterCustomFeedIcons("podcast").map((opt) => opt.name);
    expect(names).toEqual(expect.arrayContaining(["mic", "headphones"]));
  });

  it("matches by raw icon name", () => {
    const names = filterCustomFeedIcons("star").map((opt) => opt.name);
    expect(names).toContain("star");
  });

  it("is case-insensitive", () => {
    expect(filterCustomFeedIcons("STAR").map((o) => o.name)).toContain("star");
  });

  it("returns empty array for unknown query", () => {
    expect(filterCustomFeedIcons("definitelynotanicon-xyzzy")).toEqual([]);
  });

  it("resolveCustomFeedIcon falls back to the default", () => {
    expect(resolveCustomFeedIcon(null)).toBe(DEFAULT_CUSTOM_FEED_ICON);
    expect(resolveCustomFeedIcon(undefined)).toBe(DEFAULT_CUSTOM_FEED_ICON);
    expect(resolveCustomFeedIcon("")).toBe(DEFAULT_CUSTOM_FEED_ICON);
    expect(resolveCustomFeedIcon("not-a-real-feather-glyph")).toBe(
      DEFAULT_CUSTOM_FEED_ICON
    );
  });

  it("resolveCustomFeedIcon preserves valid stored names", () => {
    expect(resolveCustomFeedIcon("star")).toBe("star");
  });
});
