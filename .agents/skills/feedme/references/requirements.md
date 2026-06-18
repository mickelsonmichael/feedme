# FeedMe — Functional Requirements

This file tracks functional requirements for each screen and feature area. Update this file whenever a new feature is added or existing behavior is intentionally changed.

**Format per entry:**

- `REQ-<SCREEN>-<NNN>`: Short description of observable behavior.
- Tag with `[added]`, `[modified]`, or `[removed]` and a brief note when a requirement changes.

---

## Shared Components

| ID            | Requirement                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-MEDIA-001 | [added] Tapping an expanded image (rendered by `ExpandedFeedImage`) shall open a fullscreen modal displaying the image at full viewport size with a dark backdrop. The modal shall include a close button (×) in the top-right corner. Tapping the close button or the backdrop shall dismiss the modal. On web, pressing Escape shall also dismiss the modal. NSFW-blurred images retain their blur in fullscreen. |
| REQ-MEDIA-002 | [added] Tapping an image in a Reddit gallery (rendered by `ExpandedFeedMedia`) shall open the same fullscreen modal for that individual gallery image.                                                                                                                                   |

---

## FeedListScreen

| ID               | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDLIST-001 | The feed list shall display items from all subscribed feeds in a single aggregated list. Feed items whose `published_at` timestamp is in the future shall have their timestamp capped to the current time at parse time (before storage); the sort algorithm applies the same cap defensively for any items already stored with a future timestamp.                                                                                                                                                                                                 |
| REQ-FEEDLIST-002 | The user shall be able to switch between "compact" and "card" layout modes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-FEEDLIST-003 | The user shall be able to sort items by newest-first or stacked mode. In stacked mode, feed ordering within the same rank level shall be randomised once per data load so that no single feed consistently appears first across refreshes, but the order shall remain stable within a session (e.g. marking an item read must not reshuffle the list). Feed items whose published timestamp is in the future shall be treated as if they were published at the current time so that they do not receive outsized weight in ranking or tie-breaking. |
| REQ-FEEDLIST-004 | The user shall be able to filter items to show all, unread only, or saved only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-FEEDLIST-005 | The user shall be able to expand an item inline to view its media/content without navigating away.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-FEEDLIST-006 | The user shall be able to save or unsave any item from the list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-FEEDLIST-007 | The user shall be able to mark any item as read or unread from the list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-FEEDLIST-008 | Pull-to-refresh shall trigger a background refresh of all feeds and scroll the list to the top once the new items are rendered.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-FEEDLIST-009 | When viewing a tag-scoped feed list (`selectedTagId`), the list shall show only items from feeds that have that tag, and refresh shall be limited to those feeds.                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-FEEDLIST-010 | The default "all feeds" view shall exclude items from feeds flagged `show_only_in_tag`; such items appear only in tag-scoped views.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-FEEDLIST-011 | In card layout, items from NSFW feeds shall show a "Reveal images" overlay instead of unblurred media (images or GIFs); tapping the overlay reveals the media. For GIF posts, tapping reveal also auto-loads the GIF. Reddit galleries use a separate deferred-load mechanism and are excluded from this overlay.                                                                                                                                                                                                                                   |
| REQ-FEEDLIST-012 | Opening an item's original link via the external-link button shall mark the item as read if it is not already read.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-FEEDLIST-013 | Pressing the Feed tab button while already on the Feed screen shall scroll to the top (and reset any active scope). Pressing it while on any other screen shall navigate to the Feed screen at the same scroll position the user left it at.                                                                                                                                                                                                                                                                                                        |
| REQ-FEEDLIST-014 | When the **Group Feeds** setting is set to a value other than None (Hourly / Daily / Weekly / Monthly) and the active sort is **Newest**, the feed list shall display labeled time-bucket dividers between posts. A divider is shown only if at least one post belongs to that bucket. The setting has no effect when any sort other than Newest is active.                                                                                                                                                                                         |
| REQ-FEEDLIST-015 | In compact layout, when a post with an image is expanded inline, the thumbnail shall be hidden so the image is only displayed once (in the expanded media panel). Additionally, any `<img>` tags present in the HTML content shall be stripped before rendering, so the image embedded in the feed HTML (e.g. the Reddit thumbnail before "submitted by") is not shown again alongside the image rendered by ExpandedFeedMedia.                                                                                                                     |
| REQ-FEEDLIST-016 | [added] The feed list shall support a "single" layout that displays one post at a time using the same full article/media presentation as FeedItemScreen.                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-FEEDLIST-017 | [modified] In single layout, Previous and Next controls shall move through posts in the currently selected sort order without leaving the FeedListScreen. The top control panel shall show the main post actions (open, save, read-later, read/unread) inline with Previous/Next, and both top and bottom navigation panels shall render only Previous/Next controls without progress or helper text.                                                                                                                                               |
| REQ-FEEDLIST-018 | [modified] In single layout, posts from NSFW feeds shall be hidden behind a "Reveal NSFW" toggle button (with a chevron-down icon) at the top of the content area. Below the button, an empty state placeholder (eye-off icon) is shown instead of the post content. Tapping the button reveals the post content below and changes the icon to chevron-up; tapping again hides it. The reveal state resets each time the user navigates to a different post. |
| REQ-FEEDLIST-019 | [added] In single layout, a manual refresh shall reload the feed, scroll back to the top of the article, and select the first unread post in the refreshed result when one exists; otherwise it shall select the first post.                                                                                                                      |
| REQ-FEEDLIST-020 | [added] In single layout, the app shall record how long the user views each post. A view session starts when a post is displayed and ends when the user presses Next. Sessions that are interrupted (e.g. app force-quit) are discarded on the next startup. Pressing Previous or navigating away without pressing Next does not record a session. |
| REQ-FEEDLIST-021 | [added] For Reddit posts with a detectable author, the "..." overflow menu in single layout shall include a "Follow User" / "Unfollow User" option using the same add/remove feed logic. In compact and card layouts, a follow/unfollow icon button (user-plus / user-minus) appears in the action row for such posts. |
| REQ-FEEDLIST-022 | [added] In single layout, a "sliders" button in the left side of the toolbar shall toggle a collapsible filter/sort/search bar below the toolbar. The bar contains a filter menu (All/Unread), a sort menu, and a search text field. The sliders icon shall be shown in the accent color when the bar is open or a search query is active. |

