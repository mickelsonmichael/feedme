# App Instructions

This app is an RSS feeder app that targets Android. It is written using React Native and TypeScript, and every feature uses a local SQLite database for long-term data.

The app also has a web build, but **the web version is deprecated**: it is no longer used and is no longer verified. Android is the only environment a change has to be valid for, and touch-screen UX is the only UX that has to work.

Existing web-specific code (including its Local Storage usage) stays as-is — don't rip it out as a drive-by change. But don't write a second web implementation for new work, don't add web-only behaviour, and don't spend time confirming a change on web.

## Basic Functionality

Users add a list of RSS feeds by URL and can provide an optional title.
Items are fetched from all configured RSS feeds and displayed on the main "Feeds" page as an aggregated list,
similar to Reddit's mechanism. `Subreddits : Posts :: Feeds : Items`.

Each time the above functionality is modified as part of a change, update this description only when the change was explicitly requested.
Otherwise, this behavior is the contract for the app and all changes should stay consistent with it.

Use this file together with the shared repository rules in the root `AGENTS.md`.

## Domain Terminology

Use this glossary when interpreting user requests to avoid ambiguity.

| Term used in requests                           | Meaning                                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"single view"**                               | The `single` feed layout mode in `FeedListScreen` — one post is shown at a time, full-screen, with Prev/Next navigation. Controlled by `feedLayout === "single"`.    |
| **"compact view"**                              | The `compact` feed layout mode — posts shown as a scrollable list of condensed rows with an optional expand panel.                                                   |
| **"card view"**                                 | The `card` feed layout mode — posts shown as large media-first cards in a scrollable list.                                                                           |
| **"view post screen"** / **"single post view"** | The `FeedItemScreen` — the dedicated full-screen detail view for a single post, navigated to from compact/card layout rows and from other non-single-layout screens. |

### Images

For most scenarios, when an image is being rendered on screen, it should be actual size but have a maximum height of 1024 and a maximum width of 1024.
If there are scenarios where this limitation needs to be exceeded, then you can ask for clarification or ask a follow-up question.
This rule does not apply when the image is a thumbnail, icon, or small preview.
