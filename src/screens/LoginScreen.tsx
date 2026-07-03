import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { useFeedback } from "../components/Feedback";
import { Button, Field } from "../components/UI";
import { signIn, sendPasswordReset, friendlyAuthError } from "../firebase/auth";

export default function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    if (!email.trim() || !password) return toast("Enter email and password.", "error");
    console.log("[Login] attempting sign-in", { email: email.trim(), passwordLength: password.length });
    setBusy(true);
    try {
      const user = await signIn(email.trim(), password);
      console.log("[Login] sign-in success", { uid: user.uid, email: user.email });
      // AuthGate switches to the app stack automatically.
    } catch (err: any) {
      console.warn("[Login] sign-in failed", { code: err?.code, message: err?.message });
      toast(friendlyAuthError(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email.trim()) return toast("Enter your email first.", "error");
    console.log("[Login] sending password reset", { email: email.trim() });
    try {
      await sendPasswordReset(email.trim());
      console.log("[Login] password reset email sent");
      toast("Password reset email sent.", "success");
    } catch (err: any) {
      console.warn("[Login] password reset failed", { code: err?.code, message: err?.message });
      toast(friendlyAuthError(err), "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSoft }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <LinearGradient
            colors={colors.headerGradient}
            style={styles.logo}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.logoText}>₹</Text>
          </LinearGradient>
          <Text style={[styles.heading, { color: colors.text }]}>Welcome back</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Log in to your expense tracker
          </Text>

          <View style={{ width: "100%", maxWidth: 420, marginTop: 24 }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              isPassword
            />
            <Pressable onPress={onReset} style={{ alignSelf: "flex-end", marginBottom: 14 }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>
                Forgot password?
              </Text>
            </Pressable>
            <Button title="Log in" onPress={onLogin} loading={busy} />

            <View style={styles.footer}>
              <Text style={{ color: colors.textMuted }}>No account? </Text>
              <Pressable onPress={() => navigation.navigate("Signup")}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Sign up</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoText: { color: "#fff", fontSize: 30, fontWeight: "700" },
  heading: { fontSize: 22, fontWeight: "800", letterSpacing: -0.2 },
  sub: { fontSize: 15, marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 22 },
});
