---
name: android-debug
description: "Debug Android app issues on the emulator using MCP mobile tools and adb. Use when: testing UI interactions, verifying layout/gesture fixes, investigating crashes, or confirming behavior on device. Grants access to mobile-mcp screenshot, swipe, tap, and element listing tools."
argument-hint: "Describe the issue or behavior to verify on Android"
---

# Android Debugging

## Tools Available

The `mobile-mcp` MCP server provides device interaction. Tools are prefixed `mcp_mobile-mcp_`.

## Step 1: Confirm Device is Available

```
mobile_list_available_devices
```

If empty, the MCP server likely can't find `adb`. Ask the user for their `ANDROID_HOME` path if it isn't already known, then ensure it is set in `.vscode/mcp.json`:

```json
"env": { "ANDROID_HOME": "<path-to-android-sdk>" }
```

Verify via terminal:
```pwsh
$env:ANDROID_HOME = "<path-to-android-sdk>"
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
```

Device ID will be something like `emulator-5554`.

## Step 2: Disable the Element Inspector

The React Native element inspector activates when a tap lands on a non-interactive area — it will hijack every subsequent tap/type and prevent normal interaction.

**Detect it:** If a screenshot shows "Tap something to inspect it" at the bottom, the inspector is ON.

**Disable it:**
1. Open dev menu: `adb shell input keyevent 82`
2. Check the screenshot — tap "Toggle element inspector" to turn it OFF

Alternatively, dismiss with: `adb shell input keyevent 4` (back)

## Step 3: Interact with the App

**Prefer `mobile_list_elements_on_screen` over guessing coordinates** — it gives exact x/y positions of every element.

**Typing text:** If `mobile_type_keys` keeps triggering the inspector, fall back to adb:
```pwsh
& $adb shell input tap 160 278   # focus the field first
& $adb shell input text "your-text-here"
```

Note: `adb input text` doesn't handle special characters well (e.g., `://` in URLs). Use it for simple strings and `mobile_type_keys` otherwise.

**Swipe gestures (e.g., pull-to-refresh):**
```
mobile_swipe_on_screen  direction=down  distance=300  x=160  y=300
```
Use a y position in the middle of the content area, not near the top bar.

## Step 4: Verify the Fix

1. Navigate to the relevant screen
2. Take a screenshot to confirm state
3. Perform the gesture/interaction being tested
4. Take another screenshot immediately after — the spinner or state change should be visible

## Image Limit Management

Claude Sonnet has a **20-image context limit**. Screenshots accumulate quickly during a debugging session.

**Rules:**
- Take a screenshot only when you need to confirm a state change or read content — not after every tap
- Maintain a **rolling log of observations** in session memory instead of relying on screenshot history
- Before taking a new screenshot, summarize the last known state from memory
- If approaching the limit, prefer `mobile_list_elements_on_screen` (text-based, no image) over screenshots

**Session memory pattern — update after each meaningful state change:**
```
Screen: <screen name>
State: <what is visible / what happened>
Last action: <what was tapped/typed/swiped>
Issues: <anything unexpected>
```

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Inspector opens on every tap | Inspector was left ON | Open dev menu (keyevent 82), toggle it off |
| `mobile_type_keys` types nothing | Input not focused | Tap the field first with `mobile_click_on_screen_at_coordinates` |
| `adb devices` shows nothing | `ANDROID_HOME` not set | Set `$env:ANDROID_HOME` before calling adb |
| Pull-to-refresh does nothing | Empty state is a plain `View` | Wrap in `ScrollView` + `RefreshControl` |
| Dev menu won't open | App may not have focus | Tap the app screen first, then keyevent 82 |
| MCP server returns "device not found" | Stale device list or `ANDROID_HOME` missing | Restart MCP server, verify `mcp.json` env |
