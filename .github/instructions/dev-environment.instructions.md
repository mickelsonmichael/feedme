---
description: "Use when running commands, starting dev servers, building the app, or debugging network/runtime issues in the feedme project. Covers project structure, terminal working directories, Expo dev server, and Cloudflare Worker startup."
---

# FeedMe Dev Environment

## Project Structure

This is a monorepo with two independent projects. Every CLI command must be run from its own subdirectory:

| Project | Directory | Stack |
|---------|-----------|-------|
| Mobile/Web app | `app/` | React Native, Expo, TypeScript |
| Backend | `worker/` | Cloudflare Workers, TypeScript |

**Never run `app/` commands from the repo root or `worker/`, and vice versa.** Both have their own `package.json` and `node_modules`.

## Before Starting Any Dev Server

**Always check existing terminal instances first.** Look at all open terminals for:
- A running Expo dev server (output contains "Metro waiting on exp://..." or similar, or a process running `expo start`)
- A running Worker dev server (output contains `wrangler dev` or a local `localhost:8787` binding)

If an instance is already running, use it — do not start a duplicate. Only start a new server if none is found.

## Starting the Expo Dev Server

Run from the `app/` directory:

```pwsh
cd C:\dev\feedme\app
npx expo start
```

- Expo uses **Fast Refresh** — JS/TS changes are pushed to the device/emulator instantly without a rebuild.
- **Do not run `expo run:android` or Gradle commands** to apply code changes when the dev server is already running. Those commands do a full native build and are only needed when native code changes (e.g., new native modules, first-time install).
- If the app is already installed on the emulator, `expo start` is all that is needed.

## Starting the Worker Dev Server

Run from the `worker/` directory:

```pwsh
cd C:\dev\feedme\worker
npx wrangler dev
```

The worker runs on `http://localhost:8787` by default and proxies feed requests for the app.

**If network requests in the app are failing**, check whether the worker is running — it may need to be started first.

## Android Emulator / ADB

The Android SDK should be available. If it is not, you should recommend the user set the `ANDROID_HOME` environment variable in `.vscode/mcp.json` or
wherever necessary to ensure the variable is included in your terminal sessions and environment.

Check for a running emulator before launching a new one:

```pwsh
& $adb devices
```
