export function getFeedIconUrl(feedUrl: string): string | null {
  try {
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return `${parsed.protocol}//${parsed.host}/favicon.ico`;
  } catch {
    return null;
  }
}
