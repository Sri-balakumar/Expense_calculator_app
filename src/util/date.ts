// Date helpers — ported from month.js (weekOfMonth, weekRange, date<->input).
import { Timestamp } from "firebase/firestore";

export function toJsDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  // Values that have been through JSON — the offline read cache in util/cache.ts
  // — keep their fields but lose their methods. A Firestore Timestamp arrives as
  // { seconds, nanoseconds } and a plain Date as an ISO string. Without these,
  // every cached record would date to null and lose its sort order, its week
  // grouping and its place in the calendar.
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
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

// "YYYY-MM-DD" -> Firestore Timestamp on that day. The picker only asks for a
// calendar day, so the time-of-day comes from `baseTime` when one is given —
// editing an entry passes its existing createdAt so the original time survives
// — and from the clock otherwise.
// Empty string -> null (caller should use serverTimestamp()).
export function inputValueToTimestamp(
  value: string,
  baseTime?: Date | null
): Timestamp | null {
  if (!value) return null;
  const p = value.split("-");
  const base =
    baseTime instanceof Date && !isNaN(baseTime.getTime()) ? baseTime : new Date();
  const chosen = new Date(
    Number(p[0]),
    Number(p[1]) - 1,
    Number(p[2]),
    base.getHours(),
    base.getMinutes(),
    base.getSeconds()
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "October 2026" -> "September 2026", "January 2027" -> "December 2026".
// Month docs are named this way (MonthPickerModal), so the name is the only
// way to find the calendar month before one. null for anything else.
export function previousMonthName(name: string): string | null {
  const m = /^([A-Za-z]+) (\d{4})$/.exec((name || "").trim());
  if (!m) return null;
  const idx = MONTH_NAMES.indexOf(m[1]);
  if (idx === -1) return null;
  const year = Number(m[2]);
  return idx === 0 ? `December ${year - 1}` : `${MONTH_NAMES[idx - 1]} ${year}`;
}

// The same day of the month as `d`, but in the named month ("October 2026"),
// as "YYYY-MM-DD" — a plan reused from last month keeps its day (rent on the
// 5th stays on the 5th). Clamped to the month's length (31st -> 30th). Today
// when the name or the date can't be read.
export function sameDayIn(monthName: string, d: Date | null): string {
  const m = /^([A-Za-z]+) (\d{4})$/.exec((monthName || "").trim());
  const idx = m ? MONTH_NAMES.indexOf(m[1]) : -1;
  if (!m || idx === -1 || !d || isNaN(d.getTime())) return todayStr();
  const year = Number(m[2]);
  const last = new Date(year, idx + 1, 0).getDate();
  return dateToInputValue(new Date(year, idx, Math.min(d.getDate(), last)));
}
