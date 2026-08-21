// A plan's status is never set by hand from the numbers — it's derived here, so
// every path that moves money (part payment, removing an item, editing the
// planned amount, assigning an entry in Monthly, a goal purchase) lands on the
// same answer and a plan can't get stuck saying "Done" once it no longer is.

import { PlanDoc, PlanStatus } from "../types";

export interface DerivedStatus {
  status: PlanStatus;
  actual: number | null;
}

// Returns null when the caller should leave status/actual alone:
//   - a moved plan, whose real copy lives in another month now, and
//   - a plan the user deliberately closed before it was fully paid
//     (`closedEarly`) — re-deriving would undo that choice behind their back.
// Callers that legitimately re-open the question (Undo, or changing the planned
// amount) clear `closedEarly` first and then derive.
export function derivePlanStatus(
  plan: Pick<PlanDoc, "status" | "closedEarly">,
  planned: number,
  paid: number,
  payments: unknown[]
): DerivedStatus | null {
  if (plan.status === "moved") return null;
  // Overpaying still closes the plan — the row's separate red "⚠ Over" chip is
  // what flags the overspend, so "done and over" reads correctly.
  if (planned > 0 && paid >= planned) return { status: "done", actual: paid };
  if (plan.closedEarly) return null;
  if (paid > 0 || payments.length > 0) return { status: "partial", actual: null };
  return { status: "pending", actual: null };
}
