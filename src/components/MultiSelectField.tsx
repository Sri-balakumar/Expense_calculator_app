// MultiSelectField — a tappable field that opens a popup with checkboxes for
// selecting multiple options. Empty selection means "All".

import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { SelectOption } from "./SelectField";

export default function MultiSelectField({
  values,
  options,
  onChange,
  title = "Select",
  allLabel = "All",
}: {
  values: Set<string>;
  options: SelectOption[];
  onChange: (next: Set<string>) => void;
  title?: string;
  allLabel?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const count = values.size;
  const summary =
    count === 0
      ? allLabel
      : options
          .filter((o) => values.has(o.key))
          .map((o) => o.label)
          .join(", ");

  const toggle = (key: string) => {
    const next = new Set(values);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const labels = options.filter((o) => next.has(o.key)).map((o) => o.label);
    console.log("[MultiSelect]", title, "selected:", labels.length ? labels.join(", ") : "(all)");
    onChange(next);
  };

  return (
    <>
      <Pressable
        style={[
          styles.field,
          { backgroundColor: colors.inputBg, borderColor: count > 0 ? colors.primary : colors.border },
        ]}
        onPress={() => setOpen(true)}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginRight: 8,
            color: count > 0 ? colors.text : colors.textMuted,
            fontSize: 15,
            fontWeight: count > 0 ? "600" : "400",
          }}
        >
          {summary}
        </Text>
        <Text style={{ color: colors.textMuted }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              {count > 0 && (
                <Pressable onPress={() => onChange(new Set())}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Clear</Text>
                </Pressable>
              )}
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {options.map((o) => {
                const on = values.has(o.key);
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => toggle(o.key)}
                    style={[styles.row, on && { backgroundColor: colors.chipBg }]}
                  >
                    <Text style={{ color: colors.text, fontSize: 16 }}>
                      {o.emoji ? o.emoji + "  " : ""}
                      {o.label}
                    </Text>
                    <Text style={{ color: on ? colors.primary : colors.textMuted, fontSize: 18, fontWeight: "800" }}>
                      {on ? "☑" : "☐"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setOpen(false)} style={[styles.done, { backgroundColor: colors.primary }]}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: { width: "100%", maxWidth: 380, borderRadius: 18, padding: 16 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  done: { marginTop: 12, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
});
