// A "?" button that mirrors the "+" FAB on the opposite corner, opening a plain
// explanation of the screen it sits on. Used on every tab so each one can
// explain itself without a separate onboarding flow.

import React, { useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { Button } from "./UI";

export interface HelpContent {
  title: string;
  /** One short paragraph per idea — what it's for, then how to use it. */
  body: string[];
  /** A concrete worked example with real numbers. */
  example: string;
}

// The floating tab bar is full-width and 62 + safe-area tall (TabNavigator),
// so the FAB has to clear it — the "+" FAB's bottom: 24 would sit behind it.
const TAB_BAR_HEIGHT = 62;
const GAP = 16;

export default function HelpFab({ title, body, example }: HelpContent) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const onPress = () => {
    scale.setValue(0.85);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 150,
      useNativeDriver: true,
    }).start();
    console.log("[Help] opened", title);
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityLabel={`What is this screen for? ${title}`}
        accessibilityRole="button"
        style={[
          styles.fab,
          { backgroundColor: colors.brand, bottom: insets.bottom + TAB_BAR_HEIGHT + GAP },
        ]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="help" size={28} color="#fff" />
        </Animated.View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 19, marginBottom: 10 }}>
              {title}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {body.map((para, i) => (
                <Text
                  key={i}
                  style={{ color: colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 10 }}
                >
                  {para}
                </Text>
              ))}
              <View style={[styles.example, { backgroundColor: colors.chipBg }]}>
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 0.4,
                    marginBottom: 5,
                  }}
                >
                  FOR EXAMPLE
                </Text>
                <Text style={{ color: colors.text, fontSize: 13.5, lineHeight: 20 }}>{example}</Text>
              </View>
            </ScrollView>
            <Button title="Got it" onPress={() => setOpen(false)} style={{ marginTop: 14 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Same geometry as the "+" FAB in MonthScreen, mirrored to the left.
  fab: {
    position: "absolute",
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, maxHeight: "85%" },
  example: { borderRadius: 12, padding: 12, marginTop: 2 },
});
