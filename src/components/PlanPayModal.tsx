// Shared modal for plan "Mark done" and "Part pay" — collects amount, category,
// payment method, notes. Centered fade popup.

import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useCategories } from "../context/CategoriesContext";
import ChipPicker from "./ChipPicker";
import { Button } from "./UI";
import {
  PAYMENT_METHODS,
  PAYMENT_LABELS,
  PAYMENT_EMOJI,
  DEFAULT_PAYMENT,
} from "../constants/categories";

export interface PlanPayResult {
  amount: number;
  category: string;
  paymentMethod: string;
  notes: string;
}

const PAY_OPTS = PAYMENT_METHODS.map((k) => ({
  key: k,
  label: PAYMENT_LABELS[k],
  emoji: PAYMENT_EMOJI[k],
}));

export default function PlanPayModal({
  visible,
  title,
  subtitle,
  confirmText,
  defaultAmount,
  defaultCategory,
  onClose,
  onSubmit,
  onError,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  confirmText: string;
  defaultAmount: number;
  defaultCategory: string;
  onClose: () => void;
  onSubmit: (r: PlanPayResult) => void;
  onError: (m: string) => void;
}) {
  const { colors } = useTheme();
  const { options } = useCategories();
  const catOpts = options(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [payment, setPayment] = useState(DEFAULT_PAYMENT);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible) {
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setCategory(defaultCategory);
      setPayment(DEFAULT_PAYMENT);
      setNotes("");
    }
  }, [visible, defaultAmount, defaultCategory]);

  const submit = () => {
    const amt = Number(amount);
    if (amount === "" || isNaN(amt) || amt <= 0) return onError("Enter a valid amount.");
    onSubmit({ amount: amt, category, paymentMethod: payment, notes: notes.trim() });
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              {!!subtitle && <Text style={{ color: colors.textMuted, marginBottom: 10 }}>{subtitle}</Text>}

              <Text style={[styles.label, { color: colors.textMuted }]}>Amount (₹)</Text>
              <TextInput
                style={inputStyle}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>Category</Text>
              <ChipPicker options={catOpts} value={category} onChange={setCategory} />

              <Text style={[styles.label, { color: colors.textMuted }]}>Payment method</Text>
              <ChipPicker options={PAY_OPTS} value={payment} onChange={setPayment} />

              <Text style={[styles.label, { color: colors.textMuted }]}>Notes (optional)</Text>
              <TextInput
                style={[inputStyle, { height: 56, textAlignVertical: "top" }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button title={confirmText} onPress={submit} style={{ flex: 1 }} />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: { width: "100%", maxWidth: 420, borderRadius: 22, padding: 20, maxHeight: "88%" },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
});
