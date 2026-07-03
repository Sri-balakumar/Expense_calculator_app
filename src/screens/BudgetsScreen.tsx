import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Card } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import { fetchBudgetsData, createBudget } from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { BudgetDoc } from "../types";

type BudgetRow = BudgetDoc & { spent: number; remaining: number };

export default function BudgetsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { prompt, toast } = useFeedback();
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setBudgets(await fetchBudgetsData(user.uid));
    } catch {
      toast("Couldn't load budgets.", "error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onCreate = async () => {
    const name = await prompt({ title: "Budget name", placeholder: "e.g. Goa Trip" });
    if (!name) return;
    const amountStr = await prompt({
      title: "Total amount (₹)",
      placeholder: "e.g. 10000",
      keyboardType: "numeric",
    });
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return toast("Enter a valid amount.", "error");
    if (!user) return;
    const id = await createBudget(user.uid, name, amount);
    navigation.navigate("Month", { id, type: "budget" });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSoft }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScreenHeader
        title="Budgets"
        subtitle="Track trips, events, projects — any fixed pot of money."
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        <Pressable
          style={({ pressed }) => [
            styles.newBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={onCreate}
        >
          <Text style={styles.newBtnText}>+ New budget</Text>
        </Pressable>

        {budgets.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, textAlign: "center" }}>
              No budgets yet.
            </Text>
          </Card>
        ) : (
          budgets.map((b) => {
            const p = b.amount > 0 ? Math.min(100, Math.max(0, (b.spent / b.amount) * 100)) : 0;
            const over = b.remaining < 0;
            const fill = over ? colors.danger : p > 80 ? "#f59e0b" : colors.success;
            return (
              <Pressable
                key={b.id}
                onPress={() => navigation.navigate("Month", { id: b.id, type: "budget" })}
              >
                <Card>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, { color: colors.text }]}>{b.name}</Text>
                    <Text style={{ color: colors.textMuted, fontWeight: "700" }}>
                      {formatMoney(b.amount)}
                    </Text>
                  </View>
                  <View style={[styles.bar, { backgroundColor: colors.chipBg }]}>
                    <View
                      style={{
                        width: `${p}%`,
                        height: "100%",
                        backgroundColor: fill,
                        borderRadius: 6,
                      }}
                    />
                  </View>
                  <View style={styles.rowBottom}>
                    <Text style={{ color: colors.textMuted }}>
                      Spent <Text style={{ fontWeight: "700" }}>{formatMoney(b.spent)}</Text>
                    </Text>
                    <Text style={{ color: colors.textMuted }}>
                      Remaining{" "}
                      <Text style={{ color: over ? colors.danger : colors.success, fontWeight: "700" }}>
                        {formatMoney(b.remaining)}
                      </Text>
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 2 },
  newBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#f37021",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  newBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  name: { fontSize: 16, fontWeight: "600" },
  bar: { height: 8, borderRadius: 6, overflow: "hidden" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
});
