import { Platform } from "react-native";

/**
 * RavitoBox — direction visuelle Figma « Relais / ravito »
 * Vert forêt CTA, fond sage clair, cards blanches, coins généreux.
 */

const fontSans = Platform.select({
  web: "'Manrope', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

const fontDisplay = Platform.select({
  web: "'Manrope', 'Inter', system-ui, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

export const theme = {
  // Surfaces — sage clair Figma
  bg: "#EEF3F0",
  surface: "#FFFFFF",
  surfaceMuted: "#E4EDE8",
  ink: "#0F1F1A",
  inkMuted: "#5C6B64",
  border: "#D5E0DA",
  borderSoft: "#E8EFEB",

  // Marque — forêt nuit (headers sombres optionnels)
  hero: "#0B3D36",
  heroAccent: "#8FD6C4",

  // Action principale — vert forêt Figma (~#004D40 / #005F54)
  primary: "#005F54",
  primaryPressed: "#004940",
  primarySoft: "#E3F2EE",

  secondary: "#0F1F1A",
  secondaryInk: "#0F1F1A",
  accent: "#005F54",
  accentSoft: "#E3F2EE",
  focus: "#005F54",
  focusSoft: "rgba(0, 95, 84, 0.14)",

  // Carte / sélection
  picked: "#0A6B5C",
  pickedSoft: "#E8F6F2",
  mapTeal: "#0D8A74",

  chipBg: "#E4EDE8",
  chipBorder: "#D5E0DA",
  infoBg: "#E4EDE8",
  infoBorder: "#D5E0DA",
  warnBg: "#FFF8EB",
  warnBorder: "#E8D29A",
  danger: "#C43C3C",
  dangerSoft: "#FCEEEE",
  success: "#005F54",
  shadow: "rgba(15, 31, 26, 0.08)",
  white: "#FFFFFF",

  font: fontSans,
  fontDisplay,
  type: {
    display: 30,
    title: 22,
    section: 15,
    body: 15,
    meta: 13,
    micro: 11,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
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

/** Charge les polices web (Manrope = corps + display Figma). */
export function ensureAthleticFonts() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("ravitobox-fonts")) return;
  const link = document.createElement("link");
  link.id = "ravitobox-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
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
      background: rgba(0, 95, 84, 0.2);
    }
  `;
  document.head.appendChild(style);
}

export default theme;
