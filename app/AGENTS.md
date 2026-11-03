# App

An Android RSS reader in React Native + TypeScript (Expo). All long-term data lives in a local SQLite database. Touch-screen UX on Android is the only UX that has to work; the web build is deprecated (see the root `AGENTS.md`).

## Core behaviour

Users add RSS feeds by URL, with an optional title. Items from every feed are aggregated into one list on the main Feed screen, like Reddit: `Subreddits : Posts :: Feeds : Items`. This is the app's contract — only change this description when a change to it was explicitly requested.

## Terminology

| Term in requests                        | Meaning                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| "single view"                           | `FeedListScreen` with `feedLayout === "single"`: one post at a time, swipe or Prev/Next. |
| "compact view"                          | The `compact` layout: condensed rows with an optional inline expand panel.               |
| "card view"                             | The `card` layout: large media-first cards.                                              |
| "view post screen" / "single post view" | `FeedItemScreen`, the detail screen opened from compact/card rows and other screens.     |

## Images

Render images at actual size, capped at 1024×1024. Ask before exceeding that. Thumbnails, icons and small previews are exempt.

## React Compiler

The app is built with the React Compiler (`experiments.reactCompiler` in `app.json`) and Jest compiles components the same way. A render must depend only on props, state and context: reading module-level mutable state and forcing a re-render returns the memoised output. `npm run lint` flags the patterns the compiler skips or mishandles.

## Tests

Jest (`npm test`). Run a single file with `npm test -- <path>` — a bare `npx jest` can pick up a stale global install that fails to parse TSX.
