import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, Platform, StyleSheet } from "react-native";

const LEAFLET_TILE_FIX_ID = "ravitobox-leaflet-rnweb-tiles";

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

const TRAIL_STYLE = { color: "#0F766E", weight: 4.1, opacity: 0.82 };
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
    isPlanBox,
    isCompatible,
    dimIncompatibleBoxes,
    status,
  } = opts;
  const w = isSelected ? 30 : 26;
  const stroke = isSelected
    ? isPlanBox
      ? "#4C1D95"
      : "#0F172A"
    : isPlanBox
    ? "#7C3AED"
    : dimIncompatibleBoxes && !isCompatible
    ? "#94A3B8"
    : status.stroke;
  const fill = isSelected
    ? isPlanBox
      ? "#A78BFA"
      : "#14B8A6"
    : isPlanBox
    ? "#F5F3FF"
    : dimIncompatibleBoxes && !isCompatible
    ? "#E2E8F0"
    : "#FFFFFF";
  const opacity = dimIncompatibleBoxes && !isCompatible ? 0.65 : 1;
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
  const onMapLongPressRef = useRef(onMapLongPress);
  onMapLongPressRef.current = onMapLongPress;
  const selectedBoxIdRef = useRef(selectedBoxId);
  selectedBoxIdRef.current = selectedBoxId;
  const onPickLocationRef = useRef(onPickLocation);
  onPickLocationRef.current = onPickLocation;
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

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
    });
    osm.addTo(map);

    const overlay = L.featureGroup().addTo(map);
    mapRef.current = map;
    overlayRef.current = overlay;

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
    map.on("zoomend", emitBounds);
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

    if (typeof onPickLocationRef.current === "function") {
      map.on("click", (ev) => {
        const lat = Number(ev?.latlng?.lat);
        const lng = Number(ev?.latlng?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          onPickLocationRef.current?.(lat, lng);
        }
      });
    }

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
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte unique, centre géré ailleurs
  }, [inFixedPane, pickerMode]);

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
          const isSelected =
            Number(box.id) === Number(selectedBoxIdRef.current) ||
            selectedBoxSet.has(Number(box.id));
          const isPlanBox = planBoxSet.has(Number(box.id));
          const isCompatible =
            compatibleBoxSet.size === 0 || compatibleBoxSet.has(Number(box.id));
          const status = boxVisualStatus(box);
          if (isSelected) {
            L.circleMarker([lat, lng], {
              radius: 15,
              color: "#0F172A",
              weight: 2,
              fillColor: "#99F6E4",
              fillOpacity: 0.35,
            }).addTo(group);
          }
          const labelIcon = buildBoxHouseDivIcon(L, {
            isSelected,
            isPlanBox,
            isCompatible,
            dimIncompatibleBoxes,
            status,
          });
          const m = L.marker([lat, lng], { icon: labelIcon });
          m.on("click", () => onSelectBoxRef.current?.(box.id));
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
        const focusTrail = () => {
          onSelectTrailRef.current?.(trail.id);
          try {
            const m = mapRef.current;
            const b = line.getBounds?.();
            if (m && b && typeof b.isValid === "function" && b.isValid()) {
              m.fitBounds(b, { padding: [36, 36], maxZoom: 16, animate: true });
            }
          } catch (_e) {
            // keep map stable if fit fails on malformed geometry
          }
        };
        const haloWeight = isActive ? 12.5 : isHovered ? 11 : isPicked ? 9 : 7;
        const mainWeight = isActive
          ? 6.8
          : isHovered
          ? 6.5
          : isPicked
          ? 5.2
          : TRAIL_STYLE.weight;
        const haloOpacity = visuallyDimmed
          ? 0.08
          : isActive
          ? 0.94
          : isHovered
          ? 0.88
          : isPicked
          ? 0.62
          : 0.45;
        const mainOpacity = visuallyDimmed
          ? 0.14
          : isActive
          ? 1
          : isHovered
          ? 0.98
          : isPicked
          ? 0.88
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
          dashArray: isActive || isHovered || isPicked ? undefined : "3 4",
          lineCap: "round",
          lineJoin: "round",
        });
        line.on("click", focusTrail);
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
      if (
        autoFitToData &&
        !pickerMode &&
        map &&
        typeof group.getBounds === "function" &&
        group.getLayers().length > 0
      ) {
        const b = group.getBounds();
        if (b && typeof b.isValid === "function" && b.isValid()) {
          map.fitBounds(b, { padding: [28, 28], maxZoom: 18, animate: false });
        }
      }
    } catch (_e) {
      // Keep current viewport if bounds computation fails.
    }
  }, [boxes, trails, staticOrigin, draftPoint, pickedMapPoint, pickerMode, autoFitToData, selectedBoxId, selectedBoxSet, selectedTrailIds, selectedTrailId, pickedTrailSet, activeTrailIdNum, effectiveHoveredTrailId, hasHoveredTrail, compatibleBoxSet, planBoxSet, proximityTrailSet, trailCorridorKm, dimIncompatibleBoxes]);

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
            {pickerMode
              ? "Mode précis: zoom max + clic exact"
              : "OSM · zoom molette · glisser"}
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
