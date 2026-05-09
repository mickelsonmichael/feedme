# Repository Instructions

## Projects

| Directory | Description |
|-----------|-------------|
| `app/` | React Native + TypeScript RSS app (Android + Web) |
| `worker/` | Cloudflare Worker backend/service code |

**Always `cd` into the relevant project directory before running any scripts or tests.**
These instructions apply to both projects unless a nested `AGENTS.md` says otherwise.

---

## Hard requirements — a task is NOT complete without all of these

These are gates, not suggestions. Do not open a PR, mark a task done, or stop work until every item is satisfied.

1. **Android emulator verification** — run the app on the emulator using the Expo dev server and attach a screenshot. See the `android-emulator-adb` skill for setup. `start-emulator` must succeed and the app must visibly launch before you proceed.
2. **Web browser verification** — open the web app in the embedded browser and confirm the relevant behaviour works.
3. **Tests pass** — all pre-existing tests must still pass. Add or update tests for the changed behaviour. Do not disable or delete tests to make this green.
4. **Code quality** — run the `code quality` skill before finalising.

> If the emulator fails to boot, fix the boot problem before doing anything else. Do not substitute code reading, test suites, or your own reasoning for live verification on the target platform. Settings persistence, data loading, navigation, and any runtime behaviour can only be confirmed by actually running the app.

---

## Task workflow

Follow these steps in order. Repeat as necessary until the hard requirements above are all satisfied.

1. **Plan** — use the Plan agent before writing any code. If anything is ambiguous, use the ask-user tool before proceeding.
2. **Implement** — make the change. Stay in scope; do not fix unrelated things.
3. **Test** — write or update tests following Arrange–Act–Assert. Test requirements and edge cases, not code paths.
4. **Verify on Android** — `start-emulator` → Expo dev server → confirm the change → `adb exec-out screencap -p > screenshot-android.png`.
5. **Verify on Web** — open the embedded browser → confirm the change → capture a screenshot.
6. **Quality check** — run the `code quality` skill.
7. **Submit** — attach both screenshots to the PR description.

---

## Testing standards

- Structure: Arrange – Act – Assert.
- Test requirements and edge/error cases, not implementation details.
- Do not break existing tests unless the change explicitly requires a behaviour change, and document why in the PR.

---

## Curated Discover feeds

When adding, modifying, or removing a feed from the Discover screen's curated list, follow the `curated-feeds` skill exactly. It covers URL verification, favicon retrieval, and JSON format.

---

## Test feeds

Use these when a feed is needed during development or testing.

| Feed | URL / Description |
|------|-------------------|
| The Daily (podcast) | `https://feeds.simplecast.com/54nAGcIl` |
| NYT US News | `https://rss.nytimes.com/services/xml/rss/nyt/US.xml` |
| Reddit: `ama` | Text-focused subreddit |
| Reddit: `aww` | Image-focused subreddit |
| Reddit: `gifs` | GIF-focused subreddit |
| Reddit: `gonewild` | NSFW subreddit (images, galleries, GIFs) |
| YouTube: Atrioc | YouTube channel `atrioc` |
| YouTube: Ludwig | YouTube channel `ludwig` |

Clear existing feeds before testing if a clean state is needed. If a post with specific characteristics is required, scroll until you find one — do not assume the first result will qualify.
