// Design tokens from the Claude Design wireframes.
// Colors, spacing, and typography translated from wireframes.html /
// sketch-primitives.jsx into a single source of truth for the app.

import { Platform } from "react-native";

export const colors = {
  // Paper / ink palette (light)
  paper: "#faf8f3",
  paperWarm: "#efeae0",
  ink: "#1e1a3a",
  inkSoft: "#6a6487",
  inkFaint: "#b8b2cc",
  // Structural border: lighter black on light mode for a softer look
  border: "#ccc8db",
  accent: "#3d358f",
  accentSoft: "#7e78c4",
  highlight: "#ffe27a",
  // Semantic
  danger: "#b44b4b",
} as const;

export const darkColors = {
  // Paper / ink palette (dark)
  paper: "#0f1012",
  paperWarm: "#16181c",
  ink: "#eceef2",
  inkSoft: "#adb3be",
  inkFaint: "#2a2f38",
  // Structural border: darker white on dark mode for a softer look
  border: "#3a404b",
  accent: "#7e78c4",
  accentSoft: "#3d358f",
  highlight: "#ffe27a",
  // Semantic
  danger: "#e07070",
} as const;

export type ColorTokens = {
  paper: string;
  paperWarm: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  border: string;
  accent: string;
  accentSoft: string;
  highlight: string;
  danger: string;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 2,
  md: 4,
  lg: 8,
  pill: 999,
} as const;

export const fonts = {
  brand: "Caveat, Chalkboard SE, Marker Felt, cursive",
  heading: "sans-serif",
  body: "System",
  mono: "Menlo, Monaco, Courier New, monospace",
  sans: "sans-serif",
} as const;

export const fontSize = {
  xs: 10,
  sm: 11,
  meta: 12,
  body: 13,
  bodyLg: 14,
  title: 16,
  h2: 18,
  h1: 22,
  wordmark: 28,
} as const;

/**
 * Typography rules for long-form article bodies (the reader, and the expanded
 * content inside a post card).
 *
 * Reading-typography guidance puts comfortable body line height in the
 * 1.5–1.8 range, and asks that the gap between paragraphs be clearly larger
 * than the gap between lines — otherwise a paragraph break reads as an
 * ordinary line wrap. WCAG 2.2 SC 1.4.12 (Text Spacing) sets the same two
 * numbers as a floor: line height >= 1.5x the font size, space after a
 * paragraph >= 2x the font size.
 *
 * These are ratios rather than fixed pixel values so the native reader (14pt)
 * and the web reader (17px) stay on the same rhythm at different sizes.
 */
export const articleTypography = {
  lineHeightRatio: 1.6,
  paragraphSpacingRatio: 2,
  headingLineHeightRatio: 1.3,
} as const;

/** Body line height for `size`, per {@link articleTypography}. */
export function articleLineHeight(size: number): number {
  return Math.round(size * articleTypography.lineHeightRatio);
}

/** Gap below a paragraph/list/blockquote, per {@link articleTypography}. */
export function articleParagraphSpacing(size: number): number {
  return Math.round(size * articleTypography.paragraphSpacingRatio);
}

/** Tighter line height used for headings, per {@link articleTypography}. */
export function articleHeadingLineHeight(size: number): number {
  return Math.round(size * articleTypography.headingLineHeightRatio);
}

/** Font size of the web reader's article body. */
export const WEB_ARTICLE_FONT_SIZE = 17;

/**
 * Blur radius for NSFW media obscuring.
 *
 * `expo-image` maps `blurRadius` to CSS `filter: blur()` on web, where 24 px
 * already produces a strong Gaussian blur. On Android the same value goes
 * through a native algorithm (RenderScript / Skia) that is far less intense at
 * the same numeric value, so we use a much larger radius there.
 */
export const NSFW_BLUR_RADIUS: number = Platform.select({
  web: 60,
  default: 120,
});

/**
 * Additional view-level blur style applied to NSFW image wrappers. We layer
 * this on top of `expo-image`'s `blurRadius` because, on Android, the native
 * blur isn't reliably applied for every image source (particularly animated
 * GIF previews). Using React Native's `filter` style as a wrapper guarantees
 * a heavy, color-based blur on every platform.
 */
export const NSFW_BLUR_FILTER_STYLE = Platform.select<object>({
  web: { filter: "blur(40px)" },
  default: { filter: [{ blur: 40 }] },
}) as object;

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  fonts: typeof fonts;
  fontSize: typeof fontSize;
};

export const theme: Theme = { colors, spacing, radii, fonts, fontSize };
