import * as SplashScreen from "expo-splash-screen";

// The module holds the splash as an import-time side effect, so each test
// loads a fresh copy.
function loadSplash(): typeof import("./splash") {
  let mod: typeof import("./splash") | undefined;
  jest.isolateModules(() => {
    mod = require("./splash");
  });
  return mod!;
}

describe("splash hold", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("holds the native splash as soon as the app loads", () => {
    // Arrange / Act
    loadSplash();

    // Assert
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it("lifts the splash when the feed reports it is ready", () => {
    // Arrange
    const { releaseSplash } = loadSplash();

    // Act
    releaseSplash();

    // Assert
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("lifts the splash only once however often the feed reports in", () => {
    // Arrange
    const { releaseSplash, SPLASH_MAX_HOLD_MS } = loadSplash();

    // Act
    releaseSplash();
    releaseSplash();
    jest.advanceTimersByTime(SPLASH_MAX_HOLD_MS);

    // Assert
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("lifts the splash on its own if the feed never reports in", () => {
    // Arrange
    const { SPLASH_MAX_HOLD_MS } = loadSplash();

    // Act
    jest.advanceTimersByTime(SPLASH_MAX_HOLD_MS);

    // Assert
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
});
