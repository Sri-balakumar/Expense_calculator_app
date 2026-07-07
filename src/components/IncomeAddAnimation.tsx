// When an income is added, a green "+" bubble drops from the add (+) button and
// travels toward the bottom notification area, then fades — at which point the
// caller shows the success toast. Mirrors the PDF/Excel download animation feel.

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export default function IncomeAddAnimation({
  visible,
  variant = "plus",
  onDone,
}: {
  visible: boolean;
  variant?: "plus" | "minus";
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    console.log("[Add] drop animation start", variant);
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: 720,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  // Start at the FAB (bottom-right), pop up, then glide up-left toward the
  // bottom-center notification spot and shrink out.
  const translateY = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -22, -64] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, -110] });
  const scale = t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.6, 1.15, 0.5] });
  const opacity = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });

  const isPlus = variant === "plus";
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        {
          backgroundColor: isPlus ? colors.success : colors.danger,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      <Ionicons name={isPlus ? "add" : "remove"} size={30} color="#fff" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 300,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
});
