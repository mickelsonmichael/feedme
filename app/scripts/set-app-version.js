#!/usr/bin/env node
/**
 * Updates app.json with the version derived from a release tag.
 *
 * Usage:
 *   TAG_NAME=v0.7.0 node scripts/set-app-version.js
 *
 * Sets:
 *   expo.version       → semver string (e.g. "0.7.0")
 *   expo.android.versionCode → integer (major*10000 + minor*100 + patch)
 */

const fs = require("fs");
const path = require("path");

const tag = process.env.TAG_NAME;

if (!tag) {
  console.error("Error: TAG_NAME environment variable is required.");
  process.exit(1);
}

// Accept tags with or without a leading "v" and an optional pre-release suffix.
// Only the numeric X.Y.Z part is used for versionCode; pre-release labels are
// preserved in the version string but ignored for the integer code.
const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);

if (!match) {
  console.error(
    `Error: TAG_NAME "${tag}" does not match the expected "X.Y.Z" semver format.`
  );
  process.exit(1);
}

const [, majorStr, minorStr, patchStr] = match;
const major = Number(majorStr);
const minor = Number(minorStr);
const patch = Number(patchStr);

// Reconstruct the version string using the matched numeric components plus any
// pre-release suffix (e.g. "1.0.0-beta.1"). Strip a leading "v" if present.
const numericPrefix = `${major}.${minor}.${patch}`;
const suffix = tag.replace(/^v?\d+\.\d+\.\d+/, "");
const version = numericPrefix + suffix;

// Derive a monotonically-increasing integer for Android's versionCode.
// This assumes minor and patch are each less than 100.
const versionCode = major * 10000 + minor * 100 + patch;

const appJsonPath = path.resolve(__dirname, "..", "app.json");

let config;
try {
  config = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
} catch (err) {
  console.error(`Error: Failed to read or parse app.json: ${err.message}`);
  process.exit(1);
}

config.expo.version = version;
config.expo.android = config.expo.android || {};
config.expo.android.versionCode = versionCode;

try {
  fs.writeFileSync(appJsonPath, JSON.stringify(config, null, 2) + "\n");
} catch (err) {
  console.error(`Error: Failed to write app.json: ${err.message}`);
  process.exit(1);
}

console.log(`app.json updated: version=${version}, versionCode=${versionCode}`);