---

## FeedsScreen

| ID            | Requirement                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDS-001 | The feeds screen shall list all subscribed feeds with their icon, title, and URL.                                                                                     |
| REQ-FEEDS-002 | The user shall be able to search/filter feeds by name using a live search bar.                                                                                        |
| REQ-FEEDS-003 | Tapping a feed shall navigate to FeedItemsScreen for that feed.                                                                                                       |
| REQ-FEEDS-004 | The user shall be able to access feed detail/edit via long-press or a detail button.                                                                                  |
| REQ-FEEDS-005 | The feeds screen shall provide a navigation entry point to ImportExportScreen.                                                                                        |
| REQ-FEEDS-006 | The feeds screen shall display a list of user-defined tags. Tapping a tag opens the tag-scoped feed view; an edit (pencil) icon opens `TagDetailScreen` for that tag. |
| REQ-FEEDS-007 | The feeds screen shall provide an "Add Tag" entry that opens `TagDetailScreen` in add mode.                                                                           |

---

## FeedItemsScreen

| ID                | Requirement                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDITEMS-001 | The screen shall display all posts for a single feed identified by feedId.                                                         |
| REQ-FEEDITEMS-002 | Pull-to-refresh shall re-fetch the RSS feed, update the item list, and scroll the list to the top once the new items are rendered. |
| REQ-FEEDITEMS-003 | The user shall be able to expand items inline to view media and content.                                                           |
| REQ-FEEDITEMS-004 | The user shall be able to save/unsave and mark items as read/unread.                                                               |
| REQ-FEEDITEMS-005 | The screen title shall display the feed's title.                                                                                   |
| REQ-FEEDITEMS-006 | Opening an item's original link via the external-link button shall mark the item as read if it is not already read.                |
| REQ-FEEDITEMS-007 | [added] For Reddit posts with a detectable author, the action row shall show a follow/unfollow icon button. Tapping it when not following auto-adds the author's Reddit user feed (`https://www.reddit.com/user/USERNAME.rss`). Tapping it when already following removes that feed. The button icon and color reflect the current follow state. |

---

## FeedItemScreen

