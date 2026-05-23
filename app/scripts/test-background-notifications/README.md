# Background Notification Verification Harness

Tooling for end-to-end verification of the background-sync + notification
pipeline against a real Android build, without waiting for the OS scheduler.

## What's in this folder

- **`server.mjs`** — zero-dependency Node HTTP server that serves a mutable
  RSS 2.0 feed and accepts new posts via a `POST /add` endpoint.

## What's elsewhere

- **Settings → Background sync (debug)** — dev-only panel (gated behind
  `__DEV__`, so it does not ship in release) with two buttons:
  - **Run sync now (in-process)** — force-refreshes all feeds (bypassing
    the per-feed `next_fetch_at` adaptive throttle) and then calls
    `runBackgroundNotificationSync()` directly from JS. Fast feedback;
    bypasses WorkManager. The forced refresh is what makes the test
    reliable — without it, a recently fetched feed would be skipped and
    no new items would arrive to notify on.
  - **Trigger OS background worker** — calls
    `BackgroundTask.triggerTaskWorkerForTestingAsync()`, which fires the
    registered WorkManager job. This is the closest you can get to the real
    OS-scheduled path without waiting 15+ minutes.

## Why a debug button?

Android's `WorkManager` periodic task minimum is **15 minutes**. You cannot
shorten the schedule below that. To verify the pipeline in seconds rather
than minutes, the in-app debug buttons trigger the registered task directly.
The schedule, task definition, and code paths exercised are identical to the
production flow — only the wake-up source differs.

## End-to-end verification runbook

### 0. One-time setup

Ensure you have a debug build of the app installed on the Android emulator.
The dev panel only renders when `__DEV__ === true`, so you need a dev build
(not a release APK).

### 1. Start the fake RSS server

From the `app/` directory:

```pwsh
node scripts/test-background-notifications/server.mjs
```

You should see:

```
Fake RSS server listening on http://0.0.0.0:8799 (Android emulator: http://10.0.2.2:8799/feed.xml)
```

Sanity-check it from your dev machine:

```pwsh
curl http://127.0.0.1:8799/feed.xml
```

### 2. Add the feed to FeedMe

In the app, open **Discover → Add feed by URL** and enter:

```
http://10.0.2.2:8799/feed.xml
```

(`10.0.2.2` is the Android emulator's alias for the host machine. For a
physical device on the same Wi-Fi, use the host's LAN IP.)

Open the new feed and confirm "Initial post" loads.

### 3. Enable notifications for the feed

Open the feed's settings (the gear icon in the feed view) and:

1. Toggle **Notify** on (grant permission if prompted).
2. Set frequency to **Immediate**.

Back in app **Settings**, confirm **Background sync** is set to anything
other than "Off" (the value doesn't matter for the debug trigger; it only
matters that a task is registered).

### 4. Background the app

Press the home button on the emulator. **Do not swipe-kill** — the dev-only
trigger needs the JS runtime alive for the in-process button, and even the
"Trigger OS background worker" button has to be tapped from a foregrounded
app. (For a fully unattended OS-fired run, set the frequency to 15m and wait;
that's covered in the optional section below.)

### 5. Publish a new post on the server

From a second terminal:

```pwsh
curl -X POST http://127.0.0.1:8799/add `
  -H "Content-Type: application/json" `
  -d '{\"title\":\"Brand new post\"}'
```

Verify it appears in the feed:

```pwsh
curl http://127.0.0.1:8799/feed.xml
```

### 6. Trigger the background sync

Bring FeedMe back to the foreground, open **Settings**, scroll to
**Background sync (debug)**, and tap one of:

- **Run sync now (in-process)** — fastest, simplest. Triggers the same
  function the WorkManager job runs.
- **Trigger OS background worker** — exercises the full WorkManager path
  (recommended for production-fidelity verification).

You should see an Android notification appear within a few seconds with the
title "Brand new post".

### 7. Verify in-app

Tap the notification → the app should open directly to the new item. Or
navigate to the feed and confirm the new post is present without performing
a pull-to-refresh.

## Optional: real OS-scheduled run (slow path)

If you want to verify Android actually fires the periodic job at the
scheduled cadence (rather than relying on the test trigger):

1. In **Settings → Background sync**, set frequency to **Every 15 minutes**.
2. Send the app to background.
3. Add a new post on the server (step 5 above).
4. Watch `adb logcat` for the task to fire (filter on `expo-background-task`
   or `feedme`). Notifications should appear within ~15–30 minutes
   (WorkManager batches periodic work; exact timing is OS-controlled).

## Useful adb commands

```pwsh
# Tail logs for the notification pipeline
adb logcat -v time *:S ReactNativeJS:V expo-background-task:V

# Inspect registered WorkManager jobs for the app
adb shell dumpsys jobscheduler | Select-String -Pattern "feedme" -Context 0,5
```

## Cleanup

After testing:

- Stop the server (`Ctrl+C` in its terminal).
- Remove the test feed from the app via **Settings → Manage feeds**.
- If you bumped frequency to 15m for the slow path, restore it to whatever
  you actually use.
