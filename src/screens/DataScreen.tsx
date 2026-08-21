// What's actually stored in your account, and a one-tap backup of it.
//
// The app has two irreversible operations — converting every amount to a new
// currency, and deleting a month with all its subcollections — and neither has
// an undo. This screen is the safety net: see what you have, then take a copy
// before you do something you can't take back.

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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useFeedback } from "../components/Feedback";
import { Button, Card } from "../components/UI";
import ScreenHeader from "../components/ScreenHeader";
import Watermark from "../components/Watermark";
import HelpFab from "../components/HelpFab";
import { HELP_DATA } from "../constants/help";
import DownloadAnimation from "../components/DownloadAnimation";
import { DatabaseSnapshot, formatBytes, readDatabase } from "../util/backup";
import { exportText } from "../util/export";
import { formatDateTime } from "../util/date";

export default function DataScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const { toast } = useFeedback();
  const [snap, setSnap] = useState<DatabaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setSnap(await readDatabase(user.uid));
    } catch (e: any) {
      console.log("[Data] read failed", e?.message);
      setError("Couldn't read your data. Check your connection and pull to retry.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Export what's already on screen — no second read, so the file matches the
  // figures the user just looked at.
  const onExport = async () => {
    if (!snap || exporting) return;
    setExporting(true);
    try {
      const stamp = new Date(snap.takenAt).toISOString().slice(0, 10);
      const saved = await exportText({
        text: JSON.stringify(snap.data, null, 2),
        filename: `expense-backup-${stamp}`,
        ext: ".json",
        mimeType: "application/json",
      });
      console.log("[Data] backup exported, saved to folder:", saved);
      if (saved) setDone(true);
      else toast("Backup ready — pick where to keep it.", "success");
    } catch (e: any) {
      console.log("[Data] export failed", e?.message);
      toast(e?.message || "Couldn't write the backup.", "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgSoft }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const rows = (snap?.stats || []).filter((s) => s.count > 0);
  const empty = (snap?.stats || []).filter((s) => s.count === 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <Watermark />
      <ScreenHeader title="Data" subtitle="What's stored, and a backup of it." />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 170 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {error && (
          <Card>
            <Text style={{ color: colors.danger, fontWeight: "600" }}>{error}</Text>
            <Pressable onPress={load} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </Card>
        )}

        {snap && (
          <>
            {/* Headline: how much there is, and how big a backup would be */}
            <Card style={{ alignItems: "center", paddingVertical: 22 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Documents stored</Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 34,
                  fontWeight: "800",
                  letterSpacing: -0.5,
                  marginTop: 2,
                }}
              >
                {snap.totalDocs}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
                {formatBytes(snap.bytes)} as a backup file
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
                Read {formatDateTime(new Date(snap.takenAt))}
              </Text>
            </Card>

            {/* Per-collection breakdown */}
            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>What's in there</Text>
              {rows.map((r) => (
                <View key={r.path} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
                      {r.label}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                      {r.path}
                    </Text>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>
                    {r.count}
                  </Text>
                </View>
              ))}
              {empty.length > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 12 }}>
                  Nothing yet in: {empty.map((e) => e.label.toLowerCase()).join(", ")}.
                </Text>
              )}
            </Card>

            {/* Backup */}
            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Backup</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 4 }}>
                Writes every document above to a single JSON file — entries, plans,
                budgets, goals, categories and your profile.
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14 }}>
                Worth doing before converting your currency or deleting a month. Neither
                of those can be undone.
              </Text>
              <Button
                title={`Export backup (${formatBytes(snap.bytes)})`}
                onPress={onExport}
                loading={exporting}
                disabled={exporting || snap.totalDocs === 0}
              />
              <View style={styles.noteRow}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 6, flex: 1 }}>
                  On Android it saves to your chosen download folder. Elsewhere it opens the
                  share sheet so you can send it wherever you keep backups.
                </Text>
              </View>
            </Card>

            {/* Where the data lives */}
            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Account</Text>
              <Detail label="Signed in as" value={profile?.name || user?.email || "—"} colors={colors} />
              <Detail label="Email" value={user?.email || "—"} colors={colors} />
              <Detail label="Currency" value={profile?.currency || "INR"} colors={colors} />
              <Detail label="Stored under" value={`users/${user?.uid?.slice(0, 8)}…`} colors={colors} />
            </Card>
          </>
        )}
      </ScrollView>

      <DownloadAnimation visible={done} label="JSON" onDone={() => setDone(false)} />
      <HelpFab {...HELP_DATA} />
    </View>
  );
}

function Detail({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text
        style={{ color: colors.text, fontWeight: "600", fontSize: 13, flexShrink: 1 }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
  },
  noteRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
});
