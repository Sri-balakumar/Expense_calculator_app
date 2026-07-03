// Category colors + labels — ported from dashboard.js / month.js.

export const CATEGORY_COLORS: Record<string, string> = {
  food: "#f59e0b",
  rent: "#8b5cf6",
  transport: "#3b82f6",
  shopping: "#ec4899",
  bills: "#06b6d4",
  health: "#10b981",
  entertainment: "#f97316",
  salary: "#22c55e",
  other: "#6b7280",
};

export const CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  rent: "Rent",
  transport: "Transport",
  shopping: "Shopping",
  bills: "Bills",
  health: "Health",
  entertainment: "Fun",
  salary: "Salary",
  other: "Other",
};

// Order shown in pickers.
export const CATEGORY_KEYS = [
  "food",
  "rent",
  "transport",
  "shopping",
  "bills",
  "health",
  "entertainment",
  "salary",
  "other",
];

export const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍔",
  rent: "🏠",
  transport: "🚗",
  shopping: "🛍️",
  bills: "📄",
  health: "💊",
  entertainment: "🎬",
  salary: "💰",
  other: "📌",
};

export const DEFAULT_CATEGORY = "other";
export const DEFAULT_PAYMENT = "cash";

// Palette for auto-assigning a color to a new custom category.
export const CATEGORY_PALETTE = [
  "#ef4444", "#f59e0b", "#eab308", "#84cc16", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef",
  "#ec4899", "#f43f5e", "#14b8a6", "#0ea5e9", "#a855f7",
];

export const PAYMENT_METHODS = ["gpay", "phonepe", "paytm", "cash", "card", "other"];
export const PAYMENT_EMOJI: Record<string, string> = {
  gpay: "📱",
  phonepe: "💜",
  paytm: "🅿️",
  cash: "💵",
  card: "💳",
  other: "❓",
};
export const PAYMENT_LABELS: Record<string, string> = {
  gpay: "GPay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export function categoryColor(key?: string): string {
  return CATEGORY_COLORS[key || "other"] || CATEGORY_COLORS.other;
}

export function categoryLabel(key?: string): string {
  return CATEGORY_LABELS[key || "other"] || key || "Other";
}
