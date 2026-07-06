import React, { useEffect, useState } from "react";
import * as Font from "expo-font";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { FeedbackProvider } from "./src/components/Feedback";
import { AuthProvider } from "./src/context/AuthContext";
import { CategoriesProvider } from "./src/context/CategoriesContext";
import { PaymentMethodsProvider } from "./src/context/PaymentMethodsContext";
import { PinProvider } from "./src/context/PinContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { FONT_ASSETS, applyGlobalFont } from "./src/theme/fonts";

// Patch Text/TextInput to render in Inter app-wide (before any render).
applyGlobalFont();

function ThemedApp() {
  const { mode } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <RootNavigator />
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
                  <ThemedApp />
                </PinProvider>
              </PaymentMethodsProvider>
            </CategoriesProvider>
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
