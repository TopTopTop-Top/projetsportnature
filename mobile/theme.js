import { Platform } from "react-native";

/**
 * RavitoBox — tokens uniques Figma Relais.
 * Toute la UI doit passer par ce fichier (pas de hex ad hoc).
 */

const fontSans = Platform.select({
  web: "'Manrope', 'Segoe UI', system-ui, -apple-system, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

const fontDisplay = Platform.select({
  web: "'Manrope', system-ui, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: undefined,
});

const primary = "#2D5A4C";
const ink = "#1A2E28";
const inkMuted = "#6B7A72";
const danger = "#C45C3A";
const warn = "#A67C2D";

export const theme = {
  // Surfaces
  bg: "#F6F8F1",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2E8",
  ink,
  inkMuted,
  border: "#D7E0D6",
  borderSoft: "#E8EEE4",

  // Marque
  hero: "#1F3F36",
  heroAccent: "#C5D98A",

  // CTA
  primary,
  primaryPressed: "#23483D",
  primarySoft: "#E4EFE9",

  secondary: ink,
  secondaryInk: ink,
  accent: primary,
  accentSoft: "#E4EFE9",
  focus: primary,
  focusSoft: "rgba(45, 90, 76, 0.14)",
  focusMid: "rgba(45, 90, 76, 0.28)",

  lime: "#D8E8A0",
  limeInk: primary,

  picked: primary,
  pickedSoft: "#E8F3EE",
  mapTeal: "#3A7A68",

  chipBg: "#EEF2E8",
  chipBorder: "#D7E0D6",
  infoBg: "#EEF2E8",
  infoBorder: "#D7E0D6",
  warnBg: "#FFF5E6",
  warnBorder: "#E8C99A",
  warn,
  danger,
  dangerSoft: "#FCEEE8",
  success: primary,
  successSoft: "#E4EFE9",
  shadow: "rgba(26, 46, 40, 0.08)",
  white: "#FFFFFF",
  overlay: "rgba(26, 46, 40, 0.45)",

  /** Badges / états — une seule famille (forêt / lime / ambre / terre) */
  status: {
    pending: { fg: warn, bg: "#FFF5E6", border: "#E8C99A" },
    validated: { fg: primary, bg: "#E4EFE9", border: "#C5D9CF" },
    pay: { fg: primary, bg: "#D8E8A0", border: "#C5D98A" },
    rejected: { fg: danger, bg: "#FCEEE8", border: "#F0C9BC" },
    cancelled: { fg: danger, bg: "#FCEEE8", border: "#F0C9BC" },
    muted: { fg: inkMuted, bg: "#EEF2E8", border: "#D7E0D6" },
    easy: { fg: primary, bg: "#E4EFE9", border: "#C5D9CF" },
    medium: { fg: warn, bg: "#FFF5E6", border: "#E8C99A" },
    hard: { fg: danger, bg: "#FCEEE8", border: "#F0C9BC" },
  },

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
      background: rgba(45, 90, 76, 0.2);
    }
  `;
  document.head.appendChild(style);
}

export default theme;
