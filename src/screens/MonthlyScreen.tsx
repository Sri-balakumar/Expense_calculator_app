import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BarChart } from "react-native-gifted-charts";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import Watermark from "../components/Watermark";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Card } from "../components/UI";
import MonthPickerModal from "../components/MonthPickerModal";
import HelpFab from "../components/HelpFab";
import { HELP_MONTHLY } from "../constants/help";
import {
  fetchMonthsData,
  monthContents,
  deleteMonthDeep,
  restoreMovedPlans,
} from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { useCategories } from "../context/CategoriesContext";
import { MonthData } from "../types";

export default function MonthlyScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { label: catLabel } = useCategories();
  const { confirm, toast } = useFeedback();
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const salary = Number(profile?.salary) || 0;
  const mainBalance = Number(profile?.mainBalance) || 0;

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setMonths(await fetchMonthsData(user.uid, salary));
    } catch (e: any) {
      setError(e?.code === "permission-denied"
        ? "Database access denied. Check your Firestore rules."
        : "Couldn't load your data. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [user, salary]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openMonth = (id: string) =>
    navigation.navigate("Month", { id, type: "month" });

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSoft }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const current = months[0];
  const prev = months[1];
  const diff = current && prev ? current.spent - prev.spent : 0;
  const pct = prev && prev.spent ? Math.round((diff / prev.spent) * 100) : null;

  // Insights (top category + budget health) — port of renderInsights.
  const insights: { emoji: string; text: string }[] = [];
  if (current) {
    const cats = current.byCategory || {};
    const top = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0];
    if (top && cats[top] > 0) {
      const total = Object.values(cats).reduce((s, v) => s + v, 0);
      const p = Math.round((cats[top] / total) * 100);
      insights.push({
        emoji: "🏆",
        text: `Top category in ${current.name}: ${catLabel(top)} (${p}% — ${formatMoney(cats[top])})`,
      });
    }
    if (salary > 0) {
      const p = Math.round((current.spent / salary) * 100);
      if (p >= 100) insights.push({ emoji: "🚨", text: `You've used ${p}% of your salary this month.` });
      else if (p >= 80) insights.push({ emoji: "⚠️", text: `${p}% of your salary used. Slow down a bit.` });
      else if (p < 50) insights.push({ emoji: "✅", text: `Only ${p}% of your salary used. Looking good!` });
    }
  }

  // Trends — last 6 months, oldest first.
  const last6 = months.slice(0, 6).reverse();
  // Deleting a month takes its expenses, plans and saved calculations with it —
  // Firestore will not cascade on its own. The confirmation names the places the
  // month actually holds data, so the user can judge before destroying it.
  const onDeleteMonth = async (m: MonthData) => {
    if (!user || deleting) return;
    setDeleting(m.id);
    try {
      const c = await monthContents(user.uid, m.id);

      const where: string[] = [];
      // Saved calculations live in the month’s own "Saved" tab, so they count as
      // Monthly too — otherwise a month holding only those would read "is empty"
      // while the line underneath listed them.
      if (c.expenses > 0 || c.savedCalcs > 0) where.push("Monthly");
      if (c.plans > 0) where.push("Plans");
      const location =
        where.length === 2
          ? `${m.name} is in Monthly and Plans.`
          : where.length === 1
          ? `${m.name} is in ${where[0]} alone.`
          : `${m.name} is empty.`;

      const bits: string[] = [];
      if (c.expenses) bits.push(`${c.expenses} ${c.expenses === 1 ? "entry" : "entries"}`);
      if (c.plans) bits.push(`${c.plans} ${c.plans === 1 ? "plan" : "plans"}`);
      if (c.savedCalcs)
        bits.push(`${c.savedCalcs} saved calculation${c.savedCalcs === 1 ? "" : "s"}`);

      // Plans in other months that were moved here would otherwise be left
      // pointing at a month that no longer exists — say so up front.
      const moved = c.movedHere.length
        ? `\n\n${c.movedHere.length} plan${c.movedHere.length === 1 ? "" : "s"} in ` +
          `${[...new Set(c.movedHere.map((r) => r.monthName))].join(", ")} ` +
          `${c.movedHere.length === 1 ? "was" : "were"} moved here. ` +
          `${c.movedHere.length === 1 ? "It" : "They"} will be restored as pending.`
        : "";

      const ok = await confirm({
        title: `Delete ${m.name}?`,
        message:
          location +
          (bits.length ? `\n\n${bits.join("  ·  ")}` : "") +
          moved +
          "\n\nThis permanently deletes all of it and cannot be undone.",
        confirmText: "Delete",
      });
      if (!ok) return;

      await deleteMonthDeep(user.uid, m.id);
      await restoreMovedPlans(user.uid, c.movedHere);
      toast(`${m.name} deleted`, "success");
      await load();
    } catch (e: any) {
      console.log("[Monthly] delete failed", e?.message);
      toast("Couldn’t delete that month. Try again.", "error");
    } finally {
      setDeleting(null);
    }
  };

  const barData = last6.map((m) => ({
    value: Math.max(0, m.spent),
    label: m.name.split(" ")[0].slice(0, 3),
    frontColor: colors.primary,
  }));
  const chartWidth = Dimensions.get("window").width - 80;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <Watermark />
      {/* Gradient header with greeting + current-month summary */}
      <LinearGradient
        colors={colors.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gHeader, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.gHi}>Hi, {profile?.name || "there"} 👋</Text>
        <View style={styles.pillRow}>
          <View style={styles.hPill}>
            <Text style={styles.hPillText}>💰 Salary  {formatMoney(salary)}</Text>
          </View>
          {mainBalance > 0 && (
            <View style={styles.hPill}>
              <Text style={styles.hPillText}>🏦 Main  {formatMoney(mainBalance)}</Text>
            </View>
          )}
        </View>
        {current && (
          <View style={styles.gHero}>
            <Text style={styles.gHeroLabel}>Spent in {current.name}</Text>
            <Text style={styles.gHeroAmount}>{formatMoney(current.spent)}</Text>
            {prev ? (
              <Text style={styles.gHeroDelta}>
                {diff > 0 ? "▲" : diff < 0 ? "▼" : "–"}{" "}
                {pct === null ? "—" : Math.abs(pct) + "%"} vs {prev.name}
              </Text>
            ) : (
              <Text style={styles.gHeroDelta}>First month tracked</Text>
            )}
          </View>
        )}
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        <View style={{ paddingHorizontal: 16 }}>
          {error && (
            <Card>
              <Text style={{ color: colors.danger, fontWeight: "600" }}>{error}</Text>
              <Pressable onPress={load} style={{ marginTop: 8 }}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Retry</Text>
              </Pressable>
            </Card>
          )}

          {insights.length > 0 && (
            <Card>
              {insights.map((i, idx) => (
                <View key={idx} style={styles.insightRow}>
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{i.emoji}</Text>
                  <Text style={{ color: colors.text, flexShrink: 1, fontSize: 14 }}>{i.text}</Text>
                </View>
              ))}
            </Card>
          )}


          <Pressable
            style={({ pressed }) => [
              styles.newBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => setPicker(true)}
          >
            <Text style={styles.newBtnText}>+ New / open month</Text>
          </Pressable>

          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>YOUR MONTHS</Text>

          {months.length === 0 ? (
            <Card>
              <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                No months yet. Tap “New / open month” to start.
              </Text>
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {months.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => openMonth(m.id)}
                  style={({ pressed }) => [
                    styles.monthRow,
                    {
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                      backgroundColor: pressed ? colors.bgSoft : "transparent",
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.monthName, { color: colors.text }]}>{m.name}</Text>
                    <Text style={{ color: colors.textMuted, marginTop: 3, fontSize: 13 }}>
                      Spent{" "}
                      <Text style={{ color: colors.danger, fontWeight: "600" }}>
                        {formatMoney(m.spent)}
                      </Text>
                      {"  ·  "}Left{" "}
                      <Text
                        style={{
                          color: m.remaining < 0 ? colors.danger : colors.success,
                          fontWeight: "600",
                        }}
                      >
                        {formatMoney(m.remaining)}
                      </Text>
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => onDeleteMonth(m)}
                    disabled={!!deleting}
                    hitSlop={10}
                    style={{ padding: 6, marginLeft: 4 }}
                  >
                    {deleting === m.id ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    )}
                  </Pressable>
                  <Text style={{ color: colors.textMuted, fontSize: 22, marginLeft: 4 }}>›</Text>
                </Pressable>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>

      <MonthPickerModal
        visible={picker}
        onClose={() => setPicker(false)}
        onOpenMonth={openMonth}
      />
      <HelpFab {...HELP_MONTHLY} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  gHeader: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  gHi: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  hPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hPillText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  gHero: { marginTop: 18 },
  gHeroLabel: { color: "rgba(255,255,255,0.78)", fontSize: 13 },
  gHeroAmount: { color: "#fff", fontSize: 30, fontWeight: "800", marginTop: 2, letterSpacing: -0.4 },
  gHeroDelta: { color: "rgba(255,255,255,0.9)", fontWeight: "600", marginTop: 4, fontSize: 13 },
  cardTitle: { fontSize: 15, fontWeight: "600", marginBottom: 10 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  insightRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  monthName: { fontSize: 16, fontWeight: "600" },
  newBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
    shadowColor: "#f37021",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  newBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
