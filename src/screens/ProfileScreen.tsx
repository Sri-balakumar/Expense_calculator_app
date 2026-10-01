import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme, ACCENTS } from "../theme/ThemeContext";
import Watermark from "../components/Watermark";
import { useCurrency } from "../context/CurrencyContext";
import {
  getDownloadPrefs,
  setDownloadEnabled,
  clearDownloadFolder,
  folderLabel,
} from "../util/downloadPrefs";
import { pickDownloadFolder } from "../util/export";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Button, Card, Field, MoneyInput } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import HelpFab from "../components/HelpFab";
import { HELP_PROFILE } from "../constants/help";
import SelectField from "../components/SelectField";
import { signOutUser, updateUserProfile, changePassword, friendlyAuthError } from "../firebase/auth";
import {
  listRecurring,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  getCategoryBudgets,
  setCategoryBudget,
  addCategory,
  updateCategory,
  deleteCategory,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  recurringKey,
} from "../firebase/firestore";
import { settleOrQueue } from "../firebase/writes";
import {
  amountError,
  amountToWords,
  currencySymbol,
  formatMoney,
  formatMoneyIn,
  parseAmount,
  CURRENCIES,
} from "../util/money";
import { fetchRate } from "../util/fx";
import {
  MoneyDoc,
  batchCount,
  buildUpdates,
  commitUpdates,
  countAmounts,
  readMoneyDocs,
} from "../util/currencyMigrate";
import { CATEGORY_PALETTE, CATEGORY_KEYS, PAYMENT_METHODS } from "../constants/categories";
import { useCategories, useQuickAddCategory } from "../context/CategoriesContext";
import { usePaymentMethods } from "../context/PaymentMethodsContext";
import { usePin } from "../context/PinContext";
import PinPad from "../components/PinPad";
import { PIN_LENGTH } from "../util/pin";
import { RecurringDoc } from "../types";

