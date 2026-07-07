// Firestore data layer — port of all db.collection(...) logic from the PWA
// (dashboard.js, month.js, plan.js, year.js, profile.js) to the modular SDK.
// Same collection paths => same data => existing accounts keep working.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./config";
import {
  Expense,
  ExpenseType,
  MonthDoc,
  MonthData,
  BudgetDoc,
  PlanDoc,
  RecurringDoc,
  UserDoc,
  GoalDoc,
  GoalEntry,
} from "../types";

// ---- path helpers -----------------------------------------------------------
const userRef = (uid: string) => doc(db, "users", uid);
const monthsCol = (uid: string) => collection(db, "users", uid, "months");
const monthRef = (uid: string, mid: string) => doc(db, "users", uid, "months", mid);
const monthExpensesCol = (uid: string, mid: string) =>
  collection(db, "users", uid, "months", mid, "expenses");
const budgetsCol = (uid: string) => collection(db, "users", uid, "budgets");
const budgetRef = (uid: string, bid: string) => doc(db, "users", uid, "budgets", bid);
const budgetExpensesCol = (uid: string, bid: string) =>
  collection(db, "users", uid, "budgets", bid, "expenses");
// Plans are a subcollection of the MONTH doc: users/{uid}/months/{monthId}/plans
const plansCol = (uid: string, mid: string) =>
  collection(db, "users", uid, "months", mid, "plans");
const recurringCol = (uid: string) => collection(db, "users", uid, "recurring");
// Category budgets are a subcollection: users/{uid}/categoryBudgets/{categoryKey} { limit }
const categoryBudgetsCol = (uid: string) =>
  collection(db, "users", uid, "categoryBudgets");
// Custom categories: users/{uid}/categories/{id} { label, emoji, color }
const categoriesCol = (uid: string) => collection(db, "users", uid, "categories");

// type="month" reads months/{id}; type="budget" reads budgets/{id}.
export type TrackerType = "month" | "budget";
const expensesColFor = (uid: string, type: TrackerType, id: string) =>
  type === "budget" ? budgetExpensesCol(uid, id) : monthExpensesCol(uid, id);
export const trackerRefFor = (uid: string, type: TrackerType, id: string) =>
  type === "budget" ? budgetRef(uid, id) : monthRef(uid, id);

function docsToExpenses(snap: QuerySnapshot<DocumentData>): Expense[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];
}

// ---- user -------------------------------------------------------------------
export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

export async function createUserDoc(uid: string, data: UserDoc): Promise<void> {
  await setDoc(userRef(uid), { ...data, createdAt: serverTimestamp() });
}

export async function updateUser(uid: string, updates: Partial<UserDoc>): Promise<void> {
  await updateDoc(userRef(uid), updates);
}

// ---- admin: list all users + their month counts (port of admin.js) ----------
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  salary: number;
  monthCount: number;
  createdAt?: any;
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  const counts = await Promise.all(
    snap.docs.map((d) => getDocs(collection(db, "users", d.id, "months")))
  );
  return snap.docs.map((d, i) => {
    const u = d.data() as any;
    return {
      id: d.id,
      name: u.name || "Unnamed",
      email: u.email || "",
      salary: Number(u.salary) || 0,
      monthCount: counts[i].size,
      createdAt: u.createdAt,
    };
  });
}

