# FeedMe — Functional Requirements

This file tracks functional requirements for each screen and feature area. Update this file whenever a new feature is added or existing behavior is intentionally changed.

**Format per entry:**
- `REQ-<SCREEN>-<NNN>`: Short description of observable behavior.
- Tag with `[added]`, `[modified]`, or `[removed]` and a brief note when a requirement changes.

---

## FeedListScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDLIST-001 | The feed list shall display items from all subscribed feeds in a single aggregated list. |
| REQ-FEEDLIST-002 | The user shall be able to switch between "compact" and "card" layout modes. |
| REQ-FEEDLIST-003 | The user shall be able to sort items by newest-first or stacked mode. |
| REQ-FEEDLIST-004 | The user shall be able to filter items to show all, unread only, or saved only. |
| REQ-FEEDLIST-005 | The user shall be able to expand an item inline to view its media/content without navigating away. |
| REQ-FEEDLIST-006 | The user shall be able to save or unsave any item from the list. |
| REQ-FEEDLIST-007 | The user shall be able to mark any item as read or unread from the list. |
| REQ-FEEDLIST-008 | Pull-to-refresh shall trigger a background refresh of all feeds. |
| REQ-FEEDLIST-009 | When viewing a tag-scoped feed list (`selectedTagId`), the list shall show only items from feeds that have that tag, and refresh shall be limited to those feeds. |
| REQ-FEEDLIST-010 | The default "all feeds" view shall exclude items from feeds flagged `show_only_in_tag`; such items appear only in tag-scoped views. |

---

## FeedsScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDS-001 | The feeds screen shall list all subscribed feeds with their icon, title, and URL. |
| REQ-FEEDS-002 | The user shall be able to search/filter feeds by name using a live search bar. |
| REQ-FEEDS-003 | Tapping a feed shall navigate to FeedItemsScreen for that feed. |
| REQ-FEEDS-004 | The user shall be able to access feed detail/edit via long-press or a detail button. |
| REQ-FEEDS-005 | The feeds screen shall provide a navigation entry point to ImportExportScreen. |
| REQ-FEEDS-006 | The feeds screen shall display a list of user-defined tags. Tapping a tag opens the tag-scoped feed view; an edit (pencil) icon opens `TagDetailScreen` for that tag. |
| REQ-FEEDS-007 | The feeds screen shall provide an "Add Tag" entry that opens `TagDetailScreen` in add mode. |

---

## FeedItemsScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDITEMS-001 | The screen shall display all posts for a single feed identified by feedId. |
| REQ-FEEDITEMS-002 | Pull-to-refresh shall re-fetch the RSS feed and update the item list. |
| REQ-FEEDITEMS-003 | The user shall be able to expand items inline to view media and content. |
| REQ-FEEDITEMS-004 | The user shall be able to save/unsave and mark items as read/unread. |
| REQ-FEEDITEMS-005 | The screen title shall display the feed's title. |

---

## FeedItemScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDITEM-001 | The screen shall render the full parsed content and media for a single feed item. |
| REQ-FEEDITEM-002 | Opening a feed item shall automatically mark it as read. |
| REQ-FEEDITEM-003 | The user shall be able to save/unsave the item from this screen. |
| REQ-FEEDITEM-004 | The user shall be able to open the item's link in the browser (using their preferred link-open mode). |
| REQ-FEEDITEM-005 | Reddit posts shall show a dedicated "Comments" link to the Reddit thread. |

---

## FeedDetailScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDDETAIL-001 | The user shall be able to edit a feed's title and URL. |
| REQ-FEEDDETAIL-002 | The user shall be able to toggle proxy usage for the feed. |
| REQ-FEEDDETAIL-003 | The user shall be able to flag a feed as NSFW. |
| REQ-FEEDDETAIL-004 | The Save button shall only be enabled when unsaved changes exist. |
| REQ-FEEDDETAIL-005 | The user shall be able to manually refresh (re-fetch) the feed from this screen. |
| REQ-FEEDDETAIL-006 | The user shall be able to delete the feed with a confirmation step. |
| REQ-FEEDDETAIL-007 | The screen shall display the feed's last-fetched timestamp and any fetch error. |
| REQ-FEEDDETAIL-008 | The user shall be able to assign up to 25 tags to a feed via a multi-select picker, including creating new tags inline. |
| REQ-FEEDDETAIL-009 | The user shall be able to toggle "Show only on tag feeds" so the feed's items are hidden from the default home view and only appear in tag-scoped views. |

---

## AddFeedScreen

| ID | Requirement |
|----|-------------|
| REQ-ADDFEED-001 | The user shall be able to subscribe to a feed by entering a URL. |
| REQ-ADDFEED-002 | The user shall be able to subscribe to a Reddit feed by entering a subreddit name. |
| REQ-ADDFEED-003 | The user shall be able to subscribe to a YouTube channel feed. |
| REQ-ADDFEED-004 | The feed title shall be automatically populated by fetching the feed's XML when the URL field loses focus. |
| REQ-ADDFEED-005 | The app shall prevent adding a duplicate feed URL. |
| REQ-ADDFEED-006 | The app shall validate that the URL field contains a valid URL before saving. |
| REQ-ADDFEED-007 | If a direct fetch fails and a proxy was used as fallback, the user shall be notified. |
| REQ-ADDFEED-008 | The user shall be able to assign up to 25 tags to the new feed via a multi-select picker, including creating new tags inline. |
| REQ-ADDFEED-009 | The user shall be able to toggle "Show only on tag feeds" when adding a feed. |
| REQ-ADDFEED-010 | The user shall be able to subscribe to a GitHub repository's releases feed by entering a repository path (e.g. `owner/repo`) or a full GitHub URL (with or without a `.git` suffix). |