| ID               | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDITEM-001 | [modified] The screen shall render the full parsed content and media for a single feed item. When item content contains HTML markup, the article body shall render the sanitized HTML content (including formatting links/images) and strip unsafe markup such as `<script>` tags, inline event handler attributes, and `javascript:` URLs. For RSS items that include both `<description>` and `<content:encoded>`, the rendered content shall use `<content:encoded>` as the source body. In native rendering, HTML text/background colors shall follow the app theme and the content card shall grow to fit rendered HTML so the parent screen scrolls instead of a nested HTML viewport. |
| REQ-FEEDITEM-002 | Opening a feed item shall automatically mark it as read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-FEEDITEM-003 | The user shall be able to save/unsave the item from this screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-FEEDITEM-004 | The user shall be able to open the item's link in the browser (using their preferred link-open mode).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| REQ-FEEDITEM-005 | Reddit posts shall show a dedicated "Comments" link to the Reddit thread.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-FEEDITEM-006 | When the "Bionic Reading" setting is enabled, the article body shall render each word with its leading characters (Math.ceil(n/2)) in bold and the remainder in normal weight. Trailing punctuation (non-alphanumeric characters at the end of a token) shall not be bolded.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-FEEDITEM-007 | The screen shall display a "View XML" button that navigates to the RawXmlScreen showing the pretty-printed raw XML for the item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-FEEDITEM-008 | [added] For Reddit posts with a detectable author, the "..." overflow menu shall include a "Follow User" option. Tapping it auto-adds the author's Reddit user feed. If the author feed already exists, the option shows "Unfollow User" and removes the feed when tapped. |

---

## FeedDetailScreen

| ID                 | Requirement                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDDETAIL-001 | The user shall be able to edit a feed's title and URL.                                                                                                   |
| REQ-FEEDDETAIL-002 | The user shall be able to toggle proxy usage for the feed.                                                                                               |
| REQ-FEEDDETAIL-003 | The user shall be able to flag a feed as NSFW.                                                                                                           |
| REQ-FEEDDETAIL-004 | The Save button shall only be enabled when unsaved changes exist.                                                                                        |
| REQ-FEEDDETAIL-005 | The user shall be able to manually refresh (re-fetch) the feed via a Refresh button placed in the header alongside the Save and Delete buttons. While refreshing, the button shows a spinner. [modified: moved refresh to header icon/action button; previously a separate in-page button] |
| REQ-FEEDDETAIL-006 | The user shall be able to delete the feed with a confirmation step.                                                                                      |
| REQ-FEEDDETAIL-007 | The screen shall display the feed's last-fetched timestamp and any fetch error. When an error exists, tapping the error box shall navigate to FeedErrorScreen showing the full error message. |
| REQ-FEEDDETAIL-008 | The user shall be able to assign up to 25 tags to a feed via a multi-select picker, including creating new tags inline.                                  |
| REQ-FEEDDETAIL-009 | The user shall be able to toggle "Show only on tag feeds" so the feed's items are hidden from the default home view and only appear in tag-scoped views. |
| REQ-FEEDDETAIL-010 | The user shall be able to open per-feed notification settings from FeedDetailScreen.                                                                     |
| REQ-FEEDDETAIL-011 | The statistics section shall display the average time users spent viewing posts from this feed before pressing Next in single-layout mode (avg read time). When no completed sessions are recorded yet, the row shall be hidden. When the average is less than 5 seconds, a "Frequently Skipped" badge shall be shown on the statistics row. |

---

## FeedErrorScreen

| ID                | Requirement                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDERROR-001 | The screen shall display the full raw error message in a selectable, monospace text view.                                          |
| REQ-FEEDERROR-002 | The user shall be able to copy the error text to the clipboard via a Copy button.                                                  |
| REQ-FEEDERROR-003 | The user shall be able to return to FeedDetailScreen via a Close button.                                                           |

