import {
  computeBackoffDelay,
  computeBaseInterval,
  computeFreshnessLifetimeMs,
  computeNextFetchDelay,
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

describe("computeFreshnessLifetimeMs", () => {
  const NOW = new Date("2026-01-01T12:00:00Z").getTime();
  const now = () => NOW;

  it("returns null when the server declared nothing", () => {
    // Arrange / Act / Assert
    expect(computeFreshnessLifetimeMs({}, now)).toBeNull();
  });

  it("reads max-age from Cache-Control", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      { cacheControl: "public, max-age=3600" },
      now
    );

    // Assert
    expect(lifetime).toBe(HOUR);
  });

  it("reads max-age regardless of casing and spacing", () => {
    // Arrange — servers are inconsistent about both
    // Act / Assert
    expect(
      computeFreshnessLifetimeMs({ cacheControl: "Max-Age = 60" }, now)
    ).toBe(60_000);
  });

  it("ignores s-maxage, which is addressed to shared caches", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      { cacheControl: "public, s-maxage=86400" },
      now
    );

    // Assert
    expect(lifetime).toBeNull();
  });

  it("yields no floor when the server demands revalidation", () => {
    // Arrange / Act / Assert
    expect(
      computeFreshnessLifetimeMs({ cacheControl: "no-cache" }, now)
    ).toBeNull();
    expect(
      computeFreshnessLifetimeMs({ cacheControl: "no-store, max-age=600" }, now)
    ).toBeNull();
  });

  it("yields no floor for max-age=0", () => {
    // Arrange / Act / Assert
    expect(
      computeFreshnessLifetimeMs({ cacheControl: "max-age=0" }, now)
    ).toBeNull();
  });

  it("falls back to Expires when there is no max-age", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      {
        expires: "Thu, 01 Jan 2026 14:00:00 GMT",
        date: "Thu, 01 Jan 2026 12:00:00 GMT",
      },
      now
    );

    // Assert
    expect(lifetime).toBe(2 * HOUR);
  });

  it("measures Expires against the server's Date, not the device clock", () => {
    // Arrange — device clock running an hour fast
    const skewed = () => NOW + HOUR;

    // Act
    const lifetime = computeFreshnessLifetimeMs(
      {
        expires: "Thu, 01 Jan 2026 14:00:00 GMT",
        date: "Thu, 01 Jan 2026 12:00:00 GMT",
      },
      skewed
    );

    // Assert — still the two hours the server meant
    expect(lifetime).toBe(2 * HOUR);
  });

  it("falls back to the device clock when the server sent no Date", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      { expires: "Thu, 01 Jan 2026 13:00:00 GMT" },
      now
    );

    // Assert
    expect(lifetime).toBe(HOUR);
  });

  it("prefers max-age over Expires", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      {
        cacheControl: "max-age=60",
        expires: "Thu, 01 Jan 2026 23:00:00 GMT",
        date: "Thu, 01 Jan 2026 12:00:00 GMT",
      },
      now
    );

    // Assert
    expect(lifetime).toBe(60_000);
  });

  it("yields no floor for an already-elapsed Expires", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      {
        expires: "Thu, 01 Jan 2026 11:00:00 GMT",
        date: "Thu, 01 Jan 2026 12:00:00 GMT",
      },
      now
    );

    // Assert
    expect(lifetime).toBeNull();
  });

  it("yields no floor for an unparseable Expires", () => {
    // Arrange / Act / Assert
    expect(
      computeFreshnessLifetimeMs({ expires: "not a date" }, now)
    ).toBeNull();
  });

  it("never lets a server park a feed beyond the 24h ceiling", () => {
    // Arrange / Act
    const lifetime = computeFreshnessLifetimeMs(
      { cacheControl: "max-age=604800" },
      now
    );

    // Assert
    expect(lifetime).toBe(MAX_FETCH_INTERVAL_MS);
  });
});

describe("computeNextFetchDelay", () => {
  it("uses the learned interval when the server declared nothing", () => {
    // Arrange / Act / Assert
    expect(computeNextFetchDelay(HOUR, null)).toBe(HOUR);
  });

  it("waits out a freshness window longer than the learned interval", () => {
    // Arrange — a feed that publishes hourly but asks for 6h of cache
    // Act / Assert
    expect(computeNextFetchDelay(HOUR, 6 * HOUR)).toBe(6 * HOUR);
  });

  it("does not poll faster than the learned cadence for a permissive server", () => {
    // Arrange — a chatty cache header must not override the learned interval
    // Act / Assert
    expect(computeNextFetchDelay(6 * HOUR, 60_000)).toBe(6 * HOUR);
  });
});
