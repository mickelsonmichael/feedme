// Reanimated's Jest resolver (which also applies react-native-worklets' rule)
// steers both libraries to their plain-JS builds instead of the `.native`
// files that need the native runtime. Whatever it hands to the default
// resolver goes through React Native's resolver first, which jest-expo's
// preset would otherwise use on its own.
const reanimatedResolver = require("react-native-reanimated/jest/resolver");
const reactNativeResolver = require("@react-native/jest-preset/jest/resolver");

module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (req, opts) =>
      reactNativeResolver(req, {
        ...opts,
        defaultResolver: options.defaultResolver,
      }),
  });
