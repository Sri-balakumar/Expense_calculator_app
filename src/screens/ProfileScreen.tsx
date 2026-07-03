import React, { useCallback, useState } from "react";
import {
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
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Button, Card, Field } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import ChipPicker from "../components/ChipPicker";
import { signOutUser, updateUserProfile, changePassword, friendlyAuthError } from "../firebase/auth";
import {
  listRecurring,
  addRecurring,
  deleteRecurring,
  getCategoryBudgets,
  setCategoryBudget,
  addCategory,
  updateCategory,
  deleteCategory,
} from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { CATEGORY_PALETTE } from "../constants/categories";
import { useCategories } from "../context/CategoriesContext";
import { usePin } from "../context/PinContext";
import PinPad from "../components/PinPad";
import { PIN_LENGTH } from "../util/pin";
import { RecurringDoc } from "../types";

export default function ProfileScreen() {
  const { colors, mode, toggle } = useTheme();
  const { profile, user, refreshProfile } = useAuth();
  const { confirm, toast } = useFeedback();
  const { categories, options, label: catLabel, emoji: catEmoji } = useCategories();
  const { pinSet, setupPin, removePin } = usePin();
  // Budgets + recurring apply to spend categories (everything except salary).
  const budgetCats = categories.filter((c) => c.key !== "salary");
  const recCatOpts = options(false);
  const customCats = categories.filter((c) => c.custom);

  const [name, setName] = useState(profile?.name || "");
  const [salary, setSalary] = useState(String(profile?.salary || ""));
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

  const [catModal, setCatModal] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catEmojiInput, setCatEmojiInput] = useState("");
  const [catColor, setCatColor] = useState(CATEGORY_PALETTE[0]);
  const [savingCat, setSavingCat] = useState(false);

  const [pinModal, setPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinFirst, setPinFirst] = useState("");
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");

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
      loadLists();
    }, [loadLists, profile])
  );

  const saveProfile = async () => {
    if (!user) return;
    const n = name.trim();
    const sal = Number(salary);
    if (!n) return toast("Name cannot be empty.", "error");
    if (!sal || sal < 0) return toast("Enter a valid salary.", "error");
    setSavingProfile(true);
    try {
      await updateUserProfile(user.uid, { name: n, salary: sal });
      await refreshProfile();
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

  const addRec = async () => {
    if (!user) return;
    const n = recName.trim();
    const amt = Number(recAmount);
    if (!n) return toast("Enter a name.", "error");
    if (!amt || amt <= 0) return toast("Enter a valid amount.", "error");
    await addRecurring(user.uid, { name: n, amount: amt, category: recCat });
    setRecModal(false);
    setRecName("");
    setRecAmount("");
    setRecCat("other");
    toast("Recurring added", "success");
    loadLists();
  };

  const openCatModal = () => {
    setEditCatId(null);
    setCatName("");
    setCatEmojiInput("");
    // Pick a palette color not already used by a custom category, if possible.
    const used = new Set(customCats.map((c) => c.color));
    setCatColor(CATEGORY_PALETTE.find((c) => !used.has(c)) || CATEGORY_PALETTE[0]);
    setCatModal(true);
  };

  const openEditCat = (c: { key: string; label: string; emoji: string; color: string }) => {
    setEditCatId(c.key);
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
        await updateCategory(user.uid, editCatId, data);
        toast("Category updated", "success");
      } else {
        await addCategory(user.uid, data);
        toast("Category added", "success");
      }
      setCatModal(false);
    } catch (err: any) {
      toast(err?.message || "Couldn't save category.", "error");
    } finally {
      setSavingCat(false);
    }
  };

  const removeCat = async (key: string, label: string) => {
    if (!user) return;
    const ok = await confirm({
      title: `Delete "${label}"?`,
      message: "Existing entries keep this category but it won't be selectable for new ones.",
      confirmText: "Delete",
    });
    if (!ok) return;
    await deleteCategory(user.uid, key);
    toast("Category removed", "success");
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
    });
    if (!ok) return;
    await signOutUser();
  };

  const removePinFlow = async () => {
    const ok = await confirm({
      title: "Remove PIN?",
      message: "The app will no longer ask for a PIN on launch.",
      confirmText: "Remove",
    });
    if (!ok) return;
    await removePin();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScreenHeader title="Profile" subtitle={user?.email || undefined} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bgSoft }}
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
      {/* Personal info */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Personal info</Text>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Monthly salary (₹)" value={salary} onChangeText={setSalary} keyboardType="numeric" />
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
          Auto-added to every new month (rent, subscriptions…).
        </Text>
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{formatMoney(r.amount)}</Text>
                <Pressable onPress={() => removeRec(r)} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontWeight: "700" }}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Button
          title="+ Add recurring expense"
          variant="secondary"
          onPress={() => setRecModal(true)}
          style={{ marginTop: 10 }}
        />
      </Card>

      {/* Categories */}
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Categories</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Your own categories show up everywhere you pick one (expenses, plans, budgets).
        </Text>
        {customCats.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 8 }}>
            No custom categories yet.
          </Text>
        ) : (
          customCats.map((c) => (
            <View key={c.key} style={styles.recRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                <View style={[styles.swatch, { backgroundColor: c.color }]} />
                <Text style={{ color: colors.text }}>
                  {c.emoji} {c.label}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Pressable onPress={() => openEditCat(c)} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => removeCat(c.key, c.label)} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontWeight: "700" }}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Button
          title="+ Add category"
          variant="secondary"
          onPress={openCatModal}
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
            <Text style={{ color: colors.text }}>
              {c.emoji} {c.label}
            </Text>
            <TextInput
              style={[
                styles.budgetInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
              keyboardType="numeric"
              placeholder="No limit"
              placeholderTextColor={colors.textMuted}
              value={budgetInputs[c.key] ?? ""}
              onChangeText={(t) => setBudgetInputs((prev) => ({ ...prev, [c.key]: t }))}
              onEndEditing={() => saveBudget(c.key, budgetInputs[c.key] ?? "")}
            />
          </View>
        ))}
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
          <Text style={{ color: colors.text, fontWeight: "600" }}>Dark mode</Text>
          <Switch value={mode === "dark"} onValueChange={toggle} />
        </View>
      </Card>
      <Button title="Log out" variant="danger" onPress={onLogout} />

      {/* Add recurring modal */}
      <Modal visible={recModal} transparent animationType="fade" onRequestClose={() => setRecModal(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRecModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Add recurring</Text>
            <Field label="Name" value={recName} onChangeText={setRecName} placeholder="e.g. Rent" />
            <Field label="Amount (₹)" value={recAmount} onChangeText={setRecAmount} keyboardType="numeric" placeholder="e.g. 15000" />
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Category</Text>
            <ChipPicker options={recCatOpts} value={recCat} onChange={setRecCat} />
            <View style={styles.actions}>
              <Button title="Cancel" variant="secondary" onPress={() => setRecModal(false)} style={{ flex: 1 }} />
              <Button title="Add" onPress={addRec} style={{ flex: 1 }} />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 16 },
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
});
