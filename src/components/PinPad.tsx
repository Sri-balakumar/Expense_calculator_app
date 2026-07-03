// Reusable PIN entry: a row of dots + a numeric keypad. Controlled via value/onChange.
// Used by the lock screen and the Profile set-up flow.

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { PIN_LENGTH } from "../util/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function PinPad({
  value,
  onChange,
  length = PIN_LENGTH,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  error?: boolean;
}) {
  const { colors } = useTheme();

  const press = (k: string) => {
    if (k === "del") {
      onChange(value.slice(0, -1));
    } else if (k !== "" && value.length < length) {
      onChange(value + k);
    }
  };

  return (
    <View style={{ alignItems: "center" }}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  borderColor: error ? colors.danger : colors.primary,
                  backgroundColor: filled
                    ? error
                      ? colors.danger
                      : colors.primary
                    : "transparent",
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.pad}>
        {KEYS.map((k, i) =>
          k === "" ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(k)}
              style={({ pressed }) => [
                styles.key,
                {
                  backgroundColor: k === "del" ? "transparent" : colors.chipBg,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontSize: k === "del" ? 20 : 26, fontWeight: "600" }}>
                {k === "del" ? "⌫" : k}
              </Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: "row", gap: 18, marginBottom: 36 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pad: { width: 280, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  key: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
