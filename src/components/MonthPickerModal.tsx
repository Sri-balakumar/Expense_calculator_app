// Month picker — port of createNewMonth() from dashboard.js.
// Shows a 12-month grid for a year (prev/next), marks existing months as "Open",
// and asks for a starting balance before creating a new month.

import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { listMonths, createMonth } from "../firebase/firestore";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthPickerModal({
  visible,
  onClose,
  onOpenMonth,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenMonth: (monthId: string) => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [existing, setExisting] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null); // fullName awaiting balance
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    listMonths(user.uid).then((months) => {
      const map: Record<string, string> = {};
      months.forEach((m) => (map[m.name] = m.id));
      setExisting(map);
    });
  }, [visible, user]);

  const onTile = (monthName: string) => {
    const fullName = `${monthName} ${year}`;
    if (existing[fullName]) {
      onClose();
      onOpenMonth(existing[fullName]);
      return;
    }
    setBalance("");
    setPending(fullName);
  };

  const confirmCreate = async () => {
    if (!user || !pending) return;
    const bal = Number(balance) || 0;
    if (bal < 0) return;
    setBusy(true);
    try {
      const id = await createMonth(user.uid, pending, bal);
      setPending(null);
      onClose();
      onOpenMonth(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Pick a month</Text>
            <View style={styles.yearNav}>
              <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8}>
                <Text style={[styles.navBtn, { color: colors.primary }]}>‹</Text>
              </Pressable>
              <Text style={[styles.year, { color: colors.text }]}>{year}</Text>
              <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8}>
                <Text style={[styles.navBtn, { color: colors.primary }]}>›</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.grid}>
            {MONTH_NAMES.map((m) => {
              const isExisting = !!existing[`${m} ${year}`];
              return (
                <Pressable
                  key={m}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: isExisting ? colors.primary : colors.chipBg,
                    },
                  ]}
                  onPress={() => onTile(m)}
                >
                  <Text
                    style={{
                      color: isExisting ? "#fff" : colors.text,
                      fontWeight: "700",
                    }}
                  >
                    {m.slice(0, 3)}
                  </Text>
                  <Text
                    style={{
                      color: isExisting ? "#fff" : colors.textMuted,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {isExisting ? "Open" : "Create"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>

      {/* Balance prompt before creating */}
      <Modal visible={!!pending} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setPending(null)}>
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg, maxWidth: 360 }]}>
            <Text style={[styles.title, { color: colors.text, textAlign: "center" }]}>
              Create {pending}?
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 6, marginBottom: 12 }}>
              Current balance (₹) — cash on hand now, added on top of your salary
              for this month.
            </Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
              placeholder="e.g. 5000"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={balance}
              onChangeText={setBalance}
              autoFocus
            />
            <View style={styles.actions}>
              <Pressable
                style={[styles.actBtn, { backgroundColor: colors.chipBg }]}
                onPress={() => setPending(null)}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actBtn, { backgroundColor: colors.primary }]}
                onPress={confirmCreate}
                disabled={busy}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {busy ? "Creating…" : "Create"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  card: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "800" },
  yearNav: { flexDirection: "row", alignItems: "center", gap: 14 },
  navBtn: { fontSize: 28, fontWeight: "800", paddingHorizontal: 4 },
  year: { fontSize: 16, fontWeight: "700", minWidth: 48, textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  tile: {
    width: "31.5%",
    aspectRatio: 1.4,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  actBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
});
