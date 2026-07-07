import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Card, Button, MoneyInput } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import { fetchBudgetsData, createBudget, watchGoals, createGoal } from "../firebase/firestore";
import { formatMoney, amountToWords } from "../util/money";
import { BudgetDoc, GoalDoc } from "../types";

type BudgetRow = BudgetDoc & { spent: number; remaining: number };

function goalTotals(g: GoalDoc) {
  const entries = g.entries || [];
  const saved = entries.filter((e) => e.type === "in").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const spent = entries.filter((e) => e.type === "out").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { saved, spent, available: saved - spent };
}

export default function BudgetsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { prompt, toast } = useFeedback();
  const [tab, setTab] = useState<"budgets" | "goals">("goals");
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [goals, setGoals] = useState<GoalDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // New-goal form
  const [goalModal, setGoalModal] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setBudgets(await fetchBudgetsData(user.uid));
    } catch {
      toast("Couldn't load budgets.", "error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Goals update live.
  useEffect(() => {
    if (!user) return;
    const unsub = watchGoals(user.uid, setGoals, () => setGoals([]));
    return unsub;
  }, [user]);

  const onCreate = async () => {
    const name = await prompt({ title: "Budget name", placeholder: "e.g. Goa Trip" });
    if (!name) return;
    const amountStr = await prompt({
      title: "Total amount (₹)",
      placeholder: "e.g. 10000",
      keyboardType: "numeric",
    });
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return toast("Enter a valid amount.", "error");
    if (!user) return;
    const id = await createBudget(user.uid, name, amount);
    navigation.navigate("Month", { id, type: "budget" });
  };

  const openGoalModal = () => {
    setGoalName("");
    setGoalAmount("");
    setGoalModal(true);
  };
  const submitGoal = async () => {
    if (!user) return;
    const n = goalName.trim();
    if (!n) return toast("Enter a goal name.", "error");
    const amt = Number(goalAmount);
    if (!amt || amt <= 0) return toast("Enter the total amount you have to save.", "error");
    const id = await createGoal(user.uid, n, amt);
    setGoalModal(false);
    navigation.navigate("Goal", { id });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSoft }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScreenHeader
        title="Budgets & Goals"
        subtitle="Fixed spending pots, and savings goals you build up."
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {/* Segmented: Goals | Budgets */}
        <View style={[styles.tabs, { backgroundColor: colors.chipBg }]}>
          {(["goals", "budgets"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && { backgroundColor: colors.cardBg }]}
            >
              <Text style={{ color: tab === t ? colors.primary : colors.textMuted, fontWeight: "700" }}>
                {t === "budgets" ? "Budgets" : "Goals"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "budgets" ? (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.newBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={onCreate}
            >
              <Text style={styles.newBtnText}>+ New budget</Text>
            </Pressable>

            {budgets.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>No budgets yet.</Text>
              </Card>
            ) : (
              budgets.map((b) => {
                const p = b.amount > 0 ? Math.min(100, Math.max(0, (b.spent / b.amount) * 100)) : 0;
                const over = b.remaining < 0;
                const fill = over ? colors.danger : p > 80 ? "#f59e0b" : colors.success;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => navigation.navigate("Month", { id: b.id, type: "budget" })}
                  >
                    <Card>
                      <View style={styles.rowTop}>
                        <Text style={[styles.name, { color: colors.text }]}>{b.name}</Text>
                        <Text style={{ color: colors.textMuted, fontWeight: "700" }}>
                          {formatMoney(b.amount)}
                        </Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: colors.chipBg }]}>
                        <View
                          style={{ width: `${p}%`, height: "100%", backgroundColor: fill, borderRadius: 6 }}
                        />
                      </View>
                      <View style={styles.rowBottom}>
                        <Text style={{ color: colors.textMuted }}>
                          Spent <Text style={{ fontWeight: "700" }}>{formatMoney(b.spent)}</Text>
                        </Text>
                        <Text style={{ color: colors.textMuted }}>
                          Remaining{" "}
                          <Text style={{ color: over ? colors.danger : colors.success, fontWeight: "700" }}>
                            {formatMoney(b.remaining)}
                          </Text>
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </>
        ) : (
          <>
            <Card style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Total savings (all goals)</Text>
              <Text style={{ color: colors.success, fontSize: 28, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 }}>
                {formatMoney(goals.reduce((s, g) => s + goalTotals(g).available, 0))}
              </Text>
            </Card>

            <Pressable
              style={({ pressed }) => [
                styles.newBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={openGoalModal}
            >
              <Text style={styles.newBtnText}>+ New goal</Text>
            </Pressable>

            {goals.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No savings goals yet.
                </Text>
              </Card>
            ) : (
              goals.map((g) => {
                const { saved, spent, available } = goalTotals(g);
                const target = Number(g.target) || 0;
                const p = target > 0 ? Math.min(100, Math.max(0, (saved / target) * 100)) : 0;
                return (
                  <Pressable key={g.id} onPress={() => navigation.navigate("Goal", { id: g.id })}>
                    <Card>
                      <View style={styles.rowTop}>
                        <Text style={[styles.name, { color: colors.text }]}>{g.name}</Text>
                        <Text style={{ color: available < 0 ? colors.danger : colors.success, fontWeight: "700" }}>
                          {formatMoney(available)}
                        </Text>
                      </View>
                      {target > 0 && (
                        <View style={[styles.bar, { backgroundColor: colors.chipBg }]}>
                          <View
                            style={{ width: `${p}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 6 }}
                          />
                        </View>
                      )}
                      <View style={styles.rowBottom}>
                        <Text style={{ color: colors.textMuted }}>
                          Saved <Text style={{ fontWeight: "700" }}>{formatMoney(saved)}</Text>
                        </Text>
                        <Text style={{ color: colors.textMuted }}>
                          {target > 0 ? `${Math.round(p)}% of ${formatMoney(target)}` : `Spent ${formatMoney(spent)}`}
                        </Text>
                      </View>
                    </Card>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* New goal form */}
      <Modal visible={goalModal} transparent animationType="fade" onRequestClose={() => setGoalModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGoalModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New savings goal</Text>
            <Text style={[styles.label, { color: colors.textMuted }]}>Goal name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              placeholder="e.g. Cycle fund"
              placeholderTextColor={colors.textMuted}
              value={goalName}
              onChangeText={setGoalName}
            />
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
              Total amount you have to save (₹)
            </Text>
            <MoneyInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              placeholder="e.g. 20000"
              value={goalAmount}
              onChangeText={setGoalAmount}
            />
            {Number(goalAmount) > 0 && (
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                {amountToWords(goalAmount)}
              </Text>
            )}
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setGoalModal(false)} style={{ flex: 1 }} />
              <Button
                title="Create"
                onPress={submitGoal}
                disabled={!goalName.trim() || !(Number(goalAmount) > 0)}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 2 },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3, marginBottom: 14 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  newBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#f37021",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  newBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "600" },
  bar: { height: 8, borderRadius: 6, overflow: "hidden" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginLeft: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
});
