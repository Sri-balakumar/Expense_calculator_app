import React, { useEffect, useState } from "react";
import * as Font from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { FeedbackProvider } from "./src/components/Feedback";
import { AuthProvider } from "./src/context/AuthContext";
import { CategoriesProvider } from "./src/context/CategoriesContext";
import { PaymentMethodsProvider } from "./src/context/PaymentMethodsContext";
import { PinProvider } from "./src/context/PinContext";
import { CurrencyProvider } from "./src/context/CurrencyContext";
import { SyncProvider } from "./src/context/SyncContext";
import OfflineBanner from "./src/components/OfflineBanner";
import RootNavigator from "./src/navigation/RootNavigator";
import { FONT_ASSETS, applyGlobalFont } from "./src/theme/fonts";

// Hold the native splash until the in-app splash has painted. Without this it
// auto-hides the moment the bundle mounts — which is a `null` render (fonts,
// theme and currency all gate on storage reads) — showing a white flash before
// the real splash. RootNavigator's <Splash /> calls hideAsync() on layout.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 300, fade: true });

// Failsafe: never leave the native splash stuck up if boot fails early.
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, 8000);

// Patch Text/TextInput to render in Inter app-wide (before any render).
applyGlobalFont();

function ThemedApp() {
  const { mode } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <RootNavigator />
      {/* Last child so it paints over the screens, like the toast does. */}
      <OfflineBanner />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    Font.loadAsync(FONT_ASSETS)
      .catch((e) => console.warn("[Fonts] Inter load failed", e?.message || e))
      .finally(() => setFontsLoaded(true));
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <CategoriesProvider>
              <PaymentMethodsProvider>
                <PinProvider>
                  <SyncProvider>
                    <CurrencyProvider>
                      <ThemedApp />
                    </CurrencyProvider>
                  </SyncProvider>
                </PinProvider>
              </PaymentMethodsProvider>
            </CategoriesProvider>
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
