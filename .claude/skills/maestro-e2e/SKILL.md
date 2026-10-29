---
name: maestro-e2e
description: Write, run or debug Maestro end-to-end flows that drive the real feedme app on the Android emulator — scripted, repeatable UI checks, as opposed to Jest unit/component tests.
---

# Maestro E2E flows

Flows are YAML files in `app/e2e/maestro/`, one per file, named for what they verify. Maestro attaches to an app that is already installed and running (see the `android-emulator` skill); it doesn't build or start Metro.

## Running

```bash
cd app
npm run e2e                                  # every flow
maestro test e2e/maestro/launch-smoke.yaml   # one flow
```

Install once with `curl -sL https://get.maestro.mobile.dev | bash` and add `$HOME/.maestro/bin` to `PATH`. The driver occasionally fails to start right after a previous run ("did not start up in time") — retry once.

## Writing flows

Start every flow with:

```yaml
appId: com.feedme.app
---
- launchApp
```

- Select by existing `testID`/`accessibilityLabel` where possible; `tapOn: "text"` matches text, label and id. Grep the screen before adding new ids.
- Inputs without ids: tap the placeholder text, then `inputText`.
- Native `Alert.alert` dialogs are automated like any other screen.
- **Leave no data behind.** The emulator holds the owner's real feeds and settings. Anything a flow adds or changes (use an obvious name such as `"Maestro E2E Test Feed"`) must be undone in the same flow. Never use `clearState`.
- Maestro can't assert colours, so theme checks still need a manual screenshot in both modes.
- Slow network-loaded content: `- extendedWaitUntil: { visible: "...", timeout: 10000 }`.
- When a selector won't match, `maestro studio` shows the live tree and exact selectors. Labels are sometimes on a sibling `Text`, so relative selectors (`below: "Feed URL *"`) can help.

Command reference: https://maestro.mobile.dev/api-reference/commands
