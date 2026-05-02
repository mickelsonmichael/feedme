# Repository Instructions

This repository contains two projects:

- `app/`: React Native + TypeScript RSS app (Android + Web).
- `worker/`: Cloudflare Worker backend/service code.

These instructions apply across both projects unless a nested `AGENTS.md` provides additional rules.

Before running tests or scripts from package.json, you must change your directory into either `app/` or `worker/`, depending on which you're working on.

## Completing Tasks

Before considering a task complete, you must have done the following:

- Plan the work before beginning using the Plan agent. If you have any questions, use the built-in tool for asking the user for clarification
- **ALWAYS** use the Android emulator to test the Android app
- **ALWAYS** use the embedded web browser to test the web app
- Add or update tests for the requested changes. Do not "break" any tests - the original tests must still pass unless it is reasonable that they change
- After the task is completed, use the code quality skill to ensure the code meets the quality standards

You should repeat these steps in whatever order necessary to consider the change a fully implemented, tested, quality change

## Testing

- Follow `Arrange - Act - Assert` structure in tests.
- You should test requirements, not code paths. But you should also test edge and error cases

## Verification

Changes that affect the UI or feed behaviour should be verified on **both platforms**:

- **Android**: Use the Android emulator with the Expo dev server. See the `android-debug` skill for tooling.
- **Web**: Use the embedded browser.

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

If necessary, you should clear the existing feeds to ensure you are starting from a stable state.
Some changes may require you to find a post with certain characteristics,
you will need to scroll through the posts until you find one that meets the requirements.