| ID              | Requirement                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-ADDFEED-001 | The user shall be able to subscribe to a feed by entering a URL.                                                                                                                                                                             |
| REQ-ADDFEED-002 | [modified] The user shall be able to subscribe to a Reddit feed by entering either a subreddit or a user (`u/<name>`, `user/<name>`, or full Reddit profile URL). If no user prefix is provided, input is treated as a subreddit.            |
| REQ-ADDFEED-003 | The user shall be able to subscribe to a YouTube channel feed.                                                                                                                                                                               |
| REQ-ADDFEED-004 | The feed title shall be automatically populated by fetching the feed's XML when the URL field loses focus.                                                                                                                                   |
| REQ-ADDFEED-005 | The app shall prevent adding a duplicate feed URL.                                                                                                                                                                                           |
| REQ-ADDFEED-006 | The app shall validate that the URL field contains a valid URL before saving.                                                                                                                                                                |
| REQ-ADDFEED-007 | If a direct fetch fails and a proxy was used as fallback, the user shall be notified.                                                                                                                                                        |
| REQ-ADDFEED-008 | The user shall be able to assign up to 25 tags to the new feed via a multi-select picker, including creating new tags inline.                                                                                                                |
| REQ-ADDFEED-009 | The user shall be able to toggle "Show only on tag feeds" when adding a feed.                                                                                                                                                                |
| REQ-ADDFEED-010 | The user shall be able to subscribe to a GitHub repository's releases feed by entering a repository path (e.g. `owner/repo`) or a full GitHub URL (with or without a `.git` suffix).                                                         |
| REQ-ADDFEED-011 | The user shall be able to subscribe to a Substack publication's feed by entering the publication name (e.g. `natesilver` or `@natesilver`) or a Substack URL (e.g. `https://substack.com/@natesilver` or `https://natesilver.substack.com`). |

---

## TagDetailScreen

| ID                | Requirement                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| REQ-TAGDETAIL-001 | The screen shall support add mode (no `tagId`) and edit mode (existing `tagId`).                                   |
| REQ-TAGDETAIL-002 | The user shall be able to set or rename the tag's name with case-insensitive uniqueness.                           |
| REQ-TAGDETAIL-003 | The user shall be able to associate or disassociate any feed with the tag via a searchable feed list.              |
| REQ-TAGDETAIL-004 | In edit mode, the user shall be able to delete the tag with a confirmation step.                                   |
| REQ-TAGDETAIL-005 | Saving shall persist the tag and replace its feed associations atomically before returning to the previous screen. |
| REQ-TAGDETAIL-006 | In edit mode, the user shall be able to open per-tag notification settings from TagDetailScreen.                   |

---

## SavedScreen

| ID            | Requirement                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| REQ-SAVED-001 | The screen shall display all items the user has saved, with title, source feed name, and relative timestamp. |
| REQ-SAVED-002 | The user shall be able to unsave an item directly from this screen.                                          |
| REQ-SAVED-003 | Tapping a saved item shall navigate to FeedItemScreen and mark the item as read.                             |
| REQ-SAVED-004 | The saved list shall reload whenever the screen comes into focus.                                            |

---

## SettingsScreen

| ID               | Requirement                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-SETTINGS-001 | The user shall be able to switch between Light, Dark, and System theme.                                                                                                                                                                                                                                                                            |
| REQ-SETTINGS-002 | The user shall be able to toggle "Mark as read on scroll" behavior.                                                                                                                                                                                                                                                                                |
| REQ-SETTINGS-003 | The user shall be able to toggle "Hide read items by default".                                                                                                                                                                                                                                                                                     |
| REQ-SETTINGS-004 | The user shall be able to set their default sort mode (Newest / Stacked).                                                                                                                                                                                                                                                                          |
| REQ-SETTINGS-005 | [modified] The user shall be able to set their preferred feed layout (Compact / Card / Single).                                                                                                                                                                                                                                                    |
| REQ-SETTINGS-006 | The user shall be able to choose how links are opened (in-app browser vs. external browser).                                                                                                                                                                                                                                                       |
| REQ-SETTINGS-007 | All settings shall persist across app restarts.                                                                                                                                                                                                                                                                                                    |
| REQ-SETTINGS-008 | The settings screen shall provide navigation to ImportExportScreen.                                                                                                                                                                                                                                                                                |
| REQ-SETTINGS-009 | The user shall be able to toggle "Bionic Reading" in the Reading section. When enabled, the leading characters of each word in the article body (FeedItemScreen) shall be displayed in bold.                                                                                                                                                       |
| REQ-SETTINGS-010 | The user shall be able to choose a **Group Feeds** interval (None / Hourly / Daily / Weekly / Monthly). When set to a non-None value and Newest sort is active, time-bucket dividers are injected into the FeedListScreen feed list. The setting note shall indicate it only applies to Newest sort. All values shall persist across app restarts. |

---

## NotificationSettingsScreen

