import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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

const TRAIL_STYLE = { color: "#0F766E", weight: 2.6, opacity: 0.66 };
const TRAIL_DIFFICULTY_STYLES = {
  easy: { color: "#16A34A", casing: "#DCFCE7" },
  medium: { color: "#D97706", casing: "#FEF3C7" },
  hard: { color: "#DC2626", casing: "#FEE2E2" },
};

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
  selectedBoxId,
  selectedBoxIds = [],
  planBoxIds = [],
  compatibleBoxIds = [],
  proximityTrailIds = [],
  trailCorridorKm = 2,
  dimIncompatibleBoxes = false,
  onSelectBox,
  onSelectTrail,
  onMapLongPress,
  onPickLocation,
  onVisibleBoundsChange,
  /** Appelé après un déplacement manuel (drag) — pour découpler la caméra de la recherche. */
  onUserMapGesture,
  draftPoint,
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
  const selectedTrailSet = useMemo(
    () =>
      new Set(
        [...(selectedTrailIds || []), selectedTrailId]
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [selectedTrailIds, selectedTrailId]
  );
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
        const isSelected = selectedTrailSet.has(Number(trail.id));
        const isProximityTrail = proximityTrailSet.has(Number(trail.id));
        const diffStyle = TRAIL_DIFFICULTY_STYLES[trail.difficulty] || {
          color: TRAIL_STYLE.color,
          casing: "#CCFBF1",
        };
        if (isProximityTrail) {
          const corridorWeight = Math.max(14, Math.min(44, trailCorridorKm * 10));
          L.polyline(positions, {
            color: "#0EA5E9",
            weight: corridorWeight,
            opacity: 0.14,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(group);
        }
        if (isSelected) {
          L.polyline(positions, {
            color: diffStyle.casing,
            weight: 7,
            opacity: 0.62,
          }).addTo(group);
        }
        const line = L.polyline(positions, {
          color: diffStyle.color,
          weight: isSelected ? 4 : TRAIL_STYLE.weight,
          opacity: isSelected ? 0.94 : TRAIL_STYLE.opacity,
          dashArray: isSelected ? undefined : "5 9",
          lineCap: "round",
          lineJoin: "round",
        });
        line.on("click", () => onSelectTrailRef.current?.(trail.id));
        if (isSelected) {
          const start = positions[0];
          const end = positions[positions.length - 1];
          L.circleMarker(start, {
            radius: 5,
            color: "#0F172A",
            weight: 2,
            fillColor: "#fff",
            fillOpacity: 1,
          }).addTo(group);
          L.circleMarker(end, {
            radius: 5,
            color: "#0F172A",
            weight: 2,
            fillColor: diffStyle.color,
            fillOpacity: 1,
          }).addTo(group);
        }
        line.addTo(group);
      } catch (_e) {
        // Ignore a malformed trail instead of crashing the whole map.
      }
    });

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
          const labelIcon = L.divIcon({
            className: "ravitobox-status-pin",
            html: `<div style="
              width:${isSelected ? 18 : 14}px;height:${
              isSelected ? 18 : 14
            }px;border-radius:999px;
              border:2px solid ${
                isSelected
                  ? isPlanBox
                    ? "#4C1D95"
                    : "#0F172A"
                  : isPlanBox
                  ? "#7C3AED"
                  : dimIncompatibleBoxes && !isCompatible
                  ? "#94A3B8"
                  : status.stroke
              };
              background:${
                isSelected
                  ? isPlanBox
                    ? "#A78BFA"
                    : "#14B8A6"
                  : isPlanBox
                  ? "#F5F3FF"
                  : dimIncompatibleBoxes && !isCompatible
                  ? "#E2E8F0"
                  : "#FFFFFF"
              };
              opacity:${dimIncompatibleBoxes && !isCompatible ? "0.6" : "1"};
              box-shadow:0 3px 10px rgba(2,6,23,.20);
            "></div>`,
            iconSize: [isSelected ? 18 : 14, isSelected ? 18 : 14],
            iconAnchor: [isSelected ? 9 : 7, isSelected ? 9 : 7],
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
  }, [
    boxes,
    trails,
    staticOrigin,
    draftPoint,
    pickerMode,
    autoFitToData,
    selectedBoxId,
    selectedBoxSet,
    selectedTrailSet,
    compatibleBoxSet,
    planBoxSet,
    proximityTrailSet,
    trailCorridorKm,
    dimIncompatibleBoxes,
  ]);

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
