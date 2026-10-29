// Runs after the test framework is installed (see `jest.setupFilesAfterEnv`).

// Reanimated's test mode: animations advance on Jest's fake timers, and
// views get the toHaveAnimatedStyle matcher.
require("react-native-reanimated").setUpTests();
