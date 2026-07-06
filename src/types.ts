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

export interface PlanDoc {
  id: string;
  name: string;
  planned: number;
  category?: string;
  status: PlanStatus;
  actual?: number | null;
  paid?: number;
  payments?: PlanPayment[];
  pushedExpenseId?: string | null;
  transferredFrom?: string;
  movedTo?: string;
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
  // Global savings pot, shown as "Total with main balance"; not spent from months.
  mainBalance?: number;
  createdAt?: any;
}
