// Shared Jest setup, loaded for every test file (see `jest.setupFiles`).

// The splash hold (src/splash.ts) runs at import time from App/FeedListScreen.
// jest-expo's environment reports itself as Expo Go, where the module only
// logs warnings, so stub it for every suite. src/splash.test.ts covers the
// hold itself.
jest.mock("expo-splash-screen", () => ({
  setOptions: jest.fn(),
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

// Worklets' own mock (its recommended test setup): worklets run as plain JS
// and work scheduled back to JS runs as a microtask. Reanimated runs on its
// JS implementation via jest.resolver.js and jest.setupAfterEnv.js.
jest.mock("react-native-worklets", () =>
  require("react-native-worklets/src/mock")
);
