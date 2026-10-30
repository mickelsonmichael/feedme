import { backgroundSyncedRecently } from "./backgroundSyncWindow";

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 9, 30, 12);

describe("backgroundSyncedRecently", () => {
  it("is true within one sync interval of the last background sync", () => {
    expect(
      backgroundSyncedRecently(
        {
          backgroundSyncFrequency: "1h",
          lastBackgroundSyncAt: NOW - 59 * MINUTE,
        },
        NOW
      )
    ).toBe(true);
  });

  it("is false once the interval has passed", () => {
    expect(
      backgroundSyncedRecently(
        {
          backgroundSyncFrequency: "1h",
          lastBackgroundSyncAt: NOW - 60 * MINUTE,
        },
        NOW
      )
    ).toBe(false);
  });

  it("measures against the default 15-minute frequency when none is set", () => {
    expect(
      backgroundSyncedRecently({ lastBackgroundSyncAt: NOW - 10 * MINUTE }, NOW)
    ).toBe(true);
    expect(
      backgroundSyncedRecently({ lastBackgroundSyncAt: NOW - 20 * MINUTE }, NOW)
    ).toBe(false);
  });

  it("is false before any background sync has run", () => {
    expect(
      backgroundSyncedRecently({ backgroundSyncFrequency: "24h" }, NOW)
    ).toBe(false);
  });

  it("is false with background sync turned off", () => {
    expect(
      backgroundSyncedRecently(
        { backgroundSyncFrequency: "off", lastBackgroundSyncAt: NOW - MINUTE },
        NOW
      )
    ).toBe(false);
  });

  it("is false when the last sync is stamped in the future", () => {
    // e.g. the device clock was moved back since.
    expect(
      backgroundSyncedRecently(
        { backgroundSyncFrequency: "24h", lastBackgroundSyncAt: NOW + MINUTE },
        NOW
      )
    ).toBe(false);
  });
});
