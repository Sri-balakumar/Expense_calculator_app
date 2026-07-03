// App-lock state. On cold start, if a PIN has been set the app starts locked and
// RootNavigator shows the PIN screen until unlocked. (Cold-start only — we do not
// re-lock when returning from the background.)

import React, { createContext, useContext, useEffect, useState } from "react";
import { hasPin, savePin, verifyPin, clearPin } from "../util/pin";

interface PinValue {
  ready: boolean;
  pinSet: boolean;
  locked: boolean;
  unlock: () => void;
  setupPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  verify: (pin: string) => Promise<boolean>;
}

const PinContext = createContext<PinValue>({
  ready: false,
  pinSet: false,
  locked: false,
  unlock: () => {},
  setupPin: async () => {},
  removePin: async () => {},
  verify: async () => false,
});

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const exists = await hasPin();
      setPinSet(exists);
      setLocked(exists); // cold-start lock
      setReady(true);
    })();
  }, []);

  const unlock = () => setLocked(false);

  const setupPin = async (pin: string) => {
    await savePin(pin);
    setPinSet(true);
    setLocked(false);
  };

  const removePin = async () => {
    await clearPin();
    setPinSet(false);
    setLocked(false);
  };

  const verify = (pin: string) => verifyPin(pin);

  return (
    <PinContext.Provider value={{ ready, pinSet, locked, unlock, setupPin, removePin, verify }}>
      {children}
    </PinContext.Provider>
  );
}

export const usePin = () => useContext(PinContext);
