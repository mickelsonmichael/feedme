const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude Android build/CMake artifacts from Metro's file watcher to prevent
// ENOENT errors when temporary .cxx directories are created and deleted during builds.
config.resolver.blockList = [
  ...(config.resolver.blockList
    ? Array.isArray(config.resolver.blockList)
      ? config.resolver.blockList
      : [config.resolver.blockList]
    : []),
  /android\/\.cxx\/.*/,
  /android\/build\/.*/,
  /node_modules\/.*\/android\/\.cxx\/.*/,
  /node_modules\/.*\/android\/build\/.*/,
];

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
