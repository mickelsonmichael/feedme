const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .wasm files (required by expo-sqlite on web)
config.resolver.assetExts.push("wasm");

// Inline `require` calls so module init is deferred until first use. This
// improves cold-start time and TTI on Android by avoiding eager evaluation
// of every module in the bundle at startup.
const baseGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const base =
    typeof baseGetTransformOptions === "function"
      ? await baseGetTransformOptions(...args)
      : {};
  return {
    ...base,
    transform: {
      ...(base.transform ?? {}),
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  };
};

module.exports = config;
