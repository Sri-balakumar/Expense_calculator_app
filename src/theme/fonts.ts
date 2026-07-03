// Global Urbanist typography — matches the Alphalize apps (employee attendance,
// tool management). We patch the render of the base Text and TextInput once so
// the whole app uses Urbanist, mapping each element's fontWeight to the matching
// Urbanist font file. Any element that sets an explicit fontFamily is untouched.

import React from "react";
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from "react-native";

// Assets for Font.loadAsync — keys become the fontFamily names.
export const FONT_ASSETS = {
  "Urbanist-Light": require("../../assets/fonts/Urbanist/Urbanist-Light.ttf"),
  "Urbanist-Regular": require("../../assets/fonts/Urbanist/Urbanist-Regular.ttf"),
  "Urbanist-Medium": require("../../assets/fonts/Urbanist/Urbanist-Medium.ttf"),
  "Urbanist-SemiBold": require("../../assets/fonts/Urbanist/Urbanist-SemiBold.ttf"),
  "Urbanist-Bold": require("../../assets/fonts/Urbanist/Urbanist-Bold.ttf"),
  "Urbanist-ExtraBold": require("../../assets/fonts/Urbanist/Urbanist-ExtraBold.ttf"),
};

const WEIGHT_TO_FAMILY: Record<string, string> = {
  "100": "Urbanist-Light",
  "200": "Urbanist-Light",
  "300": "Urbanist-Light",
  "400": "Urbanist-Regular",
  normal: "Urbanist-Regular",
  "500": "Urbanist-Medium",
  "600": "Urbanist-SemiBold",
  "700": "Urbanist-Bold",
  bold: "Urbanist-Bold",
  "800": "Urbanist-ExtraBold",
  "900": "Urbanist-ExtraBold",
};

function familyForWeight(weight: unknown): string {
  return WEIGHT_TO_FAMILY[String(weight)] || "Urbanist-Regular";
}

let applied = false;

// Patch Text + TextInput once so all app text renders in Urbanist.
export function applyGlobalFont() {
  if (applied) return;
  applied = true;

  for (const Comp of [RNText, RNTextInput] as any[]) {
    const oldRender = Comp.render;
    if (typeof oldRender !== "function") continue;
    Comp.render = function (...args: any[]) {
      const origin = oldRender.apply(this, args);
      const flat = (StyleSheet.flatten(origin.props?.style) as any) || {};
      // Respect an explicit fontFamily if a component already set one.
      if (flat.fontFamily) return origin;
      const family = familyForWeight(flat.fontWeight);
      return React.cloneElement(origin, {
        style: [{ fontFamily: family }, origin.props?.style, { fontWeight: undefined }],
      });
    };
  }
}
