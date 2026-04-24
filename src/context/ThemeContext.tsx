import React, { createContext, useCallback, useContext, useState } from "react";
import { Platform, useColorScheme } from "react-native";
import { colors as lightColors, darkColors, type ColorTokens } from "../theme";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "feedme_theme_mode";

function loadMode(): ThemeMode {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  }
  return "system";
}

function saveMode(mode: ThemeMode): void {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, mode);
  }
}

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: ColorTokens;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  setMode: () => {},
  colors: lightColors,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(loadMode);

  const setMode = useCallback((newMode: ThemeMode) => {
    saveMode(newMode);
    setModeState(newMode);
  }, []);

  const isDark =
    mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, setMode, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
