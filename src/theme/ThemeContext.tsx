// Light/dark theme + a user-selectable accent color. Persists both to
// AsyncStorage. The accent overrides the primary/button color across the app.

import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeColors, lightColors, darkColors } from "./colors";

const STORAGE_KEY = "expenseTheme";
const ACCENT_KEY = "expenseAccent";

type Mode = "light" | "dark";

// Palette the user can choose their button/accent color from.
export const ACCENTS = [
  "#f37021", // orange (default)
  "#2874f0", // blue
  "#10b981", // green
  "#8b5cf6", // purple
  "#ef4444", // red
  "#ec4899", // pink
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#6366f1", // indigo
  "#14b8a6", // teal
];

const DEFAULT_ACCENT = ACCENTS[0];

// Darken a hex color by a factor (for pressed/gradient/dark variants).
function darken(hex: string, amt = 0.85): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * amt);
  const g = Math.round(((n >> 8) & 255) * amt);
  const b = Math.round((n & 255) * amt);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

interface ThemeContextValue {
  mode: Mode;
  colors: ThemeColors;
  accent: string;
  toggle: () => void;
  setMode: (m: Mode) => void;
  setAccent: (c: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colors: lightColors,
  accent: DEFAULT_ACCENT,
  toggle: () => {},
  setMode: () => {},
  setAccent: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>(system === "dark" ? "dark" : "light");
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "light" || saved === "dark") setModeState(saved);
        const savedAccent = await AsyncStorage.getItem(ACCENT_KEY);
        if (savedAccent) setAccentState(savedAccent);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };
  const toggle = () => setMode(mode === "dark" ? "light" : "dark");

  const setAccent = (c: string) => {
    console.log("[Theme] accent ->", c);
    setAccentState(c);
    AsyncStorage.setItem(ACCENT_KEY, c).catch(() => {});
  };

  // Avoid a flash of the wrong theme before AsyncStorage resolves.
  if (!loaded) return null;

  const base = mode === "dark" ? darkColors : lightColors;
  // Apply the chosen accent over the primary/button colors.
  const colors: ThemeColors = {
    ...base,
    primary: accent,
    primaryDark: darken(accent),
    primaryGradient: [accent, darken(accent)],
  };

  return (
    <ThemeContext.Provider value={{ mode, colors, accent, toggle, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
