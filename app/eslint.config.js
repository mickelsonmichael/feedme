// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const globals = require("globals");
const expoConfig = require("eslint-config-expo/flat");
const reactHooks = require("eslint-plugin-react-hooks");
const reactNative = require("eslint-plugin-react-native");

module.exports = defineConfig([
  expoConfig,
  // Includes the React Compiler rules, which flag render-time side effects
  // and patterns that defeat memoisation.
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: { "react-native": reactNative },
    rules: {
      "react-native/no-unused-styles": "error",
      // Lazy requires are deliberate here: native-only modules are loaded on
      // first use so they never evaluate where they'd crash (see
      // notifications.ts).
      "@typescript-eslint/no-require-imports": "off",
      // Deliberate patterns the compiler rules don't model: ref mirrors of
      // state read by stable callbacks, Reanimated shared-value writes, and
      // resetting state when a prop changes. Kept visible, not blocking.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "jest.*.js", "src/testUtils/**"],
    languageOptions: { globals: globals.jest },
  },
  {
    files: ["scripts/**", "*.config.js", "jest.*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    ignores: ["android/*", "dist/*", "web-build/*", ".expo/*", "public/*"],
  },
]);
