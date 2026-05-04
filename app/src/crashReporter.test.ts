import { buildGitHubIssueUrl, checkForCrashReport, clearCrashReport, installCrashHandler, type CrashReport } from "./crashReporter";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWrite = jest.fn();
const mockDelete = jest.fn();
let mockFileText: string | null = null;

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    text(): Promise<string> {
      if (mockFileText === null) {
        return Promise.reject(new Error("File does not exist"));
      }
      return Promise.resolve(mockFileText);
    }
    write(content: string): void {
      mockWrite(content);
    }
    delete(): void {
      mockDelete();
    }
  },
  Paths: { cache: "/tmp" },
}));

// Mock Platform so we can test both Android-specific and non-Android paths.
let mockPlatformOS = "android";
jest.mock("react-native", () => ({
  Platform: { get OS() { return mockPlatformOS; } },
  Linking: { openURL: jest.fn() },
}));

// Mock ErrorUtils global provided by the React Native runtime.
const mockSetGlobalHandler = jest.fn();
const mockGetGlobalHandler = jest.fn();
(globalThis as Record<string, unknown>).ErrorUtils = {
  setGlobalHandler: mockSetGlobalHandler,
  getGlobalHandler: mockGetGlobalHandler,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleCrash: CrashReport = {
  error: "TypeError: Cannot read property 'foo' of undefined",
  stack:
    "TypeError: Cannot read property 'foo' of undefined\n    at Component.render (App.tsx:42)\n    at ...",
  timestamp: "2024-01-15T10:30:00.000Z",
};

// ---------------------------------------------------------------------------
// buildGitHubIssueUrl
// ---------------------------------------------------------------------------

describe("buildGitHubIssueUrl", () => {
  it("returns a URL pointing to the feedme GitHub repo issue creation page", () => {
    const url = buildGitHubIssueUrl(sampleCrash);
    expect(url).toContain(
      "https://github.com/mickelsonmichael/feedme/issues/new"
    );
  });

  it("includes the error message in the title query param", () => {
    const url = buildGitHubIssueUrl(sampleCrash);
    expect(decodeURIComponent(url)).toContain(
      `[Crash] ${sampleCrash.error.substring(0, 100)}`
    );
  });

  it("includes the timestamp in the body query param", () => {
    const url = buildGitHubIssueUrl(sampleCrash);
    expect(decodeURIComponent(url)).toContain(sampleCrash.timestamp);
  });

  it("includes the full error in the body query param", () => {
    const url = buildGitHubIssueUrl(sampleCrash);
    expect(decodeURIComponent(url)).toContain(sampleCrash.error);
  });

  it("includes the stack trace in the body query param", () => {
    const url = buildGitHubIssueUrl(sampleCrash);
    expect(decodeURIComponent(url)).toContain(sampleCrash.stack);
  });

  it("truncates an error message that exceeds 100 characters in the title", () => {
    const longError = "A".repeat(200);
    const url = buildGitHubIssueUrl({ ...sampleCrash, error: longError });
    const decoded = decodeURIComponent(url);
    // The title should contain only the first 100 characters.
    expect(decoded).toContain(`[Crash] ${"A".repeat(100)}`);
    expect(decoded).not.toContain(`[Crash] ${"A".repeat(101)}`);
  });
});

// ---------------------------------------------------------------------------
// checkForCrashReport
// ---------------------------------------------------------------------------

describe("checkForCrashReport", () => {
  beforeEach(() => {
    mockFileText = null;
    mockPlatformOS = "android";
  });

  it("returns null on non-Android platforms", async () => {
    mockPlatformOS = "ios";
    const result = await checkForCrashReport();
    expect(result).toBeNull();
  });

  it("returns null when no crash file exists", async () => {
    mockFileText = null; // text() will throw
    const result = await checkForCrashReport();
    expect(result).toBeNull();
  });

  it("returns the parsed crash report when a file exists", async () => {
    mockFileText = JSON.stringify(sampleCrash);
    const result = await checkForCrashReport();
    expect(result).toEqual(sampleCrash);
  });

  it("returns null when the file contains invalid JSON", async () => {
    mockFileText = "not valid json {{";
    const result = await checkForCrashReport();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearCrashReport
// ---------------------------------------------------------------------------

describe("clearCrashReport", () => {
  beforeEach(() => {
    mockDelete.mockClear();
    mockPlatformOS = "android";
  });

  it("calls delete on the crash file", async () => {
    await clearCrashReport();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("does not throw even if delete fails", async () => {
    mockDelete.mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });
    await expect(clearCrashReport()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// installCrashHandler
// ---------------------------------------------------------------------------

describe("installCrashHandler", () => {
  beforeEach(() => {
    mockWrite.mockClear();
    mockSetGlobalHandler.mockClear();
    mockGetGlobalHandler.mockClear();
    mockPlatformOS = "android";
  });

  it("does not install a handler on non-Android platforms", () => {
    mockPlatformOS = "ios";
    installCrashHandler();
    expect(mockSetGlobalHandler).not.toHaveBeenCalled();
  });

  it("installs a global error handler on Android", () => {
    const noop = () => {};
    mockGetGlobalHandler.mockReturnValue(noop);
    installCrashHandler();
    expect(mockSetGlobalHandler).toHaveBeenCalledTimes(1);
  });

  it("writes a crash report file when a fatal JS error is reported", () => {
    const noop = () => {};
    mockGetGlobalHandler.mockReturnValue(noop);

    installCrashHandler();

    // Retrieve the handler that was registered and simulate a fatal error.
    const installedHandler = mockSetGlobalHandler.mock.calls[0][0] as (
      error: Error,
      isFatal?: boolean
    ) => void;

    const error = new Error("Something went badly wrong");
    error.stack = "Error: Something went badly wrong\n    at App.tsx:10";
    installedHandler(error, true);

    expect(mockWrite).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWrite.mock.calls[0][0]) as CrashReport;
    expect(written.error).toBe(error.message);
    expect(written.stack).toBe(error.stack);
    expect(typeof written.timestamp).toBe("string");
  });

  it("does not write a crash report for non-fatal errors", () => {
    const noop = () => {};
    mockGetGlobalHandler.mockReturnValue(noop);

    installCrashHandler();

    const installedHandler = mockSetGlobalHandler.mock.calls[0][0] as (
      error: Error,
      isFatal?: boolean
    ) => void;
    installedHandler(new Error("minor warning"), false);

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("still calls the previous handler after intercepting a fatal error", () => {
    const previousHandler = jest.fn();
    mockGetGlobalHandler.mockReturnValue(previousHandler);

    installCrashHandler();

    const installedHandler = mockSetGlobalHandler.mock.calls[0][0] as (
      error: Error,
      isFatal?: boolean
    ) => void;
    const error = new Error("cascade");
    installedHandler(error, true);

    expect(previousHandler).toHaveBeenCalledWith(error, true);
  });
});
