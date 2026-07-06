// Add / edit expense form modal — covers the add-expense form and edit modal
// from month.js (type toggle, category + payment pickers, date, notes).

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
import { Button } from "./UI";
import { DEFAULT_CATEGORY, DEFAULT_PAYMENT } from "../constants/categories";
import { todayStr, dateToInputValue, inputValueToDate, formatDateMedium } from "../util/date";
import { amountToWords } from "../util/money";
import { Expense, ExpenseType } from "../types";

export interface ExpenseFormResult {
  name: string;
  amount: number;
  type: ExpenseType;
  category: string;
  paymentMethod?: string;
  notes: string;
  dateValue: string; // YYYY-MM-DD
}

export default function ExpenseFormModal({
  visible,
  mode,
  initial,
  initialDate,
  onClose,
  onSubmit,
  onError,
}: {
  visible: boolean;
  mode: "add" | "edit";
  initial?: Expense | null;
  initialDate?: string;
  onClose: () => void;
  onSubmit: (r: ExpenseFormResult) => void;
  onError: (msg: string) => void;
}) {
  const { colors } = useTheme();
  const { options } = useCategories();
  const categoryOptions = options(true);
  const { options: paymentOptions } = usePaymentMethods();
  const quickAddCategory = useQuickAddCategory();
  const quickAddPayment = useQuickAddPayment();
  const [type, setType] = useState<ExpenseType>("minus");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [payment, setPayment] = useState(DEFAULT_PAYMENT);
  const [date, setDate] = useState(todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setShowDatePicker(false);
    if (mode === "edit" && initial) {
      setType(initial.type);
      setName(initial.name);
      setAmount(String(initial.amount));
      setCategory(initial.category || DEFAULT_CATEGORY);
      setPayment(initial.paymentMethod || DEFAULT_PAYMENT);
      setNotes(initial.notes || "");
      setDate(initialDate || todayStr());
    } else {
      setType("minus");
      setName("");
      setAmount("");
      setCategory(DEFAULT_CATEGORY);
      setPayment(DEFAULT_PAYMENT);
      setNotes("");
      setDate(initialDate || todayStr());
    }
  }, [visible, mode, initial, initialDate]);

  const submit = () => {
    const n = name.trim();
    const amt = Number(amount);
    if (!n) return onError("Enter an expense name.");
    if (!amt || amt <= 0) return onError("Enter a valid amount.");
    onSubmit({
      name: n,
      amount: amt,
      type,
      category,
      paymentMethod: type === "minus" ? payment : undefined,
      notes: notes.trim(),
      dateValue: date.trim(),
    });
  };

  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: colors.text }]}>
                {mode === "edit" ? "Edit" : "Add"} entry
              </Text>

              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeBtn,
                    { backgroundColor: type === "minus" ? colors.danger : colors.chipBg },
                  ]}
                  onPress={() => setType("minus")}
                >
                  <Text style={{ color: type === "minus" ? "#fff" : colors.text, fontWeight: "700" }}>
                    − Spend
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeBtn,
                    { backgroundColor: type === "plus" ? colors.success : colors.chipBg },
                  ]}
                  onPress={() => setType("plus")}
                >
                  <Text style={{ color: type === "plus" ? "#fff" : colors.text, fontWeight: "700" }}>
                    + Income
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
              <TextInput
                style={inputStyle}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Groceries"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { color: colors.textMuted }]}>Amount (₹)</Text>
              <TextInput
                style={inputStyle}
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 500"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
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
                options={categoryOptions}
                value={category}
                onChange={setCategory}
                onAdd={quickAddCategory}
                addLabel="Add category"
              />

              {type === "minus" && (
                <>
                  <Text style={[styles.label, { color: colors.textMuted }]}>Payment method</Text>
                  <SelectField
                    title="Payment method"
                    placeholder="Select payment method"
                    options={paymentOptions}
                    value={payment}
                    onChange={setPayment}
                    onAdd={quickAddPayment}
                    addLabel="Add payment method"
                  />
                </>
              )}

              <Text style={[styles.label, { color: colors.textMuted }]}>Date</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[
                  styles.input,
                  styles.dateBtn,
                  { borderColor: colors.border, backgroundColor: colors.inputBg },
                ]}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>
                  {formatDateMedium(inputValueToDate(date))}
                </Text>
                <Text style={{ fontSize: 16 }}>📅</Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={inputValueToDate(date)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={new Date()}
                  onValueChange={(_event, selected) => {
                    // Android fires once then dismisses itself; iOS stays inline.
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                    if (selected) setDate(dateToInputValue(selected));
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}
              {showDatePicker && Platform.OS === "ios" && (
                <Button
                  title="Done"
                  variant="secondary"
                  onPress={() => setShowDatePicker(false)}
                  style={{ marginTop: 8 }}
                />
              )}

              <Text style={[styles.label, { color: colors.textMuted }]}>Notes (optional)</Text>
              <TextInput
                style={[inputStyle, { height: 64, textAlignVertical: "top" }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything to remember"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
                <Button
                  title={mode === "edit" ? "Save" : "Add"}
                  onPress={submit}
                  style={{ flex: 1 }}
                />
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
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    padding: 20,
    maxHeight: "88%",
  },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 14 },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  dateBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
});
