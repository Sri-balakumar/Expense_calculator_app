import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, Button, MoneyInput } from "../components/UI";
import SelectField from "../components/SelectField";
import PlanPayModal, { PlanPayResult } from "../components/PlanPayModal";
import CalendarModal, { CalItem } from "../components/CalendarModal";
import Watermark from "../components/Watermark";
import {
  getMonth,
  watchExpenses,
  watchPlans,
  addPlan,
  updatePlan,
  deletePlan,
  getPlan,
  addExpense,
  deleteExpense,
  listMonths,
  movePlans,
} from "../firebase/firestore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { formatMoney, amountToWords, currencySymbol } from "../util/money";
import {
  toJsDate,
  formatDateTime,
  todayStr,
  dateToInputValue,
  inputValueToDate,
  inputValueToTimestamp,
  formatDateMedium,
} from "../util/date";
import { useCategories, useQuickAddCategory } from "../context/CategoriesContext";
import { derivePlanStatus } from "../util/plan";
import { PlanDoc, PlanEdit, Expense, MonthDoc } from "../types";

export default function PlanScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const { confirm, toast } = useFeedback();
  const { options: catOptions } = useCategories();
  const PLAN_CAT_OPTS = catOptions(false);
  const quickAddCategory = useQuickAddCategory();

  const monthId: string = route.params?.monthId;
  const monthName: string = route.params?.name || "Plan";

  const [balance, setBalance] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [expenseById, setExpenseById] = useState<Record<string, Expense>>({});
  const [plans, setPlans] = useState<PlanDoc[]>([]);

  // add-row state
  const [addOpen, setAddOpen] = useState(false); // collapsible "Add a plan" form
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [planDate, setPlanDate] = useState(todayStr());
  const [showPlanDate, setShowPlanDate] = useState(false);

  // modal state
  const [pay, setPay] = useState<{ plan: PlanDoc; mode: "done" | "part" } | null>(null);
  const [edit, setEdit] = useState<PlanDoc | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCat, setEditCat] = useState("other");
  const [move, setMove] = useState<PlanDoc[] | null>(null);
  // "+ Add" — raises a plan's planned amount (never records a payment).
  const [topUp, setTopUp] = useState<PlanDoc | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [detail, setDetail] = useState<PlanDoc | null>(null);
  // Which item the user is removing, while we ask what to do with its entry.
  const [removeAsk, setRemoveAsk] = useState<{ plan: PlanDoc; idx: number; pay: any } | null>(null);
  const [calOpen, setCalOpen] = useState(false); // calendar popup

  // `detail` is only a handle on WHICH plan is open — always read the live doc
  // from the snapshot so the popup reflects edits and payments as they happen.
  const detailPlan = detail ? plans.find((x) => x.id === detail.id) || detail : null;
  const topUpPlan = topUp ? plans.find((x) => x.id === topUp.id) || topUp : null;

  // Calendar marks: each plan's date is a planned spend (red dot).
  const planDayKey = (p: PlanDoc) =>
    dateToInputValue(toJsDate((p as any).date) || toJsDate(p.createdAt));
  const calMarks = useMemo(() => {
    const m: Record<string, { spend?: boolean; income?: boolean }> = {};
    plans.forEach((p) => {
      const key = planDayKey(p);
      if (!m[key]) m[key] = {};
      m[key].spend = true;
    });
    return m;
  }, [plans]);
  const calItemsForDate = useCallback(
    (key: string): CalItem[] =>
      plans
        .filter((p) => planDayKey(p) === key)
        .map((p) => ({
          id: p.id,
          name: p.name,
          amount: Number(p.planned) || 0,
          kind: "spend" as const,
          sub: p.status,
        })),
    [plans]
  );

  // Calendar button in the header (rounded circle, top-right).
  useEffect(() => {
    if (!navigation) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setCalOpen(true)}
          hitSlop={10}
          style={{
            marginRight: 12,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 17 }}>📅</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

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
  const mainBalance = Number(profile?.mainBalance) || 0;

  // Live preview while typing a new plan's amount: current amount + existing
  // pending plans, and how it leaves the balance.
  const addAmt = Number(amount) || 0;
  const liveTotal = pending + addAmt; // pending plans + the one being typed
  const liveAfter = remaining - liveTotal;

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
      date: inputValueToTimestamp(planDate),
    } as any);
    console.log("[Plan] added", { name: n, planned, category, date: planDate });
    setName("");
    setAmount("");
    setCategory("other");
    setPlanDate(todayStr());
    setAddOpen(false); // collapse the dropdown after adding
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
    // Closed short of the planned amount on purpose — flagged so a later money
    // change doesn't quietly re-open it.
    await updatePlan(user.uid, monthId, p.id, {
      status: "done",
      actual: paid,
      closedEarly: paid < planned,
    });
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
        // Marking done records an outcome without any payment behind it, so the
        // numbers alone would say "pending" — keep re-derivation off this plan.
        closedEarly: (Number(p.paid) || 0) < (Number(p.planned) || 0),
      });
      toast(`${p.name} done`, "success");
      return;
    }

    // Part payment still records a real expense in the month.
    // Use the name entered in the popup (defaults to the plan name), so each
    // payment can have its own name instead of all sharing the plan's name.
    const payName = (r.name && r.name.trim()) || p.name;
    console.log("[Plan] part payment", { plan: p.name, payName, amount: r.amount });
    // over-balance warning
    if (r.amount > remaining) {
      const ok = await confirm({
        title: "Over your balance",
        message: `Paying ${formatMoney(r.amount)} is ${formatMoney(r.amount - remaining)} more than what's left (${formatMoney(remaining)}). Record anyway?`,
        confirmText: "Record anyway",
      });
      if (!ok) return;
    }
    const ts = inputValueToTimestamp(r.dateValue);
    const expId = await addExpense(user.uid, "month", monthId, {
      name: payName,
      amount: r.amount,
      type: "minus",
      category: r.category,
      paymentMethod: r.paymentMethod,
      notes: r.notes || `Part payment: ${monthName}`,
      ...(ts ? { createdAt: ts } : {}),
    } as any);

    {
      const payments = Array.isArray(p.payments) ? p.payments.slice() : [];
      payments.push({
        name: payName,
        amount: r.amount,
        expenseId: expId,
        category: r.category,
        paymentMethod: r.paymentMethod,
        notes: r.notes,
        paidAt: inputValueToDate(r.dateValue),
      });
      const newPaid = (Number(p.paid) || 0) + r.amount;
      // Once it's fully paid the plan closes itself — otherwise its "Part" button
      // stays live and the next tap records the whole amount a second time.
      const st = derivePlanStatus(p, Number(p.planned) || 0, newPaid, payments);
      await updatePlan(user.uid, monthId, p.id, {
        paid: newPaid,
        payments,
        ...(st || {}),
      });
      const left = Math.max(0, (Number(p.planned) || 0) - newPaid);
      toast(`${formatMoney(r.amount)} paid · ${formatMoney(left)} left`, "success");
    }
  };

  // ---- undo / delete ----
  const onUndo = async (p: PlanDoc) => {
    if (!user) return;
    // Re-opening by hand also drops the "closed early" flag, so from here on the
    // plan's status follows its numbers again.
    if (Array.isArray(p.payments) && p.payments.length) {
      await updatePlan(user.uid, monthId, p.id, { status: "partial", actual: null, closedEarly: false });
      toast("Reopened — part payments kept.", "success");
      return;
    }
    if (p.pushedExpenseId) await deleteExpense(user.uid, "month", monthId, p.pushedExpenseId).catch(() => {});
    await updatePlan(user.uid, monthId, p.id, {
      status: "pending",
      actual: null,
      pushedExpenseId: null,
      closedEarly: false,
    });
    toast("Plan reopened.", "success");
  };

  // Undo a move: delete the copy in the target month and restore this plan.
  // If the copy has already been used (part-paid) there, warn first.
  const onUndoMove = async (p: PlanDoc) => {
    if (!user) return;
    const copy =
      p.movedToMonthId && p.movedToPlanId
        ? await getPlan(user.uid, p.movedToMonthId, p.movedToPlanId).catch(() => null)
        : null;
    const copyPaid = Number(copy?.paid) || 0;
    // Only payments the plan itself recorded will be deleted — expenses the user
    // entered in Monthly and assigned (linked) are theirs and stay put.
    const copyOwnPays = (Array.isArray(copy?.payments) ? (copy!.payments as any[]) : []).filter(
      (pay) => pay.expenseId && !pay.linked
    );
    const allCopyPays = Array.isArray(copy?.payments) ? (copy!.payments as any[]) : [];
    const copyPayCount = copyOwnPays.length;
    const linkedCount = allCopyPays.length - copyPayCount;
    const used = !!copy && (copyPaid > 0 || allCopyPays.length > 0);

    const ok = await confirm({
      title: `Undo move of "${p.name}"?`,
      message: used
        ? `⚠️ It's already been used in ${p.movedTo} — ${formatMoney(copyPaid)} paid across ${allCopyPays.length} payment${allCopyPays.length !== 1 ? "s" : ""}. Undoing deletes that copy` +
          (copyPayCount
            ? ` and removes the ${copyPayCount} expense${copyPayCount !== 1 ? "s" : ""} it recorded there`
            : "") +
          (linkedCount
            ? `. Your own ${linkedCount} entr${linkedCount !== 1 ? "ies" : "y"} in ${p.movedTo} stay — they're just unlinked`
            : "") +
          `. Continue?`
        : `Brings it back to ${monthName}${p.movedTo ? ` and removes the copy in ${p.movedTo}` : ""}.`,
      confirmText: "Undo move",
    });
    if (!ok) return;

    // Clean up the copy's recorded expenses in the target month, then delete it.
    // Linked expenses came from the user's Monthly list — never delete those.
    if (copy && p.movedToMonthId) {
      for (const pay of copyOwnPays) {
        await deleteExpense(user.uid, "month", p.movedToMonthId, pay.expenseId).catch(() => {});
      }
      if (copy.pushedExpenseId)
        await deleteExpense(user.uid, "month", p.movedToMonthId, copy.pushedExpenseId).catch(() => {});
    }
    if (p.movedToMonthId && p.movedToPlanId) {
      await deletePlan(user.uid, p.movedToMonthId, p.movedToPlanId).catch(() => {});
    }
    const paid = Number(p.paid) || 0;
    await updatePlan(user.uid, monthId, p.id, {
      status: paid > 0 ? "partial" : "pending",
      actual: null,
      movedTo: null,
      movedToMonthId: null,
      movedToPlanId: null,
    } as any);
    console.log("[Plan] move undone", { name: p.name, used });
    toast("Move undone.", "success");
  };

  const onDelete = async (p: PlanDoc) => {
    if (!user) return;
    // A moved plan owns a copy in another month; deleting it here would strand
    // that copy with expense references pointing at documents we're about to
    // delete. Send the user through "Undo move" instead.
    if (p.status === "moved" && p.movedToPlanId) {
      await confirm({
        title: `"${p.name}" has moved`,
        message: `It now lives in ${p.movedTo || "another month"}. Undo the move first, then delete it — or delete it there.`,
        confirmText: "OK",
      });
      return;
    }
    const payments = Array.isArray(p.payments) ? p.payments : [];
    const toRemove = payments.filter((pay) => pay.expenseId && !pay.linked);
    const expCount = toRemove.length + (p.pushedExpenseId ? 1 : 0);
    const linkedCount = payments.length - toRemove.length;
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message:
        (expCount > 0
          ? `Also removes the ${expCount > 1 ? expCount + " expenses" : "expense"} it recorded in ${monthName}.`
          : "This removes the plan.") +
        (linkedCount
          ? ` Your own ${linkedCount} entr${linkedCount !== 1 ? "ies" : "y"} in ${monthName} stay.`
          : ""),
      confirmText: "Delete",
    });
    if (!ok) return;
    for (const pay of toRemove) await deleteExpense(user.uid, "month", monthId, pay.expenseId!).catch(() => {});
    if (p.pushedExpenseId) await deleteExpense(user.uid, "month", monthId, p.pushedExpenseId).catch(() => {});
    await deletePlan(user.uid, monthId, p.id);
    toast("Plan deleted.", "success");
  };

  // Remove one added item from a plan. If a real entry in Monthly is behind it,
  // ask whether to keep that entry or delete it everywhere — deleting is real
  // money leaving the month's totals, so it's never assumed.
  const removePayment = (plan: PlanDoc, idx: number) => {
    const pay = (Array.isArray(plan.payments) ? plan.payments : [])[idx];
    if (!pay) return;
    if (!pay.expenseId) return applyRemovePayment(plan, idx, false); // nothing in Monthly
    setRemoveAsk({ plan, idx, pay });
  };

  const applyRemovePayment = async (plan: PlanDoc, idx: number, alsoDeleteEntry: boolean) => {
    if (!user) return;
    setRemoveAsk(null);
    const payments = Array.isArray(plan.payments) ? plan.payments.slice() : [];
    const removed = payments.splice(idx, 1)[0];
    if (!removed) return;
    if (alsoDeleteEntry && removed.expenseId) {
      await deleteExpense(user.uid, "month", monthId, removed.expenseId).catch(() => {});
    }
    const newPaid = Math.max(0, (Number(plan.paid) || 0) - (Number(removed.amount) || 0));
    // derivePlanStatus leaves a moved plan alone: it keeps its status and its
    // record of what was spent here, since the live copy is in another month.
    const st = derivePlanStatus(plan, Number(plan.planned) || 0, newPaid, payments);
    await updatePlan(user.uid, monthId, plan.id, { payments, paid: newPaid, ...(st || {}) } as any);
    console.log("[Plan] removed item from plan", {
      plan: plan.name,
      item: removed.name,
      newPaid,
      alsoDeleteEntry,
    });
    toast(
      alsoDeleteEntry
        ? `Deleted "${removed.name || "item"}" from the plan and ${monthName}`
        : `Removed "${removed.name || "item"}" from the plan`,
      "success"
    );
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

    // Record what changed, so the detail popup can explain why the plan says
    // 150 when the entry underneath it says 100. `edit` holds the old values.
    const at = new Date();
    const history: PlanEdit[] = [];
    const oldPlanned = Number(edit.planned) || 0;
    const oldCat = edit.category || "other";
    if (oldPlanned !== planned) history.push({ at, field: "planned", from: oldPlanned, to: planned });
    if (edit.name !== n) history.push({ at, field: "name", from: edit.name, to: n });
    if (oldCat !== editCat) history.push({ at, field: "category", from: oldCat, to: editCat });
    if (history.length === 0) {
      setEdit(null);
      return; // nothing actually changed — don't log noise
    }

    // Lowering the plan below what's already been spent flips it straight into
    // the red "over" state, so make that deliberate.
    const paid = Number(edit.paid) || 0;
    if (planned < paid) {
      const ok = await confirm({
        title: "Below what's already spent",
        message: `${formatMoney(paid)} has been added to "${edit.name}". Setting the plan to ${formatMoney(planned)} marks it over by ${formatMoney(paid - planned)}. Continue?`,
        confirmText: "Set anyway",
        danger: false,
      });
      if (!ok) return;
    }

    const edits = [...(Array.isArray(edit.edits) ? edit.edits : []), ...history];
    const updates: any = { name: n, planned, category: editCat, edits };
    // Changing the target re-opens the question of whether this plan is finished,
    // so the status follows the new figure — raising a done plan above what's
    // been paid puts it back to partial. A hand-closed plan is fair game here:
    // deliberately changing its amount is deliberately re-opening it.
    if (oldPlanned !== planned) {
      const st = derivePlanStatus(
        { status: edit.status, closedEarly: false },
        planned,
        paid,
        Array.isArray(edit.payments) ? edit.payments : []
      );
      if (st) Object.assign(updates, st, { closedEarly: false });
    }
    await updatePlan(user.uid, monthId, edit.id, updates);
    console.log("[Plan] edited", { plan: n, changes: history.map((h) => h.field) });
    setEdit(null);
    toast("Plan updated.", "success");
  };

  // ---- top up (the "+ Add" button) ----
  // Raises the plan's target. It records no payment and writes nothing into
  // Monthly — a ₹100 plan topped up by ₹100 becomes a ₹200 plan that's half paid.
  const topUpAmt = Number(topUpAmount) || 0;
  const topUpOld = Number(topUpPlan?.planned) || 0;
  const topUpPaid = Number(topUpPlan?.paid) || 0;
  const topUpNew = topUpOld + topUpAmt;
  // "After plans" once the extra is committed: the unpaid part of this plan grows
  // by the top-up, unless the plan was closed (contributing nothing) and re-opens.
  const topUpAfter = useMemo(() => {
    if (!topUpPlan) return afterPlans;
    const wasPending =
      topUpPlan.status === "pending"
        ? topUpOld
        : topUpPlan.status === "partial"
        ? Math.max(0, topUpOld - topUpPaid)
        : 0;
    const nowPending = Math.max(0, topUpNew - topUpPaid);
    return remaining - (pending - wasPending + nowPending);
  }, [topUpPlan, topUpOld, topUpPaid, topUpNew, pending, remaining, afterPlans]);

  const openTopUp = (p: PlanDoc) => {
    setTopUpAmount("");
    setTopUp(p);
  };

  const submitTopUp = async () => {
    if (!user || !topUpPlan) return;
    const p = topUpPlan;
    const amt = Number(topUpAmount);
    if (!topUpAmount.trim() || isNaN(amt) || amt <= 0) return toast("Enter a valid amount.", "error");
    const oldPlanned = Number(p.planned) || 0;
    const newPlanned = oldPlanned + amt;
    if (topUpAfter < 0) {
      const ok = await confirm({
        title: "Plans exceed balance",
        message: `Adding this makes pending plans ${formatMoney(-topUpAfter)} more than your balance (${formatMoney(remaining)}). Add anyway?`,
        confirmText: "Add anyway",
      });
      if (!ok) return;
    }
    setTopUp(null);
    // Logged as a normal "planned" edit so the detail popup's Edit history
    // explains why the plan says 200 when the entries under it add up to 100.
    const edits = [
      ...(Array.isArray(p.edits) ? p.edits : []),
      { at: new Date(), field: "planned", from: oldPlanned, to: newPlanned } as PlanEdit,
    ];
    const paid = Number(p.paid) || 0;
    const st = derivePlanStatus(
      { status: p.status, closedEarly: false },
      newPlanned,
      paid,
      Array.isArray(p.payments) ? p.payments : []
    );
    await updatePlan(user.uid, monthId, p.id, {
      planned: newPlanned,
      edits,
      closedEarly: false,
      ...(st || {}),
    } as any);
    console.log("[Plan] topped up", { plan: p.name, from: oldPlanned, to: newPlanned, paid });
    toast(`${p.name} is now ${formatMoney(newPlanned)}`, "success");
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
      <Watermark />
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
          {mainBalance > 0 && (
            <Text style={{ color: colors.text, fontSize: 13, marginTop: 4, textAlign: "center", fontWeight: "700" }}>
              With main balance: {formatMoney(remaining + mainBalance)}
            </Text>
          )}
        </Card>

        {/* Add row (collapsible) */}
        <Card>
          <Pressable
            onPress={() => {
              setAddOpen((o) => !o);
              console.log("[Plan] add form toggled", !addOpen);
            }}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Add a plan</Text>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>
              {addOpen ? "▲" : "▼"}
            </Text>
          </Pressable>
          {addOpen && (
          <View style={{ marginTop: 12 }}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            placeholder="Name (e.g. Grocery)"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <MoneyInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8 }]}
            placeholder={`Planned amount (${currencySymbol().trim()})`}
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              const a = Number(t) || 0;
              console.log("[Plan] live total", { typed: a, pending, newTotal: pending + a, afterPlans: remaining - (pending + a) });
            }}
          />
          {Number(amount) > 0 && (
            <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
              {amountToWords(amount)}
            </Text>
          )}
          {addAmt > 0 && (
            <View style={[styles.liveBox, { backgroundColor: colors.chipBg }]}>
              <View style={styles.liveRow}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Pending plans</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {formatMoney(pending)}
                </Text>
              </View>
              <View style={styles.liveRow}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>+ This plan</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {formatMoney(addAmt)}
                </Text>
              </View>
              <View style={[styles.liveRow, styles.liveTotalRow, { borderTopColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>New plans total</Text>
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>
                  {formatMoney(liveTotal)}
                </Text>
              </View>
              <View style={styles.liveRow}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>After plans</Text>
                <Text
                  style={{
                    color: liveAfter < 0 ? colors.danger : colors.success,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {formatMoney(liveAfter)}
                </Text>
              </View>
            </View>
          )}
          <View style={{ marginTop: 8 }}>
            <SelectField
              title="Category"
              placeholder="Select category"
              options={PLAN_CAT_OPTS}
              value={category}
              onChange={setCategory}
              onAdd={quickAddCategory}
              addLabel="Add category"
            />
          </View>
          <Pressable
            onPress={() => setShowPlanDate(true)}
            style={[
              styles.input,
              { borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 8, justifyContent: "center" },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: 16 }}>
              📅 {formatDateMedium(inputValueToDate(planDate))}
            </Text>
          </Pressable>
          {showPlanDate && (
            <DateTimePicker
              value={inputValueToDate(planDate)}
              mode="date"
              onChange={(_e, d) => {
                setShowPlanDate(false);
                if (d) setPlanDate(dateToInputValue(d));
              }}
            />
          )}
          <Button title="+ Add plan" onPress={onAdd} style={{ marginTop: 10 }} />
          </View>
          )}
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
              onTopUp={() => openTopUp(p)}
              onDone={() => openDone(p)}
              onPart={() => setPay({ plan: p, mode: "part" })}
              onMove={() => openMove(p)}
              onEdit={() => openEdit(p)}
              onDelete={() => onDelete(p)}
              onUndo={() => onUndo(p)}
              onUndoMove={() => onUndoMove(p)}
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
            ? // For a part payment, offer what's actually left. Only fall back to
              // the full amount when nothing has been paid yet (planned may be 0).
              Math.max(0, (Number(pay.plan.planned) || 0) - (Number(pay.plan.paid) || 0)) ||
              ((Number(pay.plan.paid) || 0) > 0 ? 0 : Number(pay.plan.planned) || 0)
            : 0
        }
        defaultCategory={pay?.plan.category || "other"}
        defaultName={pay?.plan.name || ""}
        showName={pay?.mode === "part"}
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
            <View
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  marginTop: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 0,
                },
              ]}
            >
              <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: "700", marginRight: 6 }}>{currencySymbol()}</Text>
              <TextInput
                style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 }}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="Planned amount"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ marginTop: 8 }}>
              <SelectField
                title="Category"
                placeholder="Select category"
                options={PLAN_CAT_OPTS}
                value={editCat}
                onChange={setEditCat}
                onAdd={quickAddCategory}
                addLabel="Add category"
              />
            </View>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setEdit(null)} style={{ flex: 1 }} />
              <Button title="Save" onPress={submitEdit} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Top up — raise the planned amount */}
      <Modal visible={!!topUp} transparent animationType="fade" onRequestClose={() => setTopUp(null)}>
        <Pressable style={styles.backdrop} onPress={() => setTopUp(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 4 }]}>
              Add to "{topUpPlan?.name}"
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
              Raises the planned amount — it doesn't record a payment.
            </Text>
            <MoneyInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
              placeholder={`Amount to add (${currencySymbol().trim()})`}
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              autoFocus
            />
            {topUpAmt > 0 && (
              <>
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                  {amountToWords(topUpAmount)}
                </Text>
                <View style={[styles.liveBox, { backgroundColor: colors.chipBg }]}>
                  <View style={[styles.liveRow, styles.liveTotalRow, { borderTopColor: colors.border, borderTopWidth: 0, marginTop: 0, paddingTop: 0 }]}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>Planned</Text>
                    <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>
                      {formatMoney(topUpOld)} → {formatMoney(topUpNew)}
                    </Text>
                  </View>
                  <View style={styles.liveRow}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Already paid</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                      {formatMoney(topUpPaid)}
                    </Text>
                  </View>
                  <View style={styles.liveRow}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Left to pay</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                      {formatMoney(Math.max(0, topUpNew - topUpPaid))}
                    </Text>
                  </View>
                  <View style={[styles.liveRow, styles.liveTotalRow, { borderTopColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>After plans</Text>
                    <Text
                      style={{
                        color: topUpAfter < 0 ? colors.danger : colors.success,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {formatMoney(afterPlans)} → {formatMoney(topUpAfter)}
                    </Text>
                  </View>
                </View>
              </>
            )}
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setTopUp(null)} style={{ flex: 1 }} />
              <Button title="Add" onPress={submitTopUp} style={{ flex: 1 }} />
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

      {/* Calendar */}
      <CalendarModal
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        title={`${monthName} · Plans`}
        marks={calMarks}
        itemsForDate={calItemsForDate}
      />

      {/* Detail */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            {detailPlan && (
              <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
                <PlanDetail
                  p={detailPlan}
                  colors={colors}
                  expenseById={expenseById}
                  onRemove={(idx: number) => removePayment(detailPlan, idx)}
                />
              </ScrollView>
            )}
            <Button title="Close" variant="secondary" onPress={() => setDetail(null)} style={{ marginTop: 12 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Removing an item that has a real entry in Monthly — keep it or delete it? */}
      <Modal
        visible={!!removeAsk}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveAsk(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRemoveAsk(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
              Remove "{removeAsk?.pay?.name || "item"}"?
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              {formatMoney(removeAsk?.pay?.amount)} · there's a matching entry in {monthName}.
            </Text>
            <Button
              title="Remove from plan only"
              variant="secondary"
              onPress={() => removeAsk && applyRemovePayment(removeAsk.plan, removeAsk.idx, false)}
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, marginBottom: 12 }}>
              The entry stays in {monthName} and still counts towards your spending.
            </Text>
            <Button
              title="Delete everywhere"
              variant="danger"
              onPress={() => removeAsk && applyRemovePayment(removeAsk.plan, removeAsk.idx, true)}
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
              Removes it from the plan and deletes the entry from {monthName}. Your totals go back up
              by {formatMoney(removeAsk?.pay?.amount)}.
            </Text>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setRemoveAsk(null)}
              style={{ marginTop: 14 }}
            />
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

function PlanRow({ p, colors, onDetail, onTopUp, onDone, onPart, onMove, onEdit, onDelete, onUndo, onUndoMove }: any) {
  const { emoji: catEmoji } = useCategories();
  const planned = Number(p.planned) || 0;
  const paid = Number(p.paid) || 0;
  const actual = Number(p.actual) || 0;
  const cat = p.category || "other";
  const chip = statusChip(p, colors);
  const isDone = p.status === "done";
  const isMoved = p.status === "moved";
  const isPartial = p.status === "partial";

  // Over-budget: what's been added to the plan exceeds its planned amount.
  const over = !isMoved && paid > planned;
  const overBy = paid - planned;

  let amountText: string;
  if (isDone) amountText = `${formatMoney(planned)} → ${formatMoney(actual || paid)}`;
  else if (isPartial) amountText = `${formatMoney(paid)} paid · ${formatMoney(Math.max(0, planned - paid))} left`;
  else if (isMoved) amountText = `${formatMoney(paid)} paid → moved`;
  else amountText = formatMoney(planned);

  return (
    <Card style={over ? { borderWidth: 1.5, borderColor: colors.danger } : undefined}>
      <Pressable onPress={onDetail}>
        <View style={styles.rowTop}>
          {/* flex:1 (not just flexShrink) — otherwise a long name next to a wide
              status chip collapses to nothing and only the emoji is left. */}
          <Text
            numberOfLines={2}
            style={{ color: over ? colors.danger : colors.text, fontWeight: "700", fontSize: 16, flex: 1 }}
          >
            {catEmoji(cat)} {p.name}
          </Text>
          <View
            style={[
              styles.chip,
              { backgroundColor: over ? colors.danger : chip.bg, flexShrink: 0, marginLeft: 8 },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {over ? "⚠ Over" : chip.label}
            </Text>
          </View>
        </View>
        <Text style={{ color: over ? colors.danger : colors.textMuted, marginTop: 4, fontWeight: over ? "700" : "400" }}>
          {over ? `${formatMoney(paid)} added · ${formatMoney(overBy)} over the ${formatMoney(planned)} plan` : amountText}
        </Text>
        {over && (
          <Text style={{ color: colors.danger, fontSize: 11, marginTop: 3 }}>
            Tap to see which item caused this.
          </Text>
        )}
        {!!(p as any).date && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            📅 {formatDateMedium(toJsDate((p as any).date))}
          </Text>
        )}
        {!!p.transferredFrom && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>↪ from {p.transferredFrom}</Text>
        )}
      </Pressable>

      <View style={styles.rowActions}>
        {/* Raises the plan's amount — offered on done plans too, since that's
            exactly how you re-open one that turned out to cost more. */}
        {!isMoved && <MiniBtn label="+ Add" color={colors.primary} onPress={onTopUp} />}
        {!isMoved && !isDone && <MiniBtn label="Done" color={colors.primary} onPress={onDone} />}
        {!isMoved && !isDone && <MiniBtn label="Part" color={colors.text} onPress={onPart} />}
        {!isMoved && !isDone && <MiniBtn label="Move" color={colors.text} onPress={onMove} />}
        {isDone && <MiniBtn label="Undo" color={colors.text} onPress={onUndo} />}
        {isMoved && <MiniBtn label="Undo move" color={colors.primary} onPress={onUndoMove} />}
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

function PlanDetail({ p, colors, expenseById, onRemove }: any) {
  const { label: catLabel, emoji: catEmoji } = useCategories();
  const [allEdits, setAllEdits] = useState(false);
  const planned = Number(p.planned) || 0;
  const paid = Number(p.paid) || 0;
  const actual = Number(p.actual) || 0;
  const isDone = p.status === "done";
  const payments = Array.isArray(p.payments) ? p.payments : [];
  // Newest change first.
  const edits: PlanEdit[] = (Array.isArray(p.edits) ? p.edits : []).slice().reverse();
  const shownEdits = allEdits ? edits : edits.slice(0, 5);
  // Over-budget: figure out which added item(s) pushed the plan over its plan.
  const over = p.status !== "moved" && paid > planned;
  const overBy = paid - planned;
  const culprits = payments.filter((pp: any) => Number(pp.amount) > planned);
  const culpritList = culprits.length ? culprits : payments;
  const culpritNames = culpritList.map((pp: any) => pp.name || p.name).join(", ");
  return (
    <View>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{p.name}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 2, marginBottom: 10 }}>
        {catEmoji(p.category)} {catLabel(p.category)} ·{" "}
        {over ? "⚠ Over the plan" : statusChip(p, colors).label}
      </Text>
      {over && (
        <View
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            borderWidth: 1,
            borderColor: colors.danger,
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: "800", marginBottom: 3 }}>
            ⚠️ Over by {formatMoney(overBy)}
          </Text>
          <Text style={{ color: colors.danger, fontSize: 13 }}>
            This is because of {culpritNames}. Remove {culprits.length === 1 ? "it" : "one of them"} from
            this plan, or increase the planned amount above {formatMoney(paid)}.
          </Text>
        </View>
      )}
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
            // Highlight the item(s) that pushed the plan over its plan.
            const isCulprit = over && Number(pay.amount) > planned;
            return (
              <View key={i} style={[styles.rowTop, { alignItems: "center" }]}>
                <Text style={{ color: isCulprit ? colors.danger : colors.textMuted, flex: 1 }}>
                  {isCulprit ? "⚠️ " : ""}
                  {nm}{" "}
                  <Text style={{ fontSize: 11 }}>
                    {pay.paidAt ? `· ${formatDateTime(toJsDate(pay.paidAt))}` : ""}
                  </Text>
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                  <Text style={{ color: isCulprit ? colors.danger : colors.text, fontWeight: "600" }}>
                    {formatMoney(pay.amount)}
                  </Text>
                  {onRemove && (
                    <Pressable onPress={() => onRemove(i)} hitSlop={8} style={{ marginLeft: 10 }}>
                      <Text style={{ color: colors.danger, fontWeight: "700" }}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </>
      )}

      {edits.length > 0 && (
        <>
          <Text style={{ color: colors.text, fontWeight: "700", marginTop: 12, marginBottom: 4 }}>
            Edit history
          </Text>
          {shownEdits.map((e, i) => (
            <View key={i} style={[styles.rowTop, { alignItems: "flex-start" }]}>
              <Text style={{ color: colors.textMuted, flex: 1 }}>
                {e.field === "planned" ? "Amount" : e.field === "name" ? "Name" : "Category"}{" "}
                <Text style={{ fontSize: 11 }}>
                  {e.at ? `· ${formatDateTime(toJsDate(e.at))}` : ""}
                </Text>
              </Text>
              <Text
                style={{ color: colors.text, fontWeight: "600", flexShrink: 0, marginLeft: 8 }}
              >
                {e.field === "planned"
                  ? `${formatMoney(e.from as number)} → ${formatMoney(e.to as number)}`
                  : e.field === "category"
                  ? `${catLabel(String(e.from))} → ${catLabel(String(e.to))}`
                  : `${e.from} → ${e.to}`}
              </Text>
            </View>
          ))}
          {edits.length > shownEdits.length && (
            <Pressable onPress={() => setAllEdits(true)} hitSlop={8} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                Show all {edits.length} changes
              </Text>
            </Pressable>
          )}
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
  liveBox: { marginTop: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  liveRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  liveTotalRow: { borderTopWidth: 1, marginTop: 4, paddingTop: 7 },
});
