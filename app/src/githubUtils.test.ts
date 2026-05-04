import { buildGitHubReleaseFeedUrl, getGitHubRepo } from "./githubUtils";

describe("getGitHubRepo", () => {
  it("parses a plain owner/repo path", () => {
    // Arrange
    const raw = "mickelsonmichael/feedme";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("parses a GitHub URL", () => {
    // Arrange
    const raw = "https://github.com/mickelsonmichael/feedme";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("parses a GitHub URL with a .git suffix", () => {
    // Arrange
    const raw = "https://github.com/mickelsonmichael/feedme.git";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("parses a GitHub URL with a trailing slash", () => {
    // Arrange
    const raw = "https://github.com/mickelsonmichael/feedme/";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("parses a plain owner/repo path with a .git suffix", () => {
    // Arrange
    const raw = "mickelsonmichael/feedme.git";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("trims surrounding whitespace", () => {
    // Arrange
    const raw = "  mickelsonmichael/feedme  ";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("parses an http:// GitHub URL", () => {
    // Arrange
    const raw = "http://github.com/mickelsonmichael/feedme";

    // Act
    const result = getGitHubRepo(raw);

    // Assert
    expect(result).toEqual({ owner: "mickelsonmichael", repo: "feedme" });
  });

  it("returns null for an empty string", () => {
    // Arrange & Act
    const result = getGitHubRepo("");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a string with no slash", () => {
    // Arrange & Act
    const result = getGitHubRepo("justarepo");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for a non-GitHub URL", () => {
    // Arrange & Act
    const result = getGitHubRepo("https://gitlab.com/owner/repo");

    // Assert
    expect(result).toBeNull();
  });
});

describe("buildGitHubReleaseFeedUrl", () => {
  it("builds the correct releases.atom URL from a plain owner/repo path", () => {
    // Arrange
    const raw = "mickelsonmichael/feedme";

    // Act
    const result = buildGitHubReleaseFeedUrl(raw);

    // Assert
    expect(result).toBe(
      "https://github.com/mickelsonmichael/feedme/releases.atom"
    );
  });

  it("builds the correct URL from a full GitHub URL", () => {
    // Arrange
    const raw = "https://github.com/mickelsonmichael/feedme";

    // Act
    const result = buildGitHubReleaseFeedUrl(raw);

    // Assert
    expect(result).toBe(
      "https://github.com/mickelsonmichael/feedme/releases.atom"
    );
  });

  it("builds the correct URL from a GitHub URL with .git suffix", () => {
    // Arrange
    const raw = "https://github.com/mickelsonmichael/feedme.git";

    // Act
    const result = buildGitHubReleaseFeedUrl(raw);

    // Assert
    expect(result).toBe(
      "https://github.com/mickelsonmichael/feedme/releases.atom"
    );
  });

  it("returns null for an invalid input", () => {
    // Arrange & Act
    const result = buildGitHubReleaseFeedUrl("notavalidrepo");

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    // Arrange & Act
    const result = buildGitHubReleaseFeedUrl("");

    // Assert
    expect(result).toBeNull();
  });
});
