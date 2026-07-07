import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Card, Button } from "../components/UI";
import Calculator from "../components/Calculator";
import DownloadAnimation from "../components/DownloadAnimation";
import ExpenseFormModal, { ExpenseFormResult } from "../components/ExpenseFormModal";
import MultiSelectField from "../components/MultiSelectField";
import {
  TrackerType,
  getMonth,
  watchExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  updateMonth,
  getCategoryBudgets,
  watchSavedCalcs,
  addSavedCalc,
  deleteSavedCalc,
  SavedCalc,
  getPlans,
  watchPlans,
  addPlan,
  updatePlan,
} from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { exportPdf, exportExcel, attendedWeeks } from "../util/export";
import {
  toJsDate,
  weekOfMonth,
  weekRange,
  inputValueToTimestamp,
  dateToInputValue,
  formatDateTime,
} from "../util/date";
import { DEFAULT_CATEGORY } from "../constants/categories";
import { useCategories } from "../context/CategoriesContext";
import { usePaymentMethods } from "../context/PaymentMethodsContext";
import { Expense, PlanDoc } from "../types";

export default function MonthScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const { confirm, prompt, toast } = useFeedback();
  const { label: catLabel, emoji: catEmoji, color: catColor, categories } = useCategories();
  // All spend categories (exclude the salary/income category) — always shown
  // in the Category filter row, even before any entries exist.
  const allCats = categories.filter((c) => c.key !== "salary");

  const id: string = route.params?.id;
  const type: TrackerType = route.params?.type || "month";
  const isBudget = type === "budget";

  const [name, setName] = useState("");
  const [limit, setLimit] = useState(0); // salary (month) or budget amount
  const [currentBalance, setCurrentBalance] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);
  const [catBudgets, setCatBudgets] = useState<Record<string, { limit: number }>>({});
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"expenses" | "saved">("expenses");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "minus" | "plus">("all");
  // Multi-select category filter: empty set = all categories.
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const toggleCatFilter = (key: string) =>
    setCatFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [catOpen, setCatOpen] = useState(false); // "By category" dropdown
  const [weekFilter, setWeekFilter] = useState<number | null>(null); // tap a week to filter

  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editTarget, setEditTarget] = useState<Expense | null>(null);

  const [calc, setCalc] = useState<{ value: number; title: string; expr?: string } | null>(null);
  const [details, setDetails] = useState<Expense | null>(null);

  // Assign monthly expense(s) to a plan (link them — the expenses stay in Monthly).
  const [assignExps, setAssignExps] = useState<Expense[]>([]);
  const [assignPlans, setAssignPlans] = useState<PlanDoc[]>([]);
  const [assignPlanId, setAssignPlanId] = useState<string | null>(null);
  const [assignShowNew, setAssignShowNew] = useState(false);
  const [assignNewName, setAssignNewName] = useState("");
  const assignTotal = assignExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // Expense ids already linked to a plan → don't offer "Assign" for them again.
  const [linkedExpenseIds, setLinkedExpenseIds] = useState<Set<string>>(new Set());

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [exportFmt, setExportFmt] = useState<null | "pdf" | "excel">(null);
  const [exporting, setExporting] = useState<null | "pdf" | "excel">(null);
  const exportingRef = useRef(false); // synchronous re-entry guard
  const [downloadDone, setDownloadDone] = useState<null | "pdf" | "excel">(null);
  const [weekSel, setWeekSel] = useState<Set<number>>(new Set());

  // --- load tracker doc + subscribe to expenses/saved calcs ---
  useEffect(() => {
    if (!user) return;
    let unsubExp: (() => void) | undefined;
    let unsubCalc: (() => void) | undefined;
    (async () => {
      const doc = await getMonth(user.uid, type, id);
      if (!doc) {
        toast(`${isBudget ? "Budget" : "Month"} not found.`, "error");
        navigation.goBack();
        return;
      }
      setName(doc.name);
      navigation.setOptions({ title: doc.name });
      setLimit(isBudget ? Number((doc as any).amount) || 0 : Number(profile?.salary) || 0);
      setCurrentBalance(isBudget ? 0 : Number((doc as any).currentBalance) || 0);
      if (!isBudget) {
        try {
          setCatBudgets(await getCategoryBudgets(user.uid));
        } catch {}
      }
      unsubExp = watchExpenses(
        user.uid,
        type,
        id,
        (list) => {
          // newest first (createdAt desc); fall back to stable order
          list.sort((a, b) => {
            const da = toJsDate(a.createdAt)?.getTime() || 0;
            const dbb = toJsDate(b.createdAt)?.getTime() || 0;
            return dbb - da;
          });
          setExpenses(list);
          setLoading(false);
        },
        () => {
          toast("Couldn't load expenses.", "error");
          setLoading(false);
        }
      );
      unsubCalc = watchSavedCalcs(user.uid, type, id, setSavedCalcs);
    })();
    return () => {
      unsubExp?.();
      unsubCalc?.();
    };
  }, [user, id, type]);

  // Track which expenses are already linked to a plan (to hide "Assign" for them).
  useEffect(() => {
    if (!user || type !== "month") {
      setLinkedExpenseIds(new Set());
      return;
    }
    const unsub = watchPlans(user.uid, id, (list) => {
      const ids = new Set<string>();
      list.forEach((p) => {
        (Array.isArray(p.payments) ? p.payments : []).forEach((pay: any) => {
          if (pay.expenseId) ids.add(pay.expenseId);
        });
      });
      setLinkedExpenseIds(ids);
      console.log("[Month] linked-to-plan expense ids", ids.size);
    });
    return () => unsub();
  }, [user, id, type]);

  // --- totals ---
  const { spent, income } = useMemo(() => {
    let s = 0,
      inc = 0;
    expenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (e.type === "plus") inc += amt;
      else s += amt;
    });
    return { spent: s, income: inc };
  }, [expenses]);

  const totalRemaining = (isBudget ? limit : currentBalance) - spent + income;
  // Global savings pot from Profile — shown as a combined figure, not spent from.
  const mainBalance = Number(profile?.mainBalance) || 0;

  // --- filtering ---
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filter !== "all" && e.type !== filter) return false;
      if (catFilter.size > 0 && !catFilter.has(e.category || DEFAULT_CATEGORY)) return false;
      if (weekFilter !== null && weekOfMonth(toJsDate(e.createdAt)) !== weekFilter) return false;
      if (term) {
        const hay = (
          e.name +
          " " +
          (e.notes || "") +
          " " +
          catLabel(e.category) +
          " " +
          (e.paymentMethod || "")
        ).toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
  }, [expenses, search, filter, catFilter, weekFilter, catLabel]);

  // Totals of the currently-visible (filtered) entries — shown at the bottom.
  const filteredSummary = useMemo(() => {
    let spend = 0,
      income = 0;
    filtered.forEach((e) => {
      const a = Number(e.amount) || 0;
      if (e.type === "plus") income += a;
      else spend += a;
    });
    return { spend, income };
  }, [filtered]);

  // Categories actually present in this tracker's spends, for the filter chips.
  const presentCats = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.type === "minus") set.add(e.category || DEFAULT_CATEGORY);
    });
    return Array.from(set);
  }, [expenses]);

  // Spend total per category (desc), for the "By category" breakdown + grand total.
  const categoryTotals = useMemo(() => {
    const by: Record<string, number> = {};
    let total = 0;
    expenses.forEach((e) => {
      if (e.type !== "minus") return;
      const c = e.category || DEFAULT_CATEGORY;
      const amt = Number(e.amount) || 0;
      by[c] = (by[c] || 0) + amt;
      total += amt;
    });
    const rows = Object.keys(by)
      .map((key) => ({ key, total: by[key] }))
      .sort((a, b) => b.total - a.total);
    return { rows, total };
  }, [expenses]);

  const grouped = useMemo(() => {
    // For months, unfiltered: group by week. Else flat.
    if (isBudget || filter !== "all" || catFilter.size > 0 || weekFilter !== null || search.trim()) {
      return [{ week: null as number | null, items: filtered }];
    }
    const map = new Map<number, Expense[]>();
    // `filtered` is newest-first, so keep that order: newest week first and the
    // last-added entry sits at the very top of its week.
    filtered.forEach((e) => {
      const wk = weekOfMonth(toJsDate(e.createdAt));
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk)!.push(e);
    });
    console.log("[Month] grouped newest-first, weeks:", Array.from(map.keys()));
    return Array.from(map.entries()).map(([week, items]) => ({ week, items }));
  }, [filtered, isBudget, filter, catFilter, weekFilter, search]);

  // --- weekly breakdown (months only) ---
  const weeklyTotals = useMemo(() => {
    const t: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    expenses.forEach((e) => {
      if (e.type === "minus") t[weekOfMonth(toJsDate(e.createdAt))] += Number(e.amount) || 0;
    });
    return t;
  }, [expenses]);

  // --- category budgets (months only) ---
  const catBudgetRows = useMemo(() => {
    const spentBy: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.type !== "minus") return;
      const c = e.category || DEFAULT_CATEGORY;
      spentBy[c] = (spentBy[c] || 0) + (Number(e.amount) || 0);
    });
    return Object.keys(catBudgets)
      .map((key) => ({ key, limit: Number(catBudgets[key].limit) || 0, spent: spentBy[key] || 0 }))
      .filter((r) => r.limit > 0);
  }, [expenses, catBudgets]);

  // --- actions ---
  // Spin the + FAB a full turn when tapped.
  const fabSpin = useRef(new Animated.Value(0)).current;
  const spinDeg = fabSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const onAdd = () => {
    fabSpin.setValue(0);
    Animated.timing(fabSpin, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    console.log("[FAB] + tapped (spin)");
    setFormMode("add");
    setEditTarget(null);
    setFormVisible(true);
  };

  const onEdit = (exp: Expense) => {
    setFormMode("edit");
    setEditTarget(exp);
    setFormVisible(true);
  };

  const submitForm = async (r: ExpenseFormResult) => {
    if (!user) return;
    // Over-balance warning on spends (months: balance−spent; budgets: amount−spent).
    if (r.type === "minus" && formMode === "add") {
      const remaining = (isBudget ? limit : currentBalance) - spent;
      if (r.amount > remaining) {
        const ok = await confirm({
          title: "Over your balance",
          message: `This spend of ${formatMoney(r.amount)} is ${formatMoney(
            r.amount - remaining
          )} more than what's left (${formatMoney(remaining)}). Add it anyway?`,
          confirmText: "Add anyway",
        });
        if (!ok) return;
      }
    }
    const ts = inputValueToTimestamp(r.dateValue);
    const payload: any = {
      name: r.name,
      amount: r.amount,
      type: r.type,
      category: r.category,
      notes: r.notes,
    };
    if (r.type === "minus") payload.paymentMethod = r.paymentMethod;
    if (ts) payload.createdAt = ts;

    setFormVisible(false);
    try {
      if (formMode === "edit" && editTarget) {
        // Editing: clear paymentMethod for income.
        if (r.type !== "minus") payload.paymentMethod = null;
        await updateExpense(user.uid, type, id, editTarget.id, payload);
        toast("Entry updated", "success");
      } else {
        await addExpense(user.uid, type, id, payload);
        toast((r.type === "plus" ? "Income" : "Expense") + " added", "success");
      }
    } catch {
      toast("Couldn't save. Try again.", "error");
    }
  };

  const onDelete = async (exp: Expense) => {
    if (!user) return;
    const ok = await confirm({
      title: "Delete this entry?",
      message: `"${exp.name}" — ${formatMoney(exp.amount)}`,
      confirmText: "Delete",
    });
    if (!ok) return;
    await deleteExpense(user.uid, type, id, exp.id);
    toast("Deleted", "success");
  };

  // ---- assign expense(s) to a plan (link) ----
  const openAssign = async (exps: Expense[]) => {
    if (!user || type !== "month" || exps.length === 0) return;
    setDetails(null);
    setAssignPlanId(null);
    setAssignShowNew(false);
    setAssignNewName("");
    setAssignExps(exps);
    try {
      const ps = await getPlans(user.uid, id);
      setAssignPlans(ps);
      console.log("[Month] assign: loaded plans", ps.length, "for", exps.length, "entries");
    } catch (e) {
      console.log("[Month] assign: loadPlans failed", e);
      setAssignPlans([]);
    }
  };

  // Assign the current multi-selection to a plan (skip income + already-assigned).
  const assignSelection = () => {
    const sel = expenses.filter((e) => selected.has(e.id));
    const hasIncome = sel.some((e) => e.type === "plus");
    const exps = sel.filter((e) => e.type === "minus" && !linkedExpenseIds.has(e.id));
    if (exps.length === 0) {
      if (hasIncome) return toast("Only spends can be added to plans.", "error");
      return toast("Select spend entries that aren't already in a plan.", "error");
    }
    exitSelect();
    openAssign(exps);
  };

  const doAssign = async () => {
    if (!user || assignExps.length === 0) return;
    let plan = assignPlanId ? assignPlans.find((p) => p.id === assignPlanId) : null;
    if (!plan) {
      // Create a new plan sized to the selected total, then link into it.
      const pn = assignNewName.trim() || assignExps[0].name;
      const pid = await addPlan(user.uid, id, {
        name: pn,
        planned: assignTotal,
        category: assignExps[0].category || "other",
        status: "pending",
        actual: null,
        paid: 0,
        payments: [],
        pushedExpenseId: null,
      } as any);
      plan = { id: pid, name: pn, planned: assignTotal, paid: 0, payments: [], status: "pending" } as any;
      console.log("[Month] assign: created plan", { pid, pn });
    }
    // Append every selected expense as a linked payment (stays in Monthly).
    const payments = Array.isArray(plan!.payments) ? plan!.payments.slice() : [];
    for (const exp of assignExps) {
      payments.push({
        name: exp.name,
        amount: exp.amount,
        expenseId: exp.id,
        category: exp.category,
        paymentMethod: exp.paymentMethod,
        linked: true,
        paidAt: toJsDate(exp.createdAt) || new Date(),
      } as any);
    }
    const newPaid = (Number(plan!.paid) || 0) + assignTotal;
    const planned = Number(plan!.planned) || 0;
    const over = newPaid > planned; // don't mark done when it overflows the plan
    const done = !over && newPaid >= planned;
    await updatePlan(user.uid, id, plan!.id, {
      payments,
      paid: newPaid,
      status: done ? "done" : "partial",
      actual: done ? newPaid : null,
    } as any);
    console.log("[Month] assigned to plan", { plan: plan!.name, count: assignExps.length, newPaid });
    setAssignExps([]);
    toast(`${assignExps.length > 1 ? assignExps.length + " entries" : "Assigned"} → "${plan!.name}"`, "success");
  };

  const onEditBalance = async () => {
    if (!user || isBudget) return;
    const val = await prompt({
      title: "Current balance (₹)",
      placeholder: "e.g. 5000",
      defaultValue: String(currentBalance || ""),
      keyboardType: "numeric",
      confirmText: "Save",
    });
    if (val === null) return;
    const num = Number(val);
    if (isNaN(num) || num < 0) return toast("Enter a valid amount.", "error");
    setCurrentBalance(num);
    await updateMonth(user.uid, id, { currentBalance: num });
    toast("Current balance updated.", "success");
  };

  // --- multi-select ---
  const toggleSelect = (eid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  };
  const enterSelect = (eid: string) => {
    setSelectMode(true);
    setSelected(new Set([eid]));
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const selectionTotal = useMemo(() => {
    let t = 0;
    selected.forEach((eid) => {
      const e = expenses.find((x) => x.id === eid);
      if (e) t += e.type === "plus" ? e.amount : -e.amount;
    });
    return t;
  }, [selected, expenses]);

  const calcFromSelection = () => {
    const items = expenses.filter((e) => selected.has(e.id));
    const expr = items.map((e) => (e.type === "plus" ? "+ " : "− ") + formatMoney(e.amount)).join("  ");
    setCalc({ value: selectionTotal, title: `${items.length} items — Total`, expr });
  };

  const saveSelection = async () => {
    if (!user || selected.size === 0) return;
    const items = expenses
      .filter((e) => selected.has(e.id))
      .map((e) => ({ name: e.name, amount: e.amount, type: e.type }));
    const total = items.reduce((s, e) => s + (e.type === "plus" ? e.amount : -e.amount), 0);
    const def = formatDateTime(new Date());
    const calcName = await prompt({
      title: "Name this calculation",
      placeholder: "e.g. June recharges",
      defaultValue: def,
      confirmText: "Save",
    });
    if (calcName === null) return;
    await addSavedCalc(user.uid, type, id, { name: calcName, total, items });
    toast("Calculation saved", "success");
    exitSelect();
    setTab("saved");
  };

  const deleteSelection = async () => {
    if (!user) return;
    const ok = await confirm({
      title: `Delete ${selected.size} entr${selected.size > 1 ? "ies" : "y"}?`,
      confirmText: "Delete",
    });
    if (!ok) return;
    for (const eid of selected) await deleteExpense(user.uid, type, id, eid);
    toast("Deleted", "success");
    exitSelect();
  };

  // --- export ---
  // Any type/category/search filter active → export exactly the filtered view.
  const hasActiveFilter = filter !== "all" || catFilter.size > 0 || weekFilter !== null || !!search.trim();

  // Human label of the active filter, appended to the export title + filename
  // so a downloaded file clearly shows what it contains.
  const filterDesc = () => {
    const parts: string[] = [];
    if (filter === "minus") parts.push("Spends");
    else if (filter === "plus") parts.push("Income");
    if (catFilter.size > 0) parts.push([...catFilter].map((k) => catLabel(k)).join(", "));
    if (weekFilter !== null) parts.push("Week " + weekFilter);
    if (search.trim()) parts.push(search.trim());
    return parts.join(" - ") || "Filtered";
  };

  const runExport = async (
    fmt: "pdf" | "excel",
    weekFilter: Set<number> | null,
    source: Expense[]
  ) => {
    // Block re-entry (prevents double-tap opening two save pickers → errors).
    if (exportingRef.current) {
      console.log("[Export] already running, ignoring tap");
      return;
    }
    exportingRef.current = true;
    const ctx = {
      monthName: hasActiveFilter ? `${name} - ${filterDesc()}` : name,
      userName: profile?.name || "",
      isBudget,
      limit,
      currentBalance,
      catLabel,
    };
    setExporting(fmt);
    console.log("[Export] preparing", fmt, ctx.monthName);
    try {
      const saved =
        fmt === "pdf"
          ? await exportPdf(source, weekFilter, ctx)
          : await exportExcel(source, weekFilter, ctx);
      if (saved) {
        console.log("[Export] downloaded", fmt);
        setDownloadDone(fmt); // play the download animation
      }
    } catch (e: any) {
      console.warn("[Export] failed", e?.message);
      toast(e?.message || "Export failed.", "error");
    } finally {
      setExporting(null);
      exportingRef.current = false;
    }
  };

  const startExport = (fmt: "pdf" | "excel") => {
    // Export the currently-visible rows: filtered if any filter is on, else all.
    const source = hasActiveFilter ? filtered : expenses;
    if (source.length === 0) return toast("No entries to export.", "error");
    // With a filter active the list is flat (no week grouping) — export as-is.
    if (hasActiveFilter) {
      runExport(fmt, null, source);
      return;
    }
    const weeks = attendedWeeks(expenses);
    if (isBudget || weeks.length <= 1) {
      runExport(fmt, null, expenses);
      return;
    }
    setWeekSel(new Set(weeks));
    setExportFmt(fmt);
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        {/* Total card */}
        <Card style={{ alignItems: "center", paddingVertical: 22 }}>
          <Text style={[styles.totalLabel, { color: colors.textMuted, textAlign: "center" }]}>
            {totalRemaining >= 0 ? (isBudget ? "Remaining" : "Total remaining") : "Over budget by"}
          </Text>
          <Text
            style={[
              styles.totalAmount,
              { color: totalRemaining >= 0 ? colors.success : colors.danger, textAlign: "center" },
            ]}
          >
            {formatMoney(Math.abs(totalRemaining))}
          </Text>
          {!isBudget && mainBalance > 0 && (
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                With main balance (+{formatMoney(mainBalance)})
              </Text>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 22, letterSpacing: -0.3 }}>
                {formatMoney(totalRemaining + mainBalance)}
              </Text>
            </View>
          )}
          {!isBudget && (
            <View style={[styles.breakdown, { borderTopColor: colors.border, alignSelf: "stretch" }]}>
              <BreakItem label="Salary" value={formatMoney(limit)} colors={colors} />
              <Pressable onPress={onEditBalance}>
                <BreakItem label="Balance ✎" value={formatMoney(currentBalance)} colors={colors} />
              </Pressable>
              <BreakItem label="Spent" value={formatMoney(spent)} colors={colors} />
            </View>
          )}
        </Card>

        {/* Tabs — segmented pill */}
        <View style={[styles.tabs, { backgroundColor: colors.chipBg }]}>
          {(["expenses", "saved"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tabBtn,
                tab === t && [styles.tabBtnActive, { backgroundColor: colors.cardBg }],
              ]}
            >
              <Text
                style={{
                  color: tab === t ? colors.primary : colors.textMuted,
                  fontWeight: "700",
                }}
              >
                {t === "expenses" ? "Entries" : "Saved"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "expenses" ? (
          <>
            {/* Weekly breakdown (months only) */}
            {!isBudget && expenses.length > 0 && (
              <Card>
                <View style={styles.between}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>
                    Weekly breakdown
                  </Text>
                  {weekFilter !== null && (
                    <Pressable onPress={() => setWeekFilter(null)}>
                      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                        Clear · showing Week {weekFilter}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={[styles.weekGrid, { marginTop: 10 }]}>
                  {[1, 2, 3, 4, 5]
                    .filter((w) => !(w === 5 && weeklyTotals[5] === 0))
                    .map((w) => {
                      const active = weekFilter === w;
                      return (
                        <Pressable
                          key={w}
                          onPress={() => setWeekFilter(active ? null : w)}
                          style={[
                            styles.weekTile,
                            { backgroundColor: active ? colors.primary : colors.bgSoft },
                          ]}
                        >
                          <Text style={{ color: active ? "#fff" : colors.textMuted, fontSize: 12 }}>
                            Week {w}
                          </Text>
                          <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "800" }}>
                            {formatMoney(weeklyTotals[w])}
                          </Text>
                          <Text style={{ color: active ? "rgba(255,255,255,0.85)" : colors.textMuted, fontSize: 10 }}>
                            Days {weekRange(w)}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </Card>
            )}

            {/* Category budgets (months only) */}
            {!isBudget && catBudgetRows.length > 0 && (
              <Card>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Category budgets</Text>
                {catBudgetRows.map((r) => {
                  const pct = Math.min(100, Math.max(0, (r.spent / r.limit) * 100));
                  const over = r.spent > r.limit;
                  const fill = over ? colors.danger : pct > 80 ? "#f59e0b" : colors.success;
                  return (
                    <View key={r.key} style={{ paddingVertical: 6 }}>
                      <View style={styles.between}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {catEmoji(r.key)} {catLabel(r.key)}
                        </Text>
                        <Text style={{ color: colors.textMuted }}>
                          {formatMoney(r.spent)} / {formatMoney(r.limit)}
                        </Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: colors.chipBg }]}>
                        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: fill, borderRadius: 5 }} />
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* By category breakdown — collapsible dropdown */}
            {categoryTotals.rows.length > 0 && (
              <Card>
                <Pressable onPress={() => setCatOpen((o) => !o)} style={styles.between}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>
                    By category
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ color: colors.danger, fontWeight: "800" }}>
                      {formatMoney(categoryTotals.total)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 15 }}>
                      {catOpen ? "▲" : "▼"}
                    </Text>
                  </View>
                </Pressable>
                {catOpen && (
                <View style={{ marginTop: 12 }}>
                {categoryTotals.rows.map((r) => {
                  const active = catFilter.has(r.key);
                  const pct = categoryTotals.total
                    ? Math.round((r.total / categoryTotals.total) * 100)
                    : 0;
                  const c = catColor(r.key);
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => toggleCatFilter(r.key)}
                      style={[
                        styles.catBreakRow,
                        active && { backgroundColor: colors.chipBg },
                      ]}
                    >
                      <View style={styles.catBreakTop}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <View style={[styles.catDot, { backgroundColor: c }]} />
                          <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
                            {catEmoji(r.key)} {catLabel(r.key)}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
                          {formatMoney(r.total)}
                        </Text>
                      </View>
                      <View style={styles.catBreakBottom}>
                        <View style={[styles.catBar, { backgroundColor: colors.chipBg }]}>
                          <View
                            style={{
                              width: `${Math.max(3, pct)}%`,
                              height: "100%",
                              backgroundColor: c,
                              borderRadius: 4,
                            }}
                          />
                        </View>
                        <Text style={[styles.catPct, { color: colors.textMuted }]}>{pct}%</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {catFilter.size > 0 && (
                  <Text style={{ color: colors.primary, fontSize: 12, marginTop: 8 }}>
                    Filtering by {[...catFilter].map((k) => catLabel(k)).join(", ")} — tap to toggle.
                  </Text>
                )}
                </View>
                )}
              </Card>
            )}

            {/* Search + filter */}
            <View style={styles.searchRow}>
              <TextInput
                style={[
                  styles.search,
                  { color: colors.text, backgroundColor: colors.inputBg },
                ]}
                placeholder="Search entries…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <View style={styles.filterRow}>
              {(["all", "minus", "plus"] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: filter === f ? colors.primary : colors.chipBg },
                  ]}
                >
                  <Text style={{ color: filter === f ? "#fff" : colors.text, fontWeight: "600" }}>
                    {f === "all" ? "All" : f === "minus" ? "Spends" : "Income"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* Category filter — popup with multi-select. */}
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Category</Text>
            <MultiSelectField
              title="Filter by category"
              allLabel="All categories"
              values={catFilter}
              onChange={setCatFilter}
              options={allCats.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji }))}
            />

            {/* Export */}
            <View style={styles.exportRow}>
              <Text style={{ color: colors.textMuted, marginRight: 4 }}>Export:</Text>
              <Pressable
                disabled={!!exporting}
                style={({ pressed }) => [
                  styles.exportBtn,
                  {
                    backgroundColor: exporting === "pdf" ? colors.primary : colors.chipBg,
                    opacity: exporting === "excel" ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => startExport("pdf")}
              >
                {exporting === "pdf" ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Saving…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 4 }}>PDF</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                disabled={!!exporting}
                style={({ pressed }) => [
                  styles.exportBtn,
                  {
                    backgroundColor: exporting === "excel" ? colors.primary : colors.chipBg,
                    opacity: exporting === "pdf" ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
                onPress={() => startExport("excel")}
              >
                {exporting === "excel" ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Saving…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="grid-outline" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 4 }}>Excel</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* List */}
            {filtered.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  {expenses.length === 0 ? "No entries yet. Tap + to add." : "No matches."}
                </Text>
              </Card>
            ) : (
              grouped.map((g, gi) => (
                <View key={gi}>
                  {g.week !== null && (
                    <Text style={[styles.weekDivider, { color: colors.textMuted }]}>
                      Week {g.week}
                    </Text>
                  )}
                  {g.items.map((exp) => (
                    <ExpenseRow
                      key={exp.id}
                      exp={exp}
                      colors={colors}
                      selectMode={selectMode}
                      selected={selected.has(exp.id)}
                      onPress={() => (selectMode ? toggleSelect(exp.id) : setDetails(exp))}
                      onLongPress={() => (selectMode ? toggleSelect(exp.id) : enterSelect(exp.id))}
                      onEdit={() => onEdit(exp)}
                      onDelete={() => onDelete(exp)}
                    />
                  ))}
                </View>
              ))
            )}

            {/* Filtered total at the bottom — reflects the current filter/search */}
            {filtered.length > 0 && (
              <Card style={styles.footerTotal}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>
                  {filtered.length} shown
                  {(filter !== "all" || catFilter.size > 0 || weekFilter !== null || !!search.trim()) ? " (filtered)" : ""}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  {filter !== "plus" && filteredSummary.spend > 0 && (
                    <Text style={{ color: colors.danger, fontWeight: "800" }}>
                      − {formatMoney(filteredSummary.spend)}
                    </Text>
                  )}
                  {filter !== "minus" && filteredSummary.income > 0 && (
                    <Text style={{ color: colors.success, fontWeight: "800" }}>
                      + {formatMoney(filteredSummary.income)}
                    </Text>
                  )}
                </View>
              </Card>
            )}
          </>
        ) : (
          // Saved tab
          <>
            {savedCalcs.length === 0 ? (
              <Card>
                <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                  No saved calculations. Long-press entries to select, then Save.
                </Text>
              </Card>
            ) : (
              savedCalcs.map((c) => (
                <Card key={c.id}>
                  <View style={styles.between}>
                    <Text style={{ color: colors.text, fontWeight: "700", flexShrink: 1 }}>
                      {c.name || "Untitled"}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {formatMoney(c.total)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {(c.items || []).length} items
                    {c.createdAt ? `  ·  🕐 ${formatDateTime(toJsDate(c.createdAt))}` : ""}
                  </Text>
                  {(c.items || []).map((it, idx) => (
                    <View key={idx} style={[styles.between, { marginTop: 4 }]}>
                      <Text style={{ color: colors.textMuted }}>{it.name}</Text>
                      <Text style={{ color: it.type === "plus" ? colors.success : colors.danger }}>
                        {it.type === "plus" ? "+" : "−"} {formatMoney(it.amount)}
                      </Text>
                    </View>
                  ))}
                  <Pressable
                    onPress={async () => {
                      if (!user) return;
                      const ok = await confirm({
                        title: "Delete this calculation?",
                        message: `${c.name} — ${formatMoney(c.total)}`,
                        confirmText: "Delete",
                      });
                      if (ok) {
                        await deleteSavedCalc(user.uid, type, id, c.id);
                        toast("Deleted", "success");
                      }
                    }}
                    style={{ marginTop: 10, alignSelf: "flex-end" }}
                  >
                    <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete</Text>
                  </Pressable>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Selection action bar */}
      {selectMode ? (
        <View style={[styles.selectBar, { backgroundColor: colors.cardBg, borderTopColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {selected.size} · {formatMoney(selectionTotal)}
          </Text>
          <View style={styles.selectActions}>
            <BarBtn label="Calc" color={colors.primary} onPress={calcFromSelection} />
            {type === "month" && <BarBtn label="Plan" color={colors.primary} onPress={assignSelection} />}
            <BarBtn label="Save" color={colors.primary} onPress={saveSelection} />
            <BarBtn label="Delete" color={colors.danger} onPress={deleteSelection} />
            <BarBtn label="✕" color={colors.textMuted} onPress={exitSelect} />
          </View>
        </View>
      ) : (
        <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={onAdd}>
          <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
            <Ionicons name="add" size={30} color="#fff" />
          </Animated.View>
        </Pressable>
      )}

      {/* Modals */}
      <ExpenseFormModal
        visible={formVisible}
        mode={formMode}
        initial={editTarget}
        initialDate={editTarget ? dateToInputValue(toJsDate(editTarget.createdAt)) : undefined}
        onClose={() => setFormVisible(false)}
        onSubmit={submitForm}
        onError={(m) => toast(m, "error")}
      />
      <Calculator
        visible={!!calc}
        title={calc?.title || ""}
        initialValue={calc?.value || 0}
        initialExpr={calc?.expr}
        onClose={() => setCalc(null)}
      />
      <DetailsModal
        exp={details}
        type={type}
        colors={colors}
        onClose={() => setDetails(null)}
        onAssign={
          type === "month" && details && !linkedExpenseIds.has(details.id)
            ? (exp: Expense) => openAssign([exp])
            : undefined
        }
      />

      {/* Assign expense(s) to a plan */}
      <Modal visible={assignExps.length > 0} transparent animationType="fade" onRequestClose={() => setAssignExps([])}>
        <Pressable style={styles.detailsBackdrop} onPress={() => setAssignExps([])}>
          <Pressable style={[styles.detailsCard, { backgroundColor: colors.cardBg }]}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
              Assign to a plan
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
              {assignExps.length === 1
                ? `"${assignExps[0].name}" · ${formatMoney(assignTotal)}`
                : `${assignExps.length} entries · ${formatMoney(assignTotal)}`}{" "}
              — stays in Monthly, also tracked under the plan.
            </Text>

            {assignPlans.length === 0 && !assignShowNew && (
              <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 4 }}>
                No plans in this month yet — create one below.
              </Text>
            )}
            <ScrollView style={{ maxHeight: 200 }}>
              {assignPlans.map((pl) => {
                const sel = assignPlanId === pl.id;
                const planned = Number(pl.planned) || 0;
                const paidNow = Number(pl.paid) || 0;
                const after = paidNow + assignTotal;
                const alreadyOver = paidNow > planned; // over even before this add
                const over = after > planned;
                return (
                  <Pressable
                    key={pl.id}
                    onPress={() => {
                      setAssignPlanId(sel ? null : pl.id);
                      setAssignShowNew(false);
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

            {assignShowNew ? (
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  color: colors.text,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  marginTop: 4,
                }}
                value={assignNewName}
                onChangeText={setAssignNewName}
                placeholder={`New plan name (default "${assignExps[0]?.name || ""}")`}
                placeholderTextColor={colors.textMuted}
              />
            ) : (
              <Pressable
                onPress={() => {
                  setAssignShowNew(true);
                  setAssignPlanId(null);
                }}
                style={{ paddingVertical: 8 }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700" }}>+ New plan</Text>
              </Pressable>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setAssignExps([])}
                style={{ flex: 1 }}
              />
              <Button
                title={assignPlanId ? "Assign" : "Create & assign"}
                onPress={doAssign}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Week picker before export */}
      <Modal visible={!!exportFmt} transparent animationType="fade" onRequestClose={() => setExportFmt(null)}>
        <Pressable style={styles.detailsBackdrop} onPress={() => setExportFmt(null)}>
          <Pressable style={[styles.detailsCard, { backgroundColor: colors.cardBg }]}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, marginBottom: 6 }}>
              Which weeks to include?
            </Text>
            {attendedWeeks(expenses).map((w) => {
              const on = weekSel.has(w);
              return (
                <Pressable
                  key={w}
                  style={[styles.between, { paddingVertical: 10 }]}
                  onPress={() =>
                    setWeekSel((prev) => {
                      const next = new Set(prev);
                      if (next.has(w)) next.delete(w);
                      else next.add(w);
                      return next;
                    })
                  }
                >
                  <Text style={{ color: colors.text }}>Week {w}</Text>
                  <Text>{on ? "☑️" : "⬜"}</Text>
                </Pressable>
              );
            })}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={[styles.exportBtn, { backgroundColor: colors.chipBg, flex: 1, justifyContent: "center" }]}
                onPress={() => setExportFmt(null)}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.exportBtn, { backgroundColor: colors.primary, flex: 1, justifyContent: "center" }]}
                onPress={() => {
                  if (weekSel.size === 0) return toast("Pick at least one week.", "error");
                  const all = attendedWeeks(expenses);
                  const filter = weekSel.size === all.length ? null : new Set(weekSel);
                  const fmt = exportFmt!;
                  setExportFmt(null);
                  runExport(fmt, filter, expenses);
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Download</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Download-complete animation */}
      <DownloadAnimation
        visible={!!downloadDone}
        label={(downloadDone || "").toUpperCase()}
        onDone={() => setDownloadDone(null)}
      />
    </View>
  );
}

// ---- subcomponents ----
function BreakItem({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "600", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function BarBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ color, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function ExpenseRow({
  exp,
  colors,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onEdit,
  onDelete,
}: any) {
  const { label: catLabel, emoji: catEmoji } = useCategories();
  const { label: pmLabel, emoji: pmEmoji } = usePaymentMethods();
  const isPlus = exp.type === "plus";
  const cat = exp.category || DEFAULT_CATEGORY;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.chipBg : colors.cardBg,
          borderColor: selected ? colors.primary : "transparent",
        },
      ]}
    >
      {selectMode && (
        <Text style={{ marginRight: 8 }}>{selected ? "☑️" : "⬜"}</Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{exp.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {catEmoji(cat)} {catLabel(cat)}
          {exp.type === "minus" && exp.paymentMethod
            ? `  ·  ${pmEmoji(exp.paymentMethod)} ${pmLabel(exp.paymentMethod)}`
            : ""}
        </Text>
        {!!exp.notes && (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            📝 {exp.notes}
          </Text>
        )}
      </View>
      <Text
        style={{
          color: isPlus ? colors.success : colors.danger,
          fontWeight: "800",
          fontSize: 15,
          marginRight: selectMode ? 0 : 8,
        }}
      >
        {isPlus ? "+" : "−"} {formatMoney(exp.amount)}
      </Text>
      {!selectMode && (
        <View style={{ flexDirection: "row" }}>
          <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="pencil" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function DetailsModal({ exp, type, colors, onClose, onAssign }: any) {
  const { label: catLabel, emoji: catEmoji } = useCategories();
  const { label: pmLabel, emoji: pmEmoji } = usePaymentMethods();
  if (!exp) return null;
  const cat = exp.category || DEFAULT_CATEGORY;
  const d = toJsDate(exp.createdAt);
  const rows: [string, string][] = [
    ["Type", exp.type === "plus" ? "+ Income" : "− Spend"],
    ["Amount", formatMoney(exp.amount)],
    ["Category", `${catEmoji(cat)} ${catLabel(cat)}`],
  ];
  if (exp.type === "minus")
    rows.push([
      "Payment",
      exp.paymentMethod ? `${pmEmoji(exp.paymentMethod)} ${pmLabel(exp.paymentMethod)}` : "—",
    ]);
  if (type !== "budget" && d) rows.push(["Week", `Week ${weekOfMonth(d)}`]);
  rows.push(["Date", formatDateTime(d)]);
  if (exp.notes) rows.push(["Notes", exp.notes]);

  return (
    <Pressable style={styles.detailsBackdrop} onPress={onClose}>
      <Pressable style={[styles.detailsCard, { backgroundColor: colors.cardBg }]}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, marginBottom: 10 }}>
          {exp.name}
        </Text>
        {rows.map((r, i) => (
          <View key={i} style={[styles.between, { paddingVertical: 5 }]}>
            <Text style={{ color: colors.textMuted }}>{r[0]}</Text>
            <Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>
              {r[1]}
            </Text>
          </View>
        ))}
        {onAssign && exp.type === "minus" && (
          <Pressable
            onPress={() => onAssign(exp)}
            style={{
              marginTop: 16,
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Assign to a plan</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} style={{ marginTop: 14, alignSelf: "center" }}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Close</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  totalLabel: { fontSize: 12 },
  totalAmount: { fontSize: 28, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  breakdown: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabs: { flexDirection: "row", marginBottom: 14, borderRadius: 10, padding: 3 },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  weekGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  weekTile: {
    flexGrow: 1,
    minWidth: "30%",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bar: { height: 8, borderRadius: 5, overflow: "hidden", marginTop: 6 },
  searchRow: { marginBottom: 10 },
  search: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterLabel: { fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6, marginLeft: 2 },
  footerTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  catBreakRow: { paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10 },
  catBreakTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catBreakBottom: { flexDirection: "row", alignItems: "center", marginTop: 7 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  catBar: { flex: 1, height: 6, borderRadius: 4, overflow: "hidden" },
  catPct: { fontSize: 12, marginLeft: 10, minWidth: 34, textAlign: "right" },
  catTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  catFilterRow: { flexDirection: "row", gap: 8, marginBottom: 12, paddingRight: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  exportRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 12 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  weekDivider: { fontWeight: "700", fontSize: 12, marginTop: 6, marginBottom: 4, marginLeft: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    borderRadius: 12,
    marginBottom: 9,
    borderWidth: 1.5,
    // Soft lift to match the cards.
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  selectBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectActions: { flexDirection: "row", alignItems: "center" },
  detailsBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  detailsCard: { width: "100%", maxWidth: 360, borderRadius: 18, padding: 20 },
});
