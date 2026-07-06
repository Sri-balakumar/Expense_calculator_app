// Merges the built-in payment methods with the user's custom ones (Firestore
// users/{uid}/paymentMethods) so every picker + Profile reflects added methods.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { useFeedback } from "../components/Feedback";
import {
  watchPaymentMethods,
  addPaymentMethod,
  CustomPaymentDoc,
} from "../firebase/firestore";
import { PAYMENT_METHODS, PAYMENT_LABELS, PAYMENT_EMOJI } from "../constants/categories";

export interface PaymentMethod {
  key: string;
  label: string;
  emoji: string;
  custom: boolean;
  docId?: string; // Firestore doc id when editable (custom or overridden default)
}

export interface PMOption {
  key: string;
  label: string;
  emoji?: string;
}

const DEFAULTS: PaymentMethod[] = PAYMENT_METHODS.map((k) => ({
  key: k,
  label: PAYMENT_LABELS[k] || k,
  emoji: PAYMENT_EMOJI[k] || "❓",
  custom: false,
}));

interface PaymentMethodsValue {
  methods: PaymentMethod[];
  byKey: Record<string, PaymentMethod>;
  label: (key?: string) => string;
  emoji: (key?: string) => string;
  options: PMOption[];
}

const PaymentMethodsContext = createContext<PaymentMethodsValue>({
  methods: DEFAULTS,
  byKey: Object.fromEntries(DEFAULTS.map((m) => [m.key, m])),
  label: (k) => PAYMENT_LABELS[k || "other"] || k || "Other",
  emoji: (k) => PAYMENT_EMOJI[k || "other"] || "❓",
  options: DEFAULTS.map((m) => ({ key: m.key, label: m.label, emoji: m.emoji })),
});

export function PaymentMethodsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [custom, setCustom] = useState<CustomPaymentDoc[]>([]);

  useEffect(() => {
    if (!user) {
      setCustom([]);
      return;
    }
    const unsub = watchPaymentMethods(
      user.uid,
      (list) => {
        list.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
        setCustom(list);
      },
      () => setCustom([])
    );
    return unsub;
  }, [user]);

  const value = useMemo<PaymentMethodsValue>(() => {
    const overrideByKey: Record<string, CustomPaymentDoc> = {};
    const hidden = new Set<string>();
    const news: CustomPaymentDoc[] = [];
    custom.forEach((m) => {
      if (m.key) {
        if (m.hidden) hidden.add(m.key);
        else overrideByKey[m.key] = m;
      } else {
        news.push(m);
      }
    });
    const toM = (m: CustomPaymentDoc, key: string): PaymentMethod => ({
      key,
      label: m.label || key,
      emoji: m.emoji || "💳",
      custom: true,
      docId: m.id,
    });
    const defaultsResolved: PaymentMethod[] = DEFAULTS.filter((d) => !hidden.has(d.key)).map((d) =>
      overrideByKey[d.key] ? toM(overrideByKey[d.key], d.key) : d
    );
    const newMethods: PaymentMethod[] = news
      .slice()
      .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
      .map((m) => toM(m, m.id));
    const otherIdx = defaultsResolved.findIndex((m) => m.key === "other");
    const methods =
      otherIdx === -1
        ? [...defaultsResolved, ...newMethods]
        : [...defaultsResolved.slice(0, otherIdx), ...newMethods, ...defaultsResolved.slice(otherIdx)];

    const byKey = Object.fromEntries(methods.map((m) => [m.key, m]));
    const label = (k?: string) => byKey[k || "other"]?.label || k || "Other";
    const emoji = (k?: string) => byKey[k || "other"]?.emoji || "❓";
    const options: PMOption[] = methods.map((m) => ({ key: m.key, label: m.label, emoji: m.emoji }));

    return { methods, byKey, label, emoji, options };
  }, [custom]);

  return (
    <PaymentMethodsContext.Provider value={value}>{children}</PaymentMethodsContext.Provider>
  );
}

export const usePaymentMethods = () => useContext(PaymentMethodsContext);

// Quick-add a payment method from a picker: prompt for a name, save to Firestore
// (so it also shows in Profile), return its key so the picker can select it.
export function useQuickAddPayment() {
  const { user } = useAuth();
  const { prompt, toast } = useFeedback();
  const { methods } = usePaymentMethods();
  return async (): Promise<string | null> => {
    if (!user) return null;
    const name = await prompt({ title: "New payment method", placeholder: "e.g. PhonePe", confirmText: "Add" });
    if (!name || !name.trim()) return null;
    const n = name.trim();
    if (methods.some((m) => m.label.toLowerCase() === n.toLowerCase())) {
      toast("That payment method already exists.", "error");
      return null;
    }
    const id = await addPaymentMethod(user.uid, { label: n, emoji: "💳" });
    console.log("[Payment] quick-added", { id, name: n });
    toast("Payment method added", "success");
    return id;
  };
}
