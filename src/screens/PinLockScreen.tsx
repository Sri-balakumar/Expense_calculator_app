// Full-screen PIN gate shown on cold start when an app-lock PIN is set.
// Verifies against secure storage; "Forgot PIN?" clears the PIN and logs out.

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { usePin } from "../context/PinContext";
import { useFeedback } from "../components/Feedback";
import { signOutUser } from "../firebase/auth";
import PinPad from "../components/PinPad";
import { PIN_LENGTH } from "../util/pin";

export default function PinLockScreen() {
  const { colors } = useTheme();
  const { verify, unlock, removePin } = usePin();
  const { confirm, toast } = useFeedback();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (value.length !== PIN_LENGTH) {
      if (error) setError(false);
      return;
    }
    let active = true;
    (async () => {
      const ok = await verify(value);
      if (!active) return;
      if (ok) {
        unlock();
      } else {
        setError(true);
        setValue("");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const forgot = async () => {
    const ok = await confirm({
      title: "Forgot PIN?",
      message: "You'll be logged out. Sign back in with your email and password, then you can set a new PIN.",
      confirmText: "Log out",
    });
    if (!ok) return;
    await removePin();
    await signOutUser();
    toast("Logged out", "success");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSoft, paddingTop: insets.top + 60 }]}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={[styles.title, { color: colors.text }]}>Enter PIN</Text>
      <Text style={[styles.sub, { color: error ? colors.danger : colors.textMuted }]}>
        {error ? "Wrong PIN, try again" : "Enter your 4-digit PIN to unlock"}
      </Text>

      <View style={{ marginTop: 36, flex: 1, justifyContent: "center" }}>
        <PinPad value={value} onChange={setValue} error={error} />
      </View>

      <Pressable
        onPress={forgot}
        hitSlop={12}
        style={{ marginBottom: insets.bottom + 24, paddingVertical: 8 }}
      >
        <Text style={[styles.forgot, { color: colors.danger }]}>
          Forgot PIN? Reset it
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  lockIcon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 14, marginTop: 6 },
  forgot: { fontSize: 15, fontWeight: "700", textAlign: "center" },
});
