import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BarChart } from "react-native-gifted-charts";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import Watermark from "../components/Watermark";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import { fetchYearData, YearData } from "../firebase/firestore";
import { formatMoney } from "../util/money";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function YearScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<YearData | null>(null);
  const [loading, setLoading] = useState(true);
  const salary = Number(profile?.salary) || 0;
  const atCurrentYear = year >= currentYear;

  const load = useCallback(
    async (y: number) => {
      if (!user) return;
      setLoading(true);
      try {
        setData(await fetchYearData(user.uid, y));
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      load(year);
    }, [load, year])
  );

  const chartWidth = Dimensions.get("window").width - 80;
  const barData =
    data?.byMonth.map((v, i) => ({ value: Math.max(0, v), label: MONTH_ABBR[i], frontColor: colors.primary })) || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <Watermark />
      {/* Year nav inside the gradient header */}
      <ScreenHeader>
        <View style={styles.nav}>
          <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={10}>
            <Text style={[styles.navArrow, { color: "#fff" }]}>‹</Text>
          </Pressable>
          <Text style={[styles.yearTitle, { color: "#fff" }]}>Year {year}</Text>
          <Pressable
            onPress={() => setYear((y) => Math.min(currentYear, y + 1))}
            hitSlop={10}
            disabled={atCurrentYear}
          >
            <Text style={[styles.navArrow, { color: "#fff", opacity: atCurrentYear ? 0.4 : 1 }]}>›</Text>
          </Pressable>
        </View>
      </ScreenHeader>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 120 }}>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Stats */}
            <Card>
              <View style={styles.statGrid}>
                <Stat label="Total spend" value={formatMoney(data?.totalSpend)} colors={colors} />
                <Stat label="Total income" value={formatMoney(data?.totalIncome)} colors={colors} />
                <Stat label="Avg / month" value={formatMoney(Math.round((data?.totalSpend || 0) / 12))} colors={colors} />
                <Stat label="Yearly salary" value={formatMoney(salary * 12)} colors={colors} />
              </View>
            </Card>

            {/* Chart */}
            {barData.some((b) => b.value > 0) && (
              <Card>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Monthly spend</Text>
                <BarChart
                  data={barData}
                  width={chartWidth}
                  height={170}
                  barWidth={Math.max(10, chartWidth / 26)}
                  spacing={6}
                  noOfSections={4}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  hideRules
                  yAxisTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                  xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 8 }}
                  frontColor={colors.primary}
                />
              </Card>
            )}

            {/* Tiles */}
            {MONTH_ABBR.map((m, i) => {
              const spent = data?.byMonth[i] || 0;
              const id = data?.ids[i];
              const has = spent > 0;
              return (
                <Pressable
                  key={m}
                  disabled={!id}
                  onPress={() => id && navigation.navigate("Month", { id, type: "month" })}
                >
                  <Card style={{ opacity: has || id ? 1 : 0.5 }}>
                    <View style={styles.tileRow}>
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
                        {["January","February","March","April","May","June","July","August","September","October","November","December"][i]}
                      </Text>
                      <Text style={{ color: has ? colors.danger : colors.textMuted, fontWeight: "700" }}>
                        {has ? formatMoney(spent) : "No data"}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, colors }: any) {
  return (
    <View style={styles.stat}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 17, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 18 },
  navArrow: { fontSize: 28, fontWeight: "600" },
  yearTitle: { fontSize: 20, fontWeight: "800", minWidth: 120, textAlign: "center", letterSpacing: -0.2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "50%", paddingVertical: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  tileRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
