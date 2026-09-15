// Whether the app can actually reach Firestore right now, and how many writes
// are still waiting to be acknowledged.
//
// Both come from data the SDK already gives us — the metadata on the snapshots
// the existing watch* subscriptions receive — so there is no new dependency and
// nothing extra to keep in step. See src/firebase/writes.ts for why snapshot
// metadata is a better signal than a network-reachability check.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isOnline, subscribeSyncMeta } from "../firebase/writes";

interface SyncValue {
  /** null while nothing is listening yet — we do not claim either way. */
  online: boolean | null;
  /** Writes issued this session that the server has not confirmed. */
  pending: number;
  noteQueued: () => void;
  noteSettled: () => void;
}

const Ctx = createContext<SyncValue>({
  online: null,
  pending: 0,
  noteQueued: () => {},
  noteSettled: () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(isOnline());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const apply = () => setOnline(isOnline());
    const unsub = subscribeSyncMeta(apply);
    apply();
    // isOnline() also turns on elapsed time since the last server snapshot, so
    // poll slowly as well — otherwise going offline is only noticed the next
    // time some listener happens to fire.
    const timer = setInterval(apply, 2000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const value = useMemo<SyncValue>(
    () => ({
      online,
      pending,
      noteQueued: () => setPending((n) => n + 1),
      noteSettled: () => setPending((n) => Math.max(0, n - 1)),
    }),
    [online, pending]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncValue {
  return useContext(Ctx);
}
