// A read cache on AsyncStorage, so a cold start without a network shows your
// last-known data instead of a spinner and an error.
//
// Why this exists rather than Firestore's own persistence: the Firebase JS SDK's
// persistent cache is IndexedDB-backed. Its React Native bundle re-exports
// persistentLocalCache() so the call compiles, but the implementation guards
// every access behind SimpleDb.isAvailable(), and React Native has no indexedDB
// global — so it silently never initialises. Real on-disk persistence would mean
// migrating to @react-native-firebase (native modules, no Expo Go).
//
// What the SDK DOES give us for free, and what this does not replace: while the
// app is running, reads are served from an in-memory cache and writes are queued
// and retried when the network returns. The gap is purely across a cold start.
//
// This caches reads only. Writes made while offline still rely on the SDK's
// in-memory queue and are lost if the app is killed before it reconnects.

import AsyncStorage from "@react-native-async-storage/async-storage";

// Bumped when a cached shape changes, so stale entries are ignored rather than
// deserialised into something the app no longer understands.
const VERSION = "v1";
const prefix = (key: string) => `cache:${VERSION}:${key}`;

export interface Cached<T> {
  value: T;
  /** When it was written, epoch ms — lets callers say how stale the data is. */
  at: number;
}

// Every path here is best-effort: a cache miss, a corrupt entry or a storage
// failure must never be worse than not having a cache at all.
export async function saveCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(prefix(key), JSON.stringify({ value, at: Date.now() }));
  } catch (e) {
    console.log("[Cache] write failed", key, e);
  }
}

export async function loadCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(prefix(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return null;
    return { value: parsed.value as T, at: Number(parsed.at) || 0 };
  } catch (e) {
    console.log("[Cache] read failed", key, e);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith("cache:"));
    if (mine.length) await AsyncStorage.multiRemove(mine);
    console.log("[Cache] cleared", mine.length, "entries");
  } catch (e) {
    console.log("[Cache] clear failed", e);
  }
}

// Cache keys are scoped by uid so signing into a second account on the same
// device never shows the first account's figures.
export const cacheKeys = {
  profile: (uid: string) => `${uid}:profile`,
  months: (uid: string) => `${uid}:months`,
  expenses: (uid: string, type: string, id: string) => `${uid}:expenses:${type}:${id}`,
  plans: (uid: string, monthId: string) => `${uid}:plans:${monthId}`,
};

// True when a failure is "we couldn't reach Firestore", as opposed to a genuine
// error like a permission denial — only the former should fall back to cache.
export function isOfflineError(e: any): boolean {
  const code = e?.code || "";
  const msg = String(e?.message || "").toLowerCase();
  return (
    code === "unavailable" ||
    code === "failed-precondition" ||
    msg.includes("offline") ||
    msg.includes("network") ||
    msg.includes("could not reach")
  );
}
