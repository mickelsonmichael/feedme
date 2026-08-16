import { normalizeArticleHtml, prepareArticleHtml } from "./articleHtml";

describe("normalizeArticleHtml", () => {
  it("returns an empty string for empty input", () => {
    // Arrange / Act
    const result = normalizeArticleHtml("");

    // Assert
    expect(result).toBe("");
  });

  it("splits a paragraph at a run of two or more <br>", () => {
    // Arrange — the lazy way feeds write a paragraph break
    const html = "<p>One<br><br>Two<br /><br /><br />Three</p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>One</p><p>Two</p><p>Three</p>");
  });

  it("preserves the paragraph's attributes on every fragment it creates", () => {
    // Arrange
    const html = '<p class="body">One<br><br>Two</p>';

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe('<p class="body">One</p><p class="body">Two</p>');
  });

  it("keeps a single <br> as an in-paragraph line break", () => {
    // Arrange — changelog bullets use single <br>s deliberately
    const html = "<p>- first<br />- second</p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>- first<br />- second</p>");
  });

  it("removes spacer paragraphs that hold only whitespace or nbsp", () => {
    // Arrange
    const html =
      '<p style="font-weight: bold;">&nbsp;</p><p>Real</p><p>  </p><p><br></p>';

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>Real</p>");
  });

  it("removes a wrapper left empty by removing its inner spacer", () => {
    // Arrange — <img> stripping upstream routinely leaves shells like this
    const html = "<div><p>&nbsp;</p></div><p>Real</p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>Real</p>");
  });

  it("drops the empty paragraph left by a trailing <br> run", () => {
    // Arrange
    const html = "<p>Body<br><br></p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>Body</p>");
  });

  it("trims <br>s pressed against a paragraph's edges", () => {
    // Arrange — these only ever add a stray blank line before the real gap
    const html = "<p><br>Body<br></p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe("<p>Body</p>");
  });

  it("leaves a <br> run that is not inside a paragraph alone", () => {
    // Arrange — there is no paragraph to split, and synthesising one risks
    // wrapping block content in a <p>
    const html = "<div>One<br><br>Two</div>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe(html);
  });

  it("does not disturb content that already uses only <p> boundaries", () => {
    // Arrange
    const html = "<p>One</p><p>Two</p>";

    // Act
    const result = normalizeArticleHtml(html);

    // Assert
    expect(result).toBe(html);
  });
});

describe("prepareArticleHtml", () => {
  it("returns an empty string for null content", () => {
    // Arrange / Act
    const result = prepareArticleHtml(null, false);

    // Assert
    expect(result).toBe("");
  });

  it("strips images and the empty shells they leave, then normalizes", () => {
    // Arrange — the image is rendered above the article by ExpandedFeedMedia
    const html =
      '<div class="wrap"><a href="https://example.com/post">' +
      '<img src="https://example.com/hero.png"></a></div>' +
      "<p>&nbsp;</p><p>Body<br><br>More</p>";

    // Act
    const result = prepareArticleHtml(html, false);

    // Assert
    expect(result).toBe("<p>Body</p><p>More</p>");
  });

  it("removes scripts from the content", () => {
    // Arrange
    const html = "<p>Safe</p><script>alert(1)</script>";

    // Act
    const result = prepareArticleHtml(html, false);

    // Assert
    expect(result).toBe("<p>Safe</p>");
  });

  it("applies bionic weighting when enabled", () => {
    // Arrange
    const html = "<p>reading</p>";

    // Act
    const result = prepareArticleHtml(html, true);

    // Assert
    expect(result).toBe("<p><b>read</b>ing</p>");
  });
});
