import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
import {
  formatTrailProbeLabel,
  formatTrailProbeCoords,
  getTrailProgressSlice,
  getTrailRemainderSlice,
  probeTrailAt,
} from "./trailProfile";

function drawTrailProbeOnMap(L, probeLayer, probe, trail, lineColor, locked) {
  try {
    probeLayer.clearLayers();
  } catch (_e) {
    return;
  }
  if (!probe || !trail) return;
  const color = lineColor || "#0F766E";
  const remainder = getTrailRemainderSlice(trail, probe.distKm);
  const lineOpts = { pane: PROBE_LINE_PANE };
  if (remainder && remainder.length >= 2) {
    L.polyline(remainder, {
      ...lineOpts,
      color: "#64748B",
      weight: 6,
      opacity: 0.28,
      lineCap: "round",
      lineJoin: "round",
      dashArray: "10 14",
    }).addTo(probeLayer);
  }
  const progress = getTrailProgressSlice(trail, probe.distKm);
  if (progress && progress.length >= 2) {
    L.polyline(progress, {
      ...lineOpts,
      color: "#FFFFFF",
      weight: locked ? 18 : 22,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(probeLayer);
    L.polyline(progress, {
      ...lineOpts,
      color,
      weight: locked ? 11 : 14,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(probeLayer);
    L.polyline(progress, {
      ...lineOpts,
      color: "#FBBF24",
      weight: locked ? 6 : 7,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(probeLayer);
  }
  const marker = L.circleMarker([probe.lat, probe.lng], {
    pane: PROBE_MARKER_PANE,
    radius: locked ? 14 : 12,
    color: "#FFFFFF",
    weight: locked ? 5 : 4,
    fillColor: "#EA580C",
    fillOpacity: 1,
  });
  const km = Number(probe.distKm || 0).toFixed(1);
  const tipText = locked
    ? `${km} km · point figé`
    : formatTrailProbeLabel(probe);
  marker.bindTooltip(tipText, {
    permanent: !!locked,
    direction: "top",
    offset: [0, -12],
    className: "ravitobox-trail-probe-tip",
  });
  if (locked) marker.openTooltip();
  marker.addTo(probeLayer);
  try {
    marker.bringToFront?.();
    probeLayer.bringToFront?.();
  } catch (_e) {
    /* noop */
  }
}

function drawSavedProbesOnMap(
  L,
  probeLayer,
  savedProbes,
  { onHover, onClick, markerRegistry } = {}
) {
  if (!Array.isArray(savedProbes) || !savedProbes.length) return;
  savedProbes.forEach((entry, index) => {
    const p = entry?.probe;
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const n = index + 1;
    const pointId = `draft-${entry.id ?? index}`;
    const marker = L.circleMarker([p.lat, p.lng], {
      pane: PROBE_MARKER_PANE,
      radius: 9,
      color: "#FFFFFF",
      weight: 2.5,
      fillColor: "#0F766E",
      fillOpacity: 1,
    });
    const noteLine =
      entry?.notes && String(entry.notes).trim()
        ? `Note : ${escapeHtml(String(entry.notes).trim())}`
        : "";
    const tip = [
      entry?.label || `Point ${n}`,
      formatTrailProbeLabel(p),
      formatTrailProbeCoords(p),
      noteLine,
    ]
      .filter(Boolean)
      .join("<br/>");
    marker.bindTooltip(tip, {
      permanent: false,
      direction: "top",
      offset: [0, -12],
      className: "ravitobox-trail-probe-tip",
    });
    if (onHover || onClick) {
      attachMapPointHandlers(marker, pointId, {
        onHover,
        onClick,
        point: {
          id: pointId,
          lat: p.lat,
          lon: p.lng,
          note: entry.notes,
          label: entry.label || `Brouillon ${n}`,
          source: "draft",
          entryId: entry.id,
        },
      });
    }
    marker.addTo(probeLayer);
    if (markerRegistry) {
      markerRegistry.set(pointId, {
        marker,
        meta: { source: "draft", baseRadius: 9, baseWeight: 2.5 },
      });
    }
    try {
      marker.bringToFront?.();
    } catch (_e) {
      /* noop */
    }
  });
}

function attachMapPointHandlers(marker, pointId, { onHover, onClick, point }) {
  if (onHover) {
    marker.on("mouseover", () => onHover(pointId));
    marker.on("mouseout", () => onHover(null));
  }
  if (onClick && point) {
    marker.on("click", (ev) => {
      try {
        ev?.originalEvent?.stopPropagation?.();
      } catch (_e) {
        /* noop */
      }
      onClick(point);
    });
  }
}

function attachMapPointTooltipHandlers(
  L,
  marker,
  pointId,
  { onHover, onClick, point }
) {
  if (!onHover && !(onClick && point)) return;
  marker.on("tooltipopen", (ev) => {
    const el = ev?.tooltip?.getElement?.();
    if (!el || el.__ravitoboxPointHandlersAttached) return;
    el.__ravitoboxPointHandlersAttached = true;
    if (onHover) {
      L.DomEvent.on(el, "mouseover", () => onHover(pointId));
      L.DomEvent.on(el, "mouseout", () => onHover(null));
    }
    if (onClick && point) {
      L.DomEvent.on(el, "click", (domEvent) => {
        try {
          L.DomEvent.stopPropagation(domEvent);
        } catch (_e) {
          /* noop */
        }
        onClick(point);
      });
    }
  });
}

function findNearbyBox(map, latlng, boxes, maxPx = 30) {
  if (!map || !latlng || !Array.isArray(boxes) || boxes.length === 0) {
    return null;
  }
  let clickPoint = null;
  try {
    clickPoint = map.latLngToLayerPoint(latlng);
  } catch (_e) {
    return null;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const box of boxes) {
    const lat = Number(box?.latitude);
    const lon = Number(box?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    try {
      const point = map.latLngToLayerPoint([lat, lon]);
      const distance =
        typeof clickPoint.distanceTo === "function"
          ? clickPoint.distanceTo(point)
          : Math.hypot(clickPoint.x - point.x, clickPoint.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = box;
      }
    } catch (_e) {
      /* noop */
    }
  }
  return best && bestDistance <= maxPx ? best : null;
}

function findNearbyMapPoint(map, latlng, points, maxPx = 26) {
  if (!map || !latlng || !Array.isArray(points) || points.length === 0) {
    return null;
  }
  let clickPoint = null;
  try {
    clickPoint = map.latLngToLayerPoint(latlng);
  } catch (_e) {
    return null;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const pt of points) {
    const lat = Number(pt?.lat);
    const lon = Number(pt?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    try {
      const point = map.latLngToLayerPoint([lat, lon]);
      const distance =
        typeof clickPoint.distanceTo === "function"
          ? clickPoint.distanceTo(point)
          : Math.hypot(clickPoint.x - point.x, clickPoint.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pt;
      }
    } catch (_e) {
      /* ignore malformed point */
    }
  }
  return best && bestDistance <= maxPx ? best : null;
}

function drawCommunityTrailTipsOnMap(
  L,
  layer,
  tips,
  { onHover, onClick, markerRegistry } = {}
) {
  if (!Array.isArray(tips) || !tips.length) return;
  if (markerRegistry) markerRegistry.clear();
  tips.forEach((tip, index) => {
    const lat = Number(tip.point_lat);
    const lon = Number(tip.point_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const pointId = `tip-${tip.id ?? index}`;
    const marker = L.circleMarker([lat, lon], {
      pane: PROBE_MARKER_PANE,
      radius: 8,
      color: "#FFFFFF",
      weight: 3,
      fillColor: "#6366F1",
      fillOpacity: 1,
    });
    const lines = [
      tip.label || `Conseil ${index + 1}`,
      tip.author_label ? `Par ${tip.author_label}` : null,
      tip.note || null,
    ].filter(Boolean);
    marker.bindTooltip(lines.join("<br/>"), {
      permanent: false,
      direction: "top",
      offset: [0, -10],
      className: "ravitobox-trail-probe-tip",
    });
    attachMapPointHandlers(marker, pointId, {
      onHover,
      onClick,
      point: {
        id: pointId,
        lat,
        lon,
        note: tip.note,
        label: tip.label,
        source: "tip",
        tipId: tip.id,
      },
    });
    marker.addTo(layer);
    if (markerRegistry) {
      markerRegistry.set(pointId, {
        marker,
        meta: { source: "tip", baseRadius: 8, baseWeight: 3 },
      });
    }
  });
}

function updateRegisteredMapPointStyles(markerRegistry, highlightedId) {
  if (!markerRegistry || typeof markerRegistry.forEach !== "function") return;
  markerRegistry.forEach((entry, id) => {
    const { marker, meta } = entry;
    if (!marker?.setStyle) return;
    const hi = highlightedId === id;
    const isShared = meta?.source === "shared_preview";
    const isDraft = meta?.source === "draft";
    marker.setStyle({
      radius: hi ? 12 : meta.baseRadius,
      color: hi ? "#0F172A" : "#FFFFFF",
      weight: hi ? 3.5 : meta.baseWeight,
      fillColor: isShared ? "#F59E0B" : isDraft ? "#0F766E" : "#0891B2",
      fillOpacity: 1,
    });
    try {
      if (hi) marker.openTooltip?.();
      else marker.closeTooltip?.();
    } catch (_e) {
      /* noop */
    }
  });
}

function drawTrailMapPointsOnMap(
  L,
  layer,
  points,
  { onHover, onClick, markerRegistry, permanentTooltips = false } = {}
) {
  if (!Array.isArray(points) || !points.length) return;
  if (markerRegistry) markerRegistry.clear();
  points.forEach((pt, index) => {
    if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) return;
    const isShared = pt.source === "shared_preview";
    const noteText = pt.note ? String(pt.note).trim() : "";
    const shortNote =
      noteText.length > 48 ? `${noteText.slice(0, 45)}…` : noteText;
    const marker = L.circleMarker([pt.lat, pt.lon], {
      pane: PROBE_MARKER_PANE,
      radius: permanentTooltips ? 10 : 9,
      color: "#FFFFFF",
      weight: 2.5,
      fillColor: isShared ? "#F59E0B" : "#0891B2",
      fillOpacity: 1,
    });
    const tip = [
      `<strong>${index + 1}. ${escapeHtml(pt.label || "Point GPS")}</strong>`,
      noteText ? escapeHtml(noteText) : "<em>Sans texte</em>",
      `${Number(pt.lat).toFixed(5)}°, ${Number(pt.lon).toFixed(5)}°`,
    ]
      .filter(Boolean)
      .join("<br/>");
    const permanentLabel = shortNote
      ? `${index + 1}. ${escapeHtml(shortNote)}`
      : `${index + 1}. ${escapeHtml(pt.label || "GPS")}`;
    marker.bindTooltip(permanentTooltips ? permanentLabel : tip, {
      permanent: permanentTooltips,
      interactive: Boolean(permanentTooltips && (onHover || onClick)),
      direction: "top",
      offset: [0, permanentTooltips ? -14 : -12],
      className: permanentTooltips
        ? "ravitobox-plan-point-label"
        : "ravitobox-trail-probe-tip",
    });
    attachMapPointHandlers(marker, pt.id, { onHover, onClick, point: pt });
    if (permanentTooltips) {
      attachMapPointTooltipHandlers(L, marker, pt.id, {
        onHover,
        onClick,
        point: pt,
      });
    }
    marker.addTo(layer);
    if (markerRegistry) {
      markerRegistry.set(pt.id, {
        marker,
        meta: {
          source: pt.source,
          baseRadius: 9,
          baseWeight: 2.5,
        },
      });
    }
    try {
      marker.bringToFront?.();
    } catch (_e) {
      /* noop */
    }
  });
}

const LEAFLET_TILE_FIX_ID = "ravitobox-leaflet-rnweb-tiles";
const PROBE_LINE_PANE = "ravitoboxProbeLinePane";
const PROBE_MARKER_PANE = "ravitoboxProbeMarkerPane";
const TRAIL_HIT_PANE = "ravitoboxTrailHitPane";
const BOX_MARKER_PANE = "ravitoboxBoxMarkerPane";

function ensureMapPanes(map) {
  if (!map.getPane(PROBE_LINE_PANE)) {
    const linePane = map.createPane(PROBE_LINE_PANE);
    linePane.style.zIndex = "620";
  }
  if (!map.getPane(PROBE_MARKER_PANE)) {
    const markerPane = map.createPane(PROBE_MARKER_PANE);
    markerPane.style.zIndex = "690";
  }
  if (!map.getPane(TRAIL_HIT_PANE)) {
    const hitPane = map.createPane(TRAIL_HIT_PANE);
    hitPane.style.zIndex = "550";
  }
  if (!map.getPane(BOX_MARKER_PANE)) {
    const boxPane = map.createPane(BOX_MARKER_PANE);
    boxPane.style.zIndex = "750";
  }
}

function ensureLeafletTileFix() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LEAFLET_TILE_FIX_ID)) return;
  const s = document.createElement("style");
  s.id = LEAFLET_TILE_FIX_ID;
  s.textContent = `
    .leaflet-container img.leaflet-tile {
      max-width: none !important;
      max-height: none !important;
    }
    .leaflet-container img.leaflet-marker-icon,
    .leaflet-container img.leaflet-marker-shadow {
      max-width: none !important;
    }
    .leaflet-div-icon.ravitobox-trail-pin {
      background: transparent !important;
      border: none !important;
    }
    .leaflet-div-icon.ravitobox-box-house {
      background: transparent !important;
      border: none !important;
    }
    .leaflet-tooltip.ravitobox-trail-probe-tip {
      font-size: 11px;
      font-weight: 700;
      color: #0F172A;
      border: 1px solid #FDBA74;
      background: rgba(255, 251, 235, 0.96);
      box-shadow: 0 2px 6px rgba(15,23,42,0.1);
      padding: 4px 8px;
      white-space: nowrap;
    }
    .leaflet-tooltip.ravitobox-plan-point-label {
      font-size: 11px;
      font-weight: 700;
      color: #0F172A;
      border: 1px solid #F59E0B;
      background: rgba(255,251,235,0.97);
      box-shadow: 0 2px 6px rgba(15,23,42,0.1);
      max-width: 200px;
      white-space: normal;
      line-height: 1.25;
      cursor: pointer;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(s);
}

let leafletIconsPatched = false;

function patchLeafletIcons(L) {
  if (leafletIconsPatched) return;
  leafletIconsPatched = true;
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

/** Tracé au repos : bien visible sans survol (fond OSM + halo blanc). */
const TRAIL_STYLE = { color: "#0F766E", weight: 6.8, opacity: 1 };
const TRAIL_DIFFICULTY_STYLES = {
  easy: { color: "#16A34A", casing: "#DCFCE7" },
  medium: { color: "#D97706", casing: "#FEF3C7" },
  hard: { color: "#DC2626", casing: "#FEE2E2" },
};

/** Couleurs stables par id de trace : plusieurs tracés « difficiles » restent distinguables. */
const TRAIL_DISPLAY_PALETTE = [
  "#92400E",
  "#0369A1",
  "#7C3AED",
  "#0D9488",
  "#CA8A04",
  "#DB2777",
  "#4D7C0F",
  "#4338CA",
];

function trailDisplayColor(trailId, difficultyFallback) {
  const id = Number(trailId);
  if (Number.isFinite(id)) {
    const idx = Math.abs(id) % TRAIL_DISPLAY_PALETTE.length;
    return TRAIL_DISPLAY_PALETTE[idx];
  }
  return (
    TRAIL_DIFFICULTY_STYLES[difficultyFallback]?.color || TRAIL_STYLE.color
  );
}

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

const TRAIL_ACTIVITY_LABELS = {
  hike: "Randonnée",
  trail_run: "Trail / course nature",
  road_bike: "Route (vélo)",
  mtb: "VTT / enduro",
  gravel: "Gravel",
  ski_nordic: "Ski de fond",
  ski_alp: "Ski alpin / rando ski",
  other: "Autre",
};

function parseTrailCriteria(trail) {
  try {
    const raw = trail?.criteria_json;
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function boxWaterLabel(box) {
  const w = box.has_water;
  return w === 1 || w === true || w === "1" ? "Oui" : "Non";
}

function boxVisualStatus(box) {
  const active = Number(box?.is_active ?? 1) !== 0;
  if (!active) {
    return {
      label: "Indisponible",
      bg: "#E2E8F0",
      fg: "#334155",
      stroke: "#94A3B8",
    };
  }
  return {
    label: "Disponible",
    bg: "#D1FAE5",
    fg: "#065F46",
    stroke: "#10B981",
  };
}

function truncateForPopup(text, max) {
  const t = String(text ?? "").trim();
  if (t.length <= max) return escapeHtml(t);
  return `${escapeHtml(t.slice(0, max))}…`;
}

function parseCriteria(box) {
  try {
    const raw = box?.criteria_json;
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function hostRatingLineHtml(box) {
  const n = Number(box.host_review_count || 0);
  const avg = Number(box.host_avg_score || 0);
  const name = box.host_full_name ? `${escapeHtml(box.host_full_name)} · ` : "";
  if (!n) return `${name}<em>Pas encore d'avis</em>`;
  return `${name}<strong>Note hôte ${avg.toFixed(1)}/5</strong> (${n} avis)`;
}

function buildBoxPopupHtml(box) {
  const lines = [
    `<strong>${escapeHtml(box.title)}</strong>`,
    `${escapeHtml(box.city)} · ${(box.price_cents / 100).toFixed(2)} €`,
  ];
  if (box.distance_km != null) {
    lines.push(`≈ ${Number(box.distance_km).toFixed(1)} km`);
  }
  lines.push(hostRatingLineHtml(box));
  lines.push(
    '<hr style="border:none;border-top:1px solid #ccc;margin:6px 0"/>'
  );
  lines.push(
    `Capacité : ${box.capacity_liters ?? "?"} L · Eau : ${boxWaterLabel(box)}`
  );
  if (box.description) {
    lines.push(
      `<span style="font-size:12px;color:#334155">${truncateForPopup(
        box.description,
        220
      )}</span>`
    );
  }
  if (box.availability_note) {
    lines.push(
      `<strong>Disponibilités</strong><br/><span style="font-size:12px;color:#334155">${truncateForPopup(
        box.availability_note,
        300
      )}</span>`
    );
  }
  const criteria = parseCriteria(box);
  if (criteria.length > 0) {
    lines.push(
      `<strong>Critères</strong><br/><span style="font-size:12px;color:#334155">${truncateForPopup(
        criteria.join(" · "),
        300
      )}</span>`
    );
  }
  if (box.criteria_note) {
    lines.push(
      `<strong>Détails</strong><br/><span style="font-size:12px;color:#334155">${truncateForPopup(
        box.criteria_note,
        300
      )}</span>`
    );
  }
  return lines.join("<br/>");
}

function buildTrailPopupHtml(trail, staticOrigin) {
  const raw = trail.gpx_url;
  const gpx =
    raw && staticOrigin
      ? `${staticOrigin}${raw.startsWith("/") ? "" : "/"}${raw}`
      : null;
  const gpxLine = gpx
    ? `<a href="${escapeHtml(gpx)}" target="_blank" rel="noopener">GPX</a>`
    : "";
  const act =
    TRAIL_ACTIVITY_LABELS[trail.activity || "hike"] ||
    String(trail.activity || "—");
  const crit = parseTrailCriteria(trail);
  const lines = [
    `<strong>${escapeHtml(trail.name)}</strong>`,
    `${escapeHtml(trail.territory)} · ${trail.distance_km} km`,
    `<span style="font-size:12px">${escapeHtml(
      DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty
    )} · ${escapeHtml(act)}</span>`,
  ];
  if (crit.length) {
    lines.push(
      `<span style="font-size:12px;color:#334155">${truncateForPopup(
        crit.join(" · "),
        280
      )}</span>`
    );
  }
  if (trail.notes) {
    lines.push(
      `<span style="font-size:12px;color:#334155">${truncateForPopup(
        trail.notes,
        320
      )}</span>`
    );
  }
  lines.push(gpxLine);
  return lines.filter(Boolean).join("<br/>");
}

function trailPinActivityKind(activity) {
  const a = String(activity || "hike");
  if (a === "road_bike" || a === "mtb" || a === "gravel") return "bike";
  return "hike";
}

function buildTrailPinInnerSymbol(kind) {
  if (kind === "bike") {
    return `<g fill="none" stroke="#0f172a" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9" cy="15" r="2.35"/>
      <circle cx="15" cy="15" r="2.35"/>
      <path d="M9 15h2.2l1.3-3.4 1.4 3.4H15"/>
      <path d="M11.2 15l-.9-2.2h3.4"/>
    </g>`;
  }
  /* Randonneur (silhouette lisible dans le médaillon blanc, type pin carte) */
  return `<g fill="#0f172a" transform="translate(12,9.45)">
    <circle cx="0" cy="-3.05" r="1.9"/>
    <path d="M-1.35-0.35c-.45 0-.85.28-1 .7l-1.15 3.25c-.12.35.06.72.4.85.34.12.72-.04.88-.36l.95-2.05.35 1.85-1.1 4.55h1.15l.85-3.9.85 3.9h1.1l-1.25-5.45.55-1.55c.08-.25.02-.52-.15-.72-.18-.2-.45-.32-.73-.32h-2.65z"/>
  </g>`;
}

function buildTrailPinIcon({
  color,
  activity,
  isHovered = false,
  isSelected = false,
  isDimmed = false,
  simpleMedallion = false,
}) {
  const size = isSelected ? 30 : isHovered ? 28 : 26;
  const strokeInner = isSelected ? "#0F172A" : isHovered ? "#111827" : "#1e293b";
  const opacity = isDimmed ? 0.78 : 1;
  const scale = isHovered || isSelected ? 1.06 : 1;
  const kind = trailPinActivityKind(activity);
  const pinPath =
    "M12 21.5c0 0 6.8-6.1 6.8-11.4C18.8 6.4 15.8 3 12 3S5.2 6.4 5.2 10.1C5.2 15.4 12 21.5 12 21.5z";
  const medallion = simpleMedallion
    ? `<circle cx="12" cy="9.15" r="3.2" fill="#ffffff"/>`
    : `<ellipse cx="12" cy="9.4" rx="4.35" ry="4.55" fill="#ffffff" fill-opacity="0.96"/>
      ${buildTrailPinInnerSymbol(kind)}`;
  const html = `<div style="width:${size}px;height:${size}px;opacity:${opacity};transform:scale(${scale});transform-origin:50% 100%;filter:drop-shadow(0 3px 6px rgba(15,23,42,.4));">
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
      <path d="${pinPath}" fill="${color}" stroke="#ffffff" stroke-width="2.35" stroke-linejoin="round"/>
      <path d="${pinPath}" fill="${color}" stroke="${strokeInner}" stroke-width="1.25" stroke-linejoin="round"/>
      ${medallion}
    </svg>
  </div>`;
  return { html, size };
}

function buildBoxHouseDivIcon(L, opts) {
  const {
    isSelected,
    isHighlighted,
    isPlanBox,
    isCompatible,
    dimIncompatibleBoxes,
    status,
  } = opts;
  const w = isSelected || isHighlighted ? 30 : 26;
  const stroke = isHighlighted
    ? "#EA580C"
    : isSelected
    ? isPlanBox
      ? "#4C1D95"
      : "#0F172A"
    : isPlanBox
    ? "#7C3AED"
    : dimIncompatibleBoxes && !isCompatible
    ? "#94A3B8"
    : status.stroke;
  const fill = isHighlighted
    ? isPlanBox
      ? "#FED7AA"
      : "#FEF3C7"
    : isSelected
    ? isPlanBox
      ? "#A78BFA"
      : "#14B8A6"
    : isPlanBox
    ? "#F5F3FF"
    : dimIncompatibleBoxes && !isCompatible
    ? "#E2E8F0"
    : "#FFFFFF";
  const opacity =
    dimIncompatibleBoxes && !isCompatible && !isHighlighted ? 0.65 : 1;
  const html = `<div style="width:${w}px;height:${w}px;opacity:${opacity};filter:drop-shadow(0 2px 5px rgba(15,23,42,.28));">
    <svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-7h-5v7H5a1 1 0 01-1-1v-9.5z" fill="${fill}" stroke="${stroke}" stroke-width="1.35" stroke-linejoin="round"/>
    </svg>
  </div>`;
  return L.divIcon({
    className: "ravitobox-box-house",
    html,
    iconSize: [w, w],
    iconAnchor: [Math.round(w / 2), Math.round(w * 0.95)],
  });
}

function normalizePoint(point) {
  if (Array.isArray(point) && point.length >= 2) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return null;
  }
  if (point && typeof point === "object") {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  }
  return null;
}

/**
 * Carte web : Leaflet + tuiles OSM (raster).
 * - La map est créée une seule fois (useLayoutEffect dépend seulement de inFixedPane).
 * - box / tracés : couche mise à jour sans recréer L.map.
 */
const ExplorerWebMap = memo(function ExplorerWebMap({
  center,
  boxes,
  trails,
  selectedTrailIds = [],
  selectedTrailId = null,
  hoveredTrailId = null,
  selectedBoxId,
  selectedBoxIds = [],
  planBoxIds = [],
  compatibleBoxIds = [],
  proximityTrailIds = [],
  trailCorridorKm = 2,
  dimIncompatibleBoxes = false,
  onSelectBox,
  onSelectTrail,
  onHoverTrail,
  /** { distKm, gainM, lat, lng, ... } le long de la trace sélectionnée */
  onTrailProbe,
  /** Sonde pilotée par le parent (ex. survol du profil altimétrique). */
  trailProbe = null,
  /** Quand true, la carte ne efface pas la sonde au mouseout (survol courbe / clic). */
  lockTrailProbe = false,
  /** Clic sur le tracé : verrouille la sonde (coords + tooltip). */
  onTrailProbeLock,
  /** Désactive la sonde dynamique quand la carte sert d’aperçu cliquable. */
  enableTrailProbe = true,
  /** Points mémorisés sur la trace active (affichés sur la carte). */
  savedTrailProbes = [],
  /** Conseils publics sur la trace. */
  communityTrailTips = [],
  /** Points GPS du plan actif / aperçu communauté. */
  trailMapPoints = [],
  /** Étiquettes visibles en permanence sur les points plan (onglet Plans). */
  planPointLabelsPermanent = false,
  /** Id du point survolé (panneau ↔ carte). */
  highlightedMapPointId = null,
  onMapPointHover,
  onMapPointClick,
  highlightedPlanBoxId = null,
  onPlanBoxHover,
  /** Appui long hors tracé → quitter la trace sélectionnée. */
  onRequestExitTrailSelection,
  onMapLongPress,
  onPickLocation,
  onVisibleBoundsChange,
  /** Appelé après un déplacement manuel (drag) — pour découpler la caméra de la recherche. */
  onUserMapGesture,
  draftPoint,
  /** Repère visuel du dernier clic (coordonnées) — explorateur carte. */
  pickedMapPoint = null,
  pickerMode = false,
  staticOrigin = "",
  inFixedPane = false,
  /** Quand false : ne recentre pas la carte sur les données (évite les boucles avec chargement par viewport). */
  autoFitToData = true,
  /** Si renseigné, le fit automatique ne se rejoue que lorsque cette clé change. */
  autoFitDataKey = null,
  /** Quand false : ignore les changements de `center` venant du parent (pan / zoom utilisateur préservés). */
  followExternalCenter = true,
  /** Chaque incrément force un setView (ex. sync GPS depuis Mes box). */
  recenterNonce = 0,
}) {
  const pickedTrailSet = useMemo(
    () =>
      new Set(
        (selectedTrailIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [selectedTrailIds]
  );
  const activeTrailIdNum = useMemo(() => {
    const n = Number(selectedTrailId);
    return Number.isFinite(n) ? n : null;
  }, [selectedTrailId]);
  const selectedBoxSet = useMemo(
    () =>
      new Set(
        (selectedBoxIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [selectedBoxIds]
  );
  const compatibleBoxSet = useMemo(
    () =>
      new Set(
        (compatibleBoxIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [compatibleBoxIds]
  );
  const planBoxSet = useMemo(
    () =>
      new Set(
        (planBoxIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [planBoxIds]
  );
  const proximityTrailSet = useMemo(
    () =>
      new Set(
        (proximityTrailIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [proximityTrailIds]
  );
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const lastRecenterNonceRef = useRef(0);
  const onSelectBoxRef = useRef(onSelectBox);
  onSelectBoxRef.current = onSelectBox;
  const onSelectTrailRef = useRef(onSelectTrail);
  onSelectTrailRef.current = onSelectTrail;
  const onHoverTrailRef = useRef(onHoverTrail);
  onHoverTrailRef.current = onHoverTrail;
  const onTrailProbeRef = useRef(onTrailProbe);
  onTrailProbeRef.current = onTrailProbe;
  const trailProbeRef = useRef(trailProbe);
  trailProbeRef.current = trailProbe;
  const lockTrailProbeRef = useRef(lockTrailProbe);
  lockTrailProbeRef.current = lockTrailProbe;
  const onTrailProbeLockRef = useRef(onTrailProbeLock);
  onTrailProbeLockRef.current = onTrailProbeLock;
  const enableTrailProbeRef = useRef(enableTrailProbe);
  enableTrailProbeRef.current = enableTrailProbe;
  const probeLayerRef = useRef(null);
  const savedProbeLayerRef = useRef(null);
  const communityTipsLayerRef = useRef(null);
  const planMapPointsLayerRef = useRef(null);
  const probeMarkerRef = useRef(null);
  const onRequestExitTrailSelectionRef = useRef(onRequestExitTrailSelection);
  onRequestExitTrailSelectionRef.current = onRequestExitTrailSelection;
  const communityTrailTipsRef = useRef(communityTrailTips);
  communityTrailTipsRef.current = communityTrailTips;
  const onMapLongPressRef = useRef(onMapLongPress);
  onMapLongPressRef.current = onMapLongPress;
  const selectedBoxIdRef = useRef(selectedBoxId);
  selectedBoxIdRef.current = selectedBoxId;
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;
  const activeTrailIdRef = useRef(selectedTrailId);
  activeTrailIdRef.current = selectedTrailId;
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const savedTrailProbesRef = useRef(savedTrailProbes);
  savedTrailProbesRef.current = savedTrailProbes;
  const trailMapPointsRef = useRef(trailMapPoints);
  trailMapPointsRef.current = trailMapPoints;
  const planPointLabelsPermanentRef = useRef(planPointLabelsPermanent);
  planPointLabelsPermanentRef.current = planPointLabelsPermanent;
  const highlightedMapPointIdRef = useRef(highlightedMapPointId);
  highlightedMapPointIdRef.current = highlightedMapPointId;
  const onMapPointHoverRef = useRef(onMapPointHover);
  onMapPointHoverRef.current = onMapPointHover;
  const onMapPointClickRef = useRef(onMapPointClick);
  onMapPointClickRef.current = onMapPointClick;
  const highlightedPlanBoxIdRef = useRef(highlightedPlanBoxId);
  highlightedPlanBoxIdRef.current = highlightedPlanBoxId;
  const onPlanBoxHoverRef = useRef(onPlanBoxHover);
  onPlanBoxHoverRef.current = onPlanBoxHover;
  const planPointMarkersRef = useRef(new Map());
  const communityTipMarkersRef = useRef(new Map());
  const draftPointMarkersRef = useRef(new Map());
  const lastAutoFitDataKeyRef = useRef(null);
  const mapZoomingRef = useRef(false);
  const onVisibleBoundsChangeRef = useRef(onVisibleBoundsChange);
  onVisibleBoundsChangeRef.current = onVisibleBoundsChange;
  const onUserMapGestureRef = useRef(onUserMapGesture);
  onUserMapGestureRef.current = onUserMapGesture;
  const [hoveredTrailLocalId, setHoveredTrailLocalId] = useState(null);
  const effectiveHoveredTrailId = useMemo(() => {
    const external = Number(hoveredTrailId);
    if (Number.isFinite(external)) return external;
    const local = Number(hoveredTrailLocalId);
    return Number.isFinite(local) ? local : null;
  }, [hoveredTrailId, hoveredTrailLocalId]);
  const hasHoveredTrail = Number.isFinite(effectiveHoveredTrailId);

  const mapStyle = useMemo(
    () =>
      inFixedPane
        ? { height: "100%", width: "100%", minHeight: 200, borderRadius: 12 }
        : { height: 420, width: "100%", borderRadius: 12 },
    [inFixedPane]
  );

  useLayoutEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const el = containerRef.current;
    if (!el) return undefined;

    ensureLeafletTileFix();
    // eslint-disable-next-line global-require
    const L = require("leaflet");
    // eslint-disable-next-line global-require
    require("leaflet/dist/leaflet.css");
    patchLeafletIcons(L);

    const map = L.map(el, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([center[0], center[1]], pickerMode ? 17 : 12);
    ensureMapPanes(map);

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
    });
    osm.addTo(map);

    const overlay = L.featureGroup().addTo(map);
    const probeLayer = L.featureGroup().addTo(map);
    const savedProbeLayer = L.featureGroup().addTo(map);
    const communityTipsLayer = L.featureGroup().addTo(map);
    const planMapPointsLayer = L.featureGroup().addTo(map);
    mapRef.current = map;
    overlayRef.current = overlay;
    probeLayerRef.current = probeLayer;
    savedProbeLayerRef.current = savedProbeLayer;
    communityTipsLayerRef.current = communityTipsLayer;
    planMapPointsLayerRef.current = planMapPointsLayer;
    probeMarkerRef.current = null;

    let exitTrailTimer = null;
    const EXIT_TRAIL_MS = 650;
    const exitTrailMaxSnapKm = 2.5;
    const clearExitTrailTimer = () => {
      if (exitTrailTimer) {
        clearTimeout(exitTrailTimer);
        exitTrailTimer = null;
      }
    };
    map.on("mousedown", (ev) => {
      const tid = Number(activeTrailIdRef.current);
      if (!Number.isFinite(tid)) return;
      const lat = Number(ev?.latlng?.lat);
      const lng = Number(ev?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const activeTrail = (trailsRef.current || []).find(
        (t) => Number(t.id) === tid
      );
      if (!activeTrail) return;
      const snap = probeTrailAt(activeTrail, lat, lng);
      if (snap && snap.distToPointKm <= exitTrailMaxSnapKm) {
        clearExitTrailTimer();
        return;
      }
      clearExitTrailTimer();
      exitTrailTimer = setTimeout(() => {
        exitTrailTimer = null;
        onRequestExitTrailSelectionRef.current?.();
      }, EXIT_TRAIL_MS);
    });
    map.on("mouseup", clearExitTrailTimer);
    map.on("mouseleave", clearExitTrailTimer);
    map.on("dragstart", clearExitTrailTimer);

    const emitBounds = () => {
      const fn = onVisibleBoundsChangeRef.current;
      if (typeof fn !== "function") return;
      try {
        const b = map.getBounds();
        if (!b || typeof b.isValid !== "function" || !b.isValid()) return;
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        fn({
          south: sw.lat,
          west: sw.lng,
          north: ne.lat,
          east: ne.lng,
        });
      } catch (_e) {
        /* ignore */
      }
    };
    map.on("moveend", emitBounds);
    map.on("zoomstart", () => {
      mapZoomingRef.current = true;
    });
    map.on("zoomend", () => {
      mapZoomingRef.current = false;
      emitBounds();
    });
    map.on("dragend", () => {
      const fn = onUserMapGestureRef.current;
      if (typeof fn === "function") fn();
    });
    map.on("contextmenu", (ev) => {
      const lat = Number(ev?.latlng?.lat);
      const lng = Number(ev?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      onMapLongPressRef.current?.(lat, lng);
    });
    setTimeout(emitBounds, 0);

    map.on("click", (ev) => {
      const lat = Number(ev?.latlng?.lat);
      const lng = Number(ev?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const nearbyBox = findNearbyBox(
        map,
        ev.latlng,
        boxesRef.current || [],
        32
      );
      if (nearbyBox) {
        try {
          L.DomEvent.stopPropagation(ev);
          if (ev?.originalEvent) L.DomEvent.stop(ev.originalEvent);
        } catch (_e) {
          /* noop */
        }
        onPlanBoxHoverRef.current?.(Number(nearbyBox.id));
        onSelectBoxRef.current?.(nearbyBox.id);
        return;
      }

      const nearbyPoint = findNearbyMapPoint(
        map,
        ev.latlng,
        trailMapPointsRef.current || []
      );
      if (nearbyPoint) {
        try {
          L.DomEvent.stopPropagation(ev);
          if (ev?.originalEvent) L.DomEvent.stop(ev.originalEvent);
        } catch (_e) {
          /* noop */
        }
        onMapPointHoverRef.current?.(nearbyPoint.id);
        onMapPointClickRef.current?.(nearbyPoint);
        return;
      }

      const tid = Number(activeTrailIdRef.current);
      const activeTrail =
        Number.isFinite(tid) &&
        (trailsRef.current || []).find((t) => Number(t.id) === tid);
      const onTrail =
        activeTrail &&
        (() => {
          const probe = probeTrailAt(activeTrail, lat, lng);
          return probe && probe.distToPointKm <= 2.5;
        })();

      if (lockTrailProbeRef.current) {
        if (onTrail && enableTrailProbeRef.current) {
          const probe = probeTrailAt(activeTrail, lat, lng);
          const fullProbe = { ...probe, trailId: tid, source: "map" };
          onTrailProbeRef.current?.(fullProbe);
          return;
        }
        onTrailProbeLockRef.current?.(false);
        onTrailProbeRef.current?.(null);
        return;
      }

      if (enableTrailProbeRef.current && activeTrail && onTrail) {
        try {
          L.DomEvent.stopPropagation(ev);
        } catch (_e) {
          /* noop */
        }
        const probe = probeTrailAt(activeTrail, lat, lng);
        const fullProbe = { ...probe, trailId: tid, source: "map" };
        onTrailProbeRef.current?.(fullProbe);
        onTrailProbeLockRef.current?.(true);
        return;
      }
      if (typeof onPickLocationRef.current === "function") {
        onPickLocationRef.current?.(lat, lng);
      }
    });

    let raf = 0;
    const scheduleInvalidate = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        map.invalidateSize();
      });
    };
    const onWindowResize = () => scheduleInvalidate();
    window.addEventListener("resize", onWindowResize);
    scheduleInvalidate();

    return () => {
      clearExitTrailTimer();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      probeLayerRef.current = null;
      savedProbeLayerRef.current = null;
      communityTipsLayerRef.current = null;
      planMapPointsLayerRef.current = null;
      probeMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte unique, centre géré ailleurs
  }, [inFixedPane, pickerMode]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const map = mapRef.current;
    const probeLayer = probeLayerRef.current;
    if (!map || !probeLayer) return undefined;

    const clearLiveProbeVisual = () => {
      try {
        probeLayer.clearLayers();
      } catch (_e) {
        /* noop */
      }
      probeMarkerRef.current = null;
    };

    const emitProbe = (probe) => {
      const fn = onTrailProbeRef.current;
      if (typeof fn === "function") fn(probe);
    };

    if (!enableTrailProbe || activeTrailIdNum == null) {
      clearLiveProbeVisual();
      emitProbe(null);
      return undefined;
    }

    const activeTrail = (trails || []).find(
      (t) => Number(t.id) === activeTrailIdNum
    );
    if (!activeTrail) {
      clearLiveProbeVisual();
      emitProbe(null);
      return undefined;
    }

    const maxSnapKm = 2.5;

    const handleMove = (ev) => {
      if (lockTrailProbeRef.current) return;
      const lat = Number(ev?.latlng?.lat);
      const lng = Number(ev?.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const nearbyPoint = findNearbyMapPoint(
        map,
        ev.latlng,
        trailMapPointsRef.current || [],
        22
      );
      if (nearbyPoint) {
        clearLiveProbeVisual();
        emitProbe(null);
        return;
      }
      const probe = probeTrailAt(activeTrail, lat, lng);
      if (!probe || probe.distToPointKm > maxSnapKm) {
        clearLiveProbeVisual();
        emitProbe(null);
        return;
      }
      const fullProbe = { ...probe, trailId: activeTrailIdNum, source: "map" };
      emitProbe(fullProbe);
      try {
        const L = require("leaflet");
        const lineColor = trailDisplayColor(
          activeTrail.id,
          activeTrail.difficulty
        );
        drawTrailProbeOnMap(
          L,
          probeLayer,
          fullProbe,
          activeTrail,
          lineColor,
          false
        );
      } catch (_e) {
        /* noop */
      }
    };

    const handleLeave = () => {
      if (lockTrailProbeRef.current || mapZoomingRef.current) return;
      clearLiveProbeVisual();
      emitProbe(null);
    };

    map.on("mousemove", handleMove);
    map.on("mouseout", handleLeave);

    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", handleLeave);
      if (!lockTrailProbeRef.current) {
        clearLiveProbeVisual();
        emitProbe(null);
      }
    };
  }, [activeTrailIdNum, enableTrailProbe, trails]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const savedLayer = savedProbeLayerRef.current;
    if (!savedLayer) return undefined;
    const L = require("leaflet");
    const tid = activeTrailIdNum;
    try {
      savedLayer.clearLayers();
    } catch (_e) {
      /* noop */
    }
    if (tid != null) {
      const saved = (savedTrailProbesRef.current || []).filter(
        (e) => Number(e?.trailId) === tid
      );
      drawSavedProbesOnMap(L, savedLayer, saved, {
        markerRegistry: draftPointMarkersRef.current,
        onHover: (id) => onMapPointHoverRef.current?.(id),
        onClick: (pt) => onMapPointClickRef.current?.(pt),
      });
    }
    return undefined;
  }, [savedTrailProbes, activeTrailIdNum]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const layer = communityTipsLayerRef.current;
    if (!layer) return undefined;
    const L = require("leaflet");
    try {
      layer.clearLayers();
    } catch (_e) {
      /* noop */
    }
    if (activeTrailIdNum != null) {
      drawCommunityTrailTipsOnMap(
        L,
        layer,
        communityTrailTipsRef.current || [],
        {
          markerRegistry: communityTipMarkersRef.current,
          onHover: (id) => onMapPointHoverRef.current?.(id),
          onClick: (pt) => onMapPointClickRef.current?.(pt),
        }
      );
    }
    return undefined;
  }, [communityTrailTips, activeTrailIdNum]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const layer = planMapPointsLayerRef.current;
    if (!layer) return undefined;
    const L = require("leaflet");
    try {
      layer.clearLayers();
    } catch (_e) {
      /* noop */
    }
    if (activeTrailIdNum != null) {
      drawTrailMapPointsOnMap(L, layer, trailMapPointsRef.current || [], {
        markerRegistry: planPointMarkersRef.current,
        onHover: (id) => onMapPointHoverRef.current?.(id),
        onClick: (pt) => onMapPointClickRef.current?.(pt),
        permanentTooltips: Boolean(planPointLabelsPermanentRef.current),
      });
    }
    return undefined;
  }, [trailMapPoints, activeTrailIdNum, planPointLabelsPermanent]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const hi = highlightedMapPointIdRef.current;
    updateRegisteredMapPointStyles(planPointMarkersRef.current, hi);
    updateRegisteredMapPointStyles(communityTipMarkersRef.current, hi);
    updateRegisteredMapPointStyles(draftPointMarkersRef.current, hi);
    return undefined;
  }, [highlightedMapPointId]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const probeLayer = probeLayerRef.current;
    if (!probeLayer) return undefined;
    const L = require("leaflet");
    const probe = trailProbeRef.current;
    const tid = activeTrailIdNum;
    const trail =
      tid != null ? (trails || []).find((t) => Number(t.id) === tid) : null;
    try {
      probeLayer.clearLayers();
    } catch (_e) {
      /* noop */
    }
    if (
      probe &&
      trail &&
      tid != null &&
      Number(probe.trailId) === tid
    ) {
      const lineColor = trailDisplayColor(trail.id, trail.difficulty);
      drawTrailProbeOnMap(
        L,
        probeLayer,
        probe,
        trail,
        lineColor,
        lockTrailProbeRef.current
      );
    }
    return undefined;
  }, [trailProbe, activeTrailIdNum, trails, lockTrailProbe]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const L = require("leaflet");
    const next = L.latLng(center[0], center[1]);
    if (recenterNonce > 0 && recenterNonce !== lastRecenterNonceRef.current) {
      lastRecenterNonceRef.current = recenterNonce;
      const z = pickerMode ? 17 : Math.min(Math.max(map.getZoom(), 11), 16);
      map.setView(next, z, { animate: true });
      return;
    }
    if (!followExternalCenter) return;
    const cur = map.getCenter();
    if (
      Math.abs(cur.lat - next.lat) > 1e-7 ||
      Math.abs(cur.lng - next.lng) > 1e-7
    ) {
      map.setView(next, map.getZoom(), { animate: false });
    }
  }, [center[0], center[1], followExternalCenter, recenterNonce]);

  useEffect(() => {
    const group = overlayRef.current;
    const L = require("leaflet");
    if (!group) return;
    group.clearLayers();

    let drawableTrailCount = 0;
    for (const t of trails) {
      try {
        if (!t.polyline_json) continue;
        const raw = JSON.parse(t.polyline_json);
        const pos = Array.isArray(raw)
          ? raw.map(normalizePoint).filter(Boolean)
          : [];
        if (pos.length >= 2) drawableTrailCount += 1;
      } catch (_e) {
        /* noop */
      }
    }

    let selectedLayer = null;
    const map = mapRef.current;

    trails.forEach((trail) => {
      try {
        let positions = [];
        if (trail.polyline_json) {
          const raw = JSON.parse(trail.polyline_json);
          positions = Array.isArray(raw)
            ? raw.map(normalizePoint).filter(Boolean)
            : [];
        }
        if (positions.length < 2) return;
        const tid = Number(trail.id);
        const isPicked = pickedTrailSet.has(tid);
        const isActive = activeTrailIdNum === tid;
        const isHovered =
          hasHoveredTrail && effectiveHoveredTrailId === tid;
        const dimmedByHover = hasHoveredTrail && !isHovered;
        const dimmedByInactiveSelection =
          !hasHoveredTrail &&
          activeTrailIdNum != null &&
          drawableTrailCount > 1 &&
          tid !== activeTrailIdNum;
        const visuallyDimmed = dimmedByHover || dimmedByInactiveSelection;
        const isProximityTrail = proximityTrailSet.has(tid);
        const lineColor = trailDisplayColor(trail.id, trail.difficulty);
        if (isProximityTrail) {
          const corridorWeight = Math.max(
            14,
            Math.min(44, trailCorridorKm * 10)
          );
          L.polyline(positions, {
            color: "#0EA5E9",
            weight: corridorWeight,
            opacity: 0.14,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(group);
        }
        const haloWeight = isActive ? 13.5 : isHovered ? 12 : isPicked ? 10.5 : 9.5;
        const mainWeight = isActive
          ? 7.2
          : isHovered
          ? 6.9
          : isPicked
          ? 6.2
          : TRAIL_STYLE.weight;
        const haloOpacity = visuallyDimmed
          ? 0.24
          : isActive
          ? 0.96
          : isHovered
          ? 0.9
          : isPicked
          ? 0.78
          : 0.72;
        const mainOpacity = visuallyDimmed
          ? 0.44
          : isActive
          ? 1
          : isHovered
          ? 0.99
          : isPicked
          ? 0.94
          : TRAIL_STYLE.opacity;
        L.polyline(positions, {
          color: "#ffffff",
          weight: haloWeight,
          opacity: haloOpacity,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(group);
        const line = L.polyline(positions, {
          color: lineColor,
          weight: mainWeight,
          opacity: mainOpacity,
          lineCap: "round",
          lineJoin: "round",
        });
        const focusTrail = (ev) => {
          try {
            const dom = ev?.originalEvent;
            if (dom && L.DomEvent?.stopPropagation) {
              L.DomEvent.stopPropagation(dom);
            }
          } catch (_e) {
            /* noop */
          }
          onSelectTrailRef.current?.(trail.id);
          try {
            const m = mapRef.current;
            const b = line.getBounds?.();
            if (m && b && typeof b.isValid === "function" && b.isValid()) {
              const runFit = () => {
                try {
                  m.fitBounds(b, {
                    padding: [52, 52],
                    maxZoom: 17,
                    animate: true,
                  });
                } catch (_e2) {
                  /* noop */
                }
              };
              requestAnimationFrame(() => requestAnimationFrame(runFit));
            }
          } catch (_e) {
            /* noop */
          }
        };
        line.on("click", focusTrail);
        if (isActive && enableTrailProbe) {
          const hitLine = L.polyline(positions, {
            pane: TRAIL_HIT_PANE,
            color: "#000000",
            weight: Math.max(18, mainWeight + 14),
            opacity: 0.01,
            lineCap: "round",
            lineJoin: "round",
          });
          const emitTrailProbe = (ev, isClick) => {
            const lat = Number(ev?.latlng?.lat);
            const lng = Number(ev?.latlng?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const probe = probeTrailAt(trail, lat, lng);
            if (!probe) return;
            const fullProbe = { ...probe, trailId: tid, source: "map" };
            onTrailProbeRef.current?.(fullProbe);
            if (isClick) {
              onTrailProbeLockRef.current?.(true);
            }
            try {
              const pl = probeLayerRef.current;
              if (!pl) return;
              const lockedNow = isClick
                ? true
                : lockTrailProbeRef.current;
              drawTrailProbeOnMap(
                L,
                pl,
                fullProbe,
                trail,
                lineColor,
                !!lockedNow
              );
            } catch (_e) {
              /* noop */
            }
          };
          hitLine.on("mousemove", (ev) => {
            if (lockTrailProbeRef.current) return;
            if (
              findNearbyMapPoint(
                mapRef.current,
                ev.latlng,
                trailMapPointsRef.current || [],
                22
              )
            ) {
              return;
            }
            emitTrailProbe(ev, false);
          });
          hitLine.on("click", (ev) => {
            try {
              L.DomEvent.stopPropagation(ev);
              const dom = ev?.originalEvent;
              if (dom) {
                L.DomEvent.stop(dom);
              }
            } catch (_e) {
              /* noop */
            }
            const nearbyBox = findNearbyBox(
              mapRef.current,
              ev.latlng,
              boxesRef.current || [],
              32
            );
            if (nearbyBox) {
              onPlanBoxHoverRef.current?.(Number(nearbyBox.id));
              onSelectBoxRef.current?.(nearbyBox.id);
              return;
            }
            const nearbyPoint = findNearbyMapPoint(
              mapRef.current,
              ev.latlng,
              trailMapPointsRef.current || []
            );
            if (nearbyPoint) {
              onMapPointHoverRef.current?.(nearbyPoint.id);
              onMapPointClickRef.current?.(nearbyPoint);
              return;
            }
            if (lockTrailProbeRef.current) {
              emitTrailProbe(ev, true);
              return;
            }
            emitTrailProbe(ev, true);
          });
          hitLine.addTo(group);
        }
        line.on("mouseover", () => {
          setHoveredTrailLocalId(tid);
          onHoverTrailRef.current?.(trail.id);
          try {
            line.bringToFront?.();
          } catch (_e) {
            // noop
          }
        });
        line.on("mouseout", () => {
          setHoveredTrailLocalId(null);
          onHoverTrailRef.current?.(null);
        });
        const start = positions[0];
        const pin = buildTrailPinIcon({
          color: lineColor,
          activity: trail.activity,
          isHovered,
          isSelected: isActive || isPicked,
          isDimmed: visuallyDimmed,
          simpleMedallion: true,
        });
        const pinAnchorY = Math.round((pin.size * 21.5) / 24);
        const trailIcon = L.marker(start, {
          icon: L.divIcon({
            className: "ravitobox-trail-pin",
            html: pin.html,
            iconSize: [pin.size, pin.size],
            iconAnchor: [Math.round(pin.size / 2), pinAnchorY],
          }),
          zIndexOffset: isHovered || isActive ? 850 : 500,
        });
        trailIcon.on("mouseover", () => {
          setHoveredTrailLocalId(tid);
          onHoverTrailRef.current?.(trail.id);
          try {
            trailIcon.setZIndexOffset?.(900);
            trailIcon.bringToFront?.();
          } catch (_e) {
            /* noop */
          }
        });
        trailIcon.on("mouseout", () => {
          setHoveredTrailLocalId(null);
          onHoverTrailRef.current?.(null);
        });
        trailIcon.on("click", focusTrail);
        try {
          const el = trailIcon.getElement?.();
          if (el) el.style.cursor = "pointer";
        } catch (_e) {
          /* noop */
        }
        trailIcon.bindTooltip(escapeHtml(trail.name || "Trace"), {
          direction: "top",
          offset: [0, -18],
        });
        line.addTo(group);
        trailIcon.addTo(group);
      } catch (_e) {
        // Ignore a malformed trail instead of crashing the whole map.
      }
    });

    const shouldCluster = boxes.length > 30 && map && map.getZoom() < 14;
    if (shouldCluster) {
      const clusters = new Map();
      const factor = 8;
      boxes.forEach((box) => {
        const lat = Number(box.latitude);
        const lng = Number(box.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const key = `${Math.round(lat * factor)}:${Math.round(lng * factor)}`;
        const c = clusters.get(key) || {
          latSum: 0,
          lngSum: 0,
          count: 0,
        };
        c.latSum += lat;
        c.lngSum += lng;
        c.count += 1;
        clusters.set(key, c);
      });
      clusters.forEach((cluster) => {
        const lat = cluster.latSum / cluster.count;
        const lng = cluster.lngSum / cluster.count;
        const marker = L.circleMarker([lat, lng], {
          pane: BOX_MARKER_PANE,
          radius: Math.min(18, 10 + Math.log2(cluster.count + 1) * 2),
          color: "#0F766E",
          weight: 2,
          fillColor: "#14B8A6",
          fillOpacity: 0.85,
        });
        marker.bindTooltip(`${cluster.count} box`, { direction: "top" });
        marker.on("click", () => {
          map?.setView([lat, lng], Math.min((map?.getZoom?.() || 12) + 2, 18), {
            animate: true,
          });
        });
        marker.addTo(group);
      });
    } else {
      boxes.forEach((box) => {
        try {
          const lat = Number(box.latitude);
          const lng = Number(box.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const bid = Number(box.id);
          const isHighlighted =
            Number.isFinite(bid) &&
            bid === Number(highlightedPlanBoxIdRef.current);
          const isSelected =
            bid === Number(selectedBoxIdRef.current) ||
            selectedBoxSet.has(bid) ||
            isHighlighted;
          const isPlanBox = planBoxSet.has(bid);
          const isCompatible =
            compatibleBoxSet.size === 0 || compatibleBoxSet.has(Number(box.id));
          const status = boxVisualStatus(box);
          if (isSelected) {
            L.circleMarker([lat, lng], {
              pane: BOX_MARKER_PANE,
              radius: 15,
              color: "#0F172A",
              weight: 2,
              fillColor: "#99F6E4",
              fillOpacity: 0.35,
            }).addTo(group);
          }
          const labelIcon = buildBoxHouseDivIcon(L, {
            isSelected,
            isHighlighted,
            isPlanBox,
            isCompatible,
            dimIncompatibleBoxes,
            status,
          });
          const m = L.marker([lat, lng], {
            icon: labelIcon,
            pane: BOX_MARKER_PANE,
            zIndexOffset: isSelected || isHighlighted ? 200 : 0,
            riseOnHover: true,
          });
          m.on("mouseover", () => onPlanBoxHoverRef.current?.(bid));
          m.on("mouseout", () => onPlanBoxHoverRef.current?.(null));
          m.on("click", (ev) => {
            try {
              L.DomEvent.stopPropagation(ev);
              const dom = ev?.originalEvent;
              if (dom) L.DomEvent.stop(dom);
            } catch (_e) {
              /* noop */
            }
            onPlanBoxHoverRef.current?.(bid);
            onSelectBoxRef.current?.(box.id);
          });
          const planSuffix = isPlanBox ? " · plan" : "";
          m.bindTooltip(
            `${escapeHtml(box.title || "Box")} · ${status.label}${planSuffix}`,
            {
              direction: "top",
              offset: [0, -12],
            }
          );
          m.addTo(group);
          if (isSelected) selectedLayer = m;
        } catch (_e) {
          // Ignore a malformed host point instead of crashing the whole map.
        }
      });
    }

    const p = normalizePoint(draftPoint);
    if (p) {
      try {
        const marker = L.circleMarker(p, {
          radius: 8,
          color: "#0369A1",
          weight: 2,
          fillColor: "#0EA5E9",
          fillOpacity: 0.85,
        });
        marker.bindPopup("Position box (brouillon)");
        marker.addTo(group);
      } catch (_e) {
        // Ignore marker draw issues.
      }
    }

    const tap = normalizePoint(pickedMapPoint);
    if (tap) {
      try {
        L.circleMarker(tap, {
          radius: 14,
          color: "#C2410C",
          weight: 2,
          fillColor: "#FBBF24",
          fillOpacity: 0.35,
        })
          .bindTooltip("Point choisi sur la carte", { direction: "top" })
          .addTo(group);
        L.circleMarker(tap, {
          radius: 6,
          color: "#9A3412",
          weight: 2,
          fillColor: "#F97316",
          fillOpacity: 1,
        }).addTo(group);
      } catch (_e) {
        /* ignore */
      }
    }

    try {
      const keyedAutoFit = autoFitDataKey != null && autoFitDataKey !== "";
      const shouldAutoFit =
        autoFitToData &&
        (!keyedAutoFit || lastAutoFitDataKeyRef.current !== autoFitDataKey);
      if (
        shouldAutoFit &&
        !pickerMode &&
        map &&
        typeof group.getBounds === "function" &&
        group.getLayers().length > 0
      ) {
        const b = group.getBounds();
        if (b && typeof b.isValid === "function" && b.isValid()) {
          map.fitBounds(b, { padding: [28, 28], maxZoom: 18, animate: false });
          if (keyedAutoFit) {
            lastAutoFitDataKeyRef.current = autoFitDataKey;
          }
        }
      }
    } catch (_e) {
      // Keep current viewport if bounds computation fails.
    }
  }, [boxes, trails, staticOrigin, draftPoint, pickedMapPoint, pickerMode, autoFitToData, autoFitDataKey, selectedBoxId, selectedBoxSet, selectedTrailIds, selectedTrailId, pickedTrailSet, activeTrailIdNum, effectiveHoveredTrailId, hasHoveredTrail, compatibleBoxSet, planBoxSet, proximityTrailSet, trailCorridorKm, dimIncompatibleBoxes, highlightedPlanBoxId, enableTrailProbe]);

  if (Platform.OS !== "web") {
    return null;
  }

  return (
    <View style={[styles.wrapper, inFixedPane ? styles.wrapperPane : null]}>
      <View style={[styles.mapHost, mapStyle]}>
        <View
          ref={containerRef}
          collapsable={false}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "#e8efe9" },
          ]}
        />
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>
            {activeTrailIdNum != null
              ? "Orange = brouillon · violet = conseils · appui long hors tracé = quitter"
              : pickerMode
              ? "Mode précis: zoom max + clic exact"
              : "OSM · zoom molette · glisser · clic trace pour la sélectionner"}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D4E0D8",
  },
  wrapperPane: {
    flex: 1,
    marginTop: 0,
    minHeight: 0,
  },
  mapHost: {
    position: "relative",
    overflow: "hidden",
  },
  hint: {
    position: "absolute",
    bottom: 6,
    right: 8,
    left: 8,
    alignItems: "flex-end",
  },
  hintText: {
    fontSize: 10,
    color: "rgba(12, 27, 22, 0.45)",
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});

export default ExplorerWebMap;
