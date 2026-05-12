import {
  getTimeBucketKey,
  getTimeBucketLabel,
  injectGroupDividers,
  isGroupDivider,
} from "./groupItems";
import { FeedItemWithFeed } from "./types";

// A fixed reference "now" to make assertions deterministic.
// 2024-05-15 14:30:00 UTC
const NOW = new Date("2024-05-15T14:30:00Z").getTime();

function makeItem(
  id: number,
  publishedAt: number | null
): FeedItemWithFeed {
  return {
    id,
    feed_id: 1,
    title: `Item ${id}`,
    url: `https://example.com/${id}`,
    content: null,
    image_url: null,
    raw_xml: null,
    published_at: publishedAt,
    read: 0,
    feed_title: "Test Feed",
  };
}

// ── getTimeBucketKey ──────────────────────────────────────────────────────────

describe("getTimeBucketKey", () => {
  it('returns empty string for mode "none"', () => {
    expect(getTimeBucketKey(NOW, "none")).toBe("");
  });

  it("returns hour-precision key for hourly mode", () => {
    const ts = new Date("2024-05-15T14:05:00Z").getTime();
    const key = getTimeBucketKey(ts, "hourly");
    // Two items in the same hour must share the same key.
    const ts2 = new Date("2024-05-15T14:59:00Z").getTime();
    expect(getTimeBucketKey(ts, "hourly")).toBe(getTimeBucketKey(ts2, "hourly"));
    // A different hour must produce a different key.
    const ts3 = new Date("2024-05-15T15:00:00Z").getTime();
    expect(key).not.toBe(getTimeBucketKey(ts3, "hourly"));
  });

  it("returns day-precision key for daily mode", () => {
    const tsA = new Date("2024-05-15T00:00:00Z").getTime();
    const tsB = new Date("2024-05-15T23:59:59Z").getTime();
    const tsC = new Date("2024-05-16T00:00:00Z").getTime();
    expect(getTimeBucketKey(tsA, "daily")).toBe(getTimeBucketKey(tsB, "daily"));
    expect(getTimeBucketKey(tsA, "daily")).not.toBe(
      getTimeBucketKey(tsC, "daily")
    );
  });

  it("returns week-precision key for weekly mode (weeks anchored to Monday)", () => {
    // 2024-05-13 is Monday, 2024-05-19 is Sunday — same week.
    const mon = new Date("2024-05-13T08:00:00Z").getTime();
    const sun = new Date("2024-05-19T20:00:00Z").getTime();
    // 2024-05-20 is the next Monday — different week.
    const nextMon = new Date("2024-05-20T00:01:00Z").getTime();
    expect(getTimeBucketKey(mon, "weekly")).toBe(getTimeBucketKey(sun, "weekly"));
    expect(getTimeBucketKey(mon, "weekly")).not.toBe(
      getTimeBucketKey(nextMon, "weekly")
    );
  });

  it("returns month-precision key for monthly mode", () => {
    const tsA = new Date("2024-05-01T00:00:00Z").getTime();
    const tsB = new Date("2024-05-31T23:59:59Z").getTime();
    const tsC = new Date("2024-06-01T00:00:00Z").getTime();
    expect(getTimeBucketKey(tsA, "monthly")).toBe(
      getTimeBucketKey(tsB, "monthly")
    );
    expect(getTimeBucketKey(tsA, "monthly")).not.toBe(
      getTimeBucketKey(tsC, "monthly")
    );
  });

  it("handles null timestamps without throwing", () => {
    expect(() => getTimeBucketKey(null, "daily")).not.toThrow();
  });
});

// ── getTimeBucketLabel ────────────────────────────────────────────────────────

describe("getTimeBucketLabel", () => {
  it('returns empty string for mode "none"', () => {
    expect(getTimeBucketLabel(NOW, "none", NOW)).toBe("");
  });

  it('returns "Today …" for an item published today (hourly)', () => {
    const ts = new Date("2024-05-15T10:00:00Z").getTime();
    const label = getTimeBucketLabel(ts, "hourly", NOW);
    expect(label.startsWith("Today")).toBe(true);
  });

  it('returns "Yesterday …" for an item published yesterday (hourly)', () => {
    const ts = new Date("2024-05-14T10:00:00Z").getTime();
    const label = getTimeBucketLabel(ts, "hourly", NOW);
    expect(label.startsWith("Yesterday")).toBe(true);
  });

  it('returns "Today" for an item published today (daily)', () => {
    expect(getTimeBucketLabel(NOW, "daily", NOW)).toBe("Today");
  });

  it('returns "Yesterday" for an item published yesterday (daily)', () => {
    const yesterday = NOW - 24 * 60 * 60 * 1000;
    // Ensure the date actually rolled to "yesterday" in local time.
    const ts = new Date(NOW);
    ts.setDate(ts.getDate() - 1);
    const label = getTimeBucketLabel(ts.getTime(), "daily", NOW);
    expect(label).toBe("Yesterday");
  });

  it('returns "This week" for an item in the current week (weekly)', () => {
    // NOW is 2024-05-15 (Wednesday), so 2024-05-13 (Monday) is this week.
    const ts = new Date("2024-05-13T09:00:00Z").getTime();
    const label = getTimeBucketLabel(ts, "weekly", NOW);
    expect(label).toBe("This week");
  });

  it('returns "Week of …" for an item in a past week (weekly)', () => {
    // 2024-05-06 is Monday of the previous week.
    const ts = new Date("2024-05-06T09:00:00Z").getTime();
    const label = getTimeBucketLabel(ts, "weekly", NOW);
    expect(label).toMatch(/^Week of /);
  });

  it("returns month + year for monthly mode", () => {
    const ts = new Date("2024-04-15T12:00:00Z").getTime();
    const label = getTimeBucketLabel(ts, "monthly", NOW);
    // Should contain the month name and year.
    expect(label).toMatch(/April/);
    expect(label).toMatch(/2024/);
  });
});

