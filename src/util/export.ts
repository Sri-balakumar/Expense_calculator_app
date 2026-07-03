// PDF + Excel export — ports buildExportRows/downloadPDF/downloadExcel from
// month.js. PDF: build HTML -> expo-print. Excel: xlsx workbook -> base64 file
// -> share. Both open the native share sheet (no browser "download").

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { Expense } from "../types";
import { CATEGORY_LABELS, PAYMENT_LABELS } from "../constants/categories";
import { toJsDate, weekOfMonth, formatDateMedium } from "./date";

interface ExportContext {
  monthName: string;
  userName: string;
  isBudget: boolean;
  limit: number; // salary or budget amount
  currentBalance: number;
  // Resolver so custom categories render with their label; falls back to defaults.
  catLabel?: (key?: string) => string;
}

interface ExportRow {
  Name: string;
  Category: string;
  Type: string;
  Payment: string;
  Notes: string;
  Amount: number;
  Week: string;
  Date: string;
}

export function attendedWeeks(expenses: Expense[]): number[] {
  const weeks = new Set<number>();
  expenses.forEach((e) => {
    const d = toJsDate(e.createdAt);
    if (d) weeks.add(weekOfMonth(d));
  });
  return Array.from(weeks).sort((a, b) => a - b);
}

function buildExportRows(expenses: Expense[], weekFilter: Set<number> | null, ctx: ExportContext) {
  let totalSpent = 0;
  let totalIncome = 0;
  const source = weekFilter
    ? expenses.filter((e) => {
        const d = toJsDate(e.createdAt);
        return d && weekFilter.has(weekOfMonth(d));
      })
    : expenses;
  const catLabel = ctx.catLabel || ((k?: string) => CATEGORY_LABELS[k || "other"] || "Other");
  const rows: ExportRow[] = source.map((e) => {
    if (e.type === "plus") totalIncome += e.amount;
    else totalSpent += e.amount;
    const d = toJsDate(e.createdAt);
    return {
      Name: e.name,
      Category: catLabel(e.category),
      Type: e.type === "plus" ? "Income (+)" : "Spend (-)",
      Payment: e.type === "minus" && e.paymentMethod ? PAYMENT_LABELS[e.paymentMethod] || "" : "",
      Notes: e.notes || "",
      Amount: e.amount,
      Week: d ? "Week " + weekOfMonth(d) : "",
      Date: d ? formatDateMedium(d) : "",
    };
  });
  const netSpent = totalSpent - totalIncome;
  const remaining = (ctx.isBudget ? ctx.limit : ctx.currentBalance) - netSpent;
  return { rows, totalSpent, totalIncome, remaining };
}

function inr(n: number): string {
  return "Rs. " + (Number(n) || 0).toLocaleString("en-IN");
}

function safeFilename(name: string): string {
  return (name || "month").replace(/[^a-z0-9_\- ]/gi, "_").trim() || "month";
}

