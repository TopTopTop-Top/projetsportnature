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

const TRAIL_STYLE = { color: "#0F766E", weight: 4, opacity: 0.88 };

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

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

function truncateForPopup(text, max) {
  const t = String(text ?? "").trim();
  if (t.length <= max) return escapeHtml(t);
  return `${escapeHtml(t.slice(0, max))}…`;
}

function buildBoxPopupHtml(box) {
  const lines = [
    `<strong>${escapeHtml(box.title)}</strong>`,
    `${escapeHtml(box.city)} · ${(box.price_cents / 100).toFixed(2)} €`,
  ];
  if (box.distance_km != null) {
    lines.push(`≈ ${Number(box.distance_km).toFixed(1)} km`);
  }
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
  return [
    `<strong>${escapeHtml(trail.name)}</strong>`,
    `${escapeHtml(trail.territory)} · ${trail.distance_km} km`,
    `<span style="font-size:12px">${escapeHtml(
      DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty
    )}</span>`,
    gpxLine,
  ]
    .filter(Boolean)
    .join("<br/>");
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
  onSelectBox,
  staticOrigin = "",
  inFixedPane = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const onSelectBoxRef = useRef(onSelectBox);
  onSelectBoxRef.current = onSelectBox;

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
    }).setView([center[0], center[1]], 12);

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    });
    osm.addTo(map);

    const overlay = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlayRef.current = overlay;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte unique, centre géré ailleurs
  }, [inFixedPane]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const L = require("leaflet");
    const next = L.latLng(center[0], center[1]);
    const cur = map.getCenter();
    if (
      Math.abs(cur.lat - next.lat) > 1e-7 ||
      Math.abs(cur.lng - next.lng) > 1e-7
    ) {
      map.setView(next, map.getZoom(), { animate: false });
    }
  }, [center[0], center[1]]);

  useEffect(() => {
    const group = overlayRef.current;
    const L = require("leaflet");
    if (!group) return;
    group.clearLayers();

    trails.forEach((trail) => {
      let positions = [];
      try {
        if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
      } catch (_e) {
        positions = [];
      }
      if (positions.length < 2) return;
      const line = L.polyline(positions, TRAIL_STYLE);
      if (staticOrigin) {
        line.bindPopup(buildTrailPopupHtml(trail, staticOrigin));
      }
      line.addTo(group);
    });

    boxes.forEach((box) => {
      const m = L.marker([box.latitude, box.longitude]);
      m.bindPopup(buildBoxPopupHtml(box));
      m.on("click", () => onSelectBoxRef.current?.(box.id));
      m.addTo(group);
    });

    const map = mapRef.current;
    if (map && group.getLayers().length > 0) {
      const b = group.getBounds();
      if (b.isValid()) {
        map.fitBounds(b, { padding: [28, 28], maxZoom: 15, animate: false });
      }
    }
  }, [boxes, trails, staticOrigin]);

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
          <Text style={styles.hintText}>OSM · zoom molette · glisser</Text>
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
