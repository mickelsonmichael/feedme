# FeedMe — Screens Reference

This file describes every screen in the app. Update this file whenever a new screen is added or a screen's primary purpose/features change.

> **The web build is deprecated.** Web-only screens, layouts, and behaviours noted below (the wide-web sidebar, desktop layouts, browser fallbacks) are kept for history and are no longer verified.

---

## Navigation Structure

`App.tsx` renders a **root native stack**. Its first route, `Tabs`, holds the bottom tab navigator; every other screen is pushed onto the stack above it. A pushed screen slides in with the platform transition, covers the tab bar, and is unmounted when popped. Back returns to whatever opened it — screens use `goBackOr` / `toTab` from `app/src/navigation.ts`, falling back to a tab only when there is nothing to pop (e.g. opened from a notification).

### Bottom tabs (`Tabs` route)

The tabs shown depend on screen size:

- **Small screens (mobile / narrow web < 768 px):** Feed, Feeds, Discover, Settings. `Saved` and `ReadLater` are tabs with hidden buttons, reached from the `FeedsScreen` quick-links.
- **Wide web (≥ 768 px):** the bottom tab bar is replaced by the left web sidebar, which lists Feed, Saved, Read Later, Manage Feeds, Discover, and Settings.

| Tab       | Screen                                        |
| --------- | --------------------------------------------- |
| Feed      | `FeedListScreen`                              |
| Saved     | `SavedScreen` _(button only on wide web)_     |
| ReadLater | `ReadLaterScreen` _(button only on wide web)_ |
| Feeds     | `FeedsScreen`                                 |
| Discover  | `DiscoverScreen`                              |
| Settings  | `SettingsScreen`                              |

