// Merges the built-in categories with the user's custom categories (from
// Firestore users/{uid}/categories) so every picker, list, chart and export
// across the app reflects categories added from Profile.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { useFeedback } from "../components/Feedback";
import { watchCategories, addCategory, CustomCategoryDoc } from "../firebase/firestore";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  CATEGORY_COLORS,
  CATEGORY_PALETTE,
} from "../constants/categories";
import { ChipOption } from "../components/ChipPicker";

export interface Category {
  key: string;
  label: string;
  emoji: string;
  color: string;
  custom: boolean;
  docId?: string; // Firestore doc id when editable (custom or overridden default)
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
    // Custom docs either override/hide a built-in (have `key`) or add a new one.
    const overrideByKey: Record<string, CustomCategoryDoc> = {};
    const hidden = new Set<string>();
    const news: CustomCategoryDoc[] = [];
    custom.forEach((c) => {
      if (c.key) {
        if (c.hidden) hidden.add(c.key);
        else overrideByKey[c.key] = c;
      } else {
        news.push(c);
      }
    });
    const toCat = (c: CustomCategoryDoc, key: string): Category => ({
      key,
      label: c.label || key,
      emoji: c.emoji || "📌",
      color: c.color || CATEGORY_COLORS.other,
      custom: true,
      docId: c.id,
    });
    // Defaults: drop hidden, apply overrides.
    const defaultsResolved: Category[] = DEFAULTS.filter((d) => !hidden.has(d.key)).map((d) =>
      overrideByKey[d.key] ? toCat(overrideByKey[d.key], d.key) : d
    );
    const newCats: Category[] = news
      .slice()
      .sort((a, b) => (a.label || "").localeCompare(b.label || ""))
      .map((c) => toCat(c, c.id));
    // New custom categories go before "other".
    const otherIdx = defaultsResolved.findIndex((c) => c.key === "other");
    const categories =
      otherIdx === -1
        ? [...defaultsResolved, ...newCats]
        : [...defaultsResolved.slice(0, otherIdx), ...newCats, ...defaultsResolved.slice(otherIdx)];

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

// Quick-add a category from a picker: prompt for a name, auto-assign an emoji +
// palette color, save to Firestore (so it also shows in Profile), return its key.
export function useQuickAddCategory() {
  const { user } = useAuth();
  const { prompt, toast } = useFeedback();
  const { categories } = useCategories();
  return async (): Promise<string | null> => {
    if (!user) return null;
    const name = await prompt({ title: "New category", placeholder: "e.g. Travel", confirmText: "Add" });
    if (!name || !name.trim()) return null;
    const n = name.trim();
    if (categories.some((c) => c.label.toLowerCase() === n.toLowerCase())) {
      toast("That category already exists.", "error");
      return null;
    }
    const used = new Set(categories.filter((c) => c.custom).map((c) => c.color));
    const color = CATEGORY_PALETTE.find((c) => !used.has(c)) || CATEGORY_PALETTE[0];
    const id = await addCategory(user.uid, { label: n, emoji: "🏷️", color });
    console.log("[Category] quick-added", { id, name: n });
    toast("Category added", "success");
    return id;
  };
}
