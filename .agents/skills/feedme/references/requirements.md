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

---

## FeedsScreen

| ID | Requirement |
|----|-------------|
| REQ-FEEDS-001 | The feeds screen shall list all subscribed feeds with their icon, title, and URL. |
| REQ-FEEDS-002 | The user shall be able to search/filter feeds by name using a live search bar. |
| REQ-FEEDS-003 | Tapping a feed shall navigate to FeedItemsScreen for that feed. |
| REQ-FEEDS-004 | The user shall be able to access feed detail/edit via long-press or a detail button. |
| REQ-FEEDS-005 | The feeds screen shall provide a navigation entry point to ImportExportScreen. |

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

## DiscoverScreen *(planned)*

| ID | Requirement |
|----|-------------|
| REQ-DISCOVER-001 | *(Placeholder)* The screen shall allow users to discover and subscribe to curated or searched feeds. |
