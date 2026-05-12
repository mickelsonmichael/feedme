import { hasRenderableHtml, sanitizeHtml } from "./sanitizeHtml";

describe("hasRenderableHtml", () => {
  it("returns false for null or plain text", () => {
    expect(hasRenderableHtml(null)).toBe(false);
    expect(hasRenderableHtml("plain text")).toBe(false);
  });

  it("returns true when content contains HTML tags", () => {
    expect(hasRenderableHtml("<p>hello</p>")).toBe(true);
  });
});

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    const html = `<p>Hello</p><script>alert("xss")</script><p>world</p>`;
    expect(sanitizeHtml(html)).toBe("<p>Hello</p><p>world</p>");
  });

  it("removes malformed or unterminated script tags", () => {
    const html = `<p>Hello</p><SCRIPT>alert("xss")`;
    expect(sanitizeHtml(html)).toBe("<p>Hello</p>");
  });

  it("removes event handler attributes and javascript URLs", () => {
    const html =
      `<a href="javascript:alert(1)" onClick="evil()">Click</a>` +
      `<img src="ok.jpg" ONERROR=evil()>`;
    const sanitized = sanitizeHtml(html);
    expect(sanitized).toContain(`<a href="#">Click</a>`);
    expect(sanitized).toContain(`<img src="ok.jpg">`);
    expect(sanitized).not.toContain("onclick=");
    expect(sanitized).not.toContain("onClick=");
    expect(sanitized).not.toContain("ONERROR=");
    expect(sanitized).not.toContain("javascript:");
  });

  it("blocks non-http URL schemes in href and src", () => {
    const html =
      `<a href="data:text/html;base64,abcd">data</a>` +
      `<a href="vbscript:msgbox(1)">vbscript</a>` +
      `<img src="https://example.com/p.png">`;
    const sanitized = sanitizeHtml(html);
    expect(sanitized).toContain(`<a href="#">data</a>`);
    expect(sanitized).toContain(`<a href="#">vbscript</a>`);
    expect(sanitized).toContain(`<img src="https://example.com/p.png">`);
  });
});
