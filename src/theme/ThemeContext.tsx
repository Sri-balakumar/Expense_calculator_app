// Light/dark theme + a user-selectable accent color. Persists both to
// AsyncStorage. The accent overrides the primary/button color across the app.

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, useColorScheme, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

  // Diagonal wipe when switching light/dark: a new-theme "curtain" grows from the
  // top-left corner to the bottom-right, the theme flips underneath, then it fades.
  const wipe = useRef(new Animated.Value(0)).current;
  const [transition, setTransition] = useState<{ color: string } | null>(null);

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

  // Instant set (no animation) — used internally.
  const applyMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const setMode = (m: Mode) => {
    if (m === mode) return applyMode(m);
    // A continuous diagonal wipe: a target-theme bar sweeps in from the top-left
    // to fully cover the screen, the theme flips underneath, then the same bar
    // keeps sweeping off the bottom-right — revealing the new theme behind it.
    const target = m === "dark" ? darkColors : lightColors;
    setTransition({ color: target.bgSoft });
    wipe.setValue(0);
    console.log("[Theme] wipe →", m);
    Animated.timing(wipe, {
      toValue: 1,
      duration: 430,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      applyMode(m); // flip theme while fully covered
      Animated.timing(wipe, {
        toValue: 2,
        duration: 360,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setTransition(null));
    });
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

  // A big square rotated 45°; translating it along its local x-axis moves it
  // diagonally (down-right). It sweeps in to cover the screen, then keeps going
  // off the bottom-right — a clean top-left → bottom-right wipe.
  const DIAG = Math.hypot(SCREEN.width, SCREEN.height);
  const translateX = wipe.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [-2 * DIAG, 0, 2 * DIAG],
  });

  return (
    <ThemeContext.Provider value={{ mode, colors, accent, toggle, setMode, setAccent }}>
      <View style={{ flex: 1 }}>
        {children}
        {transition && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View
              style={{
                position: "absolute",
                left: SCREEN.width / 2 - DIAG,
                top: SCREEN.height / 2 - DIAG,
                width: 2 * DIAG,
                height: 2 * DIAG,
                transform: [{ rotate: "45deg" }, { translateX }],
              }}
            >
              {/* Soft-edged curtain: solid middle covers, translucent edges keep
                  the leading/trailing wipe lines smooth instead of hard. */}
              <LinearGradient
                colors={["transparent", transition.color, transition.color, "transparent"]}
                locations={[0, 0.2, 0.8, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>
        )}
      </View>
    </ThemeContext.Provider>
  );
}

const SCREEN = Dimensions.get("window");

export const useTheme = () => useContext(ThemeContext);
