---
name: curated-feeds
description: Add, modify or remove a feed in the Discover screen's curated list (app/src/data/curatedFeeds.json). Covers verifying the feed URL, finding a working icon, and the entry format.
---

# Curated Discover feeds

The list lives in `app/src/data/curatedFeeds.json`; array order is display order, grouped by topic where reasonable. Each entry:

```json
{
  "title": "Display name",
  "url": "https://example.com/rss.xml",
  "iconUrl": "https://example.com/favicon.png",
  "description": "One short sentence, about 80 characters."
}
```

## Verify before adding

Never add a feed that fails verification — report it and ask for another URL. Run the helper scripts from `app/` (built-in Node only):

1. **Feed URL:** `node ../.claude/skills/curated-feeds/scripts/fetch-feed.js <url>` must print `OK`. For a homepage, try `/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/index.xml`.
2. **Icon:** `node ../.claude/skills/curated-feeds/scripts/fetch-icon.js <site-url>` prints `BEST ICON URL:`. CORS only mattered for the deprecated web build, so pass `--skip-cors` when an otherwise good icon is rejected for it.

## Rules

- HTTPS only for both URLs; cleartext HTTP is blocked on Android.
- No SVG icons — React Native's `Image` can't render them. Try `<site>/apple-touch-icon.png` instead.
- `iconUrl` must point at an image, not a page. `og:image` banners crop badly in the 40×40 slot; last resort only.
- Disambiguate multiple feeds from one site with an em-dash suffix: `Smithsonian — Photos`.
- Descriptions are one plain sentence; longer text is truncated to two lines.

## Icon fallbacks

- **GitHub org avatar** (`https://avatars.githubusercontent.com/u/<org-id>`, optionally `?size=64`) for sites whose favicons are blocked or missing.
- **Steam game feeds** (`store.steampowered.com/feeds/news/app/<appid>/`): use `https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg`.
- The WordPress blavatar CDN only has real icons for WordPress.com sites; `fetch-icon.js` detects the generic default and skips it.

## Check in the app

Open the Discover tab on the emulator: the entry renders with its icon and description, and **Add** subscribes without error.
