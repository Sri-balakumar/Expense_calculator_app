// Reusable gradient page header (purple brand banner with rounded bottom).
// Used across the tab screens for a consistent look.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

export default function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={colors.headerGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 16 }]}
    >
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { color: "rgba(255,255,255,0.82)", fontSize: 13, marginTop: 3 },
});
