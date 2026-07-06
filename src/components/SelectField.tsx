// SelectField — a tappable field that opens a popup with a scrollable option
// list (instead of inline chips). Tap the field → pick from the list → closes.

import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export interface SelectOption {
  key: string;
  label: string;
  emoji?: string;
}

export default function SelectField({
  value,
  options,
  onChange,
  placeholder = "Select",
  title = "Select",
  onAdd,
  addLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (key: string) => void;
  placeholder?: string;
  title?: string;
  // Returns the new option's key to auto-select it (or null/void if cancelled).
  onAdd?: () => Promise<string | null> | void;
  addLabel?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value);

  const pick = (key: string) => {
    console.log("[Select]", title, "->", key);
    onChange(key);
    setOpen(false);
  };

  const handleAdd = async () => {
    // Close this popup first so the add prompt shows cleanly (no nested modals).
    setOpen(false);
    if (!onAdd) return;
    const key = await onAdd();
    if (typeof key === "string" && key) onChange(key);
  };

  return (
    <>
      <Pressable
        style={[styles.field, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
        onPress={() => setOpen(true)}
      >
        <Text style={{ color: selected ? colors.text : colors.textMuted, fontSize: 16 }}>
          {selected ? `${selected.emoji ? selected.emoji + " " : ""}${selected.label}` : placeholder}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {options.map((o) => {
                const active = o.key === value;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => pick(o.key)}
                    style={[styles.row, active && { backgroundColor: colors.chipBg }]}
                  >
                    <Text style={{ color: colors.text, fontSize: 16 }}>
                      {o.emoji ? o.emoji + "  " : ""}
                      {o.label}
                    </Text>
                    {active && <Text style={{ color: colors.primary, fontWeight: "800" }}>✓</Text>}
                  </Pressable>
                );
              })}

              {onAdd && (
                <Pressable
                  onPress={handleAdd}
                  style={[styles.row, styles.addRow, { borderTopColor: colors.border }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>
                    ＋ {addLabel || "Add new"}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
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
  title: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  addRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, borderRadius: 0 },
});
