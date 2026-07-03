// Light/dark theme — replaces theme.js + CSS vars. Persists to AsyncStorage,
// falls back to the system color scheme on first launch.

import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeColors, lightColors, darkColors } from "./colors";

const STORAGE_KEY = "expenseTheme";

type Mode = "light" | "dark";

interface ThemeContextValue {
  mode: Mode;
  colors: ThemeColors;
  toggle: () => void;
  setMode: (m: Mode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colors: lightColors,
  toggle: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>(system === "dark" ? "dark" : "light");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "light" || saved === "dark") setModeState(saved);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };
  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  // Avoid a flash of the wrong theme before AsyncStorage resolves.
  if (!loaded) return null;

  const colors = mode === "dark" ? darkColors : lightColors;
  return (
    <ThemeContext.Provider value={{ mode, colors, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
