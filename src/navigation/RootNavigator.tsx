// Root navigation + AuthGate. Swaps between the auth stack and the app stack
// based on onAuthStateChanged. Admin users get routed to the admin home.

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { usePin } from "../context/PinContext";
import { useTheme } from "../theme/ThemeContext";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import AppNavigator from "./AppNavigator";
import AdminScreen from "../screens/admin/AdminScreen";
import PinLockScreen from "../screens/PinLockScreen";

const Stack = createNativeStackNavigator();

// In-app splash: a real React screen (unlike the native expo-splash-screen,
// this DOES show in Expo Go). Displays the app artwork full-screen while the
// app boots, held for a minimum time so the branding is actually visible.
const SPLASH_IMAGE = require("../../assets/splash-icon.png");
const MIN_SPLASH_MS = 1800;

function Splash() {
  const { colors } = useTheme();
  // Entrance animation: fade + gentle scale-up so the splash eases in.
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  console.log("[Splash] rendering in-app splash (image)");
  return (
    <View style={[styles.splash, { backgroundColor: colors.bgSoft }]}>
      <Animated.View style={{ alignItems: "center", opacity, transform: [{ scale }] }}>
        {/* White tile keeps the white-background artwork looking intentional in
            both light and dark mode instead of a bare white box on dark. */}
        <View style={styles.splashTile}>
          <Image
            source={SPLASH_IMAGE}
            style={styles.splashImage}
            resizeMode="contain"
            // Scale the large source down during native decode (Android) to avoid
            // a decode stall; no-op on iOS.
            resizeMethod="resize"
            fadeDuration={0}
          />
        </View>
        <Text style={[styles.splashTitle, { color: colors.text }]}>
          Expense Calculator
        </Text>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
      </Animated.View>
    </View>
  );
}

// Fades the app content in when it first mounts (i.e. right after the splash
// hands off) — smooths the splash → login / splash → app transition.
function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splashTile: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  splashImage: { width: 190, height: 190 },
  splashTitle: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});

export default function RootNavigator() {
  const { user, isAdmin, loading } = useAuth();
  const { ready: pinReady, locked } = usePin();

  // Minimum splash display so the branding doesn't just flash and vanish.
  const [minTimePassed, setMinTimePassed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  console.log("[Splash] gate state", {
    authLoading: loading,
    pinReady,
    minTimePassed,
    hasUser: !!user,
    isAdmin,
    locked,
  });

  if (loading || !pinReady || !minTimePassed) {
    console.log("[Splash] still showing →", {
      waitingOnAuth: loading,
      waitingOnPin: !pinReady,
      waitingOnMinTime: !minTimePassed,
    });
    return <Splash />;
  }

  console.log("[Splash] ready → leaving splash, routing app");

  // App-lock gate: logged in but locked → require PIN before anything else.
  if (user && locked) return <FadeIn><PinLockScreen /></FadeIn>;

  return (
    <FadeIn>
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: "slide_from_right" }}
      >
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : isAdmin ? (
          <Stack.Screen name="Admin" component={AdminScreen} />
        ) : (
          <Stack.Screen name="App" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </FadeIn>
  );
}
