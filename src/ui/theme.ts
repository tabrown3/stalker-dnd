import { Platform } from "react-native";

// Dark, utilitarian: olive, rust and amber on near-black.
export const colors = {
  bg: "#0e100c",
  surface: "#171a13",
  surfaceRaised: "#1f2319",
  border: "#2e3326",
  text: "#dcd8c4",
  muted: "#8d8b78",
  olive: "#8f9e5e",
  oliveDim: "#3a4227",
  amber: "#e0a63e",
  rust: "#c0582f",
  danger: "#d9534f",
};

export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, Consolas, monospace" });

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 6;
