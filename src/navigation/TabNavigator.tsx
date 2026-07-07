import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import MonthlyScreen from "../screens/MonthlyScreen";
import BudgetsScreen from "../screens/BudgetsScreen";
import PlansScreen from "../screens/PlansScreen";
import YearScreen from "../screens/YearScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Monthly: "calendar-outline",
  Budgets: "wallet-outline",
  Plans: "list-outline",
  Year: "stats-chart-outline",
  Profile: "person-outline",
};

// Animated tab icon: the pill springs (scale + lift) when its tab is tapped.
function AnimatedTabIcon({
  routeName,
  focused,
  colors,
}: {
  routeName: string;
  focused: boolean;
  colors: any;
}) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.9)).current;

  useEffect(() => {
    if (focused) {
      console.log("[Tabs] selected", routeName);
      // Pop / bounce: shrink then spring to full size with overshoot. Stays
      // inside the pill so it's never clipped by the bar's rounded top.
      scale.setValue(0.6);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(scale, {
        toValue: 0.9,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [focused, routeName, scale]);

  const base = ICONS[routeName];
  const name = focused
    ? (base.replace("-outline", "") as keyof typeof Ionicons.glyphMap)
    : base;

  return (
    <View style={styles.tabItem}>
      <Animated.View
        style={[
          styles.pill,
          focused && {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            shadowOpacity: 0.5,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          },
          { transform: [{ scale }] },
        ]}
      >
        <Ionicons name={name} size={21} color={focused ? "#fff" : "rgba(255,255,255,0.6)"} />
      </Animated.View>
      <Text
        style={[
          styles.tabLabel,
          focused
            ? { color: "#fff", fontWeight: "700" }
            : { color: "rgba(255,255,255,0.6)", fontWeight: "500" },
        ]}
        numberOfLines={1}
      >
        {routeName}
      </Text>
    </View>
  );
}

export default function TabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        // Animate the content when switching tabs (movement on tap).
        animation: "shift",
        // Full-width purple bar anchored to the bottom, top corners rounded.
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          backgroundColor: colors.brand,
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarItemStyle: { height: 62 },
        tabBarIcon: ({ focused }) => (
          <AnimatedTabIcon routeName={route.name} focused={focused} colors={colors} />
        ),
      })}
    >
      <Tab.Screen name="Monthly" component={MonthlyScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
      <Tab.Screen name="Budgets" component={BudgetsScreen} />
      <Tab.Screen name="Year" component={YearScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: "center", justifyContent: "center", width: 66 },
  pill: {
    width: 50,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: { fontSize: 10, marginTop: 4, letterSpacing: 0.2 },
});
