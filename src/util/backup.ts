// Reading the whole account out of Firestore: what's in there, and a full JSON
// backup of it.
//
// This exists because several things in the app are irreversible — converting
// every amount to a new currency, deleting a month and its subcollections — and
// the only safety net for those is having taken a copy first.
//
// Timestamps are left exactly as Firestore hands them over. JSON turns them into
// { seconds, nanoseconds }, which util/date.ts toJsDate() already understands, so
// a backup stays readable by the same code that wrote it.

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export interface CollectionStat {
  /** Human label shown in the UI. */
  label: string;
  /** Where it lives, e.g. "months/{id}/expenses". */
  path: string;
  count: number;
}

export interface DatabaseSnapshot {
  /** The whole account, ready to be written out as JSON. */
  data: any;
  stats: CollectionStat[];
  totalDocs: number;
  /** Size of the serialised backup in bytes. */
  bytes: number;
  takenAt: number;
}

const docsOf = async (...path: string[]) => {
  const snap = await getDocs(collection(db, ...(path as [string, ...string[]])));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
};

// One full pass over everything the account owns. Ordered so the returned stats
// read top-down the way the app is organised, not the way Firestore stores it.
export async function readDatabase(uid: string): Promise<DatabaseSnapshot> {
  const stats: CollectionStat[] = [];
  const add = (label: string, path: string, count: number) =>
    stats.push({ label, path, count });

  const userSnap = await getDoc(doc(db, "users", uid));
  const profile = userSnap.exists() ? userSnap.data() : null;
  add("Profile", "users/{uid}", profile ? 1 : 0);

  // Months carry three subcollections each; budgets carry two.
  const months = await docsOf("users", uid, "months");
  let expenseCount = 0;
  let planCount = 0;
  let calcCount = 0;
  const monthsOut: any[] = [];
  for (const m of months) {
    const [expenses, plans, savedCalculations] = await Promise.all([
      docsOf("users", uid, "months", m.id, "expenses"),
      docsOf("users", uid, "months", m.id, "plans"),
      docsOf("users", uid, "months", m.id, "savedCalculations"),
    ]);
    expenseCount += expenses.length;
    planCount += plans.length;
    calcCount += savedCalculations.length;
    monthsOut.push({ ...m, expenses, plans, savedCalculations });
  }
  add("Months", "months", months.length);
  add("Entries", "months/{id}/expenses", expenseCount);
  add("Plans", "months/{id}/plans", planCount);
  add("Saved calculations", "months/{id}/savedCalculations", calcCount);

  const budgets = await docsOf("users", uid, "budgets");
  let budgetExpenses = 0;
  let budgetCalcs = 0;
  const budgetsOut: any[] = [];
  for (const b of budgets) {
    const [expenses, savedCalculations] = await Promise.all([
      docsOf("users", uid, "budgets", b.id, "expenses"),
      docsOf("users", uid, "budgets", b.id, "savedCalculations"),
    ]);
    budgetExpenses += expenses.length;
    budgetCalcs += savedCalculations.length;
    budgetsOut.push({ ...b, expenses, savedCalculations });
  }
  add("Budgets", "budgets", budgets.length);
  add("Budget entries", "budgets/{id}/expenses", budgetExpenses);
  if (budgetCalcs) add("Budget calculations", "budgets/{id}/savedCalculations", budgetCalcs);

  const [goals, recurring, categoryBudgets, categories, paymentMethods] = await Promise.all([
    docsOf("users", uid, "goals"),
    docsOf("users", uid, "recurring"),
    docsOf("users", uid, "categoryBudgets"),
    docsOf("users", uid, "categories"),
    docsOf("users", uid, "paymentMethods"),
  ]);
  add("Savings goals", "goals", goals.length);
  add("Recurring expenses", "recurring", recurring.length);
  add("Category budgets", "categoryBudgets", categoryBudgets.length);
  add("Custom categories", "categories", categories.length);
  add("Payment methods", "paymentMethods", paymentMethods.length);

  const takenAt = Date.now();
  const data = {
    // Stamped so a future restore can tell what it is looking at.
    _backup: { app: "ExpenseApp", version: 1, uid, takenAt: new Date(takenAt).toISOString() },
    profile,
    months: monthsOut,
    budgets: budgetsOut,
    goals,
    recurring,
    categoryBudgets,
    categories,
    paymentMethods,
  };

  const json = JSON.stringify(data);
  const totalDocs = stats.reduce((s, c) => s + c.count, 0);
  console.log("[Backup] read", totalDocs, "documents,", json.length, "bytes");

  return { data, stats, totalDocs, bytes: byteLength(json), takenAt };
}

// JSON.stringify().length counts UTF-16 code units, which understates anything
// non-ASCII — category emoji, currency symbols, names. This is what the file
// will actually weigh on disk.
function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4; // surrogate pair — one 4-byte character
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
