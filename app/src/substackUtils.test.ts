import { buildSubstackFeedUrl, getSubstackName } from "./substackUtils";

describe("getSubstackName", () => {
  it("returns a plain name as-is", () => {
    // Arrange
    const raw = "natesilver";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("strips the leading @ from an @-prefixed name", () => {
    // Arrange
    const raw = "@natesilver";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("extracts the name from a substack.com profile URL", () => {
    // Arrange
    const raw = "https://substack.com/@natesilver";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("extracts the name from a substack.com profile URL with www", () => {
    // Arrange
    const raw = "https://www.substack.com/@natesilver";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("extracts the name from a publication subdomain URL", () => {
    // Arrange
    const raw = "https://natesilver.substack.com";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("extracts the name from a publication feed URL", () => {
    // Arrange
    const raw = "https://natesilver.substack.com/feed";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("extracts the name from an http:// subdomain URL", () => {
    // Arrange
    const raw = "http://natesilver.substack.com";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("trims surrounding whitespace", () => {
    // Arrange
    const raw = "  natesilver  ";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("trims whitespace from an @-prefixed name", () => {
    // Arrange
    const raw = "  @natesilver  ";

    // Act
    const result = getSubstackName(raw);

    // Assert
    expect(result).toBe("natesilver");
  });

  it("returns null for an empty string", () => {
    // Arrange & Act
    const result = getSubstackName("");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a bare @ with no name", () => {
    // Arrange & Act
    const result = getSubstackName("@");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a non-substack URL", () => {
    // Arrange & Act
    const result = getSubstackName("https://example.com/@user");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a name with spaces", () => {
    // Arrange & Act
    const result = getSubstackName("nate silver");

    // Assert
    expect(result).toBeNull();
  });
});

describe("buildSubstackFeedUrl", () => {
  it("builds the correct feed URL from a plain name", () => {
    // Arrange
    const raw = "natesilver";

    // Act
    const result = buildSubstackFeedUrl(raw);

    // Assert
    expect(result).toBe("https://natesilver.substack.com/feed");
  });

  it("builds the correct feed URL from an @-prefixed name", () => {
    // Arrange
    const raw = "@natesilver";

    // Act
    const result = buildSubstackFeedUrl(raw);

    // Assert
    expect(result).toBe("https://natesilver.substack.com/feed");
  });

  it("builds the correct feed URL from a substack.com profile URL", () => {
    // Arrange
    const raw = "https://substack.com/@natesilver";

    // Act
    const result = buildSubstackFeedUrl(raw);

    // Assert
    expect(result).toBe("https://natesilver.substack.com/feed");
  });

  it("builds the correct feed URL from a publication subdomain URL", () => {
    // Arrange
    const raw = "https://natesilver.substack.com";

    // Act
    const result = buildSubstackFeedUrl(raw);

    // Assert
    expect(result).toBe("https://natesilver.substack.com/feed");
  });

  it("returns null for an empty string", () => {
    // Arrange & Act
    const result = buildSubstackFeedUrl("");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for an invalid input", () => {
    // Arrange & Act
    const result = buildSubstackFeedUrl("https://example.com");

    // Assert
    expect(result).toBeNull();
  });
});
