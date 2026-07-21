/**
 * Langage visuel commun — sélection carte (waypoints, box, survol panneau).
 * Aligné sur le thème outdoor (teal forêt), anneaux doux, pas de flash.
 */
import { theme } from "./theme";

export const MAP_SEL = {
  focus: theme.focus,
  focusSoft: theme.focusSoft,
  focusMid: "rgba(13, 115, 119, 0.28)",
  spotlight: theme.accent,
  spotlightSoft: "rgba(194, 65, 12, 0.14)",
  spotlightMid: "rgba(194, 65, 12, 0.26)",
  white: theme.white,
  ink: theme.ink,
  muted: theme.inkMuted,
  pointPlan: "#64748B",
  pointDraft: theme.primary,
  pointShared: "#B45309",
  pointTip: "#0F766E",
  boxPlan: "#0F766E",
  boxDefault: "#0D7377",
};

/** @typedef {'idle' | 'hover' | 'focus' | 'spotlight'} MapSelectionTier */

export function selectionAccent(tier) {
  return tier === "spotlight" ? MAP_SEL.spotlight : MAP_SEL.focus;
}

export function selectionSoftFill(tier) {
  return tier === "spotlight" ? MAP_SEL.spotlightSoft : MAP_SEL.focusSoft;
}

export function selectionMidFill(tier) {
  return tier === "spotlight" ? MAP_SEL.spotlightMid : MAP_SEL.focusMid;
}

/**
 * Anneaux de sélection (même géométrie pour points GPS et box).
 * @param {typeof import('leaflet')} L
 * @param {import('leaflet').LayerGroup} group
 * @param {number} lat
 * @param {number} lng
 * @param {MapSelectionTier} tier
 * @param {string} [pane]
 */
export function addSelectionHalos(L, group, lat, lng, tier, pane) {
  if (!L || !group || tier === "idle") return;
  const latlng = [lat, lng];
  const base = pane ? { pane } : {};
  const accent = selectionAccent(tier);

  const nonInteractive = { interactive: false, bubblingMouseEvents: false };

  if (tier === "hover") {
    L.circleMarker(latlng, {
      ...base,
      ...nonInteractive,
      radius: 17,
      color: accent,
      weight: 2,
      fillColor: selectionSoftFill(tier),
      fillOpacity: 1,
    }).addTo(group);
    return;
  }

  L.circleMarker(latlng, {
    ...base,
    ...nonInteractive,
    radius: 26,
    color: accent,
    weight: 1.5,
    fillColor: selectionSoftFill(tier),
    fillOpacity: 1,
    opacity: 0.95,
  }).addTo(group);
  L.circleMarker(latlng, {
    ...base,
    ...nonInteractive,
    radius: 16,
    color: MAP_SEL.white,
    weight: 2.5,
    fillColor: selectionMidFill(tier),
    fillOpacity: 1,
  }).addTo(group);
}

/**
 * Style Leaflet circleMarker pour un point carte.
 * @param {string} [source] plan | draft | shared_preview | tip
 * @param {MapSelectionTier} tier
 */
export function mapPointCircleStyle(source, tier = "idle") {
  const idleFill = {
    plan: MAP_SEL.pointPlan,
    draft: MAP_SEL.pointDraft,
    shared_preview: MAP_SEL.pointShared,
    shared: MAP_SEL.pointShared,
    tip: MAP_SEL.pointTip,
  };
  const fill =
    tier === "idle"
      ? idleFill[source] || MAP_SEL.pointPlan
      : selectionAccent(tier === "spotlight" ? "spotlight" : "focus");
  return {
    radius: 10,
    color: MAP_SEL.white,
    weight: tier === "idle" ? 2 : 2.5,
    fillColor: fill,
    fillOpacity: 1,
  };
}

export function mapPointSourceFromMeta(meta) {
  if (!meta?.source) return "plan";
  if (meta.source === "draft") return "draft";
  if (meta.source === "shared_preview" || meta.source === "shared")
    return "shared_preview";
  if (meta.source === "tip") return "tip";
  return "plan";
}

export function boxSelectionTier({
  isSpotlight,
  isPanelFocused,
  isHighlighted,
}) {
  if (isSpotlight) return "spotlight";
  if (isPanelFocused) return "focus";
  if (isHighlighted) return "hover";
  return "idle";
}

export const MAP_CHIP_TOOLTIP_CLASS = "ravitobox-map-chip";

/** Surbrillance panneau latéral (alignée sur la carte). */
export const MAP_PANEL_SELECTION = {
  borderColor: MAP_SEL.focus,
  borderWidth: 2,
  backgroundColor: MAP_SEL.focusSoft,
};

export const MAP_SELECTION_LEAFLET_CSS = `
  .leaflet-tooltip.ravitobox-map-chip {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${MAP_SEL.ink};
    border: none;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(13, 115, 119, 0.16);
    border-radius: 10px;
    padding: 6px 11px;
    white-space: nowrap;
  }
  .leaflet-tooltip.ravitobox-map-chip--active {
    box-shadow: 0 6px 22px rgba(13, 115, 119, 0.22), 0 0 0 2px ${MAP_SEL.focus};
  }
  .leaflet-tooltip.ravitobox-map-chip--spotlight {
    box-shadow: 0 6px 22px rgba(194, 65, 12, 0.2), 0 0 0 2px ${MAP_SEL.spotlight};
  }
  .leaflet-div-icon.ravitobox-box-house-active {
    filter: drop-shadow(0 4px 14px rgba(13, 115, 119, 0.38));
  }
  .leaflet-div-icon.ravitobox-box-house-spotlight {
    filter: drop-shadow(0 4px 14px rgba(194, 65, 12, 0.4));
  }
`;
