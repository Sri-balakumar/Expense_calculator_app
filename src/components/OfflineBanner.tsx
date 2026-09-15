// A thin strip at the top of the app saying what is actually true about syncing.
//
// It exists because the alternative is silence: a write made without a
// connection looks identical to a saved one, and the SDK's queue does not
// survive the app being killed. The second state below is the one that matters
// — it tells the user the single thing that prevents the loss.
import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSync } from "../context/SyncContext";
import { useTheme } from "../theme/ThemeContext";

export default function OfflineBanner() {
  const { online, pending } = useSync();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const waiting = pending > 0;
  if (!waiting && online !== false) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        // The toast owns the bottom of the screen (Feedback.tsx), so this sits
        // at the top rather than fighting it for the same space.
        backgroundColor: waiting ? colors.danger : colors.cardBgAlt,
        zIndex: 50,
      }}
    >
      <Text
        style={{
          color: waiting ? "#fff" : colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {waiting
          ? `${pending} ${pending === 1 ? "entry" : "entries"} not saved yet — keep the app open.`
          : "Offline — showing your last saved data."}
      </Text>
    </View>
  );
}
