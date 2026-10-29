import * as TaskManager from "expo-task-manager";

// Separate from notifications.test.ts, which mocks an Expo Go environment
// (where the notification system is skipped entirely). This one is a real
// native build, as the OS sees it when it wakes the app headless.

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

jest.mock("expo-constants", () => ({
  default: { executionEnvironment: "standalone" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

jest.mock("expo-notifications", () => ({}));
jest.mock("expo-network", () => ({}));

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock("./database", () => ({}));
jest.mock("./feedRefresher", () => ({}));
jest.mock("./storage", () => ({
  loadConfig: jest.fn(() => ({})),
  saveConfig: jest.fn(),
}));

describe("background notification task", () => {
  it("is defined as soon as the module is imported, before anything registers it", () => {
    // Arrange / Act — a headless launch imports the module and mounts nothing.
    jest.isolateModules(() => {
      require("./notifications");
    });

    // Assert
    expect(TaskManager.defineTask).toHaveBeenCalledWith(
      "feedme-background-notification-sync",
      expect.any(Function)
    );
  });
});
