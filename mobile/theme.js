import { Platform } from "react-native";

/**
 * RavitoBox — design sport outdoor moderne (inspiration apps type Strava).
 * Charcoal + orange action + surfaces ultra clean. Pas de violet « IA ».
 */

const fontSans = Platform.select({
  web: "'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

const fontDisplay = Platform.select({
  web: "'Outfit', 'DM Sans', system-ui, sans-serif",
  ios: "System",
  android: "sans-serif-medium",
  default: undefined,
});

export const theme = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceMuted: "#FAFAFA",
  ink: "#18181B",
  inkMuted: "#71717A",
  border: "#E4E4E7",
  borderSoft: "#F4F4F5",
  hero: "#18181B",
  heroAccent: "#FB923C",
  primary: "#EA580C",
  primaryPressed: "#C2410C",
  primarySoft: "#FFF7ED",
  secondary: "#27272A",
  secondaryInk: "#27272A",
  accent: "#EA580C",
  accentSoft: "#FFF7ED",
  focus: "#EA580C",
  focusSoft: "rgba(234, 88, 12, 0.12)",
  picked: "#0F766E",
  pickedSoft: "#F0FDFA",
  chipBg: "#FFF7ED",
  chipBorder: "#FDBA74",
  infoBg: "#FFF7ED",
  infoBorder: "#FED7AA",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  success: "#059669",
  shadow: "rgba(24, 24, 27, 0.12)",
  white: "#FFFFFF",
  mapTeal: "#0D9488",
  font: fontSans,
  fontDisplay,
  radius: {
    sm: 12,
    md: 16,
    lg: 22,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
};

/** Charge les polices web (Outfit + DM Sans) une seule fois. */
export function ensureAthleticFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("ravitobox-fonts")) return;
  const link = document.createElement("link");
  link.id = "ravitobox-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Outfit:wght@600;700;800&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.id = "ravitobox-font-base";
  style.textContent = `
    html, body, #root {
      font-family: ${fontSans};
      background: ${theme.bg};
      color: ${theme.ink};
      -webkit-font-smoothing: antialiased;
    }
    button, input, textarea, select {
      font-family: inherit;
    }
  `;
  document.head.appendChild(style);
}

export default theme;
