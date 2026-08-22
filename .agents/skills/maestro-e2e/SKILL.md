---
name: maestro-e2e
description: Use whenever the task involves writing, running, or debugging automated Android UI flows for feedme — end-to-end tests that tap through real screens the way a user would, as opposed to Jest unit/component tests. Triggers on phrases like "add an e2e test", "write a Maestro flow", "automate this UI check", "verify this end-to-end", "does the add-feed flow still work", or any request to script repeatable interaction through the running app rather than one-off manual verification.
allowed-tools: shell
---

# Maestro E2E flows

feedme uses [Maestro](https://maestro.mobile.dev) for black-box Android UI automation — the closest equivalent to Playwright for this app. Flows are declarative YAML files that drive the app through the accessibility tree via `adb`/UI Automator under the hood. They complement, not replace, the two other layers of testing:

- **Jest** (`app/*.test.tsx`) — unit/component logic, fast, no device needed.
- **Maestro** (this skill) — scripted, repeatable interaction across real screens on the emulator. Use it to lock in a flow once you've verified it manually, or to re-check a flow you already wrote instead of re-doing manual taps every time.
- **Manual `android-emulator-adb` verification** — still the right tool for one-off exploration, screenshots, and anything not yet worth scripting.

Maestro only drives native Android/iOS apps — it does not work against the web build. That's fine: the web build is deprecated and is no longer verified (see `AGENTS.md`).

## Prerequisite: app already running

Maestro attaches to an app that's already installed and running on a booted emulator — it doesn't build or launch Metro for you. Follow the `android-emulator-adb` skill first: boot the emulator, install/build the APK, start Metro, and confirm the app launches. Only then run flows.

## Installing the CLI

Maestro is a standalone CLI (not an npm package), installed once per machine:

```bash
curl -sL https://get.maestro.mobile.dev | bash
export PATH="$PATH":"$HOME/.maestro/bin"   # add to shell profile if not already there
maestro --version
```

It needs a JDK on `PATH` (this environment already has one). If `maestro` isn't found in a fresh shell, the installer appended the PATH line to `~/.bashrc`/`~/.zshrc` — source that file or export the line manually.

## Running flows

From `app/`:

```bash
npm run e2e                                   # runs every flow in e2e/maestro/
maestro test e2e/maestro/launch-smoke.yaml    # run a single flow
```

Flows run against whatever is currently on the emulator, so make sure Metro is serving the JS you intend to test (native/JS mismatches show up as a red-box render error on launch, not a Maestro failure — see "Common failure patterns").

## Where flows live

`app/e2e/maestro/*.yaml` — one flow per file, named after what it verifies (`add-and-remove-feed.yaml`, not `test1.yaml`). Every flow starts with:

```yaml
appId: com.feedme.app
---
- launchApp
```

## Authoring conventions

- **Prefer existing `testID`/`accessibilityLabel` props over screen text.** Most interactive rows in feedme already carry one (e.g. `accessibilityLabel="Delete feed"`, `testID="add-feed-tags"`) — grep the target screen before assuming you need to add one. Maestro's plain string selector (`tapOn: "Add feed"`) matches visible text and accessibility label/id alike.
- **Untitled inputs**: form fields often have no `testID`, only a placeholder. Tap the placeholder text to focus, then `inputText`:
  ```yaml
  - tapOn: "https://example.com/feed.xml"
  - inputText: "https://feeds.simplecast.com/54nAGcIl"
  ```
- **Native dialogs work too.** `Alert.alert` renders a real Android dialog, not an RN view — Maestro automates it the same as any other screen (`tapOn: "Remove"`).
- **Leave no test data behind.** The dev emulator carries the project owner's real subscriptions and settings (see project memory). Any flow that adds a feed, tag, or changes a persisted setting must undo it at the end of the same flow — add with an unmistakable title like `"Maestro E2E Test Feed"`, assert it, then delete it before the flow ends. Don't rely on `launchApp`'s `clearState` — that would wipe real data too, so leave it at its default (`false`).
- **Don't assert on color/theme visually.** Maestro has no built-in pixel/color assertion. Flows that touch theme/appearance should verify *interaction* (tapping a segmented option doesn't crash, correct screen still renders) and leave the setting restored to its default, not attempt to verify the resulting colors — that still needs a manual screenshot check per `AGENTS.md`'s "verify both themes" requirement.

## Cheat sheet

```yaml
- launchApp                          # default: does NOT clear app state
- tapOn: "Settings"                  # matches text, accessibilityLabel, or id
- longPressOn: "Some Feed"
- inputText: "hello"
- assertVisible: "Appearance"
- assertNotVisible: "Maestro E2E Test Feed"
- back
- scroll                             # scrolls the nearest scrollable container down
- swipe: { direction: LEFT }
```

Full command reference: https://maestro.mobile.dev/api-reference/commands

## Discovering selectors: Maestro Studio

If it's unclear what text/id an element exposes, run:

```bash
maestro studio
```

This opens a local web UI (with the emulator already connected) showing the live accessibility tree and exact selectors for whatever is on screen — faster than guessing from `uiautomator dump`.

## Common failure patterns

**Flow fails immediately with a red-box "Cannot read property 'X' of undefined" instead of a Maestro assertion error.** This is a native/JS mismatch, not a flow bug — the installed APK's native modules are older than the JS bundle Metro is serving (usually because `npm install` pulled a dependency with native code, like `react-native-gesture-handler`, after the APK was last built). Rebuild with `npx expo run:android` per the `android-emulator-adb` skill's "Full build from scratch" section, then re-run the flow.

**`tapOn` can't find the element.** Confirm the exact text/label with `maestro studio` rather than guessing — RN sometimes renders label text as a sibling `Text` node rather than on the tappable element itself, in which case a relative selector (`tapOn: { below: "Feed URL *" }`) is more reliable than the label text itself.

**Flow is flaky around network-loaded content** (feed fetches, icons). Maestro auto-retries `assertVisible` for a few seconds by default, but for slower operations add an explicit wait: `- extendedWaitUntil: { visible: "...", timeout: 10000 }`.

## What to include when reporting results

- Which flow(s) were run and the exact command
- Pass/fail per flow; for failures, the step that failed and Maestro's screenshot (Maestro saves one automatically under `~/.maestro/tests/<timestamp>/` on failure — reference it, don't paste binary content)
- Whether any test data had to be manually cleaned up because a flow didn't reach its cleanup step
