import {
  computeBackoffDelay,
  computeBaseInterval,
  DEFAULT_FETCH_INTERVAL_MS,
  MAX_FETCH_INTERVAL_MS,
  MIN_FETCH_INTERVAL_MS,
} from "./feedSchedule";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN = 60 * 1000;

describe("computeBaseInterval", () => {
  it("returns the 1-hour default when fewer than 3 timestamps are provided", () => {
    expect(computeBaseInterval([])).toBe(DEFAULT_FETCH_INTERVAL_MS);
    expect(computeBaseInterval([Date.now()])).toBe(DEFAULT_FETCH_INTERVAL_MS);
    expect(computeBaseInterval([Date.now(), Date.now() - HOUR])).toBe(
      DEFAULT_FETCH_INTERVAL_MS
    );
  });

  it("ignores null/undefined entries when counting samples", () => {
    expect(computeBaseInterval([null, undefined, 1, 2])).toBe(
      DEFAULT_FETCH_INTERVAL_MS
    );
  });

  it("returns ~1h for 20 timestamps spaced ~1h apart", () => {
    const now = Date.now();
    const stamps = Array.from({ length: 20 }, (_, i) => now - i * HOUR);
    expect(computeBaseInterval(stamps)).toBe(HOUR);
  });

  it("returns ~1d for 5 timestamps spaced ~1d apart", () => {
    const now = Date.now();
    const stamps = Array.from({ length: 5 }, (_, i) => now - i * DAY);
    expect(computeBaseInterval(stamps)).toBe(DAY);
  });

  it("clamps a fast cadence up to the 15-minute floor", () => {
    const now = Date.now();
    // 1-second spacing — way under the floor.
    const stamps = Array.from({ length: 10 }, (_, i) => now - i * 1000);
    expect(computeBaseInterval(stamps)).toBe(MIN_FETCH_INTERVAL_MS);
    expect(MIN_FETCH_INTERVAL_MS).toBe(15 * MIN);
  });

  it("clamps a slow cadence down to the 24-hour ceiling", () => {
    const now = Date.now();
    // weekly spacing
    const stamps = Array.from({ length: 10 }, (_, i) => now - i * 7 * DAY);
    expect(computeBaseInterval(stamps)).toBe(MAX_FETCH_INTERVAL_MS);
    expect(MAX_FETCH_INTERVAL_MS).toBe(DAY);
  });

  it("uses only the most recent 20 timestamps so old archive gaps don't dominate", () => {
    const now = Date.now();
    // 20 recent stamps an hour apart, plus older ones a year apart that
    // should be ignored.
    const recent = Array.from({ length: 20 }, (_, i) => now - i * HOUR);
    const ancient = Array.from(
      { length: 5 },
      (_, i) => now - 365 * DAY - i * 365 * DAY
    );
    expect(computeBaseInterval([...recent, ...ancient])).toBe(HOUR);
  });
});

describe("computeBackoffDelay", () => {
  it("doubles the interval on the first failure", () => {
    expect(computeBackoffDelay(HOUR, 1)).toBe(2 * HOUR);
  });

  it("multiplies by 8 (2^3) on the third failure", () => {
    expect(computeBackoffDelay(HOUR, 3)).toBe(8 * HOUR);
  });

  it("caps at 24h on the 10th failure", () => {
    expect(computeBackoffDelay(HOUR, 10)).toBe(MAX_FETCH_INTERVAL_MS);
  });

  it("treats a null interval as the 1h default", () => {
    expect(computeBackoffDelay(null, 1)).toBe(2 * HOUR);
    expect(computeBackoffDelay(undefined, 2)).toBe(4 * HOUR);
  });

  it("never exceeds the 24h ceiling even with a large base interval", () => {
    expect(computeBackoffDelay(12 * HOUR, 5)).toBe(MAX_FETCH_INTERVAL_MS);
  });
});
