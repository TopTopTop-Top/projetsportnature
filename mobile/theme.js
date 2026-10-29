import { Platform } from "react-native";

/**
 * RavitoBox design system — outdoor / endurance 2025.
 * Références: Strava (accent action, densité), Komoot (carte first, chrome léger).
 * Anti-patterns IA évités: cards empilées, glow orange, pills partout, Outfit+terracotta.
 */

const fontSans = Platform.select({
  web: "'Manrope', 'Segoe UI', system-ui, -apple-system, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

const fontDisplay = Platform.select({
  web: "'Barlow Semi Condensed', 'Manrope', system-ui, sans-serif",
  ios: "System",
  android: "sans-serif-condensed",
  default: undefined,
});

export const theme = {
  bg: "#F2F3F5",
  surface: "#FFFFFF",
  surfaceMuted: "#EBEDF0",
  ink: "#0C0D0F",
  inkMuted: "#6B7280",
  border: "#D8DCE2",
  borderSoft: "#E8EAEE",
  hero: "#0C0D0F",
  heroAccent: "#FF6A3D",
  primary: "#FF4D1A",
  primaryPressed: "#E03E10",
  primarySoft: "#FFF1EC",
  secondary: "#0C0D0F",
  secondaryInk: "#0C0D0F",
  accent: "#FF4D1A",
  accentSoft: "#FFF1EC",
  focus: "#FF4D1A",
  focusSoft: "rgba(255, 77, 26, 0.12)",
  picked: "#0F766E",
  pickedSoft: "#ECFDF8",
  chipBg: "#EBEDF0",
  chipBorder: "#D8DCE2",
  infoBg: "#EBEDF0",
  infoBorder: "#D8DCE2",
  warnBg: "#FFF8EB",
  warnBorder: "#F5D78E",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  success: "#059669",
  shadow: "rgba(12, 13, 15, 0.08)",
  white: "#FFFFFF",
  mapTeal: "#0D9488",
  font: fontSans,
  fontDisplay,
  type: {
    display: 32,
    title: 22,
    section: 15,
    body: 15,
    meta: 13,
    micro: 11,
  },
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
};

/** Charge les polices web (Barlow Semi Condensed + Manrope). */
export function ensureAthleticFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("ravitobox-fonts")) return;
  const link = document.createElement("link");
  link.id = "ravitobox-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
  const style = document.createElement("style");
  style.id = "ravitobox-font-base";
  style.textContent = `
    html, body, #root {
      font-family: ${fontSans};
      background: ${theme.bg};
      color: ${theme.ink};
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    button, input, textarea, select {
      font-family: inherit;
    }
    ::selection {
      background: rgba(255, 77, 26, 0.18);
    }
  `;
  document.head.appendChild(style);
}

export default theme;