The background-sync status pill floats above the tab bar on every tab (it is rendered in the tab navigator's layout, not by a screen).

### Root stack (pushed over the tabs)

| Route              | Screen                   |
| ------------------ | ------------------------ |
| `FeedItemView`     | `FeedItemScreen`         |
| `FeedDetail`       | `FeedDetailScreen`       |
| `FeedError`        | `FeedErrorScreen`        |
| `FeedSearch`       | `FeedSearchScreen`       |
| `AddFeed`          | `AddFeedScreen`          |
| `TagDetail`        | `TagDetailScreen`        |
| `CustomFeedEdit`   | `CustomFeedEditScreen`   |
| `CustomFeedManage` | `CustomFeedManageScreen` |
| `ImportExport`     | `ImportExportScreen`     |
| `InAppBrowser`     | `InAppBrowserScreen`     |

Notification settings are a section inside `FeedDetailScreen` / `TagDetailScreen` (`NotificationSettingsSection`), not a route of their own.

---

## Screens

### FeedListScreen

**File:** `app/src/screens/FeedListScreen.tsx`  
**Tab:** Feed  
**Purpose:** The main home feed. Aggregates all items from every subscribed feed into a single chronological list. This is the primary reading experience.

**Primary features:**

- `FlashList`-based virtualized item list with pull-to-refresh
- Layout modes: compact (text + small thumbnail), card (large image), or single (one full post at a time with previous/next navigation)
- Sort modes: newest-first, stacked
- Filter modes: show all / unread only / saved
- Per-item inline expand (shows media/content inline) or tap-to-open full item
- Save/unsave and mark-read/unread per item
- Background feed refresh with progress tracking
- Header sort/filter controls injected via `HeaderContentContext`
- Responsive desktop-web layout at ≥ 760 px
- Single layout renders the full post content/media using the same article presentation as `FeedItemScreen`, including existing NSFW media handling
- Tag-scoped view: when navigated with `selectedTagId`, the list shows only items from feeds tagged with that tag, refresh is scoped to those feeds, and the scope row shows the tag name with a tag icon. The default "all feeds" view excludes feeds flagged `show_only_in_tag`.

---

### FeedsScreen

**File:** `app/src/screens/FeedsScreen.tsx`  
**Tab:** Feeds  
**Purpose:** Subscription manager — lists all added feeds with fuzzy search.

**Primary features:**

- `FlatList` of feeds with icon, title, and URL
- Live fuzzy-match search bar (substring matching)
- Tap a feed → navigates to the Feed view scoped to that feed (`selectedFeedId`)
- Long-press or detail button → navigates to `FeedDetailScreen` to edit
- Link to `ImportExportScreen`
- Tags section listing all user-defined tags with feed counts. Tapping a tag navigates to the Feed view scoped to that tag; an edit (pencil) icon opens `TagDetailScreen` for that tag. A "+" button opens `TagDetailScreen` in add mode.

---

### FeedItemScreen

**File:** `app/src/screens/FeedItemScreen.tsx`  
**Route:** `FeedItemView` (root stack)  
**Purpose:** Full detail view for a single feed item/post.

**Primary features:**

- Renders parsed content text and extracted links
- Renders HTML summaries/content as rich formatted content with sanitization safeguards
- `ExpandedFeedMedia` component for images, GIFs, video
- Reddit-specific: surfaces a dedicated "Comments" link for Reddit posts
- Save/unsave button, read/unread toggle (auto-marks read on open)
- "Open in browser" action using user's preferred link-open mode
- Header title set to the feed's name
- Bionic reading: when enabled in Settings, boldes the leading characters of each word in the article body

---

### FeedDetailScreen

**File:** `app/src/screens/FeedDetailScreen.tsx`  
**Route:** `FeedDetail` (root stack)  
**Purpose:** Edit an existing feed's metadata and settings.

**Primary features:**

- Editable fields: title, URL
- Toggle switches: Use proxy, NSFW flag, Show only on tag feeds (hides items from the default home view; they only appear under a selected tag)
- Multi-select tag picker (max 25 tags per feed) with inline create-new
- Refresh now button — re-fetches the feed and upserts new items
- Delete feed button with confirmation alert
- Dirty-state detection; Save button only enabled when changes exist
- Shows last-fetched timestamp and any feed error

---

### FeedErrorScreen

**File:** `app/src/screens/FeedErrorScreen.tsx`  
**Route:** `FeedError` (root stack)  
**Purpose:** Displays the full raw error message for the most recent fetch failure of a feed.

**Primary features:**

- Selectable monospace text showing the complete error string
- Copy button that copies the error to the clipboard
- Close button to return to FeedDetailScreen

---

### AddFeedScreen

**File:** `app/src/screens/AddFeedScreen.tsx`  
**Route:** `AddFeed` (root stack)  
**Purpose:** Subscribe to a new feed by URL, Reddit subreddit/user, YouTube channel, GitHub repository releases, or Substack publication.

**Primary features:**

- Five source modes (2-column chip grid): URL, Reddit, YouTube, GitHub, Substack
- Auto-fetches and pre-fills feed title from the feed's XML on URL blur
- Toggle switches: Use proxy, NSFW, Show only on tag feeds
- Multi-select tag picker (max 25 tags per feed) with inline create-new
- Validates URL format and duplicate detection before saving
- Proxy-use alert shown if direct request was blocked and proxy was used as fallback
- Responsive desktop-web layout

---

### TagDetailScreen

**File:** `app/src/screens/TagDetailScreen.tsx`  
**Route:** `TagDetail` (root stack)  
**Purpose:** Add or edit a user-defined tag and its associated feeds.

**Primary features:**

- Add mode (no `tagId`): name input + searchable feed list with checkbox toggles
- Edit mode (with `tagId`): pre-populates name and currently-tagged feeds
- Save creates/updates the tag (case-insensitive uniqueness) and replaces feed associations
- Delete button (edit mode only) with confirm dialog (`Alert` on native, `window.confirm` on web)
- Returns to either `FeedsScreen` or the main `Feed` based on the `from` route param
- Edit mode includes a link to `NotificationSettingsScreen` for per-tag notifications

---

### NotificationSettingsScreen

**File:** `app/src/screens/NotificationSettingsScreen.tsx`  
**Route:** `NotificationSettings` (stack)  
**Purpose:** Configure push notifications for one feed or one tag.

**Primary features:**

- Feed mode: toggle "Notify on new items"
- Feed mode: frequency selector (Immediate / Daily digest / Off)
- Tag mode: toggle "Notify when tagged feeds have new items"
- Requests notification permission when enabling notifications
- Initializes per-feed last-seen checkpoint when enabling feed notifications

---

### SavedScreen

**File:** `app/src/screens/SavedScreen.tsx`  
**Tab:** Saved  
**Purpose:** Bookmarks — shows all posts the user has explicitly saved.

**Primary features:**

- `FlatList` of saved posts with title, source feed name, and relative timestamp
- Unsave action per item (removes from saved list immediately)
- Tap → navigates to `FeedItemScreen` (marks the item as already-read)
- Reloads on focus via `useFocusEffect`

---

### SettingsScreen

**File:** `app/src/screens/SettingsScreen.tsx`  
**Tab:** Settings  
**Purpose:** App-wide preferences, all persisted to storage.

**Primary features:**

- Appearance: Light / Dark / System theme (segmented control)
- Reading: "Mark as read on scroll" toggle, "Hide read items by default" toggle, "Bionic Reading" toggle
- Default sort: Newest / Stacked (segmented)
- Group Feeds: None / Hourly / Daily / Weekly / Monthly (segmented, full-width); only applies to Newest sort
- Feed layout: Compact / Card / Single (segmented, with visual icon previews)
- Link open mode: Embedded (in-app browser) / External browser
- Navigation link to ImportExportScreen

---

### ImportExportScreen

**File:** `app/src/screens/ImportExportScreen.tsx`  
**Route:** `ImportExport` (root stack)  
**Purpose:** Bulk migrate subscriptions via OPML files.

**Primary features:**

- Export: generates an OPML file from all current feeds; on native uses share sheet, on web triggers browser download
- Import: file picker for `.opml` files, parses and bulk-adds feeds
- Status message area shows success/error inline
- Graceful fallback for web vs. native file handling

---

### InAppBrowserScreen

**File:** `app/src/screens/InAppBrowserScreen.tsx`  
**Route:** `InAppBrowser` (root stack)  
**Purpose:** Embedded web browser for opening article links without leaving the app.

**Primary features:**

- Native: renders `react-native-webview` `WebView` with a toolbar
- Web: fallback UI (can't embed webview in webview) with URL displayed
- Toolbar: Close (go back) and Open in External Browser buttons
- Header title set dynamically from the link's title param

---

### DiscoverScreen

**File:** `app/src/screens/DiscoverScreen.tsx`  
**Tab:** Discover  
**Purpose:** Find new feeds to subscribe to.

**Primary features:**

- Entry point that opens `FeedSearchScreen` for searching a website's RSS feeds.
- Curated list of suggested feeds loaded from `app/src/data/curatedFeeds.json` (title, URL, icon, description).
- Each curated row has an Add button that subscribes the feed; rows for already-subscribed feeds show "Added ✓" and are disabled.
- Re-checks subscribed state on focus.

---

### FeedSearchScreen

**File:** `app/src/screens/FeedSearchScreen.tsx`  
**Route:** `FeedSearch` (root stack)  
**Purpose:** Find RSS/Atom feeds for an arbitrary website URL.

**Primary features:**

- URL input + Search button. Auto-runs the search if `initialUrl` was passed via params.
- Uses `discoverFeeds` (HTML `<link rel="alternate">` parsing + common-path probing, with proxy fallback) to find feeds.
- Displays each result with title, URL, and how it was discovered (direct URL, page link, or guessed path).
- Each result has an Add button that subscribes the feed and reflects "Added ✓" / "Already added" state.
- Inline error message when discovery fails or no feeds are found.
