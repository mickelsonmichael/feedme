import { applyBionicToHtml } from "./bionicReading";
import { sanitizeHtml } from "./sanitizeHtml";

/** A `<p …>` and everything up to its closing tag. */
const PARAGRAPH_RE = /(<p\b[^>]*>)([\s\S]*?)<\/p\s*>/gi;
/** Two or more consecutive `<br>`s, plus any whitespace around them. */
const BR_RUN_RE = /(?:\s*<br\s*\/?>\s*){2,}/gi;
/** A `<p>`/`<div>` holding nothing but whitespace, `<br>`s, or nbsp. */
const EMPTY_BLOCK_RE =
  /<(p|div)\b[^>]*>(?:\s|&nbsp;|&#160;|&#xa0;|<br\s*\/?>)*<\/\1\s*>/gi;
/** `<br>`s pressed up against the inside of a paragraph's opening tag. */
const LEADING_BR_RE = /(<p\b[^>]*>)(?:\s*<br\s*\/?>)+\s*/gi;
/** `<br>`s pressed up against the inside of a paragraph's closing tag. */
const TRAILING_BR_RE = /(?:\s*<br\s*\/?>)+\s*(<\/p\s*>)/gi;

/**
 * Rewrites a feed's paragraph markup so every paragraph break is expressed the
 * same way — as a `<p>` boundary — and can therefore be given one consistent
 * gap by the renderer.
 *
 * Feeds separate paragraphs in three different ways, and left alone they
 * produce three different-sized gaps in the same article:
 *
 * - `<p>` boundaries — the gap the renderer styles.
 * - Runs of `<br>` — a lazy paragraph break that renders as a bare newline,
 *   noticeably tighter than a real paragraph gap.
 * - Spacer elements (`<p>&nbsp;</p>`, `<p><br></p>`) — an arbitrary extra gap
 *   stacked on top of the paragraph gap that follows it.
 *
 * A single `<br>` is left alone: it is a deliberate line break inside a
 * paragraph (changelog bullets, address blocks) and is not a paragraph break.
 */
export function normalizeArticleHtml(html: string): string {
  if (!html) return "";

  // Split paragraphs at <br> runs first, so the fragments become real
  // paragraphs before the empty-block pass runs — a trailing run like
  // "text<br><br>" turns into an empty <p> that the next step removes.
  //
  // Runs that sit outside a <p> are deliberately left as-is: there is no
  // paragraph to split there, and synthesising one risks wrapping block-level
  // content in a <p>, which browsers silently unnest.
  let result = html.replace(
    PARAGRAPH_RE,
    (_match, openTag: string, inner: string) =>
      `${openTag}${inner.replace(BR_RUN_RE, `</p>${openTag}`)}</p>`
  );

  // Looped because removing an inner spacer can leave its wrapper empty in
  // turn (`<div><p>&nbsp;</p></div>`).
  let previous = "";
  while (previous !== result) {
    previous = result;
    result = result.replace(EMPTY_BLOCK_RE, "");
  }

  return result
    .replace(LEADING_BR_RE, "$1")
    .replace(TRAILING_BR_RE, "$1")
    .trim();
}

/**
 * Turns a feed item's raw content into the HTML the reader renders: sanitized,
 * stripped of media already shown above the text, normalized into consistent
 * paragraphs, and optionally bionic-weighted.
 */
export function prepareArticleHtml(
  content: string | null,
  bionicReading: boolean
): string {
  // Strip <img> tags — images are displayed via ExpandedFeedMedia above the
  // content panel, so rendering them again inside the HTML would show the
  // same image twice (e.g. the Reddit thumbnail before "submitted by").
  // Also clean up empty <a> and <td> elements left behind after img removal
  // to prevent layout gaps (e.g. an empty table cell from the image column).
  const stripped = sanitizeHtml(content ?? "")
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<td\b[^>]*>\s*<\/td>/gi, "");

  const html = normalizeArticleHtml(stripped);
  return bionicReading ? applyBionicToHtml(html) : html;
}
