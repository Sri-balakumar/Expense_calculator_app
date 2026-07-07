// Savings goal detail: add savings ("in"), plan purchases ("out"), track the
// available balance and progress toward the target.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import {
  getGoal,
  addGoalEntry,
  deleteGoalEntry,
  updateGoal,
  deleteGoal,
  listMonths,
  addPlan,
  updatePlan,
  addExpense,
  getPlans,
} from "../firebase/firestore";
import { formatMoney, amountToWords } from "../util/money";
import { toJsDate, formatDateTime } from "../util/date";
import { GoalDoc, GoalEntry, MonthDoc, PlanDoc } from "../types";

export default function GoalScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { confirm, prompt, toast } = useFeedback();
  const id: string = route.params?.id;

  const [goal, setGoal] = useState<GoalDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [entryModal, setEntryModal] = useState<null | "in" | "out">(null);
  const [entryName, setEntryName] = useState("");
  const [entryAmount, setEntryAmount] = useState("");

  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");

  // Move a purchase to Plans / Monthly of a chosen month
  const [moveEntry, setMoveEntry] = useState<GoalEntry | null>(null);
  const [moveMonths, setMoveMonths] = useState<MonthDoc[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveDest, setMoveDest] = useState<"plan" | "expense">("plan");
  const [monthPlans, setMonthPlans] = useState<PlanDoc[]>([]);
  const [linkedPlanId, setLinkedPlanId] = useState<string | null>(null);
  const [moveShowNew, setMoveShowNew] = useState(false); // creating a new plan
  const [moveNewName, setMoveNewName] = useState("");
  const moveAmt = Number(moveEntry?.amount) || 0;

  // Load the chosen month's plans (for the plan-selection list).
  useEffect(() => {
    if (!user || !moveEntry || !moveTarget) {
      setMonthPlans([]);
      return;
    }
    let active = true;
    getPlans(user.uid, moveTarget)
      .then((ps) => active && setMonthPlans(ps))
      .catch(() => active && setMonthPlans([]));
    return () => {
      active = false;
    };
  }, [user, moveEntry, moveTarget]);

  const load = useCallback(async () => {
    if (!user) return;
    const g = await getGoal(user.uid, id);
    setGoal(g);
    if (g) navigation.setOptions({ title: g.name });
    setLoading(false);
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const entries: GoalEntry[] = (goal?.entries || [])
    .slice()
    .sort((a, b) => (toJsDate(b.at)?.getTime() || 0) - (toJsDate(a.at)?.getTime() || 0));
  const saved = entries.filter((e) => e.type === "in").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const spent = entries.filter((e) => e.type === "out").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const available = saved - spent;
  const target = Number(goal?.target) || 0;
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

  const openEntry = (type: "in" | "out") => {
    setEntryModal(type);
    setEntryName("");
    setEntryAmount("");
  };

  const submitEntry = async () => {
    if (!user || !entryModal) return;
    const amt = Number(entryAmount);
    if (!amt || amt <= 0) return toast("Enter a valid amount.", "error");
    if (entryModal === "out" && amt > available) {
      const ok = await confirm({
        title: "Over available",
        message: `Only ${formatMoney(available)} available. Plan this ${formatMoney(amt)} anyway?`,
        confirmText: "Plan anyway",
      });
      if (!ok) return;
    }
    await addGoalEntry(user.uid, id, {
      name: entryName.trim() || (entryModal === "in" ? "Savings" : "Purchase"),
      amount: amt,
      type: entryModal,
    });
    console.log("[Goal] entry added", { type: entryModal, amount: amt });
    setEntryModal(null);
    load();
    toast(entryModal === "in" ? "Savings added" : "Purchase planned", "success");
  };

  const removeEntry = async (e: GoalEntry) => {
    if (!user) return;
    const ok = await confirm({
      title: "Delete this entry?",
      message: `${e.name || (e.type === "in" ? "Savings" : "Purchase")} — ${formatMoney(e.amount)}`,
      confirmText: "Delete",
    });
    if (!ok) return;
    await deleteGoalEntry(user.uid, id, e.eid);
    load();
    toast("Deleted", "success");
  };

  const openEdit = () => {
    setEditName(goal?.name || "");
    setEditTarget(target ? String(target) : "");
    setEditModal(true);
  };
  const saveEdit = async () => {
    if (!user) return;
    const n = editName.trim();
    if (!n) return toast("Enter a name.", "error");
    await updateGoal(user.uid, id, { name: n, target: Number(editTarget) || 0 });
    setEditModal(false);
    load();
    toast("Goal updated", "success");
  };

  // Increase the target by adding an extra amount to the existing one.
  const onAddTarget = async () => {
    if (!user) return;
    const extra = await prompt({
      title: "Add to target (₹)",
      placeholder: "e.g. 10000",
      keyboardType: "numeric",
    });
    if (extra === null) return;
    const add = Number(extra);
    if (!add || add <= 0) return toast("Enter a valid amount.", "error");
    await updateGoal(user.uid, id, { target: target + add });
    console.log("[Goal] target increased by", add, "→", target + add);
    load();
    toast(`Target raised to ${formatMoney(target + add)}`, "success");
  };

  // Move a planned purchase to Plans or Monthly of a chosen month.
  const openMove = async (e: GoalEntry) => {
    if (!user) return;
    const months = await listMonths(user.uid);
    if (!months.length) return toast("Create a month first (Monthly tab).", "error");
    setMoveMonths(months);
    setMoveTarget(months[0].id);
    setMoveDest("plan");
    setLinkedPlanId(null);
    setMoveShowNew(false);
    setMoveNewName("");
    setMoveEntry(e);
  };
  const doMove = async () => {
    if (!user || !moveEntry) return;
    const m = moveMonths.find((mm) => mm.id === moveTarget);
    if (!m) return;
    const name = moveEntry.name || "Purchase";
    if (moveDest === "plan") {
      const linked = linkedPlanId ? monthPlans.find((pl) => pl.id === linkedPlanId) : null;
      if (linked) {
        // Put the purchase UNDER the selected plan as a part-payment.
        const payments = Array.isArray(linked.payments) ? linked.payments.slice() : [];
        payments.push({ name, amount: moveEntry.amount, paidAt: new Date() } as any);
        const newPaid = (Number(linked.paid) || 0) + moveEntry.amount;
        const plannedAmt = Number(linked.planned) || 0;
        const over = newPaid > plannedAmt; // don't mark done when it overflows the plan
        const done = !over && newPaid >= plannedAmt;
        await updatePlan(user.uid, moveTarget, linked.id, {
          payments,
          paid: newPaid,
          status: done ? "done" : "partial",
          actual: done ? newPaid : null,
        } as any);
        console.log("[Goal] added under plan", { plan: linked.name, name, newPaid });
      } else {
        // No plan chosen → create a new plan from the purchase.
        const pn = moveNewName.trim() || name;
        await addPlan(user.uid, moveTarget, {
          name: pn,
          planned: moveEntry.amount,
          category: "other",
          status: "pending",
          actual: null,
          paid: 0,
          payments: [],
          pushedExpenseId: null,
        } as any);
        console.log("[Goal] created new plan", { name: pn });
      }
    } else {
      await addExpense(user.uid, "month", moveTarget, {
        name,
        amount: moveEntry.amount,
        type: "minus",
        category: "other",
        paymentMethod: "cash",
        notes: `From savings goal: ${goal?.name || ""}`,
      } as any);
    }
    await deleteGoalEntry(user.uid, id, moveEntry.eid);
    console.log("[Goal] purchase moved", { dest: moveDest, month: m.name, name });
    setMoveEntry(null);
    load();
    toast(`Moved to ${moveDest === "plan" ? "Plans" : "Monthly"} · ${m.name}`, "success");
  };

  const onDeleteGoal = async () => {
    if (!user) return;
    const ok = await confirm({
      title: `Delete "${goal?.name}"?`,
      message: "This removes the goal and all its savings/purchase history.",
      confirmText: "Delete",
    });
    if (!ok) return;
    await deleteGoal(user.uid, id);
    navigation.goBack();
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Total savings + available */}
        <Card style={{ alignItems: "center", paddingVertical: 22 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Total savings</Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 34,
              fontWeight: "800",
              letterSpacing: -0.4,
              marginTop: 2,
            }}
          >
            {formatMoney(saved)}
          </Text>
          <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Available</Text>
              <Text
                style={{
                  color: available < 0 ? colors.danger : colors.success,
                  fontWeight: "800",
                  marginTop: 2,
                }}
              >
                {formatMoney(available)}
              </Text>
            </View>
            <Fig label="Spent" value={formatMoney(spent)} colors={colors} />
            <Fig label="Target" value={target ? formatMoney(target) : "—"} colors={colors} />
          </View>
          {target > 0 && (
            <View style={{ alignSelf: "stretch", marginTop: 14 }}>
              <View style={[styles.bar, { backgroundColor: colors.chipBg }]}>
                <View
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: colors.primary,
                    borderRadius: 6,
                  }}
                />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: "center" }}>
                {pct}% saved toward {formatMoney(target)}
              </Text>
            </View>
          )}
          <Pressable onPress={onAddTarget} style={{ marginTop: 12 }} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>
              ＋ Add to target
            </Text>
          </Pressable>
        </Card>

        {/* Actions */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="+ Add savings" onPress={() => openEntry("in")} style={{ flex: 1 }} />
          <Button
            title="− Plan purchase"
            variant="secondary"
            onPress={() => openEntry("out")}
            style={{ flex: 1 }}
          />
        </View>

        {/* History */}
        <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>HISTORY</Text>
        {entries.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, textAlign: "center" }}>
              No entries yet. Add savings or plan a purchase.
            </Text>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {entries.map((e, i) => (
              <View
                key={e.eid}
                style={[
                  styles.row,
                  { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {e.type === "in" ? "💰" : "🛒"} {e.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {formatDateTime(toJsDate(e.at))}
                  </Text>
                </View>
                <Text
                  style={{
                    color: e.type === "in" ? colors.success : colors.danger,
                    fontWeight: "800",
                    marginRight: 12,
                  }}
                >
                  {e.type === "in" ? "+" : "−"} {formatMoney(e.amount)}
                </Text>
                {e.type === "out" && (
                  <Pressable onPress={() => openMove(e)} hitSlop={8} style={{ marginRight: 12 }}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Move</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => removeEntry(e)} hitSlop={8}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Button title="Edit goal" variant="secondary" onPress={openEdit} style={{ flex: 1 }} />
          <Button title="Delete goal" variant="danger" onPress={onDeleteGoal} style={{ flex: 1 }} />
        </View>
      </ScrollView>

      {/* Add savings / purchase modal */}
      <Modal visible={!!entryModal} transparent animationType="fade" onRequestClose={() => setEntryModal(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEntryModal(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {entryModal === "in" ? "Add savings" : "Plan a purchase"}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              placeholder={entryModal === "in" ? "Note (e.g. Salary)" : "What (e.g. Cycle)"}
              placeholderTextColor={colors.textMuted}
              value={entryName}
              onChangeText={setEntryName}
            />
            <MoneyInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8 }]}
              placeholder="Amount (₹)"
              value={entryAmount}
              onChangeText={setEntryAmount}
              autoFocus
            />
            {Number(entryAmount) > 0 && (
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                {amountToWords(entryAmount)}
              </Text>
            )}
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setEntryModal(null)} style={{ flex: 1 }} />
              <Button title={entryModal === "in" ? "Add" : "Plan"} onPress={submitEntry} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit goal modal */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Edit goal</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={setEditName}
            />
            <MoneyInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8 }]}
              placeholder="Target (₹) — optional"
              value={editTarget}
              onChangeText={setEditTarget}
            />
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setEditModal(false)} style={{ flex: 1 }} />
              <Button title="Save" onPress={saveEdit} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move purchase → Plans / Monthly of a chosen month */}
      <Modal visible={!!moveEntry} transparent animationType="fade" onRequestClose={() => setMoveEntry(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMoveEntry(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Move "{moveEntry?.name}" ({formatMoney(moveEntry?.amount || 0)})
            </Text>

            <View style={[styles.tabs, { backgroundColor: colors.chipBg }]}>
              {(["plan", "expense"] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => {
                    setMoveDest(d);
                    setLinkedPlanId(null);
                    setMoveShowNew(false);
                    setMoveNewName("");
                  }}
                  style={[styles.tabBtn, moveDest === d && { backgroundColor: colors.cardBg }]}
                >
                  <Text style={{ color: moveDest === d ? colors.primary : colors.textMuted, fontWeight: "700" }}>
                    {d === "plan" ? "Plans" : "Monthly"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>Which month</Text>
            <ScrollView style={{ maxHeight: 150 }}>
              {moveMonths.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setMoveTarget(m.id)}
                  style={[
                    styles.monthOpt,
                    { backgroundColor: moveTarget === m.id ? colors.primary : colors.chipBg },
                  ]}
                >
                  <Text style={{ color: moveTarget === m.id ? "#fff" : colors.text, fontWeight: "600" }}>
                    {m.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Plans tab: pick an existing plan to put the purchase UNDER, or create a new one. */}
            {moveDest === "plan" && (
              <>
                <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
                  Add under an existing plan (optional)
                </Text>
                {monthPlans.length === 0 && !moveShowNew && (
                  <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 4 }}>
                    No plans in this month yet — create one below.
                  </Text>
                )}
                <ScrollView style={{ maxHeight: 150 }}>
                  {monthPlans.map((pl) => {
                    const sel = linkedPlanId === pl.id;
                    const planned = Number(pl.planned) || 0;
                    const paidNow = Number(pl.paid) || 0;
                    const after = paidNow + moveAmt;
                    const alreadyOver = paidNow > planned;
                    const over = after > planned;
                    return (
                      <Pressable
                        key={pl.id}
                        onPress={() => {
                          setLinkedPlanId(sel ? null : pl.id);
                          setMoveShowNew(false);
                        }}
                        style={{
                          paddingVertical: 9,
                          paddingHorizontal: 10,
                          borderRadius: 10,
                          marginBottom: 6,
                          backgroundColor: sel ? colors.chipBg : "transparent",
                          borderWidth: 1,
                          borderColor: sel ? colors.primary : colors.border,
                        }}
                      >
                        <View style={styles.between}>
                          <Text
                            style={{ color: sel ? colors.primary : colors.text, fontWeight: "700", flexShrink: 1 }}
                            numberOfLines={1}
                          >
                            {sel ? "● " : "○ "}
                            {pl.name}
                          </Text>
                          <Text
                            style={{
                              color: alreadyOver ? colors.danger : colors.textMuted,
                              fontWeight: "700",
                              fontSize: 12,
                            }}
                          >
                            {formatMoney(paidNow)} / {formatMoney(planned)}
                            {alreadyOver ? " ⚠" : ""}
                          </Text>
                        </View>
                        {sel && (
                          <Text
                            style={{
                              color: over ? colors.danger : colors.success,
                              fontSize: 12,
                              fontWeight: "700",
                              marginTop: 6,
                            }}
                          >
                            {alreadyOver
                              ? `⚠️ This plan is already ${formatMoney(paidNow - planned)} over its ${formatMoney(planned)} plan. Increase the planned amount or remove an existing item first.`
                              : over
                              ? `⚠️ This puts the plan ${formatMoney(after - planned)} over its ${formatMoney(planned)} plan. Increase the planned amount or drop an item.`
                              : `After: ${formatMoney(after)} of ${formatMoney(planned)} · ${formatMoney(planned - after)} left`}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {moveShowNew ? (
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 4 },
                    ]}
                    value={moveNewName}
                    onChangeText={setMoveNewName}
                    placeholder={`New plan name (default "${moveEntry?.name || ""}")`}
                    placeholderTextColor={colors.textMuted}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      setMoveShowNew(true);
                      setLinkedPlanId(null);
                    }}
                    style={{ paddingVertical: 8 }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>+ New plan</Text>
                  </Pressable>
                )}
              </>
            )}

            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setMoveEntry(null)} style={{ flex: 1 }} />
              <Button
                title={
                  moveDest === "plan"
                    ? linkedPlanId
                      ? "Add under plan"
                      : "Create plan"
                    : "Add to Monthly"
                }
                onPress={doMove}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Fig({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "700", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  breakdown: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignSelf: "stretch",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bar: { height: 10, borderRadius: 6, overflow: "hidden" },
  sectionHeader: { fontSize: 12, fontWeight: "600", letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 14 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  tabs: { flexDirection: "row", borderRadius: 10, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginLeft: 2 },
  monthOpt: { padding: 12, borderRadius: 10, marginBottom: 8 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveBox: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  liveRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  liveTotalRow: { borderTopWidth: 1, marginTop: 4, paddingTop: 7 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
});
