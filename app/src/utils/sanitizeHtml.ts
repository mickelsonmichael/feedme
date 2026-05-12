const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

export function hasRenderableHtml(content: string | null): boolean {
  if (!content) return false;
  return HTML_TAG_RE.test(content);
}

export function sanitizeHtml(content: string): string {
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi,
      ' $1="#"'
    );
}
