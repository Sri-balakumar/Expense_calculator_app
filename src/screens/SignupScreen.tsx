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
import { currencySymbol } from "../util/money";
import { signUp, signOutUser, friendlyAuthError } from "../firebase/auth";
import { createUserDoc } from "../firebase/firestore";

// Gmail-only enforcement (mirrors the PWA signup).
function isGmail(email: string) {
  return /@gmail\.com$/i.test(email.trim());
}

export default function SignupScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { toast } = useFeedback();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [salary, setSalary] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSignup = async () => {
    if (!name.trim()) return toast("Enter your name.", "error");
    if (!isGmail(email)) return toast("Please use a Gmail address.", "error");
    if (password.length < 6) return toast("Password must be at least 6 characters.", "error");
    const salaryNum = Number(salary) || 0;
    if (salaryNum <= 0) return toast("Enter your monthly salary.", "error");

    setBusy(true);
    try {
      const user = await signUp(email.trim(), password);
      await createUserDoc(user.uid, {
        name: name.trim(),
        email: email.trim(),
        salary: salaryNum,
      });
      // AuthGate picks up the new session automatically.
    } catch (err) {
      toast(friendlyAuthError(err), "error");
      // If the auth user got created but the doc failed, sign out to keep state clean.
      try {
        await signOutUser();
      } catch {}
    } finally {
      setBusy(false);
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
          <Text style={[styles.heading, { color: colors.text }]}>Create account</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Start tracking your expenses
          </Text>

          <View style={{ width: "100%", maxWidth: 420, marginTop: 24 }}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
            <Field
              label="Email (Gmail)"
              value={email}
              onChangeText={setEmail}
              placeholder="you@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label={`Monthly salary (${currencySymbol().trim()})`}
              money
              value={salary}
              onChangeText={setSalary}
              placeholder="e.g. 50000"
              keyboardType="numeric"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              isPassword
            />
            <Button title="Sign up" onPress={onSignup} loading={busy} />

            <View style={styles.footer}>
              <Text style={{ color: colors.textMuted }}>Already have an account? </Text>
              <Pressable onPress={() => navigation.goBack()}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Log in</Text>
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
