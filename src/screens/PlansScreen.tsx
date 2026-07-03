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
import { Card } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import { fetchMonthsData } from "../firebase/firestore";
import { formatMoney } from "../util/money";
import { MonthData } from "../types";

// Plans are month-scoped: this tab lists months; tapping opens that month's plan.
export default function PlansScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const salary = Number(profile?.salary) || 0;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setMonths(await fetchMonthsData(user.uid, salary));
    } finally {
      setLoading(false);
    }
  }, [user, salary]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSoft }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScreenHeader title="Plans" subtitle="Plan upcoming spends per month." />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {months.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, textAlign: "center" }}>
              Create a month first (Monthly tab).
            </Text>
          </Card>
        ) : (
          months.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => navigation.navigate("Plan", { monthId: m.id, name: m.name })}
            >
              <Card>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.text }]}>{m.name}</Text>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Plan →</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={{ color: colors.textMuted }}>
                    Balance{" "}
                    <Text style={{ fontWeight: "700" }}>{formatMoney(m.currentBalance)}</Text>
                  </Text>
                  <Text style={{ color: colors.textMuted }}>
                    Remaining{" "}
                    <Text
                      style={{
                        color: m.totalRemaining < 0 ? colors.danger : colors.success,
                        fontWeight: "700",
                      }}
                    >
                      {formatMoney(m.totalRemaining)}
                    </Text>
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 2 },
  rowTop: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 16, fontWeight: "600" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
});
