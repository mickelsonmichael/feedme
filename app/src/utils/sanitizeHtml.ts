const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const TAG_TOKEN_RE = /<\/?([a-z0-9:-]+)([^>]*)>/gi;

export function hasRenderableHtml(content: string | null): boolean {
  if (!content) return false;
  return HTML_TAG_RE.test(content);
}

export function sanitizeHtml(content: string): string {
  let result = "";
  let lastIndex = 0;
  let scriptDepth = 0;

  for (const match of content.matchAll(TAG_TOKEN_RE)) {
    const fullTag = match[0];
    const start = match.index ?? 0;
    const tagName = (match[1] ?? "").toLowerCase();
    const isClosing = fullTag.startsWith("</");

    if (scriptDepth === 0) {
      result += content.slice(lastIndex, start);
    }

    if (tagName === "script") {
      if (isClosing) {
        scriptDepth = Math.max(0, scriptDepth - 1);
      } else {
        scriptDepth += 1;
      }
      lastIndex = start + fullTag.length;
      continue;
    }

    if (scriptDepth === 0) {
      result += sanitizeTag(fullTag);
    }
    lastIndex = start + fullTag.length;
  }

  if (scriptDepth === 0) {
    result += content.slice(lastIndex);
  }

  return result;
}

function sanitizeTag(tag: string): string {
  if (!tag.startsWith("<") || tag.startsWith("</") || tag.startsWith("<!")) {
    return tag;
  }

  const tagNameMatch = tag.match(/^<\s*([a-z0-9:-]+)/i);
  if (!tagNameMatch) return "";

  const tagName = tagNameMatch[1];
  const attrs = tag.match(
    /([^\s=\/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  );
  if (!attrs) return `<${tagName}>`;

  const keep: string[] = [];
  for (const rawAttr of attrs.slice(1)) {
    const eqIndex = rawAttr.indexOf("=");
    const attrName = (eqIndex === -1 ? rawAttr : rawAttr.slice(0, eqIndex))
      .trim()
      .toLowerCase();

    if (!attrName || attrName.startsWith("on")) continue;

    if (eqIndex === -1) {
      keep.push(attrName);
      continue;
    }

    const rawValue = rawAttr.slice(eqIndex + 1).trim();
    const unquoted =
      rawValue.startsWith('"') || rawValue.startsWith("'")
        ? rawValue.slice(1, -1)
        : rawValue;

    if ((attrName === "href" || attrName === "src") && !isSafeUrl(unquoted)) {
      keep.push(`${attrName}="#"`);
      continue;
    }

    keep.push(`${attrName}="${escapeHtmlAttribute(unquoted)}"`);
  }

  const close = tag.endsWith("/>") ? " /" : "";
  const attrsPart = keep.length ? ` ${keep.join(" ")}` : "";
  return `<${tagName}${attrsPart}${close}>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeUrl(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/[\u0000-\u001f\u007f\s]+/g, "")
    .toLowerCase();

  if (!normalized) return false;
  if (
    normalized.startsWith("#") ||
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../")
  ) {
    return true;
  }

  if (normalized.startsWith("//")) return true;

  const schemeIndex = normalized.indexOf(":");
  if (schemeIndex === -1) return true;

  const scheme = normalized.slice(0, schemeIndex);
  return (
    scheme === "http" ||
    scheme === "https" ||
    scheme === "mailto" ||
    scheme === "tel"
  );
}
