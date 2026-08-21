// The account's currency. formatMoney() reads the active currency from a module
// variable (src/util/money.ts); to make the ~100 existing formatMoney() call
// sites refresh when it changes, this provider remounts its subtree via a keyed
// wrapper. Currency changes are rare, so the remount cost is acceptable.
//
// The source of truth is `currency` on the user's Firestore document, NOT local
// storage — the same account must read the same on every device, and it has to
// survive a reinstall. AsyncStorage is kept purely as a first-paint cache so the
// app doesn't flash the wrong symbol while the profile is still loading.

import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCIES, CurrencyDef, setActiveCurrency } from "../util/money";
import { useAuth } from "./AuthContext";
import { updateUser } from "../firebase/firestore";

const KEY = "expenseCurrency";

const known = (c?: string | null) => !!c && CURRENCIES.some((x) => x.code === c);

interface CurrencyContextValue {
  code: string;
  symbol: string;
  currencies: CurrencyDef[];
  /** Persists to the account, so it follows the user across devices. */
  setCurrency: (code: string) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  code: "INR",
  symbol: "₹",
  currencies: CURRENCIES,
  setCurrency: async () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, refreshProfile } = useAuth();
  const [code, setCode] = useState<string>("INR");
  const [loaded, setLoaded] = useState(false);

  // Cached choice — shown until the profile arrives.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (known(saved)) setCode(saved as string);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // The account wins as soon as it loads, including after switching accounts.
  useEffect(() => {
    const fromAccount = profile?.currency;
    if (known(fromAccount)) {
      setCode(fromAccount as string);
      AsyncStorage.setItem(KEY, fromAccount as string).catch(() => {});
    }
  }, [profile?.currency]);

  // Keep the module-level active currency in sync on every render (before
  // children render), so formatMoney() reflects the current choice.
  setActiveCurrency(code);

  const setCurrency = async (c: string) => {
    if (!known(c)) return;
    console.log("[Currency] ->", c);
    setActiveCurrency(c);
    setCode(c);
    AsyncStorage.setItem(KEY, c).catch(() => {});
    if (user) {
      try {
        await updateUser(user.uid, { currency: c });
        await refreshProfile();
      } catch (e) {
        // The local switch already applied; the account write can be retried by
        // picking the currency again.
        console.log("[Currency] could not save to account", e);
      }
    }
  };

  // Avoid a flash of the wrong currency before AsyncStorage resolves.
  if (!loaded) return null;

  const def = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

  return (
    <CurrencyContext.Provider
      value={{ code, symbol: def.symbol, currencies: CURRENCIES, setCurrency }}
    >
      {/* Remount the subtree when currency changes so formatMoney() refreshes. */}
      <React.Fragment key={code}>{children}</React.Fragment>
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