// ---- months + aggregation (port of fetchMonthsData) -------------------------
export async function fetchMonthsData(
  uid: string,
  salary: number
): Promise<MonthData[]> {
  const monthsSnap = await getDocs(query(monthsCol(uid), orderBy("createdAt", "desc")));
  if (monthsSnap.empty) return [];

  const expenseSnaps = await Promise.all(
    monthsSnap.docs.map((d) => getDocs(monthExpensesCol(uid, d.id)))
  );

  return monthsSnap.docs.map((monthDoc, idx) => {
    const month = monthDoc.data() as any;
    const currentBalance = Number(month.currentBalance) || 0;
    let spent = 0;
    let income = 0;
    const byCategory: Record<string, number> = {};
    expenseSnaps[idx].forEach((expDoc) => {
      const exp = expDoc.data() as any;
      const amt = Number(exp.amount) || 0;
      if (exp.type !== "plus") {
        spent += amt;
        const c = exp.category || "other";
        byCategory[c] = (byCategory[c] || 0) + amt;
      } else {
        income += amt;
      }
    });
    return {
      id: monthDoc.id,
      name: month.name,
      spent,
      income,
      currentBalance,
      totalRemaining: currentBalance - spent + income,
      remaining: salary - spent + income,
      byCategory,
    };
  });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface YearData {
  byMonth: number[]; // 12 spend totals
  ids: (string | null)[]; // 12 month-doc ids (or null)
  totalSpend: number;
  totalIncome: number;
}

// Port of loadYear: index every month doc by calendar position (parsed from its
// name like "May 2026"), summing spend per month + yearly totals.
export async function fetchYearData(uid: string, year: number): Promise<YearData> {
  const byMonth = new Array(12).fill(0);
  const ids: (string | null)[] = new Array(12).fill(null);
  let totalSpend = 0;
  let totalIncome = 0;

  const monthsSnap = await getDocs(monthsCol(uid));
  const docs = monthsSnap.docs.filter((d) => {
    const name: string = (d.data() as any).name || "";
    return MONTH_NAMES.some((n) => name.startsWith(n)) && name.indexOf(String(year)) !== -1;
  });

  const expenseSnaps = await Promise.all(docs.map((d) => getDocs(monthExpensesCol(uid, d.id))));
  docs.forEach((d, i) => {
    const name: string = (d.data() as any).name || "";
    const idx = MONTH_NAMES.findIndex((n) => name.startsWith(n));
    if (idx === -1) return;
    let spent = 0;
    expenseSnaps[i].forEach((e) => {
      const exp = e.data() as any;
      const amt = Number(exp.amount) || 0;
      if (exp.type === "plus") totalIncome += amt;
      else {
        spent += amt;
        totalSpend += amt;
      }
    });
    byMonth[idx] += spent;
    ids[idx] = d.id;
  });

  return { byMonth, ids, totalSpend, totalIncome };
}

export async function listMonths(uid: string): Promise<MonthDoc[]> {
  const snap = await getDocs(query(monthsCol(uid), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function getMonth(
  uid: string,
  type: TrackerType,
  id: string
): Promise<(MonthDoc & BudgetDoc) | null> {
  const snap = await getDoc(trackerRefFor(uid, type, id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
}

// Create a month + auto-add recurring expenses (port of createNewMonth).
export async function createMonth(
  uid: string,
  name: string,
  currentBalance: number
): Promise<string> {
  const ref = await addDoc(monthsCol(uid), {
    name,
    currentBalance,
    createdAt: serverTimestamp(),
  });
  const recurringSnap = await getDocs(recurringCol(uid));
  if (!recurringSnap.empty) {
    const batch = writeBatch(db);
    recurringSnap.forEach((rec) => {
      const r = rec.data() as any;
      const expRef = doc(monthExpensesCol(uid, ref.id));
      batch.set(expRef, {
        name: r.name,
        amount: Number(r.amount) || 0,
        type: "minus",
        category: r.category || "other",
        paymentMethod: "other",
        notes: "Recurring",
        recurring: true,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return ref.id;
}

export async function updateMonth(
  uid: string,
  id: string,
  updates: Record<string, any>
): Promise<void> {
  await updateDoc(monthRef(uid, id), updates);
}

// ---- expenses (work for both months and budgets) ---------------------------
export function watchExpenses(
  uid: string,
  type: TrackerType,
  id: string,
  cb: (expenses: Expense[]) => void,
  onError?: (e: any) => void
): () => void {
  return onSnapshot(
    expensesColFor(uid, type, id),
    (snap) => cb(docsToExpenses(snap)),
    onError
  );
}

// One-shot read of a tracker's expenses (used for balance projections).
export async function getExpenses(
  uid: string,
  type: TrackerType,
  id: string
): Promise<Expense[]> {
  const snap = await getDocs(expensesColFor(uid, type, id));
  return docsToExpenses(snap);
}

export async function addExpense(
  uid: string,
  type: TrackerType,
  id: string,
  expense: Omit<Expense, "id">
): Promise<string> {
  // Honor a caller-supplied createdAt (a chosen date); otherwise use server time.
  const { createdAt, ...rest } = expense as any;
  const ref = await addDoc(expensesColFor(uid, type, id), {
    ...rest,
    createdAt: createdAt ?? serverTimestamp(),
  });
  return ref.id;
}

export async function updateExpense(
  uid: string,
  type: TrackerType,
  id: string,
  expenseId: string,
  updates: Partial<Expense>
): Promise<void> {
  await updateDoc(doc(expensesColFor(uid, type, id), expenseId), updates as any);
}

export async function deleteExpense(
  uid: string,
  type: TrackerType,
  id: string,
  expenseId: string
): Promise<void> {
  await deleteDoc(doc(expensesColFor(uid, type, id), expenseId));
}

// ---- saved calculations (per tracker subcollection) -------------------------
const savedCalcsCol = (uid: string, type: TrackerType, id: string) =>
  collection(expensesColFor(uid, type, id).parent!, "savedCalculations");

export interface SavedCalc {
  id: string;
  name: string;
  total: number;
  items: { name: string; amount: number; type: ExpenseType }[];
  createdAt?: any;
}

export function watchSavedCalcs(
  uid: string,
  type: TrackerType,
  id: string,
  cb: (calcs: SavedCalc[]) => void
): () => void {
  return onSnapshot(savedCalcsCol(uid, type, id), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
  );
}

export async function addSavedCalc(
  uid: string,
  type: TrackerType,
  id: string,
  calc: Omit<SavedCalc, "id">
): Promise<void> {
  await addDoc(savedCalcsCol(uid, type, id), { ...calc, createdAt: serverTimestamp() });
}

export async function deleteSavedCalc(
  uid: string,
  type: TrackerType,
  id: string,
  calcId: string
): Promise<void> {
  await deleteDoc(doc(savedCalcsCol(uid, type, id), calcId));
}

// ---- budgets ----------------------------------------------------------------
export async function listBudgets(uid: string): Promise<BudgetDoc[]> {
  const snap = await getDocs(query(budgetsCol(uid), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function fetchBudgetsData(
  uid: string
): Promise<Array<BudgetDoc & { spent: number; remaining: number }>> {
  const snap = await getDocs(query(budgetsCol(uid), orderBy("createdAt", "desc")));
  if (snap.empty) return [];
  const expenseSnaps = await Promise.all(
    snap.docs.map((d) => getDocs(budgetExpensesCol(uid, d.id)))
  );
  return snap.docs.map((bDoc, i) => {
    const b = bDoc.data() as any;
    const amount = Number(b.amount) || 0;
    let spent = 0;
    expenseSnaps[i].forEach((e) => {
      const exp = e.data() as any;
      const amt = Number(exp.amount) || 0;
      spent += exp.type === "plus" ? -amt : amt;
    });
    return { id: bDoc.id, name: b.name, amount, spent, remaining: amount - spent };
  });
}

export async function createBudget(
  uid: string,
  name: string,
  amount: number
): Promise<string> {
  const ref = await addDoc(budgetsCol(uid), {
    name,
    amount,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ---- savings goals (users/{uid}/goals/{id}) ---------------------------------
const goalsCol = (uid: string) => collection(db, "users", uid, "goals");

export function watchGoals(
  uid: string,
  cb: (goals: GoalDoc[]) => void,
  onError?: (e: any) => void
): () => void {
  return onSnapshot(
    query(goalsCol(uid), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onError
  );
}

export async function getGoal(uid: string, id: string): Promise<GoalDoc | null> {
  const snap = await getDoc(doc(goalsCol(uid), id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as GoalDoc) : null;
}

export async function createGoal(
  uid: string,
  name: string,
  initialSavings?: number
): Promise<string> {
  const amt = Number(initialSavings) || 0;
  // Seed the pot with the amount the user already has to save.
  const entries: GoalEntry[] =
    amt > 0
      ? [
          {
            eid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
            name: "Initial savings",
            amount: amt,
            type: "in",
            at: new Date(),
          },
        ]
      : [];
  const ref = await addDoc(goalsCol(uid), {
    name,
    target: 0, // optional goal-to-reach; set later via "Add to target"/Edit
    entries,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addGoalEntry(
  uid: string,
  id: string,
  entry: Omit<GoalEntry, "eid" | "at">
): Promise<void> {
  const g = await getGoal(uid, id);
  if (!g) return;
  const entries = Array.isArray(g.entries) ? g.entries.slice() : [];
  entries.push({
    ...entry,
    eid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    at: new Date(),
  });
  await updateDoc(doc(goalsCol(uid), id), { entries } as any);
}

export async function deleteGoalEntry(uid: string, id: string, eid: string): Promise<void> {
  const g = await getGoal(uid, id);
  if (!g) return;
  const entries = (Array.isArray(g.entries) ? g.entries : []).filter((e) => e.eid !== eid);
  await updateDoc(doc(goalsCol(uid), id), { entries } as any);
}

export async function updateGoal(
  uid: string,
  id: string,
  updates: Partial<Pick<GoalDoc, "name" | "target">>
): Promise<void> {
  await updateDoc(doc(goalsCol(uid), id), updates as any);
}

export async function deleteGoal(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(goalsCol(uid), id));
}

// ---- plans (month-scoped) ---------------------------------------------------
export function watchPlans(
  uid: string,
  monthId: string,
  cb: (plans: PlanDoc[]) => void,
  onError?: (e: any) => void
): () => void {
  return onSnapshot(
    plansCol(uid, monthId),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onError
  );
}

export async function getPlans(uid: string, monthId: string): Promise<PlanDoc[]> {
  const snap = await getDocs(plansCol(uid, monthId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PlanDoc[];
}

export async function addPlan(
  uid: string,
  monthId: string,
  plan: Omit<PlanDoc, "id">
): Promise<string> {
  const ref = await addDoc(plansCol(uid, monthId), {
    ...plan,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlan(
  uid: string,
  monthId: string,
  planId: string,
  updates: Partial<PlanDoc>
): Promise<void> {
  await updateDoc(doc(plansCol(uid, monthId), planId), updates as any);
}

export async function deletePlan(
  uid: string,
  monthId: string,
  planId: string
): Promise<void> {
  await deleteDoc(doc(plansCol(uid, monthId), planId));
}

export async function getPlan(
  uid: string,
  monthId: string,
  planId: string
): Promise<PlanDoc | null> {
  const snap = await getDoc(doc(plansCol(uid, monthId), planId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as PlanDoc) : null;
}

// Move plans to another month (port of executeMove). mode "whole" moves the
// entire plan; "unpaid" moves only the remaining unpaid amount. Source plans are
// kept and marked status:"moved". Returns the count actually moved.
export async function movePlans(
  uid: string,
  fromMonthId: string,
  fromMonthName: string,
  plans: PlanDoc[],
  mode: "whole" | "unpaid",
  targetId: string,
  targetName: string
): Promise<number> {
  const batch = writeBatch(db);
  const target = plansCol(uid, targetId);
  const source = plansCol(uid, fromMonthId);
  let moved = 0;
  plans.forEach((p) => {
    const planned = Number(p.planned) || 0;
    const paid = Number(p.paid) || 0;
    const remaining = Math.max(0, planned - paid);
    if (mode === "whole") {
      const newRef = doc(target);
      batch.set(newRef, {
        name: p.name,
        planned,
        category: p.category || "other",
        status: p.status === "partial" ? "partial" : "pending",
        actual: null,
        paid,
        payments: Array.isArray(p.payments) ? p.payments : [],
        pushedExpenseId: null,
        transferredFrom: fromMonthName,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(source, p.id), {
        status: "moved",
        movedTo: targetName,
        movedToMonthId: targetId,
        movedToPlanId: newRef.id,
      });
      moved++;
    } else {
      if (remaining <= 0) return;
      const newRef = doc(target);
      batch.set(newRef, {
        name: p.name,
        planned: remaining,
        category: p.category || "other",
        status: "pending",
        actual: null,
        paid: 0,
        payments: [],
        pushedExpenseId: null,
        transferredFrom: fromMonthName,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(source, p.id), {
        status: "moved",
        movedTo: targetName,
        actual: paid,
        movedToMonthId: targetId,
        movedToPlanId: newRef.id,
      });
      moved++;
    }
  });
  if (moved) await batch.commit();
  return moved;
}

// ---- recurring --------------------------------------------------------------
export async function listRecurring(uid: string): Promise<RecurringDoc[]> {
  const snap = await getDocs(recurringCol(uid));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function addRecurring(
  uid: string,
  rec: Omit<RecurringDoc, "id">
): Promise<string> {
  const ref = await addDoc(recurringCol(uid), rec);
  return ref.id;
}

export async function updateRecurring(
  uid: string,
  id: string,
  updates: Partial<Omit<RecurringDoc, "id">>
): Promise<void> {
  await updateDoc(doc(recurringCol(uid), id), updates as any);
}

export async function deleteRecurring(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(recurringCol(uid), id));
}

// ---- category budgets (subcollection users/{uid}/categoryBudgets/{key}) -----
export async function getCategoryBudgets(
  uid: string
): Promise<Record<string, { limit: number }>> {
  const snap = await getDocs(categoryBudgetsCol(uid));
  const out: Record<string, { limit: number }> = {};
  snap.forEach((d) => {
    out[d.id] = { limit: Number((d.data() as any).limit) || 0 };
  });
  return out;
}

// Set (limit > 0) or delete (limit <= 0) a single category's budget.
export async function setCategoryBudget(
  uid: string,
  key: string,
  limit: number
): Promise<void> {
  const ref = doc(categoryBudgetsCol(uid), key);
  if (!limit || limit <= 0) await deleteDoc(ref).catch(() => {});
  else await setDoc(ref, { limit });
}

// ---- custom categories (subcollection users/{uid}/categories/{id}) ----------
export interface CustomCategoryDoc {
  id: string;
  label: string;
  emoji: string;
  color: string;
  // When set, this doc overrides/hides the built-in category with this key
  // (keeps existing entries linked). Otherwise it's a brand-new category.
  key?: string;
  hidden?: boolean;
  createdAt?: any;
}

export function watchCategories(
  uid: string,
  cb: (cats: CustomCategoryDoc[]) => void,
  onError?: (e: any) => void
): () => void {
  return onSnapshot(
    categoriesCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onError
  );
}

export async function addCategory(
  uid: string,
  cat: Omit<CustomCategoryDoc, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(categoriesCol(uid), { ...cat, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateCategory(
  uid: string,
  id: string,
  updates: Partial<Omit<CustomCategoryDoc, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(categoriesCol(uid), id), updates as any);
}

export async function deleteCategory(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(categoriesCol(uid), id));
}

// ---- custom payment methods (subcollection users/{uid}/paymentMethods/{id}) --
const paymentMethodsCol = (uid: string) =>
  collection(db, "users", uid, "paymentMethods");

export interface CustomPaymentDoc {
  id: string;
  label: string;
  emoji: string;
  // When set, overrides/hides the built-in payment method with this key.
  key?: string;
  hidden?: boolean;
  createdAt?: any;
}

export function watchPaymentMethods(
  uid: string,
  cb: (methods: CustomPaymentDoc[]) => void,
  onError?: (e: any) => void
): () => void {
  return onSnapshot(
    paymentMethodsCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    onError
  );
}

export async function addPaymentMethod(
  uid: string,
  pm: Omit<CustomPaymentDoc, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(paymentMethodsCol(uid), { ...pm, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updatePaymentMethod(
  uid: string,
  id: string,
  updates: Partial<Omit<CustomPaymentDoc, "id" | "createdAt">>
): Promise<void> {
  await updateDoc(doc(paymentMethodsCol(uid), id), updates as any);
}

export async function deletePaymentMethod(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(paymentMethodsCol(uid), id));
}
