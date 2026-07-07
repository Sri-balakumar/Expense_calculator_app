// A month-calendar popup (~90% of screen). Each day shows a red dot if there was
// a spend, a green dot if there was income (both if both). Tapping a day lists
// that day's entries below. Used by Month/Budget and Plans screens.

import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { formatMoney } from "../util/money";

export interface DayMark {
  spend?: boolean;
  income?: boolean;
}
export interface CalItem {
  id: string;
  name: string;
  amount: number;
  kind: "spend" | "income";
  sub?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${SHORT[m - 1]} ${y}`;
}

export default function CalendarModal({
  visible,
  onClose,
  title = "Calendar",
  marks,
  itemsForDate,
  initialDate,
  maxDate,
  minDate,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  marks: Record<string, DayMark>;
  itemsForDate: (key: string) => CalItem[];
  initialDate?: Date;
  maxDate?: Date; // don't navigate past this month (default: today)
  minDate?: Date; // don't navigate before this month
}) {
  const { colors } = useTheme();
  const base = initialDate || new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  // Quick-jump picker: null = calendar, "year" = choose year, "month" = choose month.
  const [pickMode, setPickMode] = useState<null | "year" | "month">(null);
  const [pickYear, setPickYear] = useState(base.getFullYear());

  // Navigation bounds: cap forward at maxDate (default today) so future/empty
  // months aren't reachable; optionally cap backward at minDate.
  const cap = maxDate || new Date();
  const maxY = cap.getFullYear();
  const maxM = cap.getMonth();
  const minY = minDate ? minDate.getFullYear() : maxY - 11;
  const years: number[] = [];
  for (let y = maxY; y >= minY; y--) years.push(y);
  const canForward = view.y < maxY || (view.y === maxY && view.m < maxM);
  const canBack =
    !minDate ||
    view.y > minDate.getFullYear() ||
    (view.y === minDate.getFullYear() && view.m > minDate.getMonth());

  const grid = useMemo(() => {
    const firstDay = new Date(view.y, view.m, 1).getDay(); // 0=Sun
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const shift = (delta: number) => {
    if (delta > 0 && !canForward) return;
    if (delta < 0 && !canBack) return;
    let m = view.m + delta;
    let y = view.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setView({ y, m });
    setSelected(null);
    console.log("[Calendar] view", `${MONTHS[m]} ${y}`);
  };

  const items = selected ? itemsForDate(selected) : [];
  const todayKey = keyOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tap-outside layer (behind the card) so the card's ScrollView keeps its gesture */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
          {/* Header */}
          <View style={styles.headRow}>
            {pickMode ? (
              <Pressable
                onPress={() => setPickMode(pickMode === "month" ? "year" : null)}
                hitSlop={10}
              >
                <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>‹ Back</Text>
              </Pressable>
            ) : (
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{title}</Text>
            )}
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ color: colors.textMuted, fontSize: 20, fontWeight: "700" }}>✕</Text>
            </Pressable>
          </View>

          {/* --- Year picker --- */}
          {pickMode === "year" && (
            <>
              <Text style={[styles.pickTitle, { color: colors.textMuted }]}>Choose year</Text>
              <ScrollView style={{ flex: 1 }}>
                <View style={styles.pickGrid}>
                  {years.map((y) => {
                    const sel = y === view.y;
                    return (
                      <Pressable
                        key={y}
                        onPress={() => {
                          setPickYear(y);
                          setPickMode("month");
                        }}
                        style={[
                          styles.pickCell,
                          { backgroundColor: sel ? colors.primary : colors.chipBg },
                        ]}
                      >
                        <Text style={{ color: sel ? "#fff" : colors.text, fontWeight: "700", fontSize: 15 }}>{y}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}

          {/* --- Month picker --- */}
          {pickMode === "month" && (
            <>
              <Text style={[styles.pickTitle, { color: colors.textMuted }]}>Choose month · {pickYear}</Text>
              <View style={styles.pickGrid}>
                {MONTHS.map((mn, mi) => {
                  const disabled = pickYear === maxY && mi > maxM;
                  const sel = pickYear === view.y && mi === view.m;
                  return (
                    <Pressable
                      key={mi}
                      disabled={disabled}
                      onPress={() => {
                        setView({ y: pickYear, m: mi });
                        setSelected(null);
                        setPickMode(null);
                        console.log("[Calendar] jump", `${mn} ${pickYear}`);
                      }}
                      style={[
                        styles.pickCell,
                        {
                          backgroundColor: sel ? colors.primary : colors.chipBg,
                          opacity: disabled ? 0.3 : 1,
                        },
                      ]}
                    >
                      <Text style={{ color: sel ? "#fff" : colors.text, fontWeight: "700", fontSize: 14 }}>
                        {mn.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Month nav (calendar mode) */}
          {!pickMode && (
          <View style={styles.navRow}>
            <Pressable
              onPress={() => shift(-1)}
              disabled={!canBack}
              hitSlop={10}
              style={[styles.navBtn, { backgroundColor: colors.chipBg, opacity: canBack ? 1 : 0.35 }]}
            >
              <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 16 }}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setPickYear(view.y);
                setPickMode("year");
              }}
              hitSlop={8}
              style={styles.monthLabelBtn}
            >
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>
                {MONTHS[view.m]} {view.y}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}> ▾</Text>
            </Pressable>
            <Pressable
              onPress={() => shift(1)}
              disabled={!canForward}
              hitSlop={10}
              style={[styles.navBtn, { backgroundColor: colors.chipBg, opacity: canForward ? 1 : 0.35 }]}
            >
              <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 16 }}>›</Text>
            </Pressable>
          </View>
          )}

          {/* Weekday labels + grid + legend + entries (calendar mode) */}
          {!pickMode && (
          <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekLabel, { color: colors.textMuted }]}>{w}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {grid.map((d, i) => {
              if (d === null) return <View key={i} style={styles.cell} />;
              const key = keyOf(view.y, view.m, d);
              const mk = marks[key];
              const sel = selected === key;
              const isToday = key === todayKey;
              return (
                <Pressable key={i} style={styles.cell} onPress={() => setSelected(sel ? null : key)}>
                  <View
                    style={[
                      styles.dayCircle,
                      sel && { backgroundColor: colors.primary },
                      !sel && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={{
                        color: sel ? "#fff" : colors.text,
                        fontWeight: sel || isToday ? "800" : "500",
                        fontSize: 14,
                      }}
                    >
                      {d}
                    </Text>
                  </View>
                  <View style={styles.dots}>
                    {mk?.spend && <View style={[styles.dot, { backgroundColor: colors.danger }]} />}
                    {mk?.income && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: colors.danger }]} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginRight: 14 }}>Spend</Text>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Income</Text>
          </View>

          {/* Selected day's entries */}
          <View style={[styles.listWrap, { borderTopColor: colors.border }]}>
            {!selected ? (
              <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 20 }}>
                Tap a date to see its entries.
              </Text>
            ) : (
              <>
                <View style={styles.listHead}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{prettyDate(selected)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {items.length} {items.length === 1 ? "entry" : "entries"}
                  </Text>
                </View>
                {items.length === 0 ? (
                  <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 16 }}>
                    Nothing on this day.
                  </Text>
                ) : (
                  <View style={{ flex: 1 }}>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingRight: 12, paddingTop: 6, paddingBottom: 8 }}
                    showsVerticalScrollIndicator={true}
                  >
                    {items.map((it) => (
                      <View key={it.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
                          <View
                            style={[
                              styles.itemDot,
                              { backgroundColor: it.kind === "income" ? colors.success : colors.danger },
                            ]}
                          />
                          <View style={{ flexShrink: 1 }}>
                            <Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>
                              {it.name}
                            </Text>
                            {!!it.sub && (
                              <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                                {it.sub}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={{ color: it.kind === "income" ? colors.success : colors.danger, fontWeight: "800" }}>
                          {it.kind === "income" ? "+" : "−"} {formatMoney(it.amount)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                  {/* Subtle fade at the top and bottom of the scroll area */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={[colors.cardBg, "transparent"]}
                    style={styles.fadeTop}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["transparent", colors.cardBg]}
                    style={styles.fadeBottom}
                  />
                  </View>
                )}
              </>
            )}
          </View>
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: { width: "100%", maxWidth: 460, height: "90%", borderRadius: 22, padding: 18 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  monthLabelBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pickTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  pickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pickCell: {
    width: "22%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  weekRow: { flexDirection: "row" },
  weekLabel: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3, marginTop: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12, marginBottom: 4 },
  listWrap: { borderTopWidth: 1, marginTop: 10, paddingTop: 8, flex: 1 },
  listHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  fadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 16 },
  fadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 22 },
});
