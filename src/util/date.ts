// Date helpers — ported from month.js (weekOfMonth, weekRange, date<->input).
import { Timestamp } from "firebase/firestore";

export function toJsDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  return null;
}

export function weekOfMonth(date: Date | null): number {
  if (!date) return 1;
  const day = date.getDate();
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

export function weekRange(w: number): string {
  const start = (w - 1) * 7 + 1;
  const end = w === 5 ? 31 : start + 6;
  return `${start}–${end}`;
}

export function todayStr(): string {
  const d = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

export function dateToInputValue(d: Date | null): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return todayStr();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

// "YYYY-MM-DD" -> Firestore Timestamp keeping current time-of-day.
// Empty string -> null (caller should use serverTimestamp()).
export function inputValueToTimestamp(value: string): Timestamp | null {
  if (!value) return null;
  const p = value.split("-");
  const now = new Date();
  const chosen = new Date(
    Number(p[0]),
    Number(p[1]) - 1,
    Number(p[2]),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  );
  if (isNaN(chosen.getTime())) return null;
  return Timestamp.fromDate(chosen);
}

// "YYYY-MM-DD" -> local Date (midnight). Falls back to today if unparseable.
export function inputValueToDate(value: string): Date {
  if (value) {
    const p = value.split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

// Friendly "12 Jun 2026" for the date-picker button label.
export function formatDateMedium(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString("en-IN", { dateStyle: "medium" } as any);
  } catch {
    return d.toDateString();
  }
}

export function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  try {
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" } as any);
  } catch {
    return d.toDateString();
  }
}
