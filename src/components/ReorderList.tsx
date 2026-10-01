// Drag-to-reorder list. Hold a row's ≡ handle and drag it up or down; the other
// rows slide out of the way and the new order is reported on release.
//
// Built on React Native's own PanResponder + Animated (like every other
// animation in the app) so it needs no native module — it runs in Expo Go and
// in the existing APK build unchanged. Rows are a fixed height, which keeps the
// "which slot is the finger over" maths to one division.
//
// Inside a ScrollView: the handle claims the touch and refuses to hand it over,
// and onDragState lets the screen switch its scrolling off for the duration.

import React, { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, PanResponderInstance, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export const REORDER_ROW_H = 56;
const GAP = 6;
const SLIDE_MS = 120;

export interface ReorderItem {
  id: string;
  title: string;
  right?: string;
}

export default function ReorderList({
  items,
  onChange,
  onDragState,
}: {
  items: ReorderItem[];
  // The full order, top to bottom, after every drop that moved something.
  onChange: (ids: string[]) => void;
  onDragState?: (dragging: boolean) => void;
}) {
  const { colors } = useTheme();
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [activeId, setActiveId] = useState<string | null>(null);

  // PanResponders are created once per row, so everything they read has to come
  // through refs or it would be the values from the first render.
  const orderRef = useRef(order);
  orderRef.current = order;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDragStateRef = useRef(onDragState);
  onDragStateRef.current = onDragState;
  const drag = useRef<{ id: string; from: number; to: number } | null>(null);
  const positions = useRef(new Map<string, Animated.Value>());
  const responders = useRef(new Map<string, PanResponderInstance>());

  const posFor = (id: string, idx: number): Animated.Value => {
    let v = positions.current.get(id);
    if (!v) {
      v = new Animated.Value(idx * REORDER_ROW_H);
      positions.current.set(id, v);
    }
    return v;
  };

  // A plan added or deleted while the list is open: keep the user's order for
  // the rest, drop what's gone, put anything new at the bottom.
  const idsKey = items.map((i) => i.id).join("|");
  useEffect(() => {
    const ids = items.map((i) => i.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Settle every row onto its slot whenever the order changes outside a drag.
  useEffect(() => {
    if (drag.current) return;
    order.forEach((id, i) => posFor(id, i).setValue(i * REORDER_ROW_H));
  }, [order]);

  const finish = () => {
    const d = drag.current;
    drag.current = null;
    setActiveId(null);
    onDragStateRef.current?.(false);
    if (!d) return;
    Animated.timing(posFor(d.id, d.from), {
      toValue: d.to * REORDER_ROW_H,
      duration: SLIDE_MS,
      useNativeDriver: false,
    }).start();
    if (d.to === d.from) return;
    const next = [...orderRef.current];
    next.splice(d.from, 1);
    next.splice(d.to, 0, d.id);
    orderRef.current = next;
    setOrder(next);
    onChangeRef.current(next);
  };

  const responderFor = (id: string): PanResponderInstance => {
    let r = responders.current.get(id);
    if (r) return r;
    r = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The ScrollView around the list asks for the touch as soon as the finger
      // moves vertically; refusing is what keeps the row under the finger.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        const from = orderRef.current.indexOf(id);
        if (from === -1) return;
        drag.current = { id, from, to: from };
        setActiveId(id);
        onDragStateRef.current?.(true);
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current;
        if (!d) return;
        const ids = orderRef.current;
        const maxY = (ids.length - 1) * REORDER_ROW_H;
        const y = Math.max(0, Math.min(maxY, d.from * REORDER_ROW_H + g.dy));
        posFor(id, d.from).setValue(y);
        const to = Math.round(y / REORDER_ROW_H);
        if (to === d.to) return;
        d.to = to;
        // Rows between the old and new slot shift one place towards the gap;
        // everything else goes back to where it started.
        ids.forEach((other, i) => {
          if (other === id) return;
          let slot = i;
          if (d.from < to && i > d.from && i <= to) slot = i - 1;
          else if (d.from > to && i >= to && i < d.from) slot = i + 1;
          Animated.timing(posFor(other, i), {
            toValue: slot * REORDER_ROW_H,
            duration: SLIDE_MS,
            useNativeDriver: false,
          }).start();
        });
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
    responders.current.set(id, r);
    return r;
  };

  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <View style={{ height: order.length * REORDER_ROW_H }}>
      {order.map((id, i) => {
        const it = byId.get(id);
        if (!it) return null;
        const active = activeId === id;
        return (
          <Animated.View
            key={id}
            style={[
              styles.row,
              {
                backgroundColor: active ? colors.chipBg : colors.cardBg,
                borderColor: active ? colors.primary : colors.border,
                transform: [{ translateY: posFor(id, i) }],
                zIndex: active ? 10 : 1,
                elevation: active ? 6 : 0,
              },
            ]}
          >
            <View {...responderFor(id).panHandlers} style={styles.handle}>
              <Ionicons name="reorder-three" size={26} color={active ? colors.primary : colors.textMuted} />
            </View>
            <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: "600", fontSize: 15 }}>
              {it.title}
            </Text>
            {!!it.right && (
              <Text style={{ color: colors.textMuted, fontWeight: "700", marginLeft: 8 }}>{it.right}</Text>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: REORDER_ROW_H - GAP,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 14,
  },
  handle: {
    width: 48,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
});
