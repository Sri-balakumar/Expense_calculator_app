// The arithmetic half of a currency migration, deliberately free of any Firebase
// import so it can be exercised on its own. currencyMigrate.ts does the reading
// and writing; everything here is pure.

export type MoneyKind =
  | "user"
  | "month"
  | "budget"
  | "expense"
  | "plan"
  | "savedCalc"
  | "recurring"
  | "categoryBudget"
  | "goal";

// Amounts are stored as plain numbers, so rounding is the only place precision
// can leak. Two decimals suits every currency the app offers.
export const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (v: any) => v !== undefined && v !== null && v !== "" && !isNaN(Number(v));
const conv = (v: any, rate: number) => round2((Number(v) || 0) * rate);

// The plain numeric fields each kind of document carries.
const SCALARS: Record<MoneyKind, string[]> = {
  user: ["salary", "mainBalance"],
  month: ["currentBalance"],
  budget: ["amount"],
  expense: ["amount"],
  plan: ["planned"], // paid/actual handled below — they must stay consistent
  savedCalc: [], // total is recomputed from items
  recurring: ["amount"],
  categoryBudget: ["limit"],
  goal: ["target"], // entries handled below
};

function scalarUpdates(data: any, fields: string[], rate: number, out: Record<string, any>): number {
  let n = 0;
  for (const f of fields) {
    if (!isNum(data?.[f])) continue;
    out[f] = conv(data[f], rate);
    n++;
  }
  return n;
}

// A plan's paid total is the sum of its payments, and actual mirrors paid once
// the plan is finished. Converting each of those independently would let
// rounding pull them apart by a paisa and make the plan read as inconsistent,
// so the totals are recomputed from the converted parts instead.
function planUpdates(d: any, rate: number, out: Record<string, any>): number {
  let n = scalarUpdates(d, SCALARS.plan, rate, out);

  const payments = Array.isArray(d?.payments) ? d.payments : null;
  const actualMirroredPaid = isNum(d?.actual) && Number(d.actual) === (Number(d?.paid) || 0);

  if (payments) {
    out.payments = payments.map((p: any) => {
      if (isNum(p?.amount)) n++;
      return { ...p, amount: conv(p?.amount, rate) };
    });
    out.paid = round2(out.payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
  } else if (isNum(d?.paid)) {
    out.paid = conv(d.paid, rate);
    n++;
  }

  if (isNum(d?.actual)) {
    out.actual = actualMirroredPaid && out.paid !== undefined ? out.paid : conv(d.actual, rate);
    n++;
  }

  // The detail popup reads history as "100 -> 150". Left alone it would
  // contradict every other figure on the plan.
  const edits = Array.isArray(d?.edits) ? d.edits : null;
  if (edits) {
    out.edits = edits.map((e: any) => {
      if (e?.field !== "planned") return e;
      if (isNum(e?.from)) n++;
      if (isNum(e?.to)) n++;
      return { ...e, from: conv(e.from, rate), to: conv(e.to, rate) };
    });
  }
  return n;
}

// Same reasoning as plans: the saved total is the sum of its items.
function savedCalcUpdates(d: any, rate: number, out: Record<string, any>): number {
  let n = 0;
  const items = Array.isArray(d?.items) ? d.items : null;
  if (items) {
    out.items = items.map((it: any) => {
      if (isNum(it?.amount)) n++;
      return { ...it, amount: conv(it?.amount, rate) };
    });
    // Saved calculations are signed: income counts up, spends count down.
    out.total = round2(
      out.items.reduce(
        (s: number, it: any) =>
          s + (it?.type === "plus" ? Number(it.amount) || 0 : -(Number(it.amount) || 0)),
        0
      )
    );
  } else if (isNum(d?.total)) {
    out.total = conv(d.total, rate);
    n++;
  }
  return n;
}

function goalUpdates(d: any, rate: number, out: Record<string, any>): number {
  let n = scalarUpdates(d, SCALARS.goal, rate, out);
  const entries = Array.isArray(d?.entries) ? d.entries : null;
  if (entries) {
    out.entries = entries.map((e: any) => {
      if (isNum(e?.amount)) n++;
      return { ...e, amount: conv(e?.amount, rate) };
    });
  }
  return n;
}

/**
 * Converted field values for one document, plus how many individual money
 * figures were touched. Pass rate 1 to count without changing anything.
 */
export function fieldUpdates(
  kind: MoneyKind,
  data: any,
  rate: number
): { data: Record<string, any>; count: number } {
  const out: Record<string, any> = {};
  let count: number;
  if (kind === "plan") count = planUpdates(data, rate, out);
  else if (kind === "savedCalc") count = savedCalcUpdates(data, rate, out);
  else if (kind === "goal") count = goalUpdates(data, rate, out);
  else count = scalarUpdates(data, SCALARS[kind], rate, out);
  return { data: out, count };
}
