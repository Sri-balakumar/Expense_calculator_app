// Small shared UI primitives — clean, minimal iOS style.

import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function Card({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.cardBg }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: any;
}) {
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
      ? colors.danger
      : colors.chipBg;
  const fg =
    variant === "secondary" ? colors.primary : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        // Colored shadow lift on filled buttons (Alphalize style).
        variant !== "secondary" && {
          shadowColor: bg,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 5,
          elevation: disabled ? 0 : 4,
        },
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  isPassword,
  style,
  ...rest
}: TextInputProps & { label?: string; isPassword?: boolean }) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {!!label && (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      )}
      <View style={{ justifyContent: "center" }}>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.inputBg,
              borderColor: focused ? colors.primary : "transparent",
              paddingRight: isPassword ? 60 : 14,
            },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && hidden}
          // Passwords must never be transformed by the keyboard.
          {...(isPassword && {
            autoCapitalize: "none",
            autoCorrect: false,
            spellCheck: false,
          })}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
        />
        {isPassword && (
          <Pressable
            style={styles.eye}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
          >
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>
              {hidden ? "Show" : "Hide"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    // Soft elevation so cards lift off the canvas (polished app feel).
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  button: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 16, letterSpacing: 0.3 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6, marginLeft: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  eye: { position: "absolute", right: 14 },
});
