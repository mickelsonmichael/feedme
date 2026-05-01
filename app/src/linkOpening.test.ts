import { Alert, Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { openUrlWithPreference } from "./linkOpening";
import * as storage from "./storage";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
  WebBrowserResultType: {
    CANCEL: "cancel",
    DISMISS: "dismiss",
    OPENED: "opened",
    LOCKED: "locked",
  },
}));

jest.mock("./storage", () => ({
  loadConfig: jest.fn(),
}));

const mockOpenBrowserAsync = WebBrowser.openBrowserAsync as jest.MockedFunction<
  typeof WebBrowser.openBrowserAsync
>;
const mockLoadConfig = storage.loadConfig as jest.MockedFunction<
  typeof storage.loadConfig
>;

const mockNavigation = {
  navigate: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  mockOpenBrowserAsync.mockResolvedValue({
    type: WebBrowser.WebBrowserResultType.OPENED,
  });
});

describe("openUrlWithPreference on native (embedded mode)", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { get: () => "android" });
    mockLoadConfig.mockReturnValue({ linkOpenMode: "embedded" });
  });

  it("opens Chrome Custom Tabs via expo-web-browser", () => {
    // Arrange
    const url = "https://example.com/article";

    // Act
    openUrlWithPreference({ url, navigation: mockNavigation });

    // Assert
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(url);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("does not navigate to InAppBrowser screen", () => {
    // Arrange
    const url = "https://example.com/article";

    // Act
    openUrlWithPreference({ url, navigation: mockNavigation });

    // Assert
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });
});

describe("openUrlWithPreference on native (external mode)", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { get: () => "android" });
    mockLoadConfig.mockReturnValue({ linkOpenMode: "external" });
  });

  it("opens with Linking.openURL", () => {
    // Arrange
    const url = "https://example.com/article";

    // Act
    openUrlWithPreference({ url, navigation: mockNavigation });

    // Assert
    expect(Linking.openURL).toHaveBeenCalledWith(url);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });
});

describe("openUrlWithPreference on web (embedded mode)", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { get: () => "web" });
    mockLoadConfig.mockReturnValue({ linkOpenMode: "embedded" });
  });

  it("opens with Linking.openURL", () => {
    // Arrange
    const url = "https://example.com/article";
    const title = "Article";

    // Act
    openUrlWithPreference({ url, navigation: mockNavigation, title });

    // Assert
    expect(Linking.openURL).toHaveBeenCalledWith(url);
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });
});
