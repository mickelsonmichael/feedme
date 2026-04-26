# App Instructions

This app is an RSS feeder app that can run either (A) as an Android mobile app or (B) as a web page.
To support this, the app is written using React Native and TypeScript.
Every feature added to the app should support both these environments and use a local SQLite database for long-term data.
The web app can choose to use Local Storage where appropriate.

Users add a list of RSS feeds by URL and can provide an optional title.
Items are fetched from all configured RSS feeds and displayed on the main "Feeds" page as an aggregated list,
similar to Reddit's mechanism. `Subreddits : Posts :: Feeds : Items`.

Each time the above functionality is modified as part of a change, update this description only when the change was explicitly requested.
Otherwise, this behavior is the contract for the app and all changes should stay consistent with it.

Use this file together with the shared repository rules in the root `AGENTS.md`.
