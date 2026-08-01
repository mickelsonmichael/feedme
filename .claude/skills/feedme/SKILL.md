---
name: feedme
description: "Use when developing the feedme app: adding a new feature, modifying existing functionality, fixing bugs, or designing UI changes. Always use this skill to identify which screen(s) a feature or bug relates to, understand existing requirements, and record new requirements. Triggers: new feature, feature change, bug fix, screen modification, feedme development."
argument-hint: "Brief description of the feature or bug being worked on"
---

# FeedMe Development Skill

## When to Use
- Building a new feature in the feedme app
- Modifying the behavior of an existing feature
- Fixing a bug in a specific screen or flow
- Anytime you need to identify which screen a requirement maps to

## Procedure

### 1. Identify the Target Screen(s)
Load [screens.md](./references/screens.md) and identify which screen(s) the feature or bug relates to. If the work spans multiple screens, list all of them.

- If a **new screen** is being introduced, add it to `screens.md` before proceeding.
- Use screen names from `screens.md` consistently when discussing the feature.

### 2. Review Existing Requirements
Load [requirements.md](./references/requirements.md) and check for any existing requirements related to the area being changed. Note any requirements that may be affected or superseded.

### 3. Record New or Updated Requirements
After implementing or designing the feature, update [requirements.md](./references/requirements.md):
- Add a new entry under the relevant screen section.
- If modifying existing behavior, update the existing requirement entry and note the change.
- Keep requirements concise and testable (observable behavior, not implementation detail).

### 4. Implement
- Follow the existing patterns for the target screen's code.
- Refer to `screens.md` for the screen's current responsibilities to avoid scope creep.
- Check `dev-environment.instructions.md` for how to run the dev server and test the change.

### 5. Verify
- Confirm the new behavior matches the requirement recorded in `requirements.md`.
- If a new screen was added, confirm `screens.md` has been updated.

## Key Files

| File | Purpose |
|------|---------|
| [screens.md](./references/screens.md) | All app screens, their purpose, and primary features |
| [requirements.md](./references/requirements.md) | Functional requirements per screen, updated with each change |
| `app/src/screens/` | Screen component source files |
| `app/src/components/` | Shared UI components |
| `app/App.tsx` | Root navigator and tab/stack configuration |
