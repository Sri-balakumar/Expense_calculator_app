// Merges the built-in categories with the user's custom categories (from
// Firestore users/{uid}/categories) so every picker, list, chart and export
// across the app reflects categories added from Profile.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { watchCategories, CustomCategoryDoc } from "../firebase/firestore";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  CATEGORY_COLORS,
} from "../constants/categories";
import { ChipOption } from "../components/ChipPicker";

export interface Category {
  key: string;
  label: string;
  emoji: string;
  color: string;
  custom: boolean;
}

const DEFAULTS: Category[] = CATEGORY_KEYS.map((k) => ({
  key: k,
  label: CATEGORY_LABELS[k] || k,
  emoji: CATEGORY_EMOJI[k] || "📌",
  color: CATEGORY_COLORS[k] || CATEGORY_COLORS.other,
  custom: false,
}));

interface CategoriesValue {
  categories: Category[]; // defaults + custom (salary included)
  byKey: Record<string, Category>;
  label: (key?: string) => string;
  emoji: (key?: string) => string;
  color: (key?: string) => string;
  // ChipPicker options; pass false to drop "salary" (spend-only contexts).
  options: (includeSalary?: boolean) => ChipOption[];
}

const CategoriesContext = createContext<CategoriesValue>({
  categories: DEFAULTS,
  byKey: Object.fromEntries(DEFAULTS.map((c) => [c.key, c])),
  label: (k) => CATEGORY_LABELS[k || "other"] || k || "Other",
  emoji: (k) => CATEGORY_EMOJI[k || "other"] || "📌",
  color: (k) => CATEGORY_COLORS[k || "other"] || CATEGORY_COLORS.other,
  options: () => [],
});

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [custom, setCustom] = useState<CustomCategoryDoc[]>([]);

  useEffect(() => {
    if (!user) {
      setCustom([]);
      return;
    }
    const unsub = watchCategories(
      user.uid,
      (cats) => {
        cats.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
        setCustom(cats);
      },
      () => setCustom([])
    );
    return unsub;
  }, [user]);

  const value = useMemo<CategoriesValue>(() => {
    // Custom categories go after the defaults but before "other".
    const otherIdx = DEFAULTS.findIndex((c) => c.key === "other");
    const customCats: Category[] = custom.map((c) => ({
      key: c.id,
      label: c.label || c.id,
      emoji: c.emoji || "📌",
      color: c.color || CATEGORY_COLORS.other,
      custom: true,
    }));
    const categories =
      otherIdx === -1
        ? [...DEFAULTS, ...customCats]
        : [...DEFAULTS.slice(0, otherIdx), ...customCats, ...DEFAULTS.slice(otherIdx)];

    const byKey = Object.fromEntries(categories.map((c) => [c.key, c]));
    const label = (k?: string) => byKey[k || "other"]?.label || k || "Other";
    const emoji = (k?: string) => byKey[k || "other"]?.emoji || "📌";
    const color = (k?: string) => byKey[k || "other"]?.color || CATEGORY_COLORS.other;
    const options = (includeSalary = true): ChipOption[] =>
      categories
        .filter((c) => includeSalary || c.key !== "salary")
        .map((c) => ({ key: c.key, label: c.label, emoji: c.emoji }));

    return { categories, byKey, label, emoji, color, options };
  }, [custom]);

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export const useCategories = () => useContext(CategoriesContext);
