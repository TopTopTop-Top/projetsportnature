import { Platform } from "react-native";

/**
 * RavitoBox — palette outdoor adaptée (trail / ravito / nature).
 * Vert forêt = marque & actions. Neutres froids pierre. Pas d’orange « startup ».
 * Menthe = accent sur fonds sombres. Teal carte = traces / box.
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
  // Surfaces — pierre froide (pas crème, pas gris zinc plat)
  bg: "#EFF2F0",
  surface: "#FFFFFF",
  surfaceMuted: "#E6EBE8",
  ink: "#101614",
  inkMuted: "#5A635E",
  border: "#D0D7D3",
  borderSoft: "#E2E7E4",

  // Marque — forêt nuit + menthe
  hero: "#101614",
  heroAccent: "#5ECFB0",

  // Action principale — teal trail (eau / nature / ravito)
  primary: "#0F7A65",
  primaryPressed: "#0A5C4C",
  primarySoft: "#E6F5F1",

  secondary: "#101614",
  secondaryInk: "#101614",
  accent: "#0F7A65",
  accentSoft: "#E6F5F1",
  focus: "#0F7A65",
  focusSoft: "rgba(15, 122, 101, 0.14)",

  // Carte / sélection nature
  picked: "#0B6B58",
  pickedSoft: "#E8F7F2",
  mapTeal: "#0D8F78",

  chipBg: "#E6EBE8",
  chipBorder: "#D0D7D3",
  infoBg: "#E6EBE8",
  infoBorder: "#D0D7D3",
  warnBg: "#FFF8EB",
  warnBorder: "#E8D29A",
  danger: "#C43C3C",
  dangerSoft: "#FCEEEE",
  success: "#0F7A65",
  shadow: "rgba(16, 22, 20, 0.08)",
  white: "#FFFFFF",

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
      background: rgba(15, 122, 101, 0.2);
    }
  `;
  document.head.appendChild(style);
}

export default theme;
