---
name: android-debug
description: "Debug Android app issues on the emulator using MCP mobile tools and adb. Use when: testing UI interactions, verifying layout/gesture fixes, investigating crashes, or confirming behavior on device. Grants access to mobile-mcp screenshot, swipe, tap, and element listing tools."
argument-hint: "Describe the issue or behavior to verify on Android"
---

# Android Debugging

The `mobile-mcp` MCP server provides device interaction. Tools are prefixed `mcp_mobile-mcp_`.

## Step 1 – Start the emulator

```bash
start-emulator
```

This boots the AVD, waits for `sys.boot_completed`, and then waits for the Android Package Manager service to be ready before returning. It typically takes 30–60 seconds.

## Step 2 – Ensure the app is installed

Check whether the app is already installed:

```bash
adb shell pm path com.feedme.app
```

- If it prints `package:...` → the app is already installed. Skip to Step 3.
- If it prints nothing or errors → install it now.

**Install from the pre-built APK** (fastest, provided by the setup cache):

```bash
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk
```

If the APK file doesn't exist yet (cache miss), do a full build and install:

```bash
cd app
npm ci
npx expo run:android   # generates android/, builds, installs, AND starts Metro
```

`expo run:android` handles everything in one step. Skip Step 3 if you used this command — Metro is already running.

> **Important**: Never use `--no-bundler` with `expo run:android`. The Metro bundler must be running for the app to load JavaScript. Without it the app will show a "Unable to connect to Metro" error.

## Step 3 – Start the Expo Metro dev server

Check whether Metro is already running:

```bash
curl -s 127.0.0.1:8081/status   # returns "packager-status:running" if up
```

If it is not running, start it (from the `app/` directory):

```bash
cd app && npm start
```

Expo uses **Fast Refresh** — JS/TypeScript changes are pushed to the device instantly without reinstalling the APK. Only reinstall if native code or `app.json` changes.

## Step 4 – Launch the app on the emulator

```bash
adb shell am start -n com.feedme.app/.MainActivity
```

Wait 2–4 seconds for it to render before taking screenshots or simulating taps.

---

## Interacting with the Device

**Prefer `mobile_list_elements_on_screen` over guessing coordinates** — it gives exact x/y positions of every element.

**ALWAYS PREFER THE MCP SERVER TO ADB COMMANDS** for interactions, as it has better error handling and will confirm success/failure of each action.

Never use multi-touch or simultaneous coordinate taps unless *truly* necessary.
A three-finger tap will cause the inspect tool to show up and block your progress.
Always use single tap x y commands with at least 300ms between actions.
If a dev overlay appears, press keyevent 82 to open the dev menu and dismiss it before continuing.

## Verifying a change

- Navigate to the relevant screen
- Take a screenshot to confirm state
- Perform the gesture/interaction being tested
- Take another screenshot immediately after — the spinner or state change should be visible
- You should wait a moment before taking the screenshot, unless you are specifically testing a loading state or spinner visibility. Otherwise, you may screenshot too early and miss the final state.

## Image Limit Management

Prefer using `mobile_list_elements_on_screen` to verify UI state instead of taking screenshots.
Take screenshots occassionally to confirm visual state, but be mindful of the image context limit of your model.

Some models (e.g. Claude Sonnet) have an **image context limit** (e.g. 20).
Screenshots accumulate quickly during a debugging session.

- Maintain a **rolling log of observations** in session memory instead of relying on screenshot history
- Before taking a new screenshot, summarize the last known state from memory

**Session memory pattern — update after each meaningful state change:**
```
Screen: <screen name>
State: <what is visible / what happened>
Last action: <what was tapped/typed/swiped>
Issues: <anything unexpected>
```

## Common Issues

The most common thing to be wary of is that the dev menu is often accidentally triggered because the gear icon has a large touch area.
You should try to avoid accidentally clicking it, potentially moving the icon by long pressing and dragging it into a spot that is less likely
to be accidentally clicked. If the dev menu is open, it will interfere with all interactions until it is closed.

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dev Menu opens on every tap | Dev Menu was accidentally clicked, the gear icon has a large touch area | Close the dev menu by tapping outside the menu or pressing the "x" button |
| Inspector opens on every tap | Inspector was left ON | Open dev menu (keyevent 82), toggle it off |
| `mobile_type_keys` types nothing | Input not focused | Tap the field first with `mobile_click_on_screen_at_coordinates` |
| `adb devices` shows nothing | `ANDROID_HOME` not set | Set `$env:ANDROID_HOME` before calling adb |
| Pull-to-refresh does nothing | Empty state is a plain `View` | Wrap in `ScrollView` + `RefreshControl` |
| Dev menu won't open | App may not have focus | Tap the app screen first, then keyevent 82 |
| MCP server returns "device not found" | Stale device list or `ANDROID_HOME` missing | Restart MCP server, verify `mcp.json` env |
| `adb install` returns "Can't find service: package" | Package Manager not ready yet (emulator booted recently) | `start-emulator` now waits for PM; if you started emulator manually, run: `until adb shell pm path android >/dev/null 2>&1; do sleep 2; done` |
| "Unable to connect to Metro" in app | Metro dev server not running, or `expo run:android --no-bundler` was used | Start Metro with `cd app && npm start` |
| Submit button click does nothing on web forms | `onBlur` on a field triggered an async fetch, setting `loading = true` and disabling the button before the click registered | Click another field first to trigger blur and wait for the async operation to complete (watch for the field to populate), then click the submit button |
