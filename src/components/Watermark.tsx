// A faint, centered splash-logo watermark (like a copyright mark) that sits
// behind a screen's content. Render it as the FIRST child of a screen's root
// view; it's absolutely positioned + non-interactive, so content draws on top
// and the light logo shows through the gaps.

import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export default function Watermark({
  size = 240,
  opacity = 0.06,
}: {
  size?: number;
  opacity?: number;
}) {
  const { mode } = useTheme();
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Image
        source={require("../../assets/splash-icon.png")}
        resizeMode="contain"
        // Flatten the logo to a cement-light silhouette (white on dark theme).
        style={{ width: size, height: size, opacity, tintColor: mode === "dark" ? "#ffffff" : "#9aa1b0" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
