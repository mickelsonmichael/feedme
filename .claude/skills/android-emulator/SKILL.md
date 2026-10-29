---
name: android-emulator
description: Run, drive and inspect the feedme app on the Android emulator — boot it, start Metro, rebuild native code, take screenshots, tap/swipe, dump the UI tree, read logs, measure frame timing. Use for any live verification on device.
---

# Android emulator

Package: `com.feedme.app`. Before starting anything, check what is already running: `adb devices` for the emulator, `curl -s 127.0.0.1:8081/status` (→ `packager-status:running`) for Metro.

## Boot

- **Copilot cloud environment:** `start-emulator` boots the cached AVD and waits for the package manager. The setup workflow pre-builds `app/android/app/build/outputs/apk/debug/app-debug.apk`; if the app isn't installed (`adb shell pm path com.feedme.app`), `adb install -r` that file.
- **Local Windows machine:** start `emulator -avd android -no-snapshot-save -no-boot-anim -gpu guest -no-audio` in the background, then poll `adb shell getprop sys.boot_completed` until it prints `1`. `-gpu swiftshader_indirect` hangs on this machine. If `adb` itself hangs, kill stale `qemu-system-x86_64`, `emulator` and `adb` processes and boot fresh.

## Run the app

- **JS/TS changes:** `cd app && npx expo start --port 8081`, then `adb reverse tcp:8081 tcp:8081` and `adb shell monkey -p com.feedme.app -c android.intent.category.LAUNCHER 1`. Fast Refresh pushes later edits.
- **Native changes** (a dependency with native code, `app.json`, config plugins): `cd app && npx expo run:android` builds, installs, launches and starts Metro. Never pass `--no-bundler`. A red box such as "Cannot read property 'X' of undefined" right at launch usually means the installed APK is older than the JS — rebuild.
- **Native builds on the local Windows machine** need a long-path-aware CMake: after any `expo prebuild` (it regenerates `android/`), add `cmake.dir=<sdk>/cmake/3.31.6` to `app/android/local.properties`, then build just the emulator ABI with `cd app/android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64` and `adb install -r app/build/outputs/apk/debug/app-debug.apk`. The SDK's default CMake 3.22.1 fails with "Filename longer than 260 characters".

## Look and interact

Use a mobile MCP server if one is configured; otherwise `adb`:

| Need              | Command                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Screenshot        | `adb exec-out screencap -p > "$TEMP/shot.png"` (never inside the repo)                                     |
| Element positions | `adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml` — `bounds` are tap coordinates |
| Input             | `adb shell input tap X Y` · `input swipe X1 Y1 X2 Y2 MS` · `input keyevent KEYCODE_BACK`                   |
| Long press        | `adb shell input motionevent DOWN X Y`, wait, `MOVE`…, `UP` (`input swipe` never dwells)                   |
| Logs              | `adb logcat -c`, act, `adb logcat -d \| grep ReactNativeJS` (`console.error` → `E/ReactNativeJS`)          |
| Frame timing      | `adb shell dumpsys gfxinfo com.feedme.app reset`, act, `adb shell dumpsys gfxinfo com.feedme.app`          |
| Fresh install     | `adb shell pm clear com.feedme.app` (wipes the owner's real feeds — avoid unless asked)                    |

## Gotchas

- Under Git Bash, `export MSYS_NO_PATHCONV=1` before any command with a `/sdcard/...` or `/data/...` path.
- A swipe needs a duration of at least 250ms to register as a pager swipe; shorter ones silently do nothing.
- Re-dump element positions after any state change instead of reusing old coordinates — banners and menus move things.
- `screenrecord` starves the app enough that scripted input stops registering while it runs.
- The LogBox "Open debugger" toast sits over the tab bar and swallows taps; dismiss it first, but only when it is actually showing.
- Don't judge light vs dark mode by eye from a screenshot — sample a pixel: light paper is about `(250,248,243)`, dark paper about `(15,16,18)`.
- The local AVD is 320×640 at density 160, so screenshot pixels are tap coordinates.
