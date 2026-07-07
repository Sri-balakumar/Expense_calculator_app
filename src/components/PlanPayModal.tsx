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
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../theme/ThemeContext";
import { useCategories, useQuickAddCategory } from "../context/CategoriesContext";
import { usePaymentMethods, useQuickAddPayment } from "../context/PaymentMethodsContext";
import SelectField from "./SelectField";
import { Button, MoneyInput } from "./UI";
import { DEFAULT_PAYMENT } from "../constants/categories";
import { todayStr, dateToInputValue, inputValueToDate, formatDateMedium } from "../util/date";
import { amountToWords } from "../util/money";

export interface PlanPayResult {
  name: string;
  amount: number;
  category: string;
  paymentMethod: string;
  notes: string;
  dateValue: string; // YYYY-MM-DD
}

export default function PlanPayModal({
  visible,
  title,
  subtitle,
  confirmText,
  defaultAmount,
  defaultCategory,
  defaultName,
  showName,
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
  defaultName?: string;
  showName?: boolean;
  onClose: () => void;
  onSubmit: (r: PlanPayResult) => void;
  onError: (m: string) => void;
}) {
  const { colors } = useTheme();
  const { options } = useCategories();
  const catOpts = options(false);
  const { options: payOpts } = usePaymentMethods();
  const quickAddCategory = useQuickAddCategory();
  const quickAddPayment = useQuickAddPayment();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [payment, setPayment] = useState(DEFAULT_PAYMENT);
  const [notes, setNotes] = useState("");
  const [dateVal, setDateVal] = useState(todayStr());
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(defaultName || "");
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setCategory(defaultCategory);
      setPayment(DEFAULT_PAYMENT);
      setNotes("");
      setDateVal(todayStr());
      setShowDate(false);
    }
  }, [visible, defaultAmount, defaultCategory, defaultName]);

  const submit = () => {
    const nm = name.trim() || (defaultName || "").trim();
    if (showName && !nm) return onError("Enter a name.");
    const amt = Number(amount);
    if (amount === "" || isNaN(amt) || amt <= 0) return onError("Enter a valid amount.");
    console.log("[PlanPay] submit", { name: nm, amount: amt, category, date: dateVal });
    onSubmit({ name: nm, amount: amt, category, paymentMethod: payment, notes: notes.trim(), dateValue: dateVal });
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

              {showName && (
                <>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
                  <TextInput
                    style={inputStyle}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Grocery"
                    placeholderTextColor={colors.textMuted}
                  />
                </>
              )}

              <Text style={[styles.label, { color: colors.textMuted }]}>Amount (₹)</Text>
              <MoneyInput
                style={inputStyle}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                autoFocus
              />
              {Number(amount) > 0 && (
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                  {amountToWords(amount)}
                </Text>
              )}

              <Text style={[styles.label, { color: colors.textMuted }]}>Category</Text>
              <SelectField
                title="Category"
                placeholder="Select category"
                options={catOpts}
                value={category}
                onChange={setCategory}
                onAdd={quickAddCategory}
                addLabel="Add category"
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>Payment method</Text>
              <SelectField
                title="Payment method"
                placeholder="Select payment method"
                options={payOpts}
                value={payment}
                onChange={setPayment}
                onAdd={quickAddPayment}
                addLabel="Add payment method"
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>Date</Text>
              <Pressable
                onPress={() => setShowDate(true)}
                style={[inputStyle, { justifyContent: "center" }]}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>
                  📅 {formatDateMedium(inputValueToDate(dateVal))}
                </Text>
              </Pressable>
              {showDate && (
                <DateTimePicker
                  value={inputValueToDate(dateVal)}
                  mode="date"
                  onChange={(_e, d) => {
                    setShowDate(false);
                    if (d) setDateVal(dateToInputValue(d));
                  }}
                />
              )}

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
