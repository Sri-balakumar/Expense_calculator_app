// Month picker — port of createNewMonth() from dashboard.js.
// Shows a 12-month grid for a year (prev/next), marks existing months as "Open",
// and asks for a starting balance — and which recurring entries to add — before
// creating a new month.

import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useCategories } from "../context/CategoriesContext";
import {
  fetchMonthsData,
  createMonth,
  listRecurring,
  recurringKey,
  RecurringPick,
} from "../firebase/firestore";
import { MonthData } from "../types";
import { formatMoney } from "../util/money";
import { previousMonthName } from "../util/date";
import { MoneyInput } from "./UI";
import { currencySymbol } from "../util/money";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// One distinct recurring template, and how many copies of it Profile holds.
interface RecGroup {
  key: string;
  item: RecurringPick;
  count: number;
}

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
  const { user, profile } = useAuth();
  const { emoji: catEmoji } = useCategories();
  const [year, setYear] = useState(new Date().getFullYear());
  const [existing, setExisting] = useState<Record<string, string>>({});
  const [months, setMonths] = useState<MonthData[]>([]);
  const [pending, setPending] = useState<string | null>(null); // fullName awaiting balance
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);
  // State alone lets a fast double tap through — both taps run before the
  // re-render that disables the button — and that made two months.
  const busyRef = useRef(false);
  // The existing-months load failing used to be swallowed, leaving `existing`
  // empty — so every month looked free to create and a duplicate was one tap
  // away. Track the failure and say so instead of guessing.
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Leftover of the month this one follows, offered as the starting balance.
  const [carry, setCarry] = useState<{ from: string; amount: number } | null>(null);
  // Recurring templates for the month being created. null = not loaded (still
  // loading, or the load failed), and then createMonth adds every one itself.
  const [recGroups, setRecGroups] = useState<RecGroup[] | null>(null);
  const [recPicked, setRecPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || !user) return;
    setLoadFailed(false);
    fetchMonthsData(user.uid, Number(profile?.salary) || 0)
      .then((list) => {
        const map: Record<string, string> = {};
        list.forEach((m) => (map[m.name] = m.id));
        setExisting(map);
        setMonths(list); // newest first
      })
      .catch((e) => {
        console.log("[MonthPicker] couldn't load existing months", e);
        setLoadFailed(true);
      });
  }, [visible, user, profile?.salary]);

  const loadRecurring = async () => {
    if (!user) return;
    setRecGroups(null);
    try {
      const recs = await listRecurring(user.uid);
      const byKey = new Map<string, RecGroup>();
      recs.forEach((r) => {
        const key = recurringKey(r);
        const g = byKey.get(key);
        if (g) g.count += 1;
        else byKey.set(key, { key, item: { name: r.name, amount: r.amount, category: r.category }, count: 1 });
      });
      const groups = [...byKey.values()].sort((a, b) => (a.item.name || "").localeCompare(b.item.name || ""));
      setRecGroups(groups);
      setRecPicked(new Set(groups.map((g) => g.key)));
    } catch (e) {
      console.log("[MonthPicker] couldn't load recurring", e);
    }
  };

  const onTile = (monthName: string) => {
    const fullName = `${monthName} ${year}`;
    if (existing[fullName]) {
      onClose();
      onOpenMonth(existing[fullName]);
      return;
    }
    // Carry from the calendar month before this one when it exists — creating
    // March after skipping February shouldn't carry from whatever was made last
    // — otherwise from the newest month there is.
    const prevName = previousMonthName(fullName);
    const source = months.find((m) => m.name === prevName) || months[0];
    const left = source ? Math.round(Math.max(0, Number(source.totalRemaining) || 0) * 100) / 100 : 0;
    setCarry(source && left > 0 ? { from: source.name, amount: left } : null);
    // Pre-fill with that leftover so it carries over by default.
    setBalance(left > 0 ? String(left) : "");
    setError(null);
    setPending(fullName);
    loadRecurring();
  };

  const toggleRec = (key: string) => {
    setRecPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmCreate = async () => {
    if (!user || !pending || busyRef.current) return;
    // Not parseAmount: a starting balance of zero is perfectly legitimate,
    // where an expense of zero is not. Still rejects Infinity/NaN. A negative
    // balance used to be a bare `return` — the user tapped Create and nothing
    // happened, with nothing said about why.
    const bal = balance.trim() === "" ? 0 : Number(balance);
    if (!Number.isFinite(bal)) {
      setError("That isn't a number we can use.");
      return;
    }
    if (bal < 0) {
      setError("Starting balance can't be negative.");
      return;
    }
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      const recurring = recGroups
        ? recGroups.filter((g) => recPicked.has(g.key)).map((g) => g.item)
        : undefined;
      const id = await createMonth(user.uid, pending, Math.round(bal * 100) / 100, { recurring });
      setPending(null);
      onClose();
      onOpenMonth(id);
    } catch (e) {
      console.log("[MonthPicker] create failed", e);
      setError("Couldn't create that month. Try again.");
    } finally {
      busyRef.current = false;
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

          {loadFailed && (
            <Text
              style={{
                color: colors.danger,
                fontSize: 12,
                fontWeight: "600",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Couldn't check which months you already have — a month shown as
              "Create" may already exist.
            </Text>
          )}

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

      {/* Balance + recurring prompt before creating */}
      <Modal visible={!!pending} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setPending(null)}>
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg, maxWidth: 380 }]}>
            <ScrollView
              style={{ maxHeight: Dimensions.get("window").height * 0.75 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.title, { color: colors.text, textAlign: "center" }]}>
                Create {pending}?
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 6, marginBottom: 12 }}>
                Opening balance ({currencySymbol().trim()}) — what you have for {pending}. Its
                total remaining starts from this.
              </Text>
              {carry && (
                <Pressable
                  onPress={() => setBalance(String(carry.amount))}
                  style={[styles.carryBtn, { backgroundColor: colors.chipBg }]}
                >
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>
                    ↩ Carry {formatMoney(carry.amount)} left from {carry.from}
                  </Text>
                </Pressable>
              )}
              <MoneyInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
                ]}
                placeholder="e.g. 5000"
                value={balance}
                onChangeText={(t) => {
                  setBalance(t);
                  if (error) setError(null);
                }}
                autoFocus
              />

              {recGroups === null ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 14 }}>
                  Loading recurring entries…
                </Text>
              ) : recGroups.length > 0 ? (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.section, { color: colors.textMuted }]}>
                    ADD RECURRING ENTRIES
                  </Text>
                  {recGroups.map((g) => {
                    const on = recPicked.has(g.key);
                    return (
                      <Pressable
                        key={g.key}
                        onPress={() => toggleRec(g.key)}
                        style={[styles.recRow, { borderTopColor: colors.border }]}
                      >
                        <Text
                          style={{
                            color: on ? colors.primary : colors.textMuted,
                            fontSize: 18,
                            fontWeight: "800",
                            marginRight: 10,
                          }}
                        >
                          {on ? "☑" : "☐"}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: on ? colors.text : colors.textMuted, fontWeight: "600" }}
                          >
                            {catEmoji(g.item.category)} {g.item.name}
                          </Text>
                          {g.count > 1 && (
                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                              ×{g.count} in Profile — only one is added
                            </Text>
                          )}
                        </View>
                        <Text
                          style={{
                            color: on ? colors.text : colors.textMuted,
                            fontWeight: "700",
                            marginLeft: 8,
                          }}
                        >
                          {formatMoney(g.item.amount)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {error && (
                <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6, fontWeight: "600" }}>
                  {error}
                </Text>
              )}
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
            </ScrollView>
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
  carryBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  section: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  recRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  actBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
});
