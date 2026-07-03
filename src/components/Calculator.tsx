// Calculator modal — port of the calc state machine in month.js.
// Opened with an initial accumulator (e.g. a multi-selection total) so the user
// can keep computing on top of it.

import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { formatMoney } from "../util/money";

interface CalcState {
  acc: number;
  op: string | null;
  operand: string;
  waiting: boolean;
}

const KEYS = [
  ["C", "÷", "×", "⌫"],
  ["7", "8", "9", "-"],
  ["4", "5", "6", "+"],
  ["1", "2", "3", "="],
  ["0", ".", "", ""],
];

const OP_SYM: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export default function Calculator({
  visible,
  title,
  initialValue,
  initialExpr,
  onClose,
}: {
  visible: boolean;
  title: string;
  initialValue: number;
  initialExpr?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [calc, setCalc] = useState<CalcState>({
    acc: initialValue,
    op: null,
    operand: "",
    waiting: true,
  });
  const [showInitialExpr, setShowInitialExpr] = useState(true);

  useEffect(() => {
    if (visible) {
      setCalc({ acc: initialValue, op: null, operand: "", waiting: true });
      setShowInitialExpr(true);
    }
  }, [visible, initialValue]);

  const applyOp = (state: CalcState): number => {
    const b = parseFloat(state.operand);
    if (isNaN(b)) return state.acc;
    switch (state.op) {
      case "+": return state.acc + b;
      case "-": return state.acc - b;
      case "*": return state.acc * b;
      case "/": return b === 0 ? 0 : state.acc / b;
      default: return b;
    }
  };

  const input = (raw: string) => {
    const key =
      raw === "÷" ? "/" : raw === "×" ? "*" : raw === "⌫" ? "back" : raw === "C" ? "clear" : raw;
    if (key === "") return;
    setShowInitialExpr(false);
    setCalc((c) => {
      const s = { ...c };
      if (/^[0-9]$/.test(key)) {
        s.operand = (s.waiting ? "" : s.operand) + key;
        s.waiting = false;
      } else if (key === ".") {
        if (s.waiting) { s.operand = "0"; s.waiting = false; }
        if (s.operand.indexOf(".") === -1) s.operand += s.operand === "" ? "0." : ".";
      } else if (key === "back") {
        if (!s.waiting) s.operand = s.operand.slice(0, -1);
      } else if (key === "clear") {
        s.acc = 0; s.op = null; s.operand = ""; s.waiting = true;
      } else if (key === "+" || key === "-" || key === "*" || key === "/") {
        if (s.operand !== "") { s.acc = applyOp(s); s.operand = ""; }
        s.op = key; s.waiting = true;
      } else if (key === "=") {
        if (s.operand !== "") { s.acc = applyOp(s); s.operand = ""; s.op = null; s.waiting = true; }
      }
      return s;
    });
  };

  const shown = calc.operand !== "" ? calc.operand : formatMoney(calc.acc);
  const expr =
    showInitialExpr && initialExpr
      ? initialExpr
      : calc.op
      ? `${formatMoney(calc.acc)} ${OP_SYM[calc.op]}`
      : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <View style={[styles.display, { backgroundColor: colors.bgSoft }]}>
            <Text style={[styles.expr, { color: colors.textMuted }]} numberOfLines={1}>
              {expr}
            </Text>
            <Text style={[styles.result, { color: colors.text }]} numberOfLines={1}>
              {shown}
            </Text>
          </View>
          {KEYS.map((row, i) => (
            <View key={i} style={styles.row}>
              {row.map((k, j) => {
                const isOp = ["÷", "×", "-", "+", "="].includes(k);
                const isFn = ["C", "⌫"].includes(k);
                if (k === "") return <View key={j} style={[styles.key, { opacity: 0 }]} />;
                return (
                  <Pressable
                    key={j}
                    style={[
                      styles.key,
                      {
                        backgroundColor: isOp
                          ? colors.primary
                          : isFn
                          ? colors.chipBg
                          : colors.bgSoft,
                      },
                    ]}
                    onPress={() => input(k)}
                  >
                    <Text
                      style={{
                        color: isOp ? "#fff" : colors.text,
                        fontSize: 22,
                        fontWeight: "700",
                      }}
                    >
                      {k}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Pressable style={[styles.done, { backgroundColor: colors.chipBg }]} onPress={onClose}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
  card: { width: "100%", maxWidth: 360, borderRadius: 20, padding: 18 },
  title: { fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  display: { borderRadius: 12, padding: 16, marginBottom: 12, minHeight: 72, justifyContent: "center" },
  expr: { fontSize: 14, textAlign: "right", minHeight: 18 },
  result: { fontSize: 30, fontWeight: "800", textAlign: "right" },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  key: { flex: 1, aspectRatio: 1.3, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  done: { paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 4 },
});
