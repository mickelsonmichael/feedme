---
name: curated-feeds
description: "Add, modify, or remove a feed in the Discover screen's curated list. Use when: a user requests a new curated feed, asks to update an existing curated entry's URL/title/description/icon, or asks to remove a curated feed. Covers feed verification, favicon retrieval, and the JSON file format."
argument-hint: "Describe the feed(s) to add, change, or remove"
---

# Curated Discover Feeds

The Discover screen shows a curated list of suggested feeds loaded from a single JSON file:

**File:** [app/src/data/curatedFeeds.json](../../../app/src/data/curatedFeeds.json)

Each entry must match this shape (see the `DiscoverScreen` consumer in [app/src/screens/DiscoverScreen.tsx](../../../app/src/screens/DiscoverScreen.tsx)):

```json
{
  "title": "Display title shown to users",
  "url": "https://example.com/rss.xml",
  "iconUrl": "https://example.com/favicon.ico",
  "description": "One-sentence description (≈80 chars max, no marketing fluff)."
}
```

Order in the array is the order shown on screen. Keep entries grouped by topic when reasonable.

## Scripts

Two Node.js helper scripts live in `.agents/skills/curated-feeds/scripts/`. **Always run them from the `app/` directory** (they use only built-in Node modules — no install needed).

| Script | Purpose |
|---|---|
| `fetch-feed.js <url>` | Verifies a URL is a reachable RSS/Atom feed |
| `fetch-icon.js <site-or-icon-url>` | Discovers and verifies a usable favicon |

`fetch-icon.js` automatically follows redirects, skips SVG (unsupported by React Native), rejects images that lack CORS headers (would be blocked on web), and falls back to the WordPress blavatar CDN (which always has `Access-Control-Allow-Origin: *`). Pass `--skip-cors` only for Android-only verification where the web build is not a concern.

## Workflow

Follow every step. Do **not** add a feed that fails any verification step — report the failure to the user and ask for a different URL.

### 1. Verify the feed URL returns RSS or Atom

```bash
node .agents/skills/curated-feeds/scripts/fetch-feed.js <feed-url>
```

Expect `OK` on stdout. Any other output means the URL is not a valid feed.

If you only have a homepage URL, try appending the common paths `/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/index.xml` and re-run the script until one succeeds.

### 2. Pick a stable title and description

- **Title:** prefer the human-readable site/feed name. If the site has multiple feeds (e.g. Smithsonian articles vs photos), disambiguate with an em-dash suffix: `Smithsonian — Photos`.
- **Description:** one short sentence describing what the feed publishes. No emojis, no marketing language, no trailing period if one isn't natural.

### 3. Retrieve and verify the icon URL

```bash
node .agents/skills/curated-feeds/scripts/fetch-icon.js <site-url>
```

The script prints `BEST ICON URL:` followed by the URL to use in `iconUrl`. If it exits with code 1, check the output — each candidate is listed with a reason for skipping. Common fixes:

- **SVG skipped** — the site only serves SVG icons; try passing the `apple-touch-icon.png` URL directly.
- **No CORS header** — the icon works on Android but will be blocked on web. The script already tries the WordPress blavatar CDN as a fallback. If that also fails, find a PNG asset on a CDN that sends `Access-Control-Allow-Origin: *`.
- **403 on favicon.ico** — try passing `<site-url>/apple-touch-icon.png` directly.

Do not commit a 404 icon — `DiscoverScreen` will show a fallback RSS glyph, but a stale 404 wastes a network request.

### 4. Edit `curatedFeeds.json`

- **Add:** append the new object, or insert it at a topical position. Keep the JSON array valid (commas, no trailing comma).
- **Modify:** update only the fields that changed. Re-run steps 1 and 3 if `url` or `iconUrl` changed.
- **Remove:** delete the entry. If the feed was previously committed and users may already be subscribed, that's fine — the curated list is only used to suggest feeds; existing subscriptions are unaffected.

### 5. Verify in the app

Per the repo `AGENTS.md`, UI changes must be verified on both platforms:

- **Android emulator:** open the Discover tab, confirm the new/changed entry renders with its icon and description, and that tapping **Add** subscribes the feed without error.
- **Web (embedded browser):** same checks.

If the icon doesn't render, re-check the `iconUrl` (HTTPS only — mixed-content blocks HTTP icons on web).

## Anti-patterns

- ❌ Adding a feed without running `fetch-feed.js` first ("looks right" is not verification).
- ❌ Using a homepage URL instead of the feed URL.
- ❌ Pointing `iconUrl` at a page (e.g. `https://example.com/`) instead of an image asset.
- ❌ Using an SVG icon — React Native's `Image` component does not render SVG.
- ❌ Using an icon without CORS headers — it will be blocked on the web build.
- ❌ Long, multi-sentence descriptions — they're truncated to 2 lines on the card.
- ❌ Committing entries with `http://` URLs — web blocks mixed content.

## Common Issues

### Sites without a WordPress blavatar

The `secure.gravatar.com/blavatar/` CDN only serves a real icon for sites hosted on WordPress.com. For non-WordPress sites the CDN returns a generic default avatar. The `fetch-icon.js` script probes with `?d=404` to detect this and skips blavatar for non-WordPress sites.

**Fix:** Use the site's GitHub org avatar (`https://avatars.githubusercontent.com/u/{org_id}`) when available — these have CORS `*` and render on both platforms.

### Sites with CORS-blocked favicons

Some sites (e.g., NPR, Ubuntu, Matrix.org) serve all favicon assets from CDNs that do not include CORS headers. The `fetch-icon.js` script will exit with code 1 — no automatic icon discovery will succeed.

**Fix:** Manually find a CORS-safe alternative:
1. Look for a GitHub org avatar: visit `https://github.com/{org}` and copy the org ID from the avatar URL (e.g. `https://avatars.githubusercontent.com/u/8418310`).
2. Pass it directly: `node .agents/skills/curated-feeds/scripts/fetch-icon.js https://avatars.githubusercontent.com/u/{org_id}`

### Steam game feeds

Steam store feeds use the format `https://store.steampowered.com/feeds/news/app/{appid}/`. The Steam favicon has no CORS, but the Steam CDN banner images do.

**Fix:** Use `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg` as the `iconUrl`. The app ID appears in the feed URL itself.

### `og:image` gives a banner, not a square icon

`og:image` is usually a wide landscape banner (e.g. 1200×630). It will appear cropped in the 40×40 icon slot. Only use it as a last resort when no proper favicon is available.

### GitHub avatar URLs have no file extension

GitHub org/user avatar URLs (e.g. `https://avatars.githubusercontent.com/u/12345`) have no file extension, but they return `image/png`. The script handles this correctly for CORS-safe hosts, but you can also append `?size=64` to hint the size.
