import { toBionic } from "./bionicReading";

describe("toBionic", () => {
  it("returns an empty array for an empty string", () => {
    expect(toBionic("")).toEqual([]);
  });

  it("bolds the first half (ceil) of a simple word", () => {
    // "Hello" → 5 chars → ceil(5/2)=3 → bold="Hel", rest="lo"
    const tokens = toBionic("Hello");
    expect(tokens).toEqual([{ kind: "word", bold: "Hel", rest: "lo" }]);
  });

  it("bolds the first character of a 1-character word", () => {
    // "I" → 1 char → ceil(1/2)=1 → bold="I", rest=""
    const tokens = toBionic("I");
    expect(tokens).toEqual([{ kind: "word", bold: "I", rest: "" }]);
  });

  it("handles a two-word phrase with whitespace token between", () => {
    const tokens = toBionic("Hello world");
    expect(tokens).toEqual([
      { kind: "word", bold: "Hel", rest: "lo" },
      { kind: "space", text: " " },
      { kind: "word", bold: "wor", rest: "ld" },
    ]);
  });

  it("does not bold trailing punctuation — comma", () => {
    // "reading," → body="reading"(7), punct=",", ceil(7/2)=4 → bold="read", rest="ing,"
    const tokens = toBionic("reading,");
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.kind).toBe("word");
    if (token.kind === "word") {
      expect(token.bold).toBe("read");
      expect(token.rest).toBe("ing,");
    }
  });

  it("does not bold trailing punctuation — period", () => {
    // "end." → body="end"(3), punct=".", ceil(3/2)=2 → bold="en", rest="d."
    const tokens = toBionic("end.");
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.kind).toBe("word");
    if (token.kind === "word") {
      expect(token.bold).toBe("en");
      expect(token.rest).toBe("d.");
    }
  });

  it("does not bold a trailing exclamation mark", () => {
    const tokens = toBionic("great!");
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.kind).toBe("word");
    if (token.kind === "word") {
      expect(token.rest).toMatch(/!$/);
      expect(token.bold).not.toMatch(/!/);
    }
  });

  it("handles a word that is entirely punctuation", () => {
    // "..." → no alphanumeric → bold="", rest="..."
    const tokens = toBionic("...");
    expect(tokens).toEqual([{ kind: "word", bold: "", rest: "..." }]);
  });

  it("preserves internal apostrophes in the body (e.g. contractions)", () => {
    // "don't" → last alphanumeric is 't' (index 4), body="don't", punct=""
    // ceil(5/2)=3 → bold="don", rest="'t"
    const tokens = toBionic("don't");
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.kind).toBe("word");
    if (token.kind === "word") {
      expect(token.bold + token.rest).toBe("don't");
      expect(token.bold).toBe("don");
    }
  });

  it("handles hyphenated words", () => {
    // "well-being" → last alphanumeric 'g', body="well-being"(10), ceil(10/2)=5
    // bold="well-", rest="being"
    const tokens = toBionic("well-being");
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    expect(token.kind).toBe("word");
    if (token.kind === "word") {
      expect(token.bold + token.rest).toBe("well-being");
    }
  });

  it("emits space tokens for multi-space whitespace runs", () => {
    const tokens = toBionic("a  b");
    expect(tokens).toEqual([
      { kind: "word", bold: "a", rest: "" },
      { kind: "space", text: "  " },
      { kind: "word", bold: "b", rest: "" },
    ]);
  });

  it("handles newlines as space tokens", () => {
    const tokens = toBionic("line1\nline2");
    expect(tokens[1]).toEqual({ kind: "space", text: "\n" });
  });

  it("reconstructing the tokens preserves the original text", () => {
    const original = "Bionic reading is great for speed!";
    const tokens = toBionic(original);
    const reconstructed = tokens
      .map((t) => (t.kind === "space" ? t.text : t.bold + t.rest))
      .join("");
    expect(reconstructed).toBe(original);
  });

  it("bold + rest always reconstructs the original word token", () => {
    const words = ["Hello", "world!", "don't", "well-being", "reading,", "I"];
    for (const word of words) {
      const tokens = toBionic(word);
      expect(tokens).toHaveLength(1);
      const token = tokens[0];
      if (token.kind === "word") {
        expect(token.bold + token.rest).toBe(word);
      }
    }
  });
});
