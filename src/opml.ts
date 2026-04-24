/**
 * Utilities for parsing and generating OPML (Outline Processor Markup Language)
 * files used to share RSS/Atom feed subscription lists.
 */

import { Feed } from "./types";

type OpmlFeed = Pick<Feed, "title" | "url"> & { description?: string | null };

const OPML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>feedme subscriptions</title>
  </head>
  <body>
`;
const OPML_FOOTER = `  </body>
</opml>`;

/**
 * Generate an OPML XML string from an array of feed objects.
 */
export function generateOpml(feeds: OpmlFeed[]): string {
  const outlines = feeds
    .map((feed) => {
      const title = escapeXml(feed.title);
      const url = escapeXml(feed.url);
      const desc = feed.description
        ? ` description="${escapeXml(feed.description)}"`
        : "";
      return `    <outline type="rss" title="${title}" xmlUrl="${url}"${desc}/>`;
    })
    .join("\n");
  return OPML_HEADER + outlines + "\n" + OPML_FOOTER;
}

/**
 * Parse an OPML XML string and return an array of feed objects.
 */
export function parseOpml(opmlText: string): OpmlFeed[] {
  const feeds: OpmlFeed[] = [];

  // Extract all <outline> elements that have an xmlUrl attribute
  const outlineRegex = /<outline\s+([^>]*?)(?:\s*\/>|\s*>)/gi;
  let match;
  while ((match = outlineRegex.exec(opmlText)) !== null) {
    const attrs = match[1];
    const xmlUrl = extractAttr(attrs, "xmlUrl");
    if (!xmlUrl) continue;

    const title =
      extractAttr(attrs, "title") ?? extractAttr(attrs, "text") ?? xmlUrl;
    const description = extractAttr(attrs, "description") ?? null;

    feeds.push({ title, url: xmlUrl, description });
  }

  return feeds;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractAttr(attrsString: string, name: string): string | undefined {
  // Escape the attribute name before using it in a RegExp
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match both single and double quoted attribute values
  const re = new RegExp(`${escaped}=["']([^"']*)["']`, "i");
  const m = attrsString.match(re);
  return m ? unescapeXml(m[1]) : undefined;
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(str: string): string {
  return String(str)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // must be last to avoid double-unescaping
}
