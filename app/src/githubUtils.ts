/**
 * Extracts the owner and repository name from a raw user-supplied value.
 * Accepts any of:
 *   - A plain owner/repo path:             "mickelsonmichael/feedme"
 *   - A GitHub URL:                        "https://github.com/mickelsonmichael/feedme"
 *   - A GitHub URL with .git suffix:       "https://github.com/mickelsonmichael/feedme.git"
 *   - A GitHub URL with trailing slash:    "https://github.com/mickelsonmichael/feedme/"
 * Whitespace is trimmed automatically.
 *
 * Returns { owner, repo } or null if the input cannot be parsed.
 *
 * Example: getGitHubRepo("https://github.com/mickelsonmichael/feedme.git")
 *       → { owner: "mickelsonmichael", repo: "feedme" }
 */
export function getGitHubRepo(
  rawValue: string
): { owner: string; repo: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Match full GitHub URL patterns (with or without .git suffix / trailing slash)
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/?#\s]+)\/([^/?#\s]+?)(?:\.git)?\/?$/i
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Match plain owner/repo path (optionally ending in .git)
  const pathMatch = trimmed.match(/^([^/?#\s]+)\/([^/?#\s]+?)(?:\.git)?$/);
  if (pathMatch) {
    return { owner: pathMatch[1], repo: pathMatch[2] };
  }

  return null;
}

/**
 * Constructs the GitHub Releases Atom feed URL from a raw user-supplied value.
 * Accepts the same input formats as getGitHubRepo.
 *
 * Returns the feed URL string, or null if the input cannot be parsed.
 *
 * Example: buildGitHubReleaseFeedUrl("mickelsonmichael/feedme")
 *       → "https://github.com/mickelsonmichael/feedme/releases.atom"
 */
export function buildGitHubReleaseFeedUrl(rawValue: string): string | null {
  const repo = getGitHubRepo(rawValue);
  if (!repo) return null;
  return `https://github.com/${repo.owner}/${repo.repo}/releases.atom`;
}
