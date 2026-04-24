import React, { createContext, useCallback, useContext, useState } from "react";
import { useColorScheme } from "react-native";
import { colors as lightColors, darkColors, type ColorTokens } from "../theme";
import { loadConfig, saveConfig } from "../storage";
import type { ThemeMode } from "../types";

export type { ThemeMode };

function loadMode(): ThemeMode {
  return loadConfig().themeMode ?? "system";
}

function saveMode(mode: ThemeMode): void {
  saveConfig({ themeMode: mode });
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
  const [mode, setModeState] = useState<ThemeMode>(() => loadMode());

  const setMode = useCallback((newMode: ThemeMode) => {
    try {
      saveMode(newMode);
    } catch (e) {
      console.warn("[feedme] Failed to persist theme mode:", e);
    }
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
