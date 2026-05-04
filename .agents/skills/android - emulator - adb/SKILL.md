---
name: android-emulator-adb
description: Use whenever the task involves running, installing, testing, debugging, or interacting with the Android app on the emulator — including building the APK, taking screenshots, capturing logcat, simulating taps or text input, inspecting the UI hierarchy, or verifying app behavior end-to-end. Triggers on phrases like "test the app", "install the APK", "take a screenshot", "what does the app look like", "check the logs", "the app crashed", "tap the button", "verify the feed loads", or any request that requires actually running the app rather than just reading code.
allowed-tools: shell
---

# Android emulator and adb

This skill explains how to run the Android app inside the emulator that was provisioned by the workflow at `.github/workflows/copilot-setup-steps.yml`, and how to interact with it using `adb`. The emulator is headless (no GUI window), but `adb` exposes everything needed to install, drive, screenshot, and debug the app.

## Prefer MCP tools when available

Before reaching for the raw `adb` commands in this skill, check whether an Android-aware MCP server is configured for this session (for example, an adb MCP server or a uiautomator2-based one). If equivalent MCP tooling is available for the action you need — installing an APK, taking a screenshot, dumping the UI, simulating taps, reading logcat — use that instead. MCP tools return structured output, handle device-state edge cases more reliably, and are easier to compose than parsing shell output.

Fall back to the `adb` commands below when no MCP tool covers the action, when an MCP call fails, or when you need a flag or behavior the MCP wrapper doesn't expose.

## Starting the emulator

The setup workflow caches an AVD snapshot but does not leave the emulator running. Boot it with the helper installed on `$PATH`:

```bash
start-emulator
```

This boots the cached AVD in the background, waits for `sys.boot_completed`, and unlocks the screen. It typically takes 30–60 seconds. After it returns, `adb` is ready.

If `start-emulator` is not on `$PATH` for some reason, fall back to:

```bash
nohup "$ANDROID_HOME/emulator/emulator" -avd "${AVD_NAME:-copilot_avd}" \
  -no-window -no-audio -no-boot-anim -no-snapshot-save -gpu swiftshader_indirect \
  > /tmp/emulator.log 2>&1 &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
```

Verify the device is online before doing anything else:

```bash
adb devices    # expect a line like: emulator-5554  device
```

If it shows `offline` or `unauthorized`, the emulator hasn't finished booting. Wait and retry.

## Building and installing the APK

Build a debug APK with Gradle. The workflow has already installed the SDK, JDK, and Gradle:

```bash
./gradlew assembleDebug
```

The output APK is at `app/build/outputs/apk/debug/app-debug.apk` for typical AGP layouts. Install it:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Use `-r` to reinstall over an existing version. If the install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall first:

```bash
adb uninstall <package.name>
adb install app/build/outputs/apk/debug/app-debug.apk
```

The package name is in `app/build.gradle` (or `app/build.gradle.kts`) under `applicationId`.

## Launching the app

```bash
adb shell am start -n <package.name>/<package.name>.MainActivity
```

Replace `MainActivity` with whatever activity is marked as `LAUNCHER` in `AndroidManifest.xml`. To find it without reading the manifest:

```bash
adb shell cmd package resolve-activity --brief <package.name> | tail -n 1
```

Wait 2–4 seconds after launching before screenshotting or interacting — the activity needs time to render and any initial network requests need time to start.

## Taking screenshots

The fastest method, no temp file on the device:

```bash
adb exec-out screencap -p > screenshot.png
```

If the app shows network-loaded content (such as feed items in this RSS reader), wait long enough for the network request to complete before screenshotting — usually 3–5 seconds is enough on a fast feed, longer for slow or paginated ones. When in doubt, take multiple screenshots at intervals:

```bash
sleep 3 && adb exec-out screencap -p > shot-3s.png
sleep 5 && adb exec-out screencap -p > shot-8s.png
```

Save screenshots to a sensible path the user can find later, like `screenshots/feature-name.png`.

## Reading logs

Clear the buffer before the action you want to capture, run the action, then dump:

```bash
adb logcat -c                                    # clear
# ...trigger the action under test...
adb logcat -d > logcat.txt                       # dump everything since clear
```

To filter by the app's package while it runs (useful for following a live action):

```bash
adb logcat --pid=$(adb shell pidof <package.name>)
```

For just errors and warnings:

```bash
adb logcat -d *:W
```

When investigating a crash, grep for `AndroidRuntime` and `FATAL EXCEPTION`:

```bash
adb logcat -d | grep -A 30 "FATAL EXCEPTION"
```

## Inspecting the UI

To see what's currently on screen as a structured tree, dump the UI hierarchy:

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml ui.xml
```

The XML lists every view with its bounds, text, content-description, resource-id, and clickable state. This is more reliable than trying to read a screenshot — use it to find what to tap, verify text is rendered, or confirm a screen has loaded.

## Simulating input

Tap at coordinates (find them via the UI dump's `bounds` attribute):

```bash
adb shell input tap <x> <y>
```

Bounds in the dump look like `[120,300][960,420]` — tap the center: x = (120+960)/2, y = (300+420)/2.

Type text into the focused field:

```bash
adb shell input text "search%squery"   # %s is a literal space
```

Common keycodes:

```bash
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_HOME
adb shell input keyevent KEYCODE_ENTER
adb shell input keyevent 82            # menu
```

Swipe (useful for scrolling lists):

```bash
adb shell input swipe <x1> <y1> <x2> <y2> <duration_ms>
# e.g., scroll down on a 1080-wide screen:
adb shell input swipe 540 1500 540 500 300
```

## Network and connectivity

Since this app fetches RSS feeds, network state matters. Confirm the emulator has network:

```bash
adb shell ping -c 2 8.8.8.8
```

To test how the app behaves offline, toggle airplane mode:

```bash
adb shell cmd connectivity airplane-mode enable
# ...test offline behavior...
adb shell cmd connectivity airplane-mode disable
```

## Cleaning up between test runs

To get a clean app state without uninstalling:

```bash
adb shell pm clear <package.name>
```

This wipes app data, cache, and shared preferences. Good before testing a fresh-install or first-launch flow.

## Common failure patterns

**`adb: device offline` or commands hang.** The emulator hasn't finished booting. Run the boot-wait loop from the "Starting the emulator" section. If it persists, check `/tmp/emulator.log` for errors.

**`error: device 'emulator-5554' not found`.** The emulator process died. Kill any stragglers with `adb kill-server && pkill -f qemu-system` and re-run `start-emulator`.

**Tap or input goes to the wrong place.** The screen may have rotated or a dialog may have appeared. Re-dump the UI before trying again — never assume coordinates from a previous dump are still valid after any state change.

**Screenshot is black or shows the lock screen.** The screen turned off. Wake it: `adb shell input keyevent KEYCODE_WAKEUP && adb shell input keyevent 82`.

**App crashes immediately on launch.** Run `adb logcat -d | grep -A 30 "FATAL EXCEPTION"` and read the stack trace. The crash is usually in the first 20 lines after `FATAL EXCEPTION`.

## What to include when reporting results

When summarizing what was tested, include:

- Which APK was installed (path + git SHA if known)
- The exact command sequence run
- Relevant logcat excerpts (not the full log — grep down to ~20 lines max)
- One or two screenshots showing the state being demonstrated
- Any deviations from expected behavior

Avoid pasting full logcat dumps or full UI XML dumps into PR comments — they're huge. Save them as files in the workspace and reference them.
