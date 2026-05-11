export type BionicToken =
  | { kind: "space"; text: string }
  | { kind: "word"; bold: string; rest: string };

/**
 * Splits a single whitespace-free token into its bold prefix and normal suffix.
 *
 * Trailing punctuation (characters that are not a–z, A–Z, or 0–9) is excluded
 * from the bold anchor so that e.g. "reading," boldes only the letters.
 * Leading characters are also kept outside the bold portion when the token
 * begins with punctuation (e.g. a leading quote like `"Hello`).
 *
 * The heuristic: bold the first Math.ceil(n / 2) characters of the
 * alphabetic/numeric body, where n = body length.
 */
function splitWord(word: string): { bold: string; rest: string } {
  // Match everything up-to-and-including the last alphanumeric character,
  // then capture any trailing non-alphanumeric suffix.
  const match = word.match(/^([\s\S]*?[a-zA-Z0-9])([^a-zA-Z0-9]*)$/);
  if (!match) {
    // Entire token is punctuation / symbols — nothing to bold.
    return { bold: "", rest: word };
  }

  const body = match[1]; // up to and including last alphanumeric
  const punct = match[2]; // trailing punctuation / symbols

  const boldLength = Math.ceil(body.length / 2);
  return {
    bold: body.slice(0, boldLength),
    rest: body.slice(boldLength) + punct,
  };
}

/**
 * Converts a plain-text string into an array of BionicTokens.
 *
 * Whitespace runs are emitted as-is (`kind: "space"`).
 * Non-whitespace tokens have their leading characters wrapped in bold
 * (`kind: "word"` with `bold` and `rest` fields).
 */
export function toBionic(text: string): BionicToken[] {
  if (!text) return [];

  // Split on whitespace runs, keeping the separators.
  const parts = text.split(/(\s+)/);
  const tokens: BionicToken[] = [];

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      tokens.push({ kind: "space", text: part });
    } else {
      tokens.push({ kind: "word", ...splitWord(part) });
    }
  }

  return tokens;
}
