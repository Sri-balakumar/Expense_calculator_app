import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useFeedback } from "../../components/Feedback";
import { Button, Card } from "../../components/UI";
import ScreenHeader from "../../components/ScreenHeader";
import { signOutUser } from "../../firebase/auth";
import { listAllUsers, AdminUserRow } from "../../firebase/firestore";
import { isAdminEmail } from "../../constants/admin";
import { formatMoney } from "../../util/money";
import { toJsDate } from "../../util/date";

export default function AdminScreen() {
  const { colors, mode, toggle } = useTheme();
  const { user } = useAuth();
  const { confirm } = useFeedback();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await listAllUsers());
    } catch (e: any) {
      setError(e?.code === "permission-denied" ? "Access denied by Firestore rules." : "Couldn't load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onLogout = async () => {
    const ok = await confirm({
      title: "Log out?",
      message: "You'll need to sign in again with your email and password.",
      confirmText: "Log out",
    });
    if (!ok) return;
    await signOutUser();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <ScreenHeader title="Admin" subtitle={user?.email || undefined} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bgSoft }}
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
      <Card>
        <View style={styles.between}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Dark mode</Text>
          <Switch value={mode === "dark"} onValueChange={toggle} />
        </View>
      </Card>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
      ) : error ? (
        <Card>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>{error}</Text>
        </Card>
      ) : (
        <>
          <Text style={{ color: colors.textMuted, marginBottom: 8 }}>
            {users.length} user{users.length !== 1 ? "s" : ""}
          </Text>
          {users.map((u) => {
            const initials =
              u.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "?";
            const joined = toJsDate(u.createdAt);
            return (
              <Card key={u.id}>
                <View style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{u.name}</Text>
                      {isAdminEmail(u.email) && (
                        <Text style={[styles.badge, { backgroundColor: colors.primary }]}>Admin</Text>
                      )}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{u.email}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
                      Salary <Text style={{ fontWeight: "700" }}>{formatMoney(u.salary)}</Text>
                      {"  ·  "}Months <Text style={{ fontWeight: "700" }}>{u.monthCount}</Text>
                      {joined ? `  ·  Joined ${joined.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" } as any)}` : ""}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </>
      )}

      <Button title="Log out" variant="danger" onPress={onLogout} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  badge: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
});
