import { FeedItemWithFeed, GroupFeedsMode } from "./types";

export type { GroupFeedsMode };

export type GroupDivider = {
  type: "group-divider";
  label: string;
  key: string;
};

export type FeedListRow = FeedItemWithFeed | GroupDivider;

export function isGroupDivider<T>(row: T): row is T & GroupDivider {
  return (row as GroupDivider).type === "group-divider";
}

/**
 * Computes an opaque bucket key for the given timestamp (ms since epoch)
 * based on the grouping mode.  Items with the same key belong to the same bucket.
 */
export function getTimeBucketKey(
  ts: number | null,
  mode: GroupFeedsMode
): string {
  if (mode === "none") return "";
  const date = new Date(ts ?? 0);

  switch (mode) {
    case "hourly":
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
        String(date.getHours()).padStart(2, "0"),
      ].join("-");

    case "daily":
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");

    case "weekly": {
      // Anchor the week to the Monday of the item's week.
      const monday = new Date(date);
      const daysToMonday = (date.getDay() + 6) % 7; // Sun=0 → 6 days back, Mon=1 → 0, …
      monday.setDate(date.getDate() - daysToMonday);
      return [
        monday.getFullYear(),
        String(monday.getMonth() + 1).padStart(2, "0"),
        String(monday.getDate()).padStart(2, "0"),
        "week",
      ].join("-");
    }

    case "monthly":
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
      ].join("-");
  }
}

/**
 * Formats a timestamp into a human-readable group header label.
 */
export function getTimeBucketLabel(
  ts: number | null,
  mode: GroupFeedsMode,
  now: number = Date.now()
): string {
  if (mode === "none") return "";

  const date = new Date(ts ?? 0);
  const today = new Date(now);

  const isSameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  switch (mode) {
    case "hourly": {
      const timeLabel = date.toLocaleTimeString(undefined, {
        hour: "numeric",
        hour12: true,
      });
      if (isSameDay) return `Today ${timeLabel}`;
      if (isYesterday) return `Yesterday ${timeLabel}`;
      return (
        date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }) +
        " " +
        timeLabel
      );
    }

    case "daily": {
      if (isSameDay) return "Today";
      if (isYesterday) return "Yesterday";
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year:
          date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      });
    }

    case "weekly": {
      const monday = new Date(date);
      const daysToMonday = (date.getDay() + 6) % 7;
      monday.setDate(date.getDate() - daysToMonday);

      // Find this week's Monday for comparison.
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      thisMonday.setHours(0, 0, 0, 0);
      monday.setHours(0, 0, 0, 0);

      if (monday.getTime() === thisMonday.getTime()) return "This week";
      return (
        "Week of " +
        monday.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year:
            monday.getFullYear() !== today.getFullYear()
              ? "numeric"
              : undefined,
        })
      );
    }

    case "monthly":
      return date.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
  }
}

/**
 * Injects group-divider rows into a sorted (newest-first) list of items.
 * A divider is inserted before the first item of each new time bucket.
 * Empty buckets are skipped automatically since they produce no items.
 *
 * @param items  Items already sorted newest-first.
 * @param mode   Grouping granularity.  "none" returns the original array unchanged.
 * @param now    Optional clock override, useful in tests.
 */
export function injectGroupDividers(
  items: FeedItemWithFeed[],
  mode: GroupFeedsMode,
  now: number = Date.now()
): FeedListRow[] {
  if (mode === "none" || items.length === 0) return items;

  const result: FeedListRow[] = [];
  let lastKey = "";

  for (const item of items) {
    const key = getTimeBucketKey(item.published_at, mode);
    if (key !== lastKey) {
      result.push({
        type: "group-divider",
        label: getTimeBucketLabel(item.published_at, mode, now),
        key: `divider-${key}`,
      });
      lastKey = key;
    }
    result.push(item);
  }

  return result;
}