| ID             | Requirement                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| REQ-NOTIFY-001 | The screen shall support feed mode (`feedId`) and tag mode (`tagId`).                                     |
| REQ-NOTIFY-002 | In feed mode, the user shall be able to toggle "Notify on new items" (default off).                       |
| REQ-NOTIFY-003 | In feed mode, the user shall be able to set notification frequency to Immediate, Daily digest, or Off.    |
| REQ-NOTIFY-004 | In tag mode, the user shall be able to toggle notifications for any feed linked to the tag (default off). |
| REQ-NOTIFY-005 | Enabling notifications shall request OS notification permission if not already granted.                   |

---

## ImportExportScreen

| ID                   | Requirement                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| REQ-IMPORTEXPORT-001 | The user shall be able to export all subscribed feeds as an OPML file.              |
| REQ-IMPORTEXPORT-002 | On native, the exported OPML file shall be shared via the system share sheet.       |
| REQ-IMPORTEXPORT-003 | On web, the exported OPML file shall be downloaded via the browser.                 |
| REQ-IMPORTEXPORT-004 | The user shall be able to import feeds from an OPML file.                           |
| REQ-IMPORTEXPORT-005 | The screen shall display a success or error message after import/export operations. |

## RawXmlScreen

| ID             | Requirement                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-RAWXML-001 | The screen shall display the raw XML for a feed item, formatted with proper indentation.                                                        |
| REQ-RAWXML-002 | The user shall be able to copy the formatted XML to the clipboard using a Copy button. The button shall briefly indicate success after copying. |
| REQ-RAWXML-003 | When no raw XML is available for the item, the screen shall display an empty-state message.                                                     |
| REQ-RAWXML-004 | The screen shall support horizontal scrolling for wide XML content.                                                                             |

---

## InAppBrowserScreen

| ID              | Requirement                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| REQ-BROWSER-001 | On native, the screen shall render an embedded WebView for the given URL.                                                         |
| REQ-BROWSER-002 | On web, the screen shall show a fallback UI with the URL since embedding a webview is not supported.                              |
| REQ-BROWSER-003 | The toolbar shall provide a Close button to return to the previous screen.                                                        |
| REQ-BROWSER-004 | The toolbar shall provide an "Open in External Browser" button that opens the URL in the system browser.                          |
| REQ-BROWSER-005 | On Android, the embedded browser (Chrome Custom Tab) shall not appear as a separate app entry in the task switcher or app drawer. |

---

## DiscoverScreen

| ID               | Requirement                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-DISCOVER-001 | The Discover screen shall be reachable from the bottom tab bar / web sidebar via a Discover tab.                                                                                                     |
| REQ-DISCOVER-002 | On small screens (mobile or web < 768 px), the Discover tab shall replace the Saved and Read Later tabs in the bottom tab bar; Saved and Read Later remain reachable from `FeedsScreen` quick-links. |
| REQ-DISCOVER-003 | The Discover screen shall display a curated list of suggested feeds sourced from `app/src/data/curatedFeeds.json`, each with a title, description, and icon.                                         |
| REQ-DISCOVER-004 | The user shall be able to subscribe to any curated feed with a single tap; rows for already-subscribed feeds shall be visibly disabled.                                                              |
| REQ-DISCOVER-005 | The Discover screen shall provide an entry point that opens the FeedSearch screen.                                                                                                                   |

---

## FeedSearchScreen

| ID                 | Requirement                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-FEEDSEARCH-001 | The user shall be able to enter a website URL and search it for RSS or Atom feeds.                                                                        |
| REQ-FEEDSEARCH-002 | The search shall detect feeds advertised via HTML `<link rel="alternate">` tags and by probing common feed paths (e.g. `/feed`, `/rss.xml`, `/atom.xml`). |
| REQ-FEEDSEARCH-003 | If the input URL is itself an RSS/Atom feed, it shall be returned as a single result.                                                                     |
| REQ-FEEDSEARCH-004 | Search results shall display each feed's title, URL, and how it was discovered.                                                                           |
| REQ-FEEDSEARCH-005 | The user shall be able to subscribe to any result with a single tap; duplicate subscriptions shall be reported inline rather than via an error dialog.    |
| REQ-FEEDSEARCH-006 | When discovery fails (network error or no feeds found), the screen shall display an inline error/empty-state message.                                     |
