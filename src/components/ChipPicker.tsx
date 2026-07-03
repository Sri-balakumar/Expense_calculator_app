// Horizontal selectable chips — replaces the category/payment pickers in month.js.
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export interface ChipOption {
  key: string;
  label: string;
  emoji?: string;
}

export default function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: ChipOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.chipBg,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {!!o.emoji && <Text style={{ fontSize: 14 }}>{o.emoji} </Text>}
            <Text
              style={{
                color: active ? "#fff" : colors.text,
                fontWeight: active ? "600" : "500",
                fontSize: 14,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
});