export default function ProfileScreen() {
  const { colors, mode, toggle, accent, setAccent } = useTheme();
  const { profile, user, refreshProfile } = useAuth();
  const { confirm, toast } = useFeedback();
  const { categories, options, label: catLabel, emoji: catEmoji } = useCategories();
  const quickAddCategory = useQuickAddCategory();
  const { methods: paymentMethods } = usePaymentMethods();
  const { pinSet, setupPin, removePin, verify } = usePin();
  const { code: curCode, symbol: curSymbol, currencies, setCurrency } = useCurrency();
  const [pickedCur, setPickedCur] = useState(curCode); // pending currency choice (Save to apply)
  const [curModal, setCurModal] = useState(false);
  const [curSearch, setCurSearch] = useState("");
  // Changing currency is a migration, not a relabel — this drives the popup that
  // makes the user choose which one they actually mean.
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [moneyDocs, setMoneyDocs] = useState<MoneyDoc[] | null>(null);
  const [amountCount, setAmountCount] = useState(0);
  const [rateText, setRateText] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateFetched, setRateFetched] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convProgress, setConvProgress] = useState<{ done: number; total: number } | null>(null);
  // Download folder prefs
  const [dlEnabled, setDlEnabled] = useState(false);
  const [dlFolder, setDlFolder] = useState<string | null>(null);
  // Budgets + recurring apply to spend categories (everything except salary).
  const budgetCats = categories.filter((c) => c.key !== "salary");
  const recCatOpts = options(false);
  const customCats = categories.filter((c) => c.custom);
  const customPayments = paymentMethods.filter((m) => m.custom);

  const [name, setName] = useState(profile?.name || "");
  const [salary, setSalary] = useState(String(profile?.salary || ""));
  const [mainBalance, setMainBalance] = useState(String(profile?.mainBalance || ""));
  const [savingProfile, setSavingProfile] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");

  const [recurring, setRecurring] = useState<RecurringDoc[]>([]);
  const [budgets, setBudgets] = useState<Record<string, { limit: number }>>({});
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});

  const [recModal, setRecModal] = useState(false);
  const [recName, setRecName] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recCat, setRecCat] = useState("other");
  const [editRecId, setEditRecId] = useState<string | null>(null); // null = adding
  // A ref, not just state: a second tap can land before the re-render that
  // would disable the button, and each one used to add another copy.
  const savingRecRef = useRef(false);
  const [savingRec, setSavingRec] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null); // key being edited
  const [editCatDocId, setEditCatDocId] = useState<string | undefined>(undefined);
  const [catName, setCatName] = useState("");
  const [catEmojiInput, setCatEmojiInput] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_PALETTE[0]);
  const [savingCat, setSavingCat] = useState(false);

  // Payment methods
  const [pmModal, setPmModal] = useState(false);
  const [editPmId, setEditPmId] = useState<string | null>(null); // key being edited
  const [editPmDocId, setEditPmDocId] = useState<string | undefined>(undefined);
  const [pmName, setPmName] = useState("");
  const [pmEmojiInput, setPmEmojiInput] = useState("");
  const [savingPm, setSavingPm] = useState(false);

  const [pinModal, setPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinFirst, setPinFirst] = useState("");
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");

  // Remove-PIN verification
  const [removePinModal, setRemovePinModal] = useState(false);
  const [removePinValue, setRemovePinValue] = useState("");
  const [removePinError, setRemovePinError] = useState("");

  const loadLists = useCallback(async () => {
    if (!user) return;
    const [recs, b] = await Promise.all([listRecurring(user.uid), getCategoryBudgets(user.uid)]);
    recs.sort((a, b2) => (a.name || "").localeCompare(b2.name || ""));
    setRecurring(recs);
    setBudgets(b);
    const inputs: Record<string, string> = {};
    Object.keys(b).forEach((k) => (inputs[k] = b[k]?.limit ? String(b[k].limit) : ""));
    setBudgetInputs(inputs);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setName(profile?.name || "");
      setSalary(String(profile?.salary || ""));
      setMainBalance(String(profile?.mainBalance || ""));
      loadLists();
      getDownloadPrefs().then((p) => {
        setDlEnabled(p.enabled);
        // Show the full path derived from the saved folder URI.
        setDlFolder(p.folderUri ? folderLabel(p.folderUri) : null);
      });
    }, [loadLists, profile])
  );

  const toggleDownloadFolder = async () => {
    const next = !dlEnabled;
    if (!next) {
      // Turning OFF → confirm first.
      const ok = await confirm({
        title: "Turn off fixed folder?",
        message: "Exports will ask you to pick a folder each time you download.",
        confirmText: "Turn off",
        danger: false,
      });
      if (!ok) return;
      setDlEnabled(false);
      await setDownloadEnabled(false);
      toast("Exports will ask for a folder each time.", "info");
      return;
    }
    // Turning ON → enable, and prompt to pick a folder if none set yet.
    setDlEnabled(true);
    await setDownloadEnabled(true);
    if (!dlFolder) chooseDownloadFolder();
  };

  const chooseDownloadFolder = async () => {
    const name = await pickDownloadFolder();
    if (name) {
      setDlFolder(name);
      setDlEnabled(true);
      await setDownloadEnabled(true);
      toast(`Exports will save to "${name}".`, "success");
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const n = name.trim();
    const sal = Number(salary);
    if (!n) return toast("Name cannot be empty.", "error");
    if (!sal || sal < 0) return toast("Enter a valid salary.", "error");
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, {
        name: n,
        salary: sal,
        mainBalance: Number(mainBalance) || 0,
      });
      await refreshProfile();
      console.log("[Profile] saved", { name: n, salary: sal, mainBalance: Number(mainBalance) || 0 });
      toast("Profile updated!", "success");
    } catch (err: any) {
      toast(err?.message || "Update failed.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const updatePassword = async () => {
    if (!newPw || newPw.length < 6) return toast("New password must be at least 6 characters.", "error");
    try {
      await changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      toast("Password updated!", "success");
    } catch (err) {
      toast(friendlyAuthError(err), "error");
    }
  };

  const openRecModal = () => {
    setEditRecId(null);
    setRecName("");
    setRecAmount("");
    setRecCat("other");
    setRecModal(true);
  };

  const openEditRec = (r: RecurringDoc) => {
    setEditRecId(r.id);
    setRecName(r.name || "");
    setRecAmount(String(Number(r.amount) || ""));
    setRecCat(r.category || "other");
    setRecModal(true);
    console.log("[Profile] edit recurring", r.id);
  };

  const saveRec = async () => {
    if (!user) return;
    const n = recName.trim();
    const parsedRec = parseAmount(recAmount);
    if (!n) return toast("Enter a name.", "error");
    if (!parsedRec.ok) return toast(amountError(parsedRec.reason), "error");
    const amt = parsedRec.value;
    if (savingRecRef.current) return;
    savingRecRef.current = true;
    setSavingRec(true);
    try {
      if (editRecId) {
        await updateRecurring(user.uid, editRecId, { name: n, amount: amt, category: recCat });
        console.log("[Profile] recurring updated", editRecId);
        toast("Recurring updated", "success");
      } else {
        const same = recurring.find(
          (r) => recurringKey(r) === recurringKey({ name: n, amount: amt, category: recCat })
        );
        if (same) {
          const ok = await confirm({
            title: "Already added",
            message: `You already have ${same.name} ${formatMoney(amt)}. Every new month would offer it twice. Add another?`,
            confirmText: "Add another",
            danger: false,
          });
          if (!ok) return;
        }
        const outcome = await settleOrQueue(
          addRecurring(user.uid, { name: n, amount: amt, category: recCat })
        );
        console.log("[Profile] recurring added", n, outcome);
        if (outcome === "failed") return toast("Couldn't add that. Try again.", "error");
        if (outcome === "queued") toast("Added on this device — will sync when you're online.", "info");
        else toast("Recurring added", "success");
      }
      setRecModal(false);
      setEditRecId(null);
      setRecName("");
      setRecAmount("");
      setRecCat("other");
      loadLists();
    } finally {
      savingRecRef.current = false;
      setSavingRec(false);
    }
  };

  // Extra copies of the same template (same name, amount and category) — every
  // one after the first of its kind. These are what put one entry into a new
  // month five times over.
  const duplicateRecs = (() => {
    const seen = new Set<string>();
    return recurring.filter((r) => {
      const k = recurringKey(r);
      if (seen.has(k)) return true;
      seen.add(k);
      return false;
    });
  })();

  const removeDuplicateRecs = async () => {
    if (!user || duplicateRecs.length === 0) return;
    const n = duplicateRecs.length;
    const ok = await confirm({
      title: `Remove ${n} duplicate${n > 1 ? "s" : ""}?`,
      message:
        "One of each stays. Months you already created keep their entries — remove extras there with a long-press on the entry.",
      confirmText: "Remove",
    });
    if (!ok) return;
    try {
      await Promise.all(duplicateRecs.map((r) => deleteRecurring(user.uid, r.id)));
      toast(`${n} duplicate${n > 1 ? "s" : ""} removed`, "success");
    } catch (e: any) {
      console.log("[Profile] remove duplicates failed", e?.message);
      toast("Couldn't remove them all. Try again.", "error");
    }
    loadLists();
  };

  const openCatModal = () => {
    setEditCatId(null);
    setEditCatDocId(undefined);
    setCatName("");
    setCatEmojiInput("");
    // Pick a palette color not already used by a custom category, if possible.
    const used = new Set(customCats.map((c) => c.color));
    setCatColor(CATEGORY_PALETTE.find((c) => !used.has(c)) || CATEGORY_PALETTE[0]);
    setCatModal(true);
  };

  const openEditCat = (c: {
    key: string;
    label: string;
    emoji: string;
    color: string;
    docId?: string;
  }) => {
    setEditCatId(c.key);
    setEditCatDocId(c.docId);
    setCatName(c.label);
    setCatEmojiInput(c.emoji);
    setCatColor(c.color);
    setCatModal(true);
  };

  const saveCat = async () => {
    if (!user) return;
    const n = catName.trim();
    if (!n) return toast("Enter a category name.", "error");
    const dupe = categories.some(
      (c) => c.key !== editCatId && c.label.toLowerCase() === n.toLowerCase()
    );
    if (dupe) return toast("A category with that name already exists.", "error");
    setSavingCat(true);
    try {
      const data = { label: n, emoji: catEmojiInput.trim() || "📌", color: catColor };
      if (editCatId) {
        if (editCatDocId) {
          // Custom or already-overridden default → update its doc.
          await updateCategory(user.uid, editCatDocId, data);
        } else {
          // Plain built-in default → create an override keyed by its key.
          await addCategory(user.uid, { ...data, key: editCatId } as any);
        }
        toast("Category updated", "success");
      } else {
        await addCategory(user.uid, data); // brand-new category (no key)
        toast("Category added", "success");
      }
      setCatModal(false);
    } catch (err: any) {
      toast(err?.message || "Couldn't save category.", "error");
    } finally {
      setSavingCat(false);
    }
  };

  const removeCat = async (cat: { key: string; label: string; emoji: string; color: string; docId?: string }) => {
    if (!user) return;
    const isDefault = CATEGORY_KEYS.includes(cat.key);
    const ok = await confirm({
      title: `Delete "${cat.label}"?`,
      message: isDefault
        ? "It won't be selectable for new entries (existing ones keep it). You can re-add it later."
        : "Existing entries keep it but it won't be selectable for new ones.",
      confirmText: "Delete",
    });
    if (!ok) return;
    if (isDefault) {
      // Hide the built-in: mark its override doc hidden, or create a hidden one.
      if (cat.docId) await updateCategory(user.uid, cat.docId, { hidden: true } as any);
      else
        await addCategory(user.uid, {
          key: cat.key,
          hidden: true,
          label: cat.label,
          emoji: cat.emoji,
          color: cat.color,
        } as any);
    } else if (cat.docId) {
      await deleteCategory(user.uid, cat.docId);
    }
    console.log("[Category] removed", cat.key);
    toast("Category removed", "success");
  };

  // ---- payment methods ----
  const openPmModal = () => {
    setEditPmId(null);
    setEditPmDocId(undefined);
    setPmName("");
    setPmEmojiInput("");
    setPmModal(true);
  };
  const openEditPm = (m: { key: string; label: string; emoji: string; docId?: string }) => {
    setEditPmId(m.key);
    setEditPmDocId(m.docId);
    setPmName(m.label);
    setPmEmojiInput(m.emoji);
    setPmModal(true);
  };
  const savePm = async () => {
    if (!user) return;
    const n = pmName.trim();
    if (!n) return toast("Enter a name.", "error");
    const dupe = paymentMethods.some(
      (m) => m.key !== editPmId && m.label.toLowerCase() === n.toLowerCase()
    );
    if (dupe) return toast("A payment method with that name already exists.", "error");
    setSavingPm(true);
    try {
      const data = { label: n, emoji: pmEmojiInput.trim() || "💳" };
      if (editPmId) {
        if (editPmDocId) {
          await updatePaymentMethod(user.uid, editPmDocId, data);
        } else {
          await addPaymentMethod(user.uid, { ...data, key: editPmId } as any);
        }
        toast("Payment method updated", "success");
      } else {
        await addPaymentMethod(user.uid, data);
        toast("Payment method added", "success");
      }
      setPmModal(false);
    } catch (err: any) {
      toast(err?.message || "Couldn't save payment method.", "error");
    } finally {
      setSavingPm(false);
    }
  };
  const removePm = async (m: { key: string; label: string; emoji: string; docId?: string }) => {
    if (!user) return;
    const isDefault = PAYMENT_METHODS.includes(m.key);
    const ok = await confirm({
      title: `Delete "${m.label}"?`,
      message: isDefault
        ? "It won't be selectable for new entries. You can re-add it later."
        : "Existing entries keep it but it won't be selectable for new ones.",
      confirmText: "Delete",
    });
    if (!ok) return;
    if (isDefault) {
      if (m.docId) await updatePaymentMethod(user.uid, m.docId, { hidden: true } as any);
      else
        await addPaymentMethod(user.uid, {
          key: m.key,
          hidden: true,
          label: m.label,
          emoji: m.emoji,
        } as any);
    } else if (m.docId) {
      await deletePaymentMethod(user.uid, m.docId);
    }
    console.log("[Payment] removed", m.key);
    toast("Payment method removed", "success");
  };

  // ---- App lock (PIN) ----
  const openPinModal = () => {
    setPinStep("enter");
    setPinFirst("");
    setPinValue("");
    setPinError("");
    setPinModal(true);
  };

  const closePinModal = () => {
    setPinModal(false);
    setPinValue("");
    setPinFirst("");
    setPinStep("enter");
    setPinError("");
  };

  const onPinChange = (v: string) => {
    setPinError("");
    setPinValue(v);
    if (v.length < PIN_LENGTH) return;
    if (pinStep === "enter") {
      setPinFirst(v);
      setPinStep("confirm");
      setPinValue("");
    } else if (v === pinFirst) {
      const wasSet = pinSet;
      setupPin(v)
        .then(() => {
          closePinModal();
          toast(wasSet ? "PIN changed" : "PIN set", "success");
        })
        .catch(() => setPinError("Couldn't save PIN."));
    } else {
      setPinError("PINs didn't match. Start again.");
      setPinFirst("");
      setPinStep("enter");
      setPinValue("");
    }
  };

  const onLogout = async () => {
    const ok = await confirm({
      title: "Log out?",
      message: "You'll need to sign in again with your email and password.",
      confirmText: "Log out",
      danger: false, // use the accent color, not red
    });
    if (!ok) return;
    await signOutUser();
  };

  // Require the current PIN before removing app lock.
  const removePinFlow = () => {
    setRemovePinValue("");
    setRemovePinError("");
    setRemovePinModal(true);
  };
  const onRemovePinChange = async (v: string) => {
    setRemovePinError("");
    setRemovePinValue(v);
    if (v.length < PIN_LENGTH) return;
    const ok = await verify(v);
    if (!ok) {
      console.log("[Pin] remove: wrong PIN");
      setRemovePinError("Wrong PIN. Try again.");
      setRemovePinValue("");
      return;
    }
    await removePin();
    setRemovePinModal(false);
    console.log("[Pin] removed after verification");
    toast("PIN removed", "success");
  };

  const removeRec = async (r: RecurringDoc) => {
    if (!user) return;
    const ok = await confirm({
      title: "Delete recurring?",
      message: "It won't be auto-added to new months.",
      confirmText: "Delete",
    });
    if (!ok) return;
    await deleteRecurring(user.uid, r.id);
    toast("Recurring removed", "success");
    loadLists();
  };

  const saveBudget = async (key: string, raw: string) => {
    if (!user) return;
    const val = Number(raw);
    await setCategoryBudget(user.uid, key, isNaN(val) ? 0 : val);
  };

  // ---- currency switch -------------------------------------------------
  const rate = Number(rateText);
  const rateValid = !!rateText.trim() && !isNaN(rate) && rate > 0;
  const toDef = switchTo ? CURRENCIES.find((c) => c.code === switchTo) : null;
  // Preview against a real figure of the user’s where possible, so the effect
  // of the rate is obvious rather than abstract.
  const sample = Number(profile?.salary) || Number(profile?.mainBalance) || 1000;

  // Read every money-bearing document once when the popup opens, and ask for
  // today’s rate. The read is the expensive half; re-costing the preview as the
  // user edits the rate is pure arithmetic over what we already hold.
  useEffect(() => {
    if (!switchTo || !user) return;
    let cancelled = false;
    setMoneyDocs(null);
    setAmountCount(0);
    setRateText("");
    setRateFetched(false);
    setScanning(true);
    setRateLoading(true);
    (async () => {
      try {
        const docs = await readMoneyDocs(user.uid);
        if (cancelled) return;
        setMoneyDocs(docs);
        setAmountCount(countAmounts(docs));
      } catch (e) {
        console.log("[Currency] scan failed", e);
        if (!cancelled) setMoneyDocs([]);
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();
    (async () => {
      const r = await fetchRate(curCode, switchTo);
      if (cancelled) return;
      if (r) {
        setRateText(String(r));
        setRateFetched(true);
      }
      setRateLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [switchTo, user, curCode]);

  const closeSwitch = () => {
    if (converting) return; // never abandon a half-written migration
    setSwitchTo(null);
    setMoneyDocs(null);
    setConvProgress(null);
  };

  // "I picked the wrong currency" — the numbers were never in the old currency
  // to begin with, so relabelling is the honest thing to do.
  const doRelabel = async () => {
    if (!switchTo) return;
    const ok = await confirm({
      title: "Relabel without converting?",
      message:
        `${amountCount} amount${amountCount === 1 ? "" : "s"} keep exactly the same numbers and simply show as ` +
        `${toDef?.symbol.trim()}. ${formatMoneyIn(curCode, sample)} becomes ${formatMoneyIn(switchTo, sample)}.` +
        "\n\nOnly do this if the currency was wrong to begin with.",
      confirmText: "Relabel",
    });
    if (!ok) return;
    const target = switchTo;
    setSwitchTo(null);
    setMoneyDocs(null);
    await setCurrency(target);
    toast(`Now showing ${target} — amounts unchanged`, "success");
  };

  const doConvert = async () => {
    if (!switchTo || !moneyDocs || !rateValid || converting) return;
    const updates = buildUpdates(moneyDocs, rate);
    const chunks = batchCount(updates);
    const ok = await confirm({
      title: `Convert ${amountCount} amount${amountCount === 1 ? "" : "s"}?`,
      message:
        `Every stored figure is multiplied by ${rate} and rewritten in ${switchTo}. ` +
        `${formatMoneyIn(curCode, sample)} becomes ${formatMoneyIn(switchTo, sample * rate)}.` +
        (chunks > 1
          ? `\n\nThis writes in ${chunks} batches. If it is interrupted partway, some amounts will be converted and others not.`
          : "") +
        "\n\nThis cannot be undone automatically.",
      confirmText: "Convert",
    });
    if (!ok) return;
    setConverting(true);
    setConvProgress({ done: 0, total: updates.length });
    try {
      await commitUpdates(updates, (done, total) => setConvProgress({ done, total }));
      const target = switchTo;
      setConverting(false);
      setSwitchTo(null);
      setMoneyDocs(null);
      setConvProgress(null);
      await setCurrency(target);
      toast(`Converted to ${target}`, "success");
    } catch (e: any) {
      setConverting(false);
      setConvProgress(null);
      console.log("[Currency] convert failed", e?.message);
      // The account currency is deliberately left alone: the data is in a mixed
      // state and claiming the switch succeeded would be a lie.
      await confirm({
        title: "Conversion didn’t finish",
        message:
          `${e?.message || "Something went wrong."}` +
          `\n\nYour currency is still ${curCode}. Check your figures before retrying — amounts that were already converted would be multiplied a second time.`,
        confirmText: "OK",
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <Watermark />
      <ScreenHeader title="Profile" subtitle={user?.email || undefined} />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 170 }}
        keyboardShouldPersistTaps="handled"
      >
      {/* Personal info */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Personal info</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label={`Monthly salary (${currencySymbol().trim()})`} money value={salary} onChangeText={setSalary} keyboardType="numeric" />
        {Number(salary) > 0 && (
          <Text style={{ color: colors.primary, fontSize: 12, marginTop: -8, marginBottom: 10, fontStyle: "italic" }}>
            {amountToWords(salary)} only
          </Text>
        )}
        <Field
          label={`Main balance (${currencySymbol().trim()}) — savings, not spent from months`}
          money
          value={mainBalance}
          onChangeText={setMainBalance}
          keyboardType="numeric"
          placeholder="e.g. 3000"
        />
        {Number(mainBalance) > 0 && (
          <Text style={{ color: colors.primary, fontSize: 12, marginTop: -8, marginBottom: 10, fontStyle: "italic" }}>
            {amountToWords(mainBalance)} only
          </Text>
        )}
        <View style={styles.between}>
          <Text style={{ color: colors.textMuted }}>Email</Text>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{user?.email || "—"}</Text>
        </View>
        <Button title="Save changes" onPress={saveProfile} loading={savingProfile} style={{ marginTop: 14 }} />
      </Card>

      {/* Change password */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Change password</Text>
        <Field label="Current password" value={curPw} onChangeText={setCurPw} isPassword />
        <Field label="New password" value={newPw} onChangeText={setNewPw} isPassword placeholder="At least 6 characters" />
        <Button title="Update password" onPress={updatePassword} />
      </Card>

      {/* Recurring */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Recurring expenses</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Offered when you create a month — tick the ones to add (rent, subscriptions…).
        </Text>
        {duplicateRecs.length > 0 && (
          <Pressable onPress={removeDuplicateRecs} style={{ marginBottom: 10 }} hitSlop={6}>
            <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>
              ⚠ Remove {duplicateRecs.length} duplicate{duplicateRecs.length > 1 ? "s" : ""}
            </Text>
          </Pressable>
        )}
        {recurring.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 8 }}>None yet.</Text>
        ) : (
          recurring.map((r) => (
            <View key={r.id} style={styles.recRow}>
              <Text style={{ color: colors.text, flexShrink: 1 }}>
                {catEmoji(r.category)} {r.name}{" "}
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {catLabel(r.category)}
                </Text>
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{formatMoney(r.amount)}</Text>
                <Pressable onPress={() => openEditRec(r)} hitSlop={8}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </Pressable>
                <Pressable onPress={() => removeRec(r)} hitSlop={8}>
                  <Text style={{ fontSize: 18 }}>🗑️</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Button
          title="+ Add recurring expense"
          variant="secondary"
          onPress={openRecModal}
          style={{ marginTop: 10 }}
        />
      </Card>

      {/* Payment methods */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Payment methods</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Built-in methods plus your own — these show up wherever you pick one.
        </Text>
        {paymentMethods.map((m) => (
          <View key={m.key} style={styles.recRow}>
            <Text style={{ color: colors.text, flexShrink: 1 }}>
              {m.emoji} {m.label}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable onPress={() => openEditPm(m)} hitSlop={8}>
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </Pressable>
              <Pressable onPress={() => removePm(m)} hitSlop={8}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Button
          title="+ Add payment method"
          variant="secondary"
          onPress={openPmModal}
          style={{ marginTop: 10 }}
        />
      </Card>

      {/* Category budgets */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Category budgets</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Monthly limit per category — shows as a progress bar on the month page.
        </Text>
        {budgetCats.map((c) => (
          <View key={c.key} style={styles.budgetRow}>
            <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
              {c.emoji} {c.label}
            </Text>
            <MoneyInput
              style={[
                styles.budgetInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
              placeholder="No limit"
              value={budgetInputs[c.key] ?? ""}
              onChangeText={(t) => setBudgetInputs((prev) => ({ ...prev, [c.key]: t }))}
              onEndEditing={() => saveBudget(c.key, budgetInputs[c.key] ?? "")}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 10 }}>
              <Pressable onPress={() => openEditCat(c)} hitSlop={8}>
                <Text style={{ fontSize: 16 }}>✏️</Text>
              </Pressable>
              <Pressable onPress={() => removeCat(c)} hitSlop={8}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Button
          title="+ Add category"
          variant="secondary"
          onPress={openCatModal}
          style={{ marginTop: 12 }}
        />
      </Card>

      {/* App lock */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>App lock</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
          {pinSet
            ? "A 4-digit PIN is required each time you open the app."
            : "Set a 4-digit PIN to lock the app when it's opened."}
        </Text>
        {pinSet ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title="Change PIN" variant="secondary" onPress={openPinModal} style={{ flex: 1 }} />
            <Button title="Remove PIN" variant="danger" onPress={removePinFlow} style={{ flex: 1 }} />
          </View>
        ) : (
          <Button title="Set up PIN" variant="secondary" onPress={openPinModal} />
        )}
      </Card>

      {/* Theme + logout */}
      <Card>
        <View style={styles.between}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>
            Appearance · {mode === "dark" ? "Dark" : "Light"}
          </Text>
          <Pressable
            onPress={toggle}
            hitSlop={10}
            style={[styles.themeBtn, { backgroundColor: colors.chipBg }]}
          >
            <Text style={{ fontSize: 22 }}>{mode === "dark" ? "🌙" : "☀️"}</Text>
          </Pressable>
        </View>

        <Text style={{ color: colors.textMuted, fontWeight: "600", marginTop: 16, marginBottom: 10 }}>
          Accent color
        </Text>
        <View style={styles.palette}>
          {ACCENTS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setAccent(c)}
              style={[
                styles.paletteDot,
                { backgroundColor: c, borderColor: accent === c ? colors.text : "transparent" },
              ]}
            />
          ))}
        </View>
      </Card>

      {/* Currency */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Currency</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Pick one — it shows on every amount across the app.
        </Text>
        <Pressable
          style={[styles.curField, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
          onPress={() => {
            setPickedCur(curCode);
            setCurSearch("");
            setCurModal(true);
          }}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
            {curSymbol.trim()}  {curCode}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>▾</Text>
        </Pressable>
      </Card>

      {/* Downloads */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Downloads</Text>
        <View style={styles.between}>
          <Text style={{ color: colors.text, flexShrink: 1, paddingRight: 12 }}>
            Save exports to a fixed folder
          </Text>
          <Pressable
            onPress={toggleDownloadFolder}
            style={{
              width: 52,
              height: 30,
              borderRadius: 15,
              padding: 3,
              backgroundColor: dlEnabled ? colors.primary : colors.chipBg,
              alignItems: dlEnabled ? "flex-end" : "flex-start",
            }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" }} />
          </Pressable>
        </View>
        {dlEnabled ? (
          <>
            <Pressable
              onPress={chooseDownloadFolder}
              style={[
                styles.curField,
                { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 12 },
              ]}
            >
              <Text
                style={{ color: dlFolder ? colors.text : colors.textMuted, fontSize: 15, flexShrink: 1 }}
                numberOfLines={1}
              >
                📁 {dlFolder || "Tap to choose a folder"}
              </Text>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
                {dlFolder ? "Change" : "Choose"}
              </Text>
            </Pressable>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
              PDF/Excel go straight here — no folder prompt each time.
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
            You'll pick a folder each time you export.
          </Text>
        )}
      </Card>

      <Button title="Log out" variant="primary" onPress={onLogout} />

      {/* Credit + version */}
      <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 12, marginTop: 18 }}>
        Sri Balakumar  🤍  |  version 1.0.0
      </Text>

      {/* Currency switch — convert the stored amounts, or just relabel them */}
      <Modal visible={!!switchTo} transparent animationType="fade" onRequestClose={closeSwitch}>
        <Pressable style={styles.backdrop} onPress={closeSwitch}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 4 }]}>
              Change currency
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "700", marginBottom: 12 }}>
              {curSymbol.trim()} {curCode}  →  {toDef?.symbol.trim()} {switchTo}
            </Text>

            {scanning ? (
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.textMuted, fontSize: 13, marginLeft: 8 }}>
                  Checking your data…
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 4 }}>
                {amountCount === 0
                  ? "You have no stored amounts yet — nothing to convert."
                  : `${amountCount} stored amount${amountCount === 1 ? "" : "s"} across your months, plans, budgets and goals.`}
              </Text>
            )}

            {amountCount > 0 && (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 }}>
                  Exchange rate (1 {curCode} = ? {switchTo})
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
                  ]}
                  value={rateText}
                  onChangeText={(t) => {
                    setRateText(t);
                    setRateFetched(false); // hand-edited: stop calling it today’s rate
                  }}
                  keyboardType="numeric"
                  placeholder={rateLoading ? "Fetching today’s rate…" : "e.g. 0.0104"}
                  placeholderTextColor={colors.textMuted}
                  editable={!converting}
                />
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  {rateLoading
                    ? "Looking up today’s rate…"
                    : rateFetched
                    ? "Today’s rate — edit it if you want a different one."
                    : rateText.trim()
                    ? "Using the rate you entered."
                    : "Couldn’t fetch a rate — type one in to convert."}
                </Text>

                {rateValid && (
                  <View style={[styles.previewBox, { backgroundColor: colors.chipBg }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Preview</Text>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, marginTop: 2 }}>
                      {formatMoneyIn(curCode, sample)}  →  {formatMoneyIn(switchTo!, sample * rate)}
                    </Text>
                  </View>
                )}
              </>
            )}

            {converting && convProgress && (
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 10, fontWeight: "700" }}>
                Converting… {convProgress.done} of {convProgress.total} records. Keep the app open.
              </Text>
            )}

            {amountCount > 0 && (
              <>
                <Button
                  title="Convert amounts"
                  onPress={doConvert}
                  loading={converting}
                  disabled={!rateValid || scanning || converting}
                  style={{ marginTop: 16 }}
                />
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, marginBottom: 12 }}>
                  Multiplies every stored amount by the rate. Use this if you have moved to a new
                  currency and want your history to follow.
                </Text>
                <Button
                  title="Just relabel"
                  variant="secondary"
                  onPress={doRelabel}
                  disabled={converting}
                />
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                  Keeps the numbers exactly as they are and only changes the symbol. Use this if
                  the currency was simply set wrong.
                </Text>
              </>
            )}

            {amountCount === 0 && !scanning && (
              <Button
                title={`Switch to ${switchTo}`}
                onPress={doRelabel}
                style={{ marginTop: 16 }}
              />
            )}

            <Button
              title="Cancel"
              variant="secondary"
              onPress={closeSwitch}
              disabled={converting}
              style={{ marginTop: 14 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
      {/* Currency picker (search + symbol/name rows + Save inside) */}
      <Modal visible={curModal} transparent animationType="fade" onRequestClose={() => setCurModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCurModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Choose currency</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginBottom: 10 },
              ]}
              placeholder="Search (₹, USD, Rupee…)"
              placeholderTextColor={colors.textMuted}
              value={curSearch}
              onChangeText={setCurSearch}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {currencies
                .filter((c) => {
                  const q = curSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    c.code.toLowerCase().includes(q) ||
                    c.name.toLowerCase().includes(q) ||
                    c.symbol.toLowerCase().includes(q)
                  );
                })
                .map((c) => {
                  const sel = pickedCur === c.code;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => setPickedCur(c.code)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        marginBottom: 6,
                        backgroundColor: sel ? colors.chipBg : "transparent",
                        borderWidth: 1,
                        borderColor: sel ? colors.primary : colors.border,
                      }}
                    >
                      {/* left: symbol · right: name */}
                      <Text style={{ color: sel ? colors.primary : colors.text, fontSize: 18, fontWeight: "800", minWidth: 44 }}>
                        {c.symbol.trim()}
                      </Text>
                      <Text style={{ color: sel ? colors.primary : colors.text, fontSize: 15, fontWeight: "600", flex: 1, textAlign: "right" }}>
                        {c.name}
                        {sel ? "  ✓" : ""}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setCurModal(false)} style={{ flex: 1 }} />
              <Button
                title="Save"
                onPress={() => {
                  console.log("[Profile] currency chosen", pickedCur);
                  setCurModal(false);
                  // Never switch straight away — every amount already stored is
                  // in the old currency, so the user has to say what happens to
                  // them before anything changes.
                  if (pickedCur !== curCode) setSwitchTo(pickedCur);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add recurring modal */}
      <Modal visible={recModal} transparent animationType="fade" onRequestClose={() => setRecModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRecModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {editRecId ? "Edit recurring" : "Add recurring"}
            </Text>
            <Field label="Name" value={recName} onChangeText={setRecName} placeholder="e.g. Rent" />
            <Field label={`Amount (${currencySymbol().trim()})`} money value={recAmount} onChangeText={setRecAmount} keyboardType="numeric" placeholder="e.g. 15000" />
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Category</Text>
            <SelectField
              title="Category"
              placeholder="Select category"
              options={recCatOpts}
              value={recCat}
              onChange={setRecCat}
              onAdd={quickAddCategory}
              addLabel="Add category"
            />
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setRecModal(false)} style={{ flex: 1 }} />
              <Button
                title={editRecId ? "Save" : "Add"}
                onPress={saveRec}
                loading={savingRec}
                disabled={savingRec}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add category modal */}
      <Modal visible={catModal} transparent animationType="fade" onRequestClose={() => setCatModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCatModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {editCatId ? "Edit category" : "New category"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Name" value={catName} onChangeText={setCatName} placeholder="e.g. Travel" />
              </View>
              <View style={{ width: 90 }}>
                <Field
                  label="Emoji"
                  value={catEmojiInput}
                  onChangeText={(t) => setCatEmojiInput(t.slice(0, 2))}
                  placeholder="📌"
                />
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 8 }}>Color</Text>
            <View style={styles.palette}>
              {CATEGORY_PALETTE.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCatColor(c)}
                  style={[
                    styles.paletteDot,
                    { backgroundColor: c, borderColor: catColor === c ? colors.text : "transparent" },
                  ]}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setCatModal(false)} style={{ flex: 1 }} />
              <Button
                title={editCatId ? "Save" : "Add"}
                onPress={saveCat}
                loading={savingCat}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add / edit payment method modal */}
      <Modal visible={pmModal} transparent animationType="fade" onRequestClose={() => setPmModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPmModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {editPmId ? "Edit payment method" : "New payment method"}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Name" value={pmName} onChangeText={setPmName} placeholder="e.g. PhonePe" />
              </View>
              <View style={{ width: 90 }}>
                <Field
                  label="Emoji"
                  value={pmEmojiInput}
                  onChangeText={(t) => setPmEmojiInput(t.slice(0, 2))}
                  placeholder="💳"
                />
              </View>
            </View>
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setPmModal(false)} style={{ flex: 1 }} />
              <Button
                title={editPmId ? "Save" : "Add"}
                onPress={savePm}
                loading={savingPm}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* PIN setup modal */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={closePinModal}>
        <Pressable style={styles.backdrop} onPress={closePinModal}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg, alignItems: "center" }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {pinStep === "enter" ? (pinSet ? "Enter new PIN" : "Choose a PIN") : "Confirm PIN"}
            </Text>
            <Text
              style={{
                color: pinError ? colors.danger : colors.textMuted,
                fontSize: 13,
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              {pinError || (pinStep === "enter" ? "Pick a 4-digit PIN" : "Re-enter to confirm")}
            </Text>
            <PinPad value={pinValue} onChange={onPinChange} error={!!pinError} />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={closePinModal}
              style={{ marginTop: 24, alignSelf: "stretch" }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Remove-PIN verification modal */}
      <Modal
        visible={removePinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRemovePinModal(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRemovePinModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg, alignItems: "center" }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Enter PIN to remove</Text>
            <Text
              style={{
                color: removePinError ? colors.danger : colors.textMuted,
                fontSize: 13,
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              {removePinError || "Confirm your current PIN to turn off app lock"}
            </Text>
            <PinPad value={removePinValue} onChange={onRemovePinChange} error={!!removePinError} />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setRemovePinModal(false)}
              style={{ marginTop: 24, alignSelf: "stretch" }}
            />
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>
      <HelpFab {...HELP_PROFILE} />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 16 },
  themeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  recRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.12)",
  },
  budgetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  paletteDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  budgetInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    width: 130,
    textAlign: "right",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  previewBox: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  curField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
