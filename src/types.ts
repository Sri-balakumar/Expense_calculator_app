// Shared data types — mirror the Firestore documents used by the PWA.

export type ExpenseType = "plus" | "minus";

export interface Expense {
  id: string;
  name: string;
  amount: number;
  type: ExpenseType;
  category: string;
  date?: string;
  notes?: string;
  paymentMethod?: string;
  recurring?: boolean;
  createdAt?: any;
}

export interface MonthDoc {
  id: string;
  name: string;
  currentBalance?: number;
  createdAt?: any;
}

// Computed per-month figures (mirrors fetchMonthsData in dashboard.js).
export interface MonthData {
  id: string;
  name: string;
  spent: number;
  income: number;
  currentBalance: number;
  totalRemaining: number; // currentBalance - spent + income
  remaining: number; // salary - spent + income
  byCategory: Record<string, number>;
}

export interface BudgetDoc {
  id: string;
  name: string;
  amount: number;
  createdAt?: any;
}

// Savings goal: a pot you add savings into ("in") and plan purchases from ("out").
export interface GoalEntry {
  eid: string;
  name?: string;
  amount: number;
  type: "in" | "out"; // in = savings added, out = purchase planned/spent
  at?: any;
}

export interface GoalDoc {
  id: string;
  name: string;
  target?: number; // optional goal amount
  entries?: GoalEntry[];
  createdAt?: any;
}

export type PlanStatus = "pending" | "partial" | "done" | "moved";

export interface PlanPayment {
  name: string;
  amount: number;
  category?: string;
  paymentMethod?: string;
  notes?: string;
  expenseId?: string;
  linked?: boolean;
  paidAt?: any;
}

// One recorded change to a plan after it was created — shown as history in the
// plan's detail popup ("₹100 → ₹150"). `at` is a plain Date: Firestore rejects
// serverTimestamp() inside array elements.
export interface PlanEdit {
  at: any;
  field: "planned" | "name" | "category";
  from: string | number;
  to: string | number;
}

export interface PlanDoc {
  id: string;
  name: string;
  planned: number;
  category?: string;
  edits?: PlanEdit[];
  status: PlanStatus;
  // Closed by hand before it was fully paid ("Mark done" / "Finish"), so the
  // status must not be re-derived from the numbers behind the user's back.
  closedEarly?: boolean;
  actual?: number | null;
  paid?: number;
  payments?: PlanPayment[];
  pushedExpenseId?: string | null;
  transferredFrom?: string;
  movedTo?: string;
  // Where a moved plan went — used to undo the move (delete the copy + restore).
  movedToMonthId?: string | null;
  movedToPlanId?: string | null;
  createdAt?: any;
}

export interface RecurringDoc {
  id: string;
  name: string;
  amount: number;
  category?: string;
}

export interface UserDoc {
  name: string;
  salary: number;
  email: string;
  // Currency every stored amount is denominated in. Lives on the account, not
  // the device, so the same data reads the same everywhere. Changing it is a
  // migration (see util/currencyMigrate.ts), never just a relabel by default.
  currency?: string;
  // Global savings pot, shown as "Total with main balance"; not spent from months.
  mainBalance?: number;
  createdAt?: any;
}