// ── injectGroupDividers ───────────────────────────────────────────────────────

describe("injectGroupDividers", () => {
  it('returns the original array unchanged for mode "none"', () => {
    const items = [makeItem(1, NOW), makeItem(2, NOW - 1000)];
    const result = injectGroupDividers(items, "none", NOW);
    expect(result).toBe(items); // same reference
  });

  it("returns the original array unchanged when items is empty", () => {
    const result = injectGroupDividers([], "daily", NOW);
    expect(result).toHaveLength(0);
  });

  it("injects one divider per distinct daily bucket", () => {
    const day1a = new Date("2024-05-15T10:00:00Z").getTime();
    const day1b = new Date("2024-05-15T08:00:00Z").getTime();
    const day2 = new Date("2024-05-14T20:00:00Z").getTime();
    const items = [makeItem(1, day1a), makeItem(2, day1b), makeItem(3, day2)];

    const result = injectGroupDividers(items, "daily", NOW);
    // Should be: [divider(day1), item1, item2, divider(day2), item3]
    expect(result).toHaveLength(5);
    expect(isGroupDivider(result[0])).toBe(true);
    expect(isGroupDivider(result[1])).toBe(false);
    expect(isGroupDivider(result[2])).toBe(false);
    expect(isGroupDivider(result[3])).toBe(true);
    expect(isGroupDivider(result[4])).toBe(false);
  });

  it("does not insert a divider for a bucket that has no items", () => {
    // Items only span two days, so only two dividers should appear.
    const day1 = new Date("2024-05-15T10:00:00Z").getTime();
    const day3 = new Date("2024-05-13T10:00:00Z").getTime();
    const items = [makeItem(1, day1), makeItem(2, day3)];
    const result = injectGroupDividers(items, "daily", NOW);
    const dividers = result.filter(isGroupDivider);
    expect(dividers).toHaveLength(2);
  });

  it("injects one divider at the top when all items are in the same bucket", () => {
    const items = [
      makeItem(1, new Date("2024-05-15T10:00:00Z").getTime()),
      makeItem(2, new Date("2024-05-15T11:00:00Z").getTime()),
    ];
    const result = injectGroupDividers(items, "daily", NOW);
    const dividers = result.filter(isGroupDivider);
    expect(dividers).toHaveLength(1);
    expect(isGroupDivider(result[0])).toBe(true);
  });

  it("divider keys are unique across different buckets", () => {
    const ts1 = new Date("2024-05-15T10:00:00Z").getTime();
    const ts2 = new Date("2024-05-14T10:00:00Z").getTime();
    const items = [makeItem(1, ts1), makeItem(2, ts2)];
    const result = injectGroupDividers(items, "daily", NOW);
    const dividers = result.filter(isGroupDivider);
    const keys = dividers.map((d) => (d as import("./groupItems").GroupDivider).key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("handles weekly grouping across a week boundary", () => {
    // Week 1: Mon 2024-05-13
    const w1 = new Date("2024-05-14T10:00:00Z").getTime(); // Tuesday
    // Week 2: Mon 2024-05-06
    const w2 = new Date("2024-05-07T10:00:00Z").getTime(); // Tuesday previous week
    const items = [makeItem(1, w1), makeItem(2, w2)];
    const result = injectGroupDividers(items, "weekly", NOW);
    expect(result.filter(isGroupDivider)).toHaveLength(2);
  });

  it("handles monthly grouping across a month boundary", () => {
    const may = new Date("2024-05-01T10:00:00Z").getTime();
    const apr = new Date("2024-04-30T10:00:00Z").getTime();
    const items = [makeItem(1, may), makeItem(2, apr)];
    const result = injectGroupDividers(items, "monthly", NOW);
    expect(result.filter(isGroupDivider)).toHaveLength(2);
  });

  it("handles null published_at without throwing", () => {
    const items = [makeItem(1, null)];
    expect(() => injectGroupDividers(items, "daily", NOW)).not.toThrow();
  });
});
