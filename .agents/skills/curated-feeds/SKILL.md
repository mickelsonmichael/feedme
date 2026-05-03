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

## Workflow

Follow every step. Do **not** add a feed that fails any verification step — report the failure to the user and ask for a different URL.

### 1. Verify the feed URL returns RSS or Atom

Use PowerShell `Invoke-WebRequest` to fetch the feed. Confirm:

- HTTP status is `200`.
- Body starts with `<?xml`, `<rss`, `<feed`, or contains `<channel>`.
- `Content-Type` includes `xml`, `rss`, or `atom`.

```powershell
$r = Invoke-WebRequest -UseBasicParsing -Uri "<feed-url>"
$r.StatusCode
$r.Headers["Content-Type"]
$r.Content.Substring(0, [Math]::Min(300, $r.Content.Length))
```

If the candidate URL is a website (not a feed), use the in-app `discoverFeeds` logic conceptually — try `<link rel="alternate">` in the HTML and the common paths `/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/index.xml`.

### 2. Pick a stable title and description

- **Title:** prefer the human-readable site/feed name. If the site has multiple feeds (e.g. Smithsonian articles vs photos), disambiguate with an em-dash suffix: `Smithsonian — Photos`.
- **Description:** one short sentence describing what the feed publishes. No emojis, no marketing language, no trailing period if one isn't natural.

### 3. Retrieve and verify the icon URL

Prefer, in order:

1. The `<link rel="icon">` / `<link rel="shortcut icon">` URL from the site's HTML.
2. `https://<host>/favicon.ico`.
3. A site-specific known good asset (e.g. WordPress sites often expose `/wp-content/.../favicon-32x32.png`).

Verify the icon URL returns `200` with an image content-type:

```powershell
$r = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "<icon-url>"
$r.StatusCode
$r.Headers["Content-Type"]
```

If the favicon is a tracking pixel, missing, or a generic browser default, fall back to the next option. Do not commit a 404 icon — `DiscoverScreen` will show a fallback RSS glyph, but a stale 404 wastes a network request.

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

- ❌ Adding a feed without fetching it first ("looks right" is not verification).
- ❌ Using a homepage URL instead of the feed URL.
- ❌ Pointing `iconUrl` at a page (e.g. `https://example.com/`) instead of an image asset.
- ❌ Long, multi-sentence descriptions — they're truncated to 2 lines on the card.
- ❌ Committing entries with `http://` URLs — web blocks mixed content.
