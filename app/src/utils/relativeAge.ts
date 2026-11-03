/**
 * A compact age for list rows: "just now", "5h", "3d", then a short date
 * ("Mar 4") once it's a week old. Empty for a missing timestamp.
 */
export function formatRelativeAge(ts: number | null, now = Date.now()): string {
  if (!ts) return "";
  const hours = Math.floor((now - ts) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
