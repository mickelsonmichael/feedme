// Curated list of Feather icons appropriate for naming a "custom feed".
// We don't expose every Feather glyph because most are tool / control icons
// (cursor, sliders, eject, etc.) that make no sense as a feed identity.
// Each entry exposes searchable aliases so the icon picker filter can match
// on common synonyms ("podcast" → mic, "video" → film, etc.).

import type React from "react";
import { Feather } from "@expo/vector-icons";

export type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

export type CustomFeedIconOption = {
  name: FeatherIconName;
  /** Lowercase keywords searched in addition to the icon name itself. */
  aliases: string[];
};

export const DEFAULT_CUSTOM_FEED_ICON: FeatherIconName = "list";

export const CUSTOM_FEED_ICON_OPTIONS: CustomFeedIconOption[] = [
  { name: "list", aliases: ["list", "default"] },
  { name: "rss", aliases: ["rss", "feed"] },
  { name: "inbox", aliases: ["inbox", "mail"] },
  { name: "star", aliases: ["star", "favorite", "favourite"] },
  { name: "heart", aliases: ["heart", "love", "like"] },
  { name: "bookmark", aliases: ["bookmark", "save"] },
  { name: "tag", aliases: ["tag", "label"] },
  { name: "folder", aliases: ["folder", "group"] },
  { name: "archive", aliases: ["archive", "store"] },
  { name: "book", aliases: ["book", "read", "reading"] },
  { name: "book-open", aliases: ["book", "open", "read"] },
  { name: "tv", aliases: ["tv", "video", "media"] },
  { name: "film", aliases: ["film", "movie", "video"] },
  { name: "music", aliases: ["music", "song"] },
  { name: "headphones", aliases: ["headphones", "podcast", "audio"] },
  { name: "mic", aliases: ["mic", "microphone", "podcast", "audio"] },
  { name: "image", aliases: ["image", "photo", "picture"] },
  { name: "camera", aliases: ["camera", "photo"] },
  { name: "video", aliases: ["video", "movie", "film"] },
  { name: "globe", aliases: ["globe", "world", "international"] },
  { name: "map", aliases: ["map", "travel", "place"] },
  { name: "compass", aliases: ["compass", "discover", "explore"] },
  { name: "coffee", aliases: ["coffee", "morning", "drink"] },
  { name: "briefcase", aliases: ["briefcase", "work", "business"] },
  { name: "code", aliases: ["code", "dev", "programming", "tech"] },
  { name: "terminal", aliases: ["terminal", "shell", "dev"] },
  { name: "cpu", aliases: ["cpu", "tech", "hardware"] },
  { name: "monitor", aliases: ["monitor", "tech", "screen", "computer"] },
  { name: "smartphone", aliases: ["smartphone", "phone", "mobile"] },
  { name: "trending-up", aliases: ["trending", "stocks", "finance", "up"] },
  { name: "dollar-sign", aliases: ["dollar", "money", "finance"] },
  { name: "shopping-bag", aliases: ["shopping", "shop", "store"] },
  { name: "shopping-cart", aliases: ["shopping", "cart", "buy"] },
  { name: "gift", aliases: ["gift", "present"] },
  { name: "smile", aliases: ["smile", "happy", "fun"] },
  { name: "zap", aliases: ["zap", "energy", "fast", "lightning"] },
  { name: "flag", aliases: ["flag", "country"] },
  { name: "anchor", aliases: ["anchor", "sea", "boat"] },
  { name: "award", aliases: ["award", "trophy", "prize"] },
  { name: "activity", aliases: ["activity", "pulse", "health"] },
  { name: "thermometer", aliases: ["thermometer", "weather", "temperature"] },
  { name: "sun", aliases: ["sun", "weather", "day"] },
  { name: "moon", aliases: ["moon", "night"] },
  { name: "cloud", aliases: ["cloud", "weather"] },
  { name: "umbrella", aliases: ["umbrella", "weather", "rain"] },
  { name: "feather", aliases: ["feather", "writing", "blog"] },
  { name: "edit", aliases: ["edit", "writing", "blog"] },
  { name: "message-square", aliases: ["message", "chat", "comment"] },
  { name: "message-circle", aliases: ["message", "chat", "comment"] },
  { name: "users", aliases: ["users", "people", "community"] },
  { name: "user", aliases: ["user", "person", "profile"] },
  { name: "github", aliases: ["github", "git", "code"] },
  { name: "youtube", aliases: ["youtube", "video"] },
  { name: "twitter", aliases: ["twitter", "social"] },
  { name: "facebook", aliases: ["facebook", "social"] },
  { name: "instagram", aliases: ["instagram", "social", "photo"] },
  { name: "linkedin", aliases: ["linkedin", "social", "work"] },
  { name: "twitch", aliases: ["twitch", "stream"] },
  { name: "hash", aliases: ["hash", "tag", "channel"] },
  { name: "alert-triangle", aliases: ["alert", "warning"] },
  { name: "shield", aliases: ["shield", "security", "safe"] },
  { name: "eye-off", aliases: ["eye", "hidden", "nsfw", "private"] },
  { name: "lock", aliases: ["lock", "private", "secure", "nsfw"] },
];

/**
 * Filter the curated icon list by a free-form query string. Matches against
 * icon names and the curated aliases. Returns the unfiltered list when the
 * query is empty.
 */
export function filterCustomFeedIcons(
  query: string,
  options: CustomFeedIconOption[] = CUSTOM_FEED_ICON_OPTIONS
): CustomFeedIconOption[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return options;
  return options.filter((opt) => {
    if (opt.name.toLowerCase().includes(trimmed)) return true;
    return opt.aliases.some((alias) => alias.includes(trimmed));
  });
}

/**
 * Resolve a stored icon string to a valid Feather glyph name. Falls back to
 * the default if the stored value isn't part of the curated list.
 */
export function resolveCustomFeedIcon(
  icon: string | null | undefined
): FeatherIconName {
  if (!icon) return DEFAULT_CUSTOM_FEED_ICON;
  const found = CUSTOM_FEED_ICON_OPTIONS.find((opt) => opt.name === icon);
  return found ? found.name : DEFAULT_CUSTOM_FEED_ICON;
}
