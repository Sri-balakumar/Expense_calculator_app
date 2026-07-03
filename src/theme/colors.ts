// Theme color tokens — matched to the Alphalize apps (employee attendance,
// tool management): dark-purple brand (#2E294E) + orange action color (#F37021),
// Urbanist type, white cards on a soft canvas.

export interface ThemeColors {
  bgSoft: string;
  text: string;
  textMuted: string;
  cardBg: string;
  cardBgAlt: string;
  primary: string;
  primaryDark: string;
  primaryGradient: [string, string];
  headerGradient: [string, string, string];
  success: string;
  successLight: string;
  danger: string;
  dangerLight: string;
  border: string;
  borderSoft: string;
  inputBg: string;
  chipBg: string;
  white: string;
  // Brand-specific extras.
  brand: string; // dark purple — headers, bottom bar
}

export const lightColors: ThemeColors = {
  bgSoft: "#f4f4f7",
  text: "#2e294e", // dark purple brand text
  textMuted: "#848884",
  cardBg: "#ffffff",
  cardBgAlt: "#f7f7fa",
  primary: "#f37021", // orange — buttons, active accents
  primaryDark: "#d95f16",
  primaryGradient: ["#f37021", "#d95f16"],
  headerGradient: ["#2e294e", "#3a3363", "#2e294e"], // purple brand
  success: "#008000",
  successLight: "#e3f4e3",
  danger: "#ff3333",
  dangerLight: "#ffe5e5",
  border: "#e4e2ea",
  borderSoft: "#f0eff4",
  inputBg: "#ffffff",
  chipBg: "#efeef4",
  white: "#ffffff",
  brand: "#2e294e",
};

export const darkColors: ThemeColors = {
  bgSoft: "#151321",
  text: "#f1f0f6",
  textMuted: "#9a97ad",
  cardBg: "#241f3d",
  cardBgAlt: "#1c1830",
  primary: "#f37021",
  primaryDark: "#d95f16",
  primaryGradient: ["#f37021", "#d95f16"],
  headerGradient: ["#2e294e", "#3a3363", "#2e294e"],
  success: "#37b737",
  successLight: "#123318",
  danger: "#ff5a5a",
  dangerLight: "#3b1414",
  border: "#332c52",
  borderSoft: "#271f45",
  inputBg: "#1c1830",
  chipBg: "#2a2447",
  white: "#ffffff",
  brand: "#2e294e",
};
