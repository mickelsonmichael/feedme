// Design tokens from the Claude Design wireframes.
// Colors, spacing, and typography translated from wireframes.html /
// sketch-primitives.jsx into a single source of truth for the app.

export const colors = {
  // Paper / ink palette (light)
  paper: "#faf8f3",
  paperWarm: "#efeae0",
  ink: "#1e1a3a",
  inkSoft: "#6a6487",
  inkFaint: "#b8b2cc",
  accent: "#3d358f",
  accentSoft: "#7e78c4",
  highlight: "#ffe27a",
  // Semantic
  danger: "#b44b4b",
} as const;

export const darkColors = {
  // Paper / ink palette (dark)
  paper: "#1a1826",
  paperWarm: "#221f30",
  ink: "#e8e4f5",
  inkSoft: "#9992c0",
  inkFaint: "#3d3958",
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

export type Theme = {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  fonts: typeof fonts;
  fontSize: typeof fontSize;
};

export const theme: Theme = { colors, spacing, radii, fonts, fontSize };
