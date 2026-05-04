# FeedMe — Screens Reference

This file describes every screen in the app. Update this file whenever a new screen is added or a screen's primary purpose/features change.

---

## Navigation Structure

### Bottom Tab Navigator

The set of bottom tabs depends on screen size:

- **Small screens (mobile / narrow web < 768 px):** Feed, Feeds, Discover, Settings. `Saved` and `ReadLater` are accessible from the `FeedsScreen` quick-links instead of from the tab bar.
- **Wide web (≥ 768 px):** the bottom tab bar is replaced by the left web sidebar, which lists Feed, Saved, Read Later, Manage Feeds, Discover, and Settings.

| Tab | Screen |
|-----|--------|
| Feed | `FeedListScreen` |
| Saved | `SavedScreen` *(wide web only)* |
| ReadLater | `ReadLaterScreen` *(wide web only)* |
| Feeds | `FeedsScreen` |
| Discover | `DiscoverScreen` |
| Settings | `SettingsScreen` |
| AddFeed | `AddFeedScreen` *(hidden route)* |
| FeedSearch | `FeedSearchScreen` *(hidden route)* |

### Root Stack Navigator (modal/push over tabs)
| Route | Screen |
|-------|--------|
| `FeedItems` | `FeedItemsScreen` |
| `FeedItemView` | `FeedItemScreen` |
| `FeedDetail` | `FeedDetailScreen` |
| `TagDetail` | `TagDetailScreen` |
| `ImportExport` | `ImportExportScreen` |
| `InAppBrowser` | `InAppBrowserScreen` |

---

## Screens

### FeedListScreen
**File:** `app/src/screens/FeedListScreen.tsx`  
**Tab:** Feed  
**Purpose:** The main home feed. Aggregates all items from every subscribed feed into a single chronological list. This is the primary reading experience.

**Primary features:**
- `FlashList`-based virtualized item list with pull-to-refresh
- Layout modes: compact (text + small thumbnail) vs. card (large image)
- Sort modes: newest-first, stacked
- Filter modes: show all / unread only / saved
- Per-item inline expand (shows media/content inline) or tap-to-open full item
- Save/unsave and mark-read/unread per item
- Background feed refresh with progress tracking
- Header sort/filter controls injected via `HeaderContentContext`
- Responsive desktop-web layout at ≥ 760 px
- Tag-scoped view: when navigated with `selectedTagId`, the list shows only items from feeds tagged with that tag, refresh is scoped to those feeds, and the scope row shows the tag name with a tag icon. The default "all feeds" view excludes feeds flagged `show_only_in_tag`.

---

### FeedsScreen
**File:** `app/src/screens/FeedsScreen.tsx`  
**Tab:** Feeds  
**Purpose:** Subscription manager — lists all added feeds with fuzzy search.

**Primary features:**
- `FlatList` of feeds with icon, title, and URL
- Live fuzzy-match search bar (substring matching)
- Tap a feed → navigates to `FeedItemsScreen` for that feed
- Long-press or detail button → navigates to `FeedDetailScreen` to edit
- Link to `ImportExportScreen`
- Tags section listing all user-defined tags with feed counts. Tapping a tag navigates to the Feed view scoped to that tag; an edit (pencil) icon opens `TagDetailScreen` for that tag. A "+" button opens `TagDetailScreen` in add mode.

---

### FeedItemsScreen
**File:** `app/src/screens/FeedItemsScreen.tsx`  
**Route:** `FeedItems` (stack)  
**Purpose:** Shows all posts for a single feed, loaded by `feedId`.

**Primary features:**
- `FlashList` of `FeedPostCard` items, pull-to-refresh (re-fetches the RSS feed live)
- Inline expand of items (images, video, Reddit gallery support)
- Save/unsave and read/unread toggling per item
- Modal overlay showing raw XML for a selected item (debug view)
- Header title set to the feed's title

---

### FeedItemScreen
**File:** `app/src/screens/FeedItemScreen.tsx`  
**Route:** `FeedItemView` (stack)  
**Purpose:** Full detail view for a single feed item/post.

**Primary features:**
- Renders parsed content text and extracted links
- `ExpandedFeedMedia` component for images, GIFs, video
- Reddit-specific: surfaces a dedicated "Comments" link for Reddit posts
- Save/unsave button, read/unread toggle (auto-marks read on open)
- "Open in browser" action using user's preferred link-open mode
- Header title set to the feed's name

---

### FeedDetailScreen
**File:** `app/src/screens/FeedDetailScreen.tsx`  
**Route:** `FeedDetail` (stack)  
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

### AddFeedScreen
**File:** `app/src/screens/AddFeedScreen.tsx`  
**Tab:** AddFeed  
**Purpose:** Subscribe to a new feed by URL, subreddit name, YouTube channel, or GitHub repository releases.

**Primary features:**
- Four source modes (2-column chip grid): URL, Reddit, YouTube, GitHub
- Auto-fetches and pre-fills feed title from the feed's XML on URL blur
- Toggle switches: Use proxy, NSFW, Show only on tag feeds
- Multi-select tag picker (max 25 tags per feed) with inline create-new
- Validates URL format and duplicate detection before saving
- Proxy-use alert shown if direct request was blocked and proxy was used as fallback
- Responsive desktop-web layout

---

### TagDetailScreen
**File:** `app/src/screens/TagDetailScreen.tsx`  
**Route:** `TagDetail` (stack)  
**Purpose:** Add or edit a user-defined tag and its associated feeds.

**Primary features:**
- Add mode (no `tagId`): name input + searchable feed list with checkbox toggles
- Edit mode (with `tagId`): pre-populates name and currently-tagged feeds
- Save creates/updates the tag (case-insensitive uniqueness) and replaces feed associations
- Delete button (edit mode only) with confirm dialog (`Alert` on native, `window.confirm` on web)
- Returns to either `FeedsScreen` or the main `Feed` based on the `from` route param

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
- Reading: "Mark as read on scroll" toggle, "Hide read items by default" toggle
- Default sort: Newest / Stacked (segmented)
- Feed layout: Compact / Card (segmented, with visual icon previews)
- Link open mode: Embedded (in-app browser) / External browser
- Navigation link to ImportExportScreen

---

### ImportExportScreen
**File:** `app/src/screens/ImportExportScreen.tsx`  
**Route:** `ImportExport` (stack)  
**Purpose:** Bulk migrate subscriptions via OPML files.

**Primary features:**
- Export: generates an OPML file from all current feeds; on native uses share sheet, on web triggers browser download
- Import: file picker for `.opml` files, parses and bulk-adds feeds
- Status message area shows success/error inline
- Graceful fallback for web vs. native file handling

---

### InAppBrowserScreen
**File:** `app/src/screens/InAppBrowserScreen.tsx`  
**Route:** `InAppBrowser` (stack)  
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
**Route:** `FeedSearch` (hidden tab route)  
**Purpose:** Find RSS/Atom feeds for an arbitrary website URL.

**Primary features:**
- URL input + Search button. Auto-runs the search if `initialUrl` was passed via params.
- Uses `discoverFeeds` (HTML `<link rel="alternate">` parsing + common-path probing, with proxy fallback) to find feeds.
- Displays each result with title, URL, and how it was discovered (direct URL, page link, or guessed path).
- Each result has an Add button that subscribes the feed and reflects "Added ✓" / "Already added" state.
- Inline error message when discovery fails or no feeds are found.