---

## TagDetailScreen

| ID | Requirement |
|----|-------------|
| REQ-TAGDETAIL-001 | The screen shall support add mode (no `tagId`) and edit mode (existing `tagId`). |
| REQ-TAGDETAIL-002 | The user shall be able to set or rename the tag's name with case-insensitive uniqueness. |
| REQ-TAGDETAIL-003 | The user shall be able to associate or disassociate any feed with the tag via a searchable feed list. |
| REQ-TAGDETAIL-004 | In edit mode, the user shall be able to delete the tag with a confirmation step. |
| REQ-TAGDETAIL-005 | Saving shall persist the tag and replace its feed associations atomically before returning to the previous screen. |

---

## SavedScreen

| ID | Requirement |
|----|-------------|
| REQ-SAVED-001 | The screen shall display all items the user has saved, with title, source feed name, and relative timestamp. |
| REQ-SAVED-002 | The user shall be able to unsave an item directly from this screen. |
| REQ-SAVED-003 | Tapping a saved item shall navigate to FeedItemScreen and mark the item as read. |
| REQ-SAVED-004 | The saved list shall reload whenever the screen comes into focus. |

---

## SettingsScreen

| ID | Requirement |
|----|-------------|
| REQ-SETTINGS-001 | The user shall be able to switch between Light, Dark, and System theme. |
| REQ-SETTINGS-002 | The user shall be able to toggle "Mark as read on scroll" behavior. |
| REQ-SETTINGS-003 | The user shall be able to toggle "Hide read items by default". |
| REQ-SETTINGS-004 | The user shall be able to set their default sort mode (Newest / Stacked). |
| REQ-SETTINGS-005 | The user shall be able to set their preferred feed layout (Compact / Card). |
| REQ-SETTINGS-006 | The user shall be able to choose how links are opened (in-app browser vs. external browser). |
| REQ-SETTINGS-007 | All settings shall persist across app restarts. |
| REQ-SETTINGS-008 | The settings screen shall provide navigation to ImportExportScreen. |

---

## ImportExportScreen

| ID | Requirement |
|----|-------------|
| REQ-IMPORTEXPORT-001 | The user shall be able to export all subscribed feeds as an OPML file. |
| REQ-IMPORTEXPORT-002 | On native, the exported OPML file shall be shared via the system share sheet. |
| REQ-IMPORTEXPORT-003 | On web, the exported OPML file shall be downloaded via the browser. |
| REQ-IMPORTEXPORT-004 | The user shall be able to import feeds from an OPML file. |
| REQ-IMPORTEXPORT-005 | The screen shall display a success or error message after import/export operations. |

---

## InAppBrowserScreen

| ID | Requirement |
|----|-------------|
| REQ-BROWSER-001 | On native, the screen shall render an embedded WebView for the given URL. |
| REQ-BROWSER-002 | On web, the screen shall show a fallback UI with the URL since embedding a webview is not supported. |
| REQ-BROWSER-003 | The toolbar shall provide a Close button to return to the previous screen. |
| REQ-BROWSER-004 | The toolbar shall provide an "Open in External Browser" button that opens the URL in the system browser. |

---

## DiscoverScreen

| ID | Requirement |
|----|-------------|
| REQ-DISCOVER-001 | The Discover screen shall be reachable from the bottom tab bar / web sidebar via a Discover tab. |
| REQ-DISCOVER-002 | On small screens (mobile or web < 768 px), the Discover tab shall replace the Saved and Read Later tabs in the bottom tab bar; Saved and Read Later remain reachable from `FeedsScreen` quick-links. |
| REQ-DISCOVER-003 | The Discover screen shall display a curated list of suggested feeds sourced from `app/src/data/curatedFeeds.json`, each with a title, description, and icon. |
| REQ-DISCOVER-004 | The user shall be able to subscribe to any curated feed with a single tap; rows for already-subscribed feeds shall be visibly disabled. |
| REQ-DISCOVER-005 | The Discover screen shall provide an entry point that opens the FeedSearch screen. |

---

## FeedSearchScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDSEARCH-001 | The user shall be able to enter a website URL and search it for RSS or Atom feeds. |
| REQ-FEEDSEARCH-002 | The search shall detect feeds advertised via HTML `<link rel="alternate">` tags and by probing common feed paths (e.g. `/feed`, `/rss.xml`, `/atom.xml`). |
| REQ-FEEDSEARCH-003 | If the input URL is itself an RSS/Atom feed, it shall be returned as a single result. |
| REQ-FEEDSEARCH-004 | Search results shall display each feed's title, URL, and how it was discovered. |
| REQ-FEEDSEARCH-005 | The user shall be able to subscribe to any result with a single tap; duplicate subscriptions shall be reported inline rather than via an error dialog. |
| REQ-FEEDSEARCH-006 | When discovery fails (network error or no feeds found), the screen shall display an inline error/empty-state message. |
