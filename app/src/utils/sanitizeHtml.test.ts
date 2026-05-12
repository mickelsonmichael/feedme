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

  it("removes event handler attributes and javascript URLs", () => {
    const html =
      `<a href="javascript:alert(1)" onclick="evil()">Click</a>` +
      `<img src="ok.jpg" onerror="evil()">`;
    const sanitized = sanitizeHtml(html);
    expect(sanitized).toContain(`<a href="#">Click</a>`);
    expect(sanitized).toContain(`<img src="ok.jpg">`);
    expect(sanitized).not.toContain("onclick=");
    expect(sanitized).not.toContain("onerror=");
    expect(sanitized).not.toContain("javascript:");
  });
});
