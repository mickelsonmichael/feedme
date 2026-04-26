export type ContentActionLink = {
  label: "Link" | "Comments";
  url: string;
};

export function parseContentAndLinks(html: string | null): {
  text: string;
  links: ContentActionLink[];
} {
  if (!html) return { text: "", links: [] };

  const normalizedHtml = decodeHtmlEntities(html);
  const links: ContentActionLink[] = [];

  const withoutActionAnchors = normalizedHtml.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (fullMatch, href: string, innerHtml: string) => {
      const label = toActionLabel(stripHtml(innerHtml));
      if (!label) return fullMatch;

      const url = href.trim();
      if (!url) return " ";

      if (!links.some((existing) => existing.url === url)) {
        links.push({ label, url });
      }

      return " ";
    }
  );

  return { text: stripHtml(withoutActionAnchors), links };
}

function toActionLabel(value: string): ContentActionLink["label"] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "[link]" || normalized === "link") return "Link";
  if (normalized === "[comments]" || normalized === "comments") {
    return "Comments";
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  const decodeCodePoint = (rawCodePoint: string, radix: 10 | 16): string => {
    const parsed = Number.parseInt(rawCodePoint, radix);
    if (Number.isNaN(parsed)) return "";

    try {
      return String.fromCodePoint(parsed);
    } catch {
      return "";
    }
  };

  const decodeOnePass = (input: string): string =>
    input
      .replace(/&#(\d+);/g, (match, codePoint) => {
        const decoded = decodeCodePoint(codePoint, 10);
        return decoded || match;
      })
      .replace(/&#x([0-9a-f]+);/gi, (match, codePoint) => {
        const decoded = decodeCodePoint(codePoint, 16);
        return decoded || match;
      })
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

  let decoded = value;
  for (let i = 0; i < 5; i += 1) {
    const next = decodeOnePass(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }

  return decoded;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
