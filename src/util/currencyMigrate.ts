// Converting every stored amount when the account's currency changes.
//
// Money is spread across 11 document types and 19 fields, three of them inside
// arrays, so the work is split deliberately:
//
//   readMoneyDocs()  — one pass over Firestore, returns the raw documents
//   buildUpdates()   — pure (see currencyMath.ts); re-runs for free every time
//                      the user edits the rate, so the preview and the count
//                      cost exactly one read
//
// Only then does commitUpdates() write anything.

import { DocumentReference, collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { MoneyKind, fieldUpdates } from "./currencyMath";

// Firestore caps a batch at 500 writes; leave headroom.
const BATCH_SIZE = 400;

export interface MoneyDoc {
  ref: DocumentReference;
  kind: MoneyKind;
  data: any;
}

export interface Update {
  ref: DocumentReference;
  data: Record<string, any>;
}

// ---- read ------------------------------------------------------------------

// One pass over every collection that holds money. Sub-collections are fetched
// per parent, so this is O(months + budgets) queries — a few dozen at most for
// a real account.
export async function readMoneyDocs(uid: string): Promise<MoneyDoc[]> {
  const out: MoneyDoc[] = [];
  const push = (ref: DocumentReference, kind: MoneyKind, data: any) => out.push({ ref, kind, data });

  const uRef = doc(db, "users", uid);
  const uSnap = await getDoc(uRef);
  if (uSnap.exists()) push(uRef, "user", uSnap.data());

  const simple: [string, MoneyKind][] = [
    ["recurring", "recurring"],
    ["categoryBudgets", "categoryBudget"],
    ["goals", "goal"],
  ];
  for (const [name, kind] of simple) {
    const snap = await getDocs(collection(db, "users", uid, name));
    snap.forEach((d) => push(d.ref, kind, d.data()));
  }

  // Months and budgets each own expenses + savedCalculations; months also plans.
  const trackers: [string, MoneyKind][] = [
    ["months", "month"],
    ["budgets", "budget"],
  ];
  for (const [name, kind] of trackers) {
    const snap = await getDocs(collection(db, "users", uid, name));
    for (const t of snap.docs) {
      push(t.ref, kind, t.data());
      const subs: [string, MoneyKind][] =
        name === "months"
          ? [
              ["expenses", "expense"],
              ["plans", "plan"],
              ["savedCalculations", "savedCalc"],
            ]
          : [
              ["expenses", "expense"],
              ["savedCalculations", "savedCalc"],
            ];
      for (const [sub, subKind] of subs) {
        const s = await getDocs(collection(db, "users", uid, name, t.id, sub));
        s.forEach((d) => push(d.ref, subKind, d.data()));
      }
    }
  }
  console.log("[Currency] scanned documents", out.length);
  return out;
}

// ---- build (pure) ----------------------------------------------------------

export function buildUpdates(docs: MoneyDoc[], rate: number): Update[] {
  const updates: Update[] = [];
  for (const d of docs) {
    const { data, count } = fieldUpdates(d.kind, d.data, rate);
    if (count > 0 || Object.keys(data).length > 0) updates.push({ ref: d.ref, data });
  }
  return updates;
}

// How many individual money figures the switch touches — the number shown to
// the user before they commit to anything. Rate 1 leaves the maths a no-op.
export function countAmounts(docs: MoneyDoc[]): number {
  return docs.reduce((sum, d) => sum + fieldUpdates(d.kind, d.data, 1).count, 0);
}

// ---- commit ----------------------------------------------------------------

export const batchCount = (updates: Update[]) => Math.ceil(updates.length / BATCH_SIZE) || 0;

// Writes in chunks. A single chunk is atomic; more than one is not, so callers
// warn the user when batchCount() > 1 and report how far it got if a chunk
// throws — that is what `done` carries on the thrown error.
export async function commitUpdates(
  updates: Update[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((u) => batch.update(u.ref, u.data));
    try {
      await batch.commit();
    } catch (e: any) {
      const err: any = new Error(
        `Converted ${done} of ${updates.length} records before failing: ${e?.message || e}`
      );
      err.done = done;
      err.total = updates.length;
      throw err;
    }
    done += chunk.length;
    onProgress?.(done, updates.length);
  }
  console.log("[Currency] converted records", done);
}
