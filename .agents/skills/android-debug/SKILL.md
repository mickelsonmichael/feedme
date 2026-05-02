---
name: android-debug
description: "Debug Android app issues on the emulator using MCP mobile tools and adb. Use when: testing UI interactions, verifying layout/gesture fixes, investigating crashes, or confirming behavior on device. Grants access to mobile-mcp screenshot, swipe, tap, and element listing tools."
argument-hint: "Describe the issue or behavior to verify on Android"
---

# Android Debugging

The `mobile-mcp` MCP server provides device interaction. Tools are prefixed `mcp_mobile-mcp_`.

Before you begin, ensure the expo dev server is running using `npm expo start` from the `app/` directory.
You should check for an existing process in the terminals before starting a new one to avoid duplicates.

Once started, you can use the `mobile_list_available_devices` tool to confirm the emulator is detected.

If the tool returns an empty list, the MCP server likely can't find `adb`.
Ask the user for their `ANDROID_HOME` path if it isn't already known, then ensure it is set in `.vscode/mcp.json`:

```json
"env": { "ANDROID_HOME": "<path-to-android-sdk>" }
```

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
| Submit button click does nothing on web forms | `onBlur` on a field triggered an async fetch, setting `loading = true` and disabling the button before the click registered | Click another field first to trigger blur and wait for the async operation to complete (watch for the field to populate), then click the submit button |