function esc(s: any): string {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- PDF ----
export async function exportPdf(
  expenses: Expense[],
  weekFilter: Set<number> | null,
  ctx: ExportContext
): Promise<void> {
  const data = buildExportRows(expenses, weekFilter, ctx);
  const title = (ctx.isBudget ? "Budget Report" : "Expense Report") + " — " + ctx.monthName;

  const summary: [string, string][] = [["Name", ctx.userName || "-"]];
  if (ctx.isBudget) summary.push(["Budget Amount", inr(ctx.limit)]);
  else {
    summary.push(["Salary", inr(ctx.limit)]);
    summary.push(["Current Balance", inr(ctx.currentBalance)]);
  }
  summary.push(["Total Spend", inr(data.totalSpent)]);
  summary.push(["Total Income", inr(data.totalIncome)]);
  summary.push([ctx.isBudget ? "Remaining" : "Total Remaining", inr(data.remaining)]);

  const summaryHtml = summary
    .map(
      (s) =>
        `<tr><td class="lab">${esc(s[0])}</td><td class="val">${esc(s[1])}</td></tr>`
    )
    .join("");

  const headCols = ctx.isBudget
    ? ["#", "Date", "Name", "Category", "Type", "Payment", "Notes", "Amount"]
    : ["#", "Date", "Week", "Name", "Category", "Type", "Payment", "Notes", "Amount"];
  const headHtml = headCols.map((c) => `<th>${c}</th>`).join("");
  const bodyHtml = data.rows
    .map((r, i) => {
      const cells = ctx.isBudget
        ? [i + 1, r.Date, r.Name, r.Category, r.Type, r.Payment, r.Notes, r.Amount.toLocaleString("en-IN")]
        : [i + 1, r.Date, r.Week, r.Name, r.Category, r.Type, r.Payment, r.Notes, r.Amount.toLocaleString("en-IN")];
      return `<tr>${cells.map((c, ci) => `<td class="${ci === cells.length - 1 ? "amt" : ""}">${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: 'Times New Roman', serif; color: #23233c; padding: 24px; }
  h1 { text-align: center; font-size: 22px; margin: 0 0 4px; }
  .rule { height: 3px; background: #6366f1; margin: 6px 0 16px; border-radius: 2px; }
  .summary { width: 100%; border: 1px solid #d2d4e1; border-radius: 6px; background: #f7f8ff; border-collapse: collapse; margin-bottom: 18px; }
  .summary td { padding: 6px 12px; }
  .summary .lab { font-weight: bold; color: #3730a3; width: 40%; }
  .summary tr:last-child td { background: #10b981; color: #fff; font-weight: bold; }
  table.data { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.data th { background: #6366f1; color: #fff; padding: 6px; border: 1px solid #6366f1; }
  table.data td { padding: 5px 6px; border: 1px solid #cdcfdc; }
  table.data tr:nth-child(even) td { background: #f3f4ff; }
  table.data td.amt { text-align: right; font-weight: bold; }
  .footer { margin-top: 18px; font-style: italic; color: #9696a0; font-size: 10px; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <div class="rule"></div>
  <table class="summary">${summaryHtml}</table>
  <table class="data"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
  <div class="footer">Generated by Expense Calculator</div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  // Rename to a friendly filename before sharing.
  const target = FileSystem.cacheDirectory + safeFilename(ctx.monthName) + ".pdf";
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: target });
  } catch {
    return shareFile(uri, "application/pdf");
  }
  await shareFile(target, "application/pdf");
}

// ---- Excel ----
export async function exportExcel(
  expenses: Expense[],
  weekFilter: Set<number> | null,
  ctx: ExportContext
): Promise<void> {
  const data = buildExportRows(expenses, weekFilter, ctx);
  const title = (ctx.isBudget ? "Budget Report — " : "Expense Report — ") + ctx.monthName;

  const summary: [string, any][] = [["Name", ctx.userName || "-"]];
  if (ctx.isBudget) summary.push(["Budget Amount (₹)", ctx.limit]);
  else {
    summary.push(["Salary (₹)", ctx.limit]);
    summary.push(["Current Balance (₹)", ctx.currentBalance]);
  }
  summary.push(["Total Spend (₹)", data.totalSpent]);
  summary.push(["Total Income (₹)", data.totalIncome]);
  summary.push([ctx.isBudget ? "Remaining (₹)" : "Total Remaining (₹)", data.remaining]);

  const colHeader = ctx.isBudget
    ? ["#", "Date", "Name", "Category", "Type", "Payment", "Notes", "Amount (₹)"]
    : ["#", "Date", "Week", "Name", "Category", "Type", "Payment", "Notes", "Amount (₹)"];

  const bodyRows = data.rows.map((r, i) =>
    ctx.isBudget
      ? [i + 1, r.Date, r.Name, r.Category, r.Type, r.Payment, r.Notes, r.Amount]
      : [i + 1, r.Date, r.Week, r.Name, r.Category, r.Type, r.Payment, r.Notes, r.Amount]
  );

  const aoa: any[][] = [[title], ...summary, [], colHeader, ...bodyRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = colHeader.map((_, i) => ({ wch: i === 0 ? 6 : i === colHeader.length - 1 ? 14 : 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expenses");

  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const uri = FileSystem.cacheDirectory + safeFilename(ctx.monthName) + ".xlsx";
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await shareFile(uri, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

async function shareFile(uri: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
}
