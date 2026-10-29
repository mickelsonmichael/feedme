# FeedMe

An RSS reader. Two independent projects, each with its own `package.json` — run commands from inside the relevant directory:

| Directory | What                                                                  |
| --------- | --------------------------------------------------------------------- |
| `app/`    | React Native + Expo + TypeScript app (Android). See `app/AGENTS.md`.  |
| `worker/` | Cloudflare Worker that proxies feed requests. See `worker/AGENTS.md`. |

`npm run start` from the root runs both dev servers (Expo on `:8081`, worker on `:8787`). Check whether one is already running before starting another.

## Android is the only target

The web build is deprecated. Don't run, verify or screenshot it, and don't add web-only behaviour. Leave existing web code (`Platform.OS === "web"` branches, the wide-web sidebar) in place rather than removing it as a drive-by.

## Done means

- The change is verified in the running app on the Android emulator — tests and code reading don't substitute for this. Visual changes are checked in both light and dark mode. Screenshots stay out of the repo.
- Tests pass, and changed behaviour has tests that check requirements and edge cases rather than implementation details.
- `npm run format:check` and `npm run typecheck` pass in `app/` (`npm run format` fixes formatting).

## Skills

- `android-emulator` — boot the emulator, run Metro, rebuild, screenshot, tap/swipe, read logs.
- `maestro-e2e` — scripted end-to-end UI flows.
- `feedme` — screen map and recorded requirements; update the requirements when behaviour changes.
- `curated-feeds` — required whenever the Discover screen's curated list changes.

## Test feeds

| Feed                | URL / description                                     |
| ------------------- | ----------------------------------------------------- |
| The Daily (podcast) | `https://feeds.simplecast.com/54nAGcIl`               |
| NYT US News         | `https://rss.nytimes.com/services/xml/rss/nyt/US.xml` |
| Reddit `ama`        | Text posts                                            |
| Reddit `aww`        | Images                                                |
| Reddit `gifs`       | GIFs                                                  |
| Reddit `gonewild`   | NSFW images, galleries, GIFs                          |
| YouTube `atrioc`    | YouTube channel                                       |
| YouTube `ludwig`    | YouTube channel                                       |

If a post with particular characteristics is needed, scroll until you find one rather than assuming the first result qualifies.
