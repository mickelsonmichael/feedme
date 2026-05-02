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

**ALWAYS PREFER THE MCP SERVER TO ADB COMMANDS** for interactions, as it has better error handling and will confirm success/failure of each action.

Never use multi-touch or simultaneous coordinate taps unless *truly* necessary.
Always use single tap x y commands with at least 300ms between actions.
If a dev overlay appears, press keyevent 82 to open the dev menu and dismiss it before continuing.

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
| Submit button click does nothing on web forms | `onBlur` on a field triggered an async fetch, setting `loading = true` and disabling the button before the click registered | Click another field first to trigger blur and wait for the async operation to complete (watch for the field to populate), then click the submit button |
