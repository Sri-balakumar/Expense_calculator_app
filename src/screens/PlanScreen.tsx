import React, { useEffect, useMemo, useState } from "react";
import {
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
import { useFeedback } from "../components/Feedback";
import { Card, Button } from "../components/UI";
import ChipPicker from "../components/ChipPicker";
import PlanPayModal, { PlanPayResult } from "../components/PlanPayModal";
import {
  getMonth,
  watchExpenses,
  watchPlans,
  addPlan,
  updatePlan,
  deletePlan,
  addExpense,
  deleteExpense,
  listMonths,
  movePlans,
} from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { toJsDate, formatDateTime } from "../util/date";
import { useCategories } from "../context/CategoriesContext";
import { PlanDoc, Expense, MonthDoc } from "../types";

export default function PlanScreen({ route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { confirm, toast } = useFeedback();
  const { options: catOptions } = useCategories();
  const PLAN_CAT_OPTS = catOptions(false);

  const monthId: string = route.params?.monthId;
  const monthName: string = route.params?.name || "Plan";

  const [balance, setBalance] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [expenseById, setExpenseById] = useState<Record<string, Expense>>({});
  const [plans, setPlans] = useState<PlanDoc[]>([]);

  // add-row state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");

  // modal state
  const [pay, setPay] = useState<{ plan: PlanDoc; mode: "done" | "part" } | null>(null);
  const [edit, setEdit] = useState<PlanDoc | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCat, setEditCat] = useState("other");
  const [move, setMove] = useState<PlanDoc[] | null>(null);
  const [detail, setDetail] = useState<PlanDoc | null>(null);

  useEffect(() => {
    if (!user) return;
    getMonth(user.uid, "month", monthId).then((m) => {
      if (m) setBalance(Number((m as MonthDoc).currentBalance) || 0);
    });
    const unsubExp = watchExpenses(user.uid, "month", monthId, (list) => {
      let spent = 0;
      const byId: Record<string, Expense> = {};
      list.forEach((e) => {
        byId[e.id] = e;
        const amt = Number(e.amount) || 0;
        spent += e.type === "plus" ? -amt : amt;
      });
      setMonthSpent(spent);
      setExpenseById(byId);
    });
    const unsubPlans = watchPlans(user.uid, monthId, (list) => {
      // createdAt asc
      list.sort((a, b) => (toJsDate(a.createdAt)?.getTime() || 0) - (toJsDate(b.createdAt)?.getTime() || 0));
      setPlans(list);
    });
    return () => {
      unsubExp();
      unsubPlans();
    };
  }, [user, monthId]);

  // figures
  const { pending } = useMemo(() => {
    let pend = 0;
    plans.forEach((p) => {
      const planned = Number(p.planned) || 0;
      const paid = Number(p.paid) || 0;
      if (p.status === "pending") pend += planned;
      else if (p.status === "partial") pend += Math.max(0, planned - paid);
    });
    return { pending: pend };
  }, [plans]);

  const remaining = balance - monthSpent;
  const afterPlans = remaining - pending;

  // ---- add ----
  const onAdd = async () => {
    if (!user) return;
    const n = name.trim();
    const planned = Number(amount);
    if (!n) return toast("Enter a plan name.", "error");
    if (!planned || planned <= 0) return toast("Enter a valid amount.", "error");
    const after = remaining - (pending + planned);
    if (after < 0) {
      const ok = await confirm({
        title: "Plans exceed balance",
        message: `Adding this makes pending plans ${formatMoney(-after)} more than your balance (${formatMoney(remaining)}). Add anyway?`,
        confirmText: "Add anyway",
      });
      if (!ok) return;
    }
    await addPlan(user.uid, monthId, {
      name: n,
      planned,
      category,
      status: "pending",
      actual: null,
      paid: 0,
      payments: [],
      pushedExpenseId: null,
    } as any);
    setName("");
    setAmount("");
    setCategory("other");
  };

  // ---- done / part-pay ----
  const openDone = (p: PlanDoc) => {
    if ((Number(p.paid) || 0) > 0) {
      finalizePartial(p);
      return;
    }
    setPay({ plan: p, mode: "done" });
  };

  const finalizePartial = async (p: PlanDoc) => {
    if (!user) return;
    const planned = Number(p.planned) || 0;
    const paid = Number(p.paid) || 0;
    const ok = await confirm({
      title: `Finish "${p.name}"?`,
      message: `Spent ${formatMoney(paid)} of ${formatMoney(planned)}. The remaining ${formatMoney(Math.max(0, planned - paid))} won't be recorded.`,
      confirmText: "Finish",
      danger: false,
    });
    if (!ok) return;
    await updatePlan(user.uid, monthId, p.id, { status: "done", actual: paid });
    toast(`${p.name} closed`, "success");
  };

  const submitPay = async (r: PlanPayResult) => {
    if (!user || !pay) return;
    const p = pay.plan;
    const mode = pay.mode;
    setPay(null);

    if (mode === "done") {
      // Marking done just records the outcome on the plan itself. It does NOT
      // push an expense into the month, so it never shows in the Monthly section
      // and never affects the balance/calculations — the plan simply stays here,
      // finished.
      await updatePlan(user.uid, monthId, p.id, {
        status: "done",
        actual: r.amount,
        category: r.category,
        pushedExpenseId: null,
      });
      toast(`${p.name} done`, "success");
      return;
    }

    // Part payment still records a real expense in the month.
    // over-balance warning
    if (r.amount > remaining) {
      const ok = await confirm({
        title: "Over your balance",
        message: `Paying ${formatMoney(r.amount)} is ${formatMoney(r.amount - remaining)} more than what's left (${formatMoney(remaining)}). Record anyway?`,
        confirmText: "Record anyway",
      });
      if (!ok) return;
    }
    const expId = await addExpense(user.uid, "month", monthId, {
      name: p.name,
      amount: r.amount,
      type: "minus",
      category: r.category,
      paymentMethod: r.paymentMethod,
      notes: r.notes || `Part payment: ${monthName}`,
    } as any);

    {
      const payments = Array.isArray(p.payments) ? p.payments.slice() : [];
      payments.push({
        name: p.name,
        amount: r.amount,
        expenseId: expId,
        category: r.category,
        paymentMethod: r.paymentMethod,
        notes: r.notes,
        paidAt: new Date(),
      });
      const newPaid = (Number(p.paid) || 0) + r.amount;
      await updatePlan(user.uid, monthId, p.id, { paid: newPaid, payments, status: "partial" });
      const left = Math.max(0, (Number(p.planned) || 0) - newPaid);
      toast(`${formatMoney(r.amount)} paid · ${formatMoney(left)} left`, "success");
    }
  };

  // ---- undo / delete ----
  const onUndo = async (p: PlanDoc) => {
    if (!user) return;
    if (Array.isArray(p.payments) && p.payments.length) {
      await updatePlan(user.uid, monthId, p.id, { status: "partial", actual: null });
      toast("Reopened — part payments kept.", "success");
      return;
    }
    if (p.pushedExpenseId) await deleteExpense(user.uid, "month", monthId, p.pushedExpenseId).catch(() => {});
    await updatePlan(user.uid, monthId, p.id, { status: "pending", actual: null, pushedExpenseId: null });
    toast("Plan reopened.", "success");
  };

  const onDelete = async (p: PlanDoc) => {
    if (!user) return;
    const payments = Array.isArray(p.payments) ? p.payments : [];
    const toRemove = payments.filter((pay) => pay.expenseId && !pay.linked);
    const expCount = toRemove.length + (p.pushedExpenseId ? 1 : 0);
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message: expCount > 0 ? `Also removes the ${expCount > 1 ? expCount + " expenses" : "expense"} it recorded in ${monthName}.` : "This removes the plan.",
      confirmText: "Delete",
    });
    if (!ok) return;
    for (const pay of toRemove) await deleteExpense(user.uid, "month", monthId, pay.expenseId!).catch(() => {});
    if (p.pushedExpenseId) await deleteExpense(user.uid, "month", monthId, p.pushedExpenseId).catch(() => {});
    await deletePlan(user.uid, monthId, p.id);
    toast("Plan deleted.", "success");
  };

  // ---- edit ----
  const openEdit = (p: PlanDoc) => {
    setEdit(p);
    setEditName(p.name);
    setEditAmount(String(Number(p.planned) || 0));
    setEditCat(p.category || "other");
  };
  const submitEdit = async () => {
    if (!user || !edit) return;
    const n = editName.trim();
    const planned = Number(editAmount);
    if (!n) return toast("Enter a plan name.", "error");
    if (!planned || planned <= 0) return toast("Enter a valid amount.", "error");
    await updatePlan(user.uid, monthId, edit.id, { name: n, planned, category: editCat });
    setEdit(null);
    toast("Plan updated.", "success");
  };

  // ---- move ----
  const [moveMonths, setMoveMonths] = useState<MonthDoc[]>([]);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const openMove = async (p: PlanDoc) => {
    if (!user) return;
    const months = (await listMonths(user.uid)).filter((m) => m.id !== monthId);
    if (!months.length) return toast("Create another month to move into.", "error");
    setMoveMonths(months);
    setMoveTarget(months[0].id);
    setMove([p]);
  };
  const doMove = async (mode: "whole" | "unpaid") => {
    if (!user || !move) return;
    const target = moveMonths.find((m) => m.id === moveTarget);
    if (!target) return;
    const n = await movePlans(user.uid, monthId, monthName, move, mode, target.id, target.name);
    setMove(null);
    toast(n ? `${n} plan${n > 1 ? "s" : ""} moved to ${target.name}.` : "Nothing to move.", n ? "success" : "error");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Figures */}
        <Card>
          <View style={styles.figRow}>
            <Fig label="Balance" value={formatMoney(balance)} color={colors.text} />
            <Fig label="Remaining" value={formatMoney(remaining)} color={remaining < 0 ? colors.danger : colors.success} />
            <Fig label="After plans" value={formatMoney(afterPlans)} color={afterPlans < 0 ? colors.danger : colors.success} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, textAlign: "center" }}>
            Pending plans: {formatMoney(pending)}
          </Text>
        </Card>

        {/* Add row */}
        <Card>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Add a plan</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            placeholder="Name (e.g. Grocery)"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8 }]}
            placeholder="Planned amount (₹)"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <View style={{ marginTop: 8 }}>
            <ChipPicker options={PLAN_CAT_OPTS} value={category} onChange={setCategory} />
          </View>
          <Button title="+ Add plan" onPress={onAdd} style={{ marginTop: 10 }} />
        </Card>

        {/* Rows */}
        {plans.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, textAlign: "center" }}>No plans yet.</Text>
          </Card>
        ) : (
          plans.map((p) => (
            <PlanRow
              key={p.id}
              p={p}
              colors={colors}
              onDetail={() => setDetail(p)}
              onDone={() => openDone(p)}
              onPart={() => setPay({ plan: p, mode: "part" })}
              onMove={() => openMove(p)}
              onEdit={() => openEdit(p)}
              onDelete={() => onDelete(p)}
              onUndo={() => onUndo(p)}
            />
          ))
        )}
      </ScrollView>

      {/* Done / Part pay */}
      <PlanPayModal
        visible={!!pay}
        title={pay?.mode === "done" ? `Mark "${pay?.plan.name}" done` : `Record payment for "${pay?.plan.name}"`}
        subtitle={
          pay
            ? `${formatMoney(Number(pay.plan.paid) || 0)} paid of ${formatMoney(Number(pay.plan.planned) || 0)}`
            : undefined
        }
        confirmText={pay?.mode === "done" ? "Mark done" : "Record payment"}
        defaultAmount={
          pay
            ? Math.max(0, (Number(pay.plan.planned) || 0) - (Number(pay.plan.paid) || 0)) || Number(pay.plan.planned) || 0
            : 0
        }
        defaultCategory={pay?.plan.category || "other"}
        onClose={() => setPay(null)}
        onSubmit={submitPay}
        onError={(m) => toast(m, "error")}
      />

      {/* Edit */}
      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEdit(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Edit plan</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8 }]}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="Planned amount"
              placeholderTextColor={colors.textMuted}
            />
            <View style={{ marginTop: 8 }}>
              <ChipPicker options={PLAN_CAT_OPTS} value={editCat} onChange={setEditCat} />
            </View>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setEdit(null)} style={{ flex: 1 }} />
              <Button title="Save" onPress={submitEdit} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move */}
      <Modal visible={!!move} transparent animationType="fade" onRequestClose={() => setMove(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMove(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Move "{move?.[0]?.name}"
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: 10 }}>Move to month:</Text>
            <ScrollView style={{ maxHeight: 180 }}>
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
            <View style={styles.actions}>
              <Button title="Unpaid part" variant="secondary" onPress={() => doMove("unpaid")} style={{ flex: 1 }} />
              <Button title="Whole plan" onPress={() => doMove("whole")} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            {detail && <PlanDetail p={detail} colors={colors} expenseById={expenseById} />}
            <Button title="Close" variant="secondary" onPress={() => setDetail(null)} style={{ marginTop: 12 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Fig({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 11, color: "#888" }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "800", color, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function statusChip(p: PlanDoc, colors: any) {
  const map: Record<string, { label: string; bg: string }> = {
    done: { label: "✓ Done", bg: colors.success },
    moved: { label: `↪ Moved`, bg: colors.textMuted },
    partial: { label: "◐ Partial", bg: "#f59e0b" },
    pending: { label: "Pending", bg: colors.primary },
  };
  return map[p.status] || map.pending;
}

function PlanRow({ p, colors, onDetail, onDone, onPart, onMove, onEdit, onDelete, onUndo }: any) {
  const { emoji: catEmoji } = useCategories();
  const planned = Number(p.planned) || 0;
  const paid = Number(p.paid) || 0;
  const actual = Number(p.actual) || 0;
  const cat = p.category || "other";
  const chip = statusChip(p, colors);
  const isDone = p.status === "done";
  const isMoved = p.status === "moved";
  const isPartial = p.status === "partial";

  let amountText: string;
  if (isDone) amountText = `${formatMoney(planned)} → ${formatMoney(actual || paid)}`;
  else if (isPartial) amountText = `${formatMoney(paid)} paid · ${formatMoney(Math.max(0, planned - paid))} left`;
  else if (isMoved) amountText = `${formatMoney(paid)} paid → moved`;
  else amountText = formatMoney(planned);

  return (
    <Card>
      <Pressable onPress={onDetail}>
        <View style={styles.rowTop}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, flexShrink: 1 }}>
            {catEmoji(cat)} {p.name}
          </Text>
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{chip.label}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>{amountText}</Text>
        {!!p.transferredFrom && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>↪ from {p.transferredFrom}</Text>
        )}
      </Pressable>

      <View style={styles.rowActions}>
        {!isMoved && !isDone && <MiniBtn label="Done" color={colors.primary} onPress={onDone} />}
        {!isMoved && !isDone && <MiniBtn label="Part" color={colors.text} onPress={onPart} />}
        {!isMoved && !isDone && <MiniBtn label="Move" color={colors.text} onPress={onMove} />}
        {isDone && <MiniBtn label="Undo" color={colors.text} onPress={onUndo} />}
        {!isMoved && <MiniBtn label="Edit" color={colors.text} onPress={onEdit} />}
        <MiniBtn label="Delete" color={colors.danger} onPress={onDelete} />
      </View>
    </Card>
  );
}

function MiniBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ color, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function PlanDetail({ p, colors, expenseById }: any) {
  const { label: catLabel, emoji: catEmoji } = useCategories();
  const planned = Number(p.planned) || 0;
  const paid = Number(p.paid) || 0;
  const actual = Number(p.actual) || 0;
  const isDone = p.status === "done";
  const payments = Array.isArray(p.payments) ? p.payments : [];
  return (
    <View>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{p.name}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 2, marginBottom: 10 }}>
        {catEmoji(p.category)} {catLabel(p.category)} ·{" "}
        {statusChip(p, colors).label}
      </Text>
      <DRow label="Planned" value={formatMoney(planned)} colors={colors} />
      {isDone ? (
        <DRow label="Spent" value={formatMoney(payments.length ? paid : actual)} colors={colors} />
      ) : (
        <>
          <DRow label="Paid" value={formatMoney(paid)} colors={colors} />
          <DRow label="Remaining" value={formatMoney(Math.max(0, planned - paid))} colors={colors} />
        </>
      )}
      {payments.length > 0 && (
        <>
          <Text style={{ color: colors.text, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>
            Items added
          </Text>
          {payments.map((pay: any, i: number) => {
            const exp = pay.expenseId ? expenseById[pay.expenseId] : null;
            const nm = pay.name || (exp && exp.name) || p.name;
            return (
              <View key={i} style={styles.rowTop}>
                <Text style={{ color: colors.textMuted, flexShrink: 1 }}>
                  {nm}{" "}
                  <Text style={{ fontSize: 11 }}>
                    {pay.paidAt ? `· ${formatDateTime(toJsDate(pay.paidAt))}` : ""}
                  </Text>
                </Text>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{formatMoney(pay.amount)}</Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function DRow({ label, value, colors }: any) {
  return (
    <View style={styles.rowTop}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figRow: { flexDirection: "row" },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.15)",
    paddingTop: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, maxHeight: "85%" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  monthOpt: { padding: 12, borderRadius: 10, marginBottom: 8 },
});
