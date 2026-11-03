import { formatRelativeAge } from "./relativeAge";

const HOUR = 3_600_000;
const NOW = new Date(2026, 2, 20, 12, 0, 0).getTime();

describe("formatRelativeAge", () => {
  it("is empty when there is no timestamp", () => {
    expect(formatRelativeAge(null, NOW)).toBe("");
    expect(formatRelativeAge(0, NOW)).toBe("");
  });

  it('says "just now" under an hour old', () => {
    expect(formatRelativeAge(NOW - 59 * 60_000, NOW)).toBe("just now");
  });

  it("counts whole hours under a day", () => {
    expect(formatRelativeAge(NOW - HOUR, NOW)).toBe("1h");
    expect(formatRelativeAge(NOW - 23.9 * HOUR, NOW)).toBe("23h");
  });

  it("counts whole days under a week", () => {
    expect(formatRelativeAge(NOW - 24 * HOUR, NOW)).toBe("1d");
    expect(formatRelativeAge(NOW - 6.9 * 24 * HOUR, NOW)).toBe("6d");
  });

  it("falls back to a short date from a week old", () => {
    const weekOld = NOW - 7 * 24 * HOUR;
    expect(formatRelativeAge(weekOld, NOW)).toBe(
      new Date(weekOld).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    );
  });
});
