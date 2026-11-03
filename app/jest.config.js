const expoPreset = require("jest-expo/jest-preset");

// The app is built with the React Compiler (app.json `experiments.reactCompiler`),
// so tests compile components the same way rather than exercising code that
// never ships. Metro tells babel-preset-expo through the transform caller;
// this does the same for jest-expo's babel-jest transform.
const JS_TRANSFORM = "\\.[jt]sx?$";
const [babelJest, babelOptions] = expoPreset.transform[JS_TRANSFORM];

module.exports = {
  preset: "jest-expo",
  transform: {
    ...expoPreset.transform,
    [JS_TRANSFORM]: [
      babelJest,
      {
        ...babelOptions,
        caller: { ...babelOptions.caller, supportsReactCompiler: true },
      },
    ],
  },
  setupFiles: [
    "<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js",
    "<rootDir>/jest.setup.js",
  ],
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@shopify/flash-list))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setupAfterEnv.js"],
  resolver: "<rootDir>/jest.resolver.js",
};
