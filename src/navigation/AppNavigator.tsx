// App stack for signed-in (non-admin) users: bottom tabs + pushed detail screens.
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeContext";
import TabNavigator from "./TabNavigator";
import MonthScreen from "../screens/MonthScreen";
import PlanScreen from "../screens/PlanScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        // Purple brand navigation bar (Alphalize style).
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: "#fff",
        headerTitleStyle: { color: "#fff", fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bgSoft },
        // Smooth push transition + interactive swipe-back gesture.
        animation: "slide_from_right",
        animationDuration: 260,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="Month"
        component={MonthScreen}
        options={{ title: "Month" }}
      />
      <Stack.Screen name="Plan" component={PlanScreen} options={{ title: "Plan" }} />
    </Stack.Navigator>
  );
}
