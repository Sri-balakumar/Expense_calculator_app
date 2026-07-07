// Centered "download complete" animation: a PDF/document icon jumps up and
// turns to the right, then CHANGES into a download icon, falls back down with a
// bounce, and lands with a "<LABEL> downloaded" caption, then fades away.

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export default function DownloadAnimation({
  visible,
  label,
  onDone,
}: {
  visible: boolean;
  label: string;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const backdrop = useRef(new Animated.Value(0)).current;
  const jump = useRef(new Animated.Value(0)).current; // 0 rest → 1 up
  const spin = useRef(new Animated.Value(0)).current; // 0 → 1 rotated right
  const swap = useRef(new Animated.Value(0)).current; // 0 doc → 1 download icon
  const done = useRef(new Animated.Value(0)).current; // caption + landed state

  useEffect(() => {
    if (!visible) return;
    console.log("[Download] animation start", label);
    backdrop.setValue(0);
    jump.setValue(0);
    spin.setValue(0);
    swap.setValue(0);
    done.setValue(0);
    Animated.sequence([
      Animated.timing(backdrop, { toValue: 1, duration: 160, useNativeDriver: true }),
      // 1) PDF icon jumps up while turning right
      Animated.parallel([
        Animated.timing(jump, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      // 2) at the top, it changes into the download icon
      Animated.timing(swap, { toValue: 1, duration: 200, useNativeDriver: true }),
      // 3) download icon falls back down (bounce) and straightens up
      Animated.parallel([
        Animated.spring(jump, { toValue: 0, friction: 4, tension: 70, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      // 4) landed → show caption
      Animated.timing(done, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(950),
      Animated.timing(backdrop, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const translateY = jump.interpolate({ inputRange: [0, 1], outputRange: [0, -48] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "22deg"] });
  const docOpacity = swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const dlOpacity = swap.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.backdrop, { opacity: backdrop }]} pointerEvents="none">
      <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
        <Animated.View style={[styles.iconBox, { transform: [{ translateY }, { rotate }] }]}>
          {/* PDF/document icon (before the turn) */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: docOpacity }]}>
            <Ionicons name="document-text" size={58} color={colors.primary} />
          </Animated.View>
          {/* Download icon (after the turn) */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: dlOpacity }]}>
            <Ionicons name="download" size={56} color={colors.success} />
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[styles.text, { color: colors.text, opacity: done }]}>
          {label} downloaded
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  card: {
    width: 200,
    height: 168,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  iconBox: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  text: { fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
});
