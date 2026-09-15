// Telling the truth about a write.
//
// The Firebase JS SDK resolves a write promise only when the SERVER has
// acknowledged it. Offline that promise neither resolves nor rejects — it just
// hangs forever. Code that awaits it inside a try/catch therefore shows no
// error, no success, and no spinner ever stops. Worse, the row still appears in
// the list from the local snapshot, so the user reasonably concludes it saved.
//
// settleOrQueue races the acknowledgement against a deadline so every caller
// gets an answer, and the three answers are honest:
//   acked  - the server has it.
//   queued - the SDK is holding it. It is NOT saved to the account yet, and it
//            is lost if the app is killed before the network returns.
//   failed - the server refused it (rules, invalid data). The SDK rolls the row
//            back out of the local cache on its own.
//
// It never cancels the write. The SDK keeps retrying in the background; the race
// only decides what to tell the user right now.
import type { LocalWrite } from "./firestore";

export type Outcome = "acked" | "queued" | "failed";

const DEFAULT_TIMEOUT_MS = 5000;

export async function settleOrQueue(
  w: LocalWrite,
  opts?: { timeoutMs?: number }
): Promise<Outcome> {
  // When we already know there is no connection there is nothing to wait for —
  // answer at once instead of making the user watch a dead screen for 5s.
  const ms = opts?.timeoutMs ?? (isOffline() ? 0 : DEFAULT_TIMEOUT_MS);

  let timer: any;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    const result = await Promise.race([
      w.ack.then(
        () => "acked" as const,
        // A rejection is a real refusal, never "offline" — offline never
        // rejects, which is the whole reason this helper exists.
        () => "failed" as const
      ),
      deadline,
    ]);
    return result === "timeout" ? "queued" : result;
  } finally {
    clearTimeout(timer);
  }
}

// ---- connectivity, derived from what Firestore already tells us -------------
//
// No NetInfo dependency: a radio link is the wrong question. A captive portal or
// a DNS failure both read as "connected" while Firestore cannot reach anything.
// Whether a live listener is being served from cache is the real signal.
//
// The catch is that fromCache is true on a listener's FIRST snapshot even when
// fully online — that is just latency compensation. Believing it would flash
// "offline" on every navigation, which is a worse lie than the bug being fixed.
// So offline requires every active listener to agree AND a quiet period since
// the last server-backed snapshot.
const GRACE_MS = 2000;

const listeners = new Map<string, boolean>(); // key -> fromCache
let lastServerSnapshotAt = 0;
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => fn());
}

export function reportSnapshotMeta(key: string, fromCache: boolean): void {
  const prev = listeners.get(key);
  listeners.set(key, fromCache);
  if (!fromCache) lastServerSnapshotAt = Date.now();
  if (prev !== fromCache) notify();
}

export function dropSnapshotMeta(key: string): void {
  if (listeners.delete(key)) notify();
}

// null = not known yet (nothing is listening, so there is nothing to claim).
export function isOnline(): boolean | null {
  if (listeners.size === 0) return null;
  const allCached = [...listeners.values()].every((fromCache) => fromCache);
  if (!allCached) return true;
  return Date.now() - lastServerSnapshotAt <= GRACE_MS ? true : false;
}

export function isOffline(): boolean {
  return isOnline() === false;
}

export function subscribeSyncMeta(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
