// User-selectable currency, persisted to AsyncStorage. formatMoney() reads the
// active currency from a module variable (src/util/money.ts); to make the ~100
// existing formatMoney() call sites refresh when the currency changes, this
// provider remounts its subtree via a keyed wrapper. Currency changes are rare,
// so the remount cost (and navigation reset) is acceptable.

import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CURRENCIES,
  CurrencyDef,
  setActiveCurrency,
} from "../util/money";

const KEY = "expenseCurrency";

interface CurrencyContextValue {
  code: string;
  symbol: string;
  currencies: CurrencyDef[];
  setCurrency: (code: string) => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  code: "INR",
  symbol: "₹",
  currencies: CURRENCIES,
  setCurrency: () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<string>("INR");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved && CURRENCIES.some((c) => c.code === saved)) setCode(saved);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Keep the module-level active currency in sync on every render (before
  // children render), so formatMoney() reflects the current choice.
  setActiveCurrency(code);

  const setCurrency = (c: string) => {
    console.log("[Currency] ->", c);
    setActiveCurrency(c);
    setCode(c);
    AsyncStorage.setItem(KEY, c).catch(() => {});
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
