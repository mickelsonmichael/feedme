/**
 * Pretty-prints an XML string by adding indentation and line breaks.
 * Works on both React Native (no DOM) and web.
 */
export function prettyXml(xml: string): string {
  // Normalise line endings and remove existing indentation/blank lines
  const flat = xml.replace(/\r\n?/g, "\n").replace(/>\s+</g, "><").trim();

  let result = "";
  let depth = 0;
  const indent = "  ";

  // Simple token-by-token scan
  let i = 0;
  while (i < flat.length) {
    if (flat[i] !== "<") {
      // Text content between tags
      const end = flat.indexOf("<", i);
      const text = (end === -1 ? flat.slice(i) : flat.slice(i, end)).trim();
      if (text) {
        result += indent.repeat(depth) + text + "\n";
      }
      i = end === -1 ? flat.length : end;
      continue;
    }

    // Find the closing >
    const close = flat.indexOf(">", i);
    if (close === -1) {
      result += flat.slice(i);
      break;
    }

    const tag = flat.slice(i, close + 1);
    i = close + 1;

    if (tag.startsWith("<?") || tag.startsWith("<!")) {
      // XML declaration / DOCTYPE / comment
      result += indent.repeat(depth) + tag + "\n";
    } else if (tag.startsWith("</")) {
      // Closing tag
      depth = Math.max(0, depth - 1);
      result += indent.repeat(depth) + tag + "\n";
    } else if (tag.endsWith("/>")) {
      // Self-closing tag
      result += indent.repeat(depth) + tag + "\n";
    } else {
      // Opening tag
      result += indent.repeat(depth) + tag + "\n";
      depth += 1;
    }
  }

  return result.trimEnd();
}
