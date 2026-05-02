# Repository Instructions

This repository contains two projects:

- `app/`: React Native + TypeScript RSS app (Android + Web).
- `worker/`: Cloudflare Worker backend/service code.

These instructions apply across both projects unless a nested `AGENTS.md` provides additional rules.

Before running tests or scripts from package.json, you must change your directory into either `app/` or `worker/`, depending on which you're working on.

## Commits

Use Conventional Commits.
Examples:

- `feat(feeds): add ability to favorite feeds`
- `fix(settings): persist dark mode selection longer than 1 day`

## Testing

- New features should include tests.
- Keep the full existing test suite passing.
- Follow `Arrange - Act - Assert` structure in tests.

## Code Quality

All agents must run the `code-quality` skill as part of each task.

## Verification

Changes that affect the UI or feed behaviour should be verified on **both platforms**:

- **Android**: Use the Android emulator with the Expo dev server. See the `android-debug` skill for tooling.
- **Web**: Use the embedded browser via `npx expo start --web` from `app/`.

## Test Feeds

Use these feeds when a feed is needed during development or testing:

| Feed | URL / Description |
|------|-----------------|
| The Daily (podcast) | `https://feeds.simplecast.com/54nAGcIl` |
| NYT US News | `https://rss.nytimes.com/services/xml/rss/nyt/US.xml` |
| Reddit: `ama` | Text-focused subreddit |
| Reddit: `aww` | Image-focused subreddit |
| Reddit: `gifs` | Gif-focused subreddit |
| Reddit: `gonewild` | NSFW subreddit (images, galleries, gifs) |
| YouTube: Atrioc | YouTube: `atrioc` |
| YouTube: Ludwig | YouTube: `ludwig` |

## Task Completion Requirements

Before considering a task complete:

1. Plan the work.
2. Implement the requested changes.
3. Add or update tests when functionality changes.
4. Run the appropriate quality checks and fix any issues.
