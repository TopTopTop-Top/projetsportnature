import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

const CARTO_VOYAGER_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const MAPLIBRE_CSS_CDN =
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

function ensureMaplibreCss() {
  if (typeof document === "undefined") return;
  const id = "ravitobox-maplibre-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS_CDN;
  document.head.appendChild(link);
}

/** require() garde MapLibre dans le bundle principal — évite les chunks async (module 695) sur hébergement statique. */
function loadMaplibreSync() {
  try {
    // eslint-disable-next-line global-require
    require("maplibre-gl/dist/maplibre-gl.css");
  } catch (_e) {
    ensureMaplibreCss();
  }
  // eslint-disable-next-line global-require
  const mod = require("maplibre-gl");
  return mod.default ?? mod;
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
  lines.push(
    "<em>Statut : box active — réservation par créneau ci-dessous.</em>"
  );
  if (box.description) {
    lines.push(
      `<span style="font-size:12px;color:#334155">${truncateForPopup(
        box.description,
        240
      )}</span>`
    );
  }
  if (box.availability_note) {
    lines.push(
      `<strong>Disponibilités / infos</strong><br/><span style="font-size:12px;color:#334155">${truncateForPopup(
        box.availability_note,
        320
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
    ? `<a href="${escapeHtml(
        gpx
      )}" download target="_blank" rel="noopener">Télécharger le GPX</a>`
    : "<span style='font-size:12px'>GPX non disponible</span>";
  return [
    `<strong>${escapeHtml(trail.name)}</strong>`,
    `${escapeHtml(trail.territory)} · ${trail.distance_km} km · D+ ${
      trail.elevation_m
    } m`,
    `<span style="font-size:12px">${escapeHtml(
      DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty
    )}</span>`,
    gpxLine,
  ].join("<br/>");
}

function trailsGeoJSON(trails) {
  const features = [];
  for (const trail of trails) {
    let positions = [];
    try {
      if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
    } catch (_e) {
      positions = [];
    }
    if (positions.length < 2) continue;
    const coordinates = positions.map(([lat, lng]) => [lng, lat]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: { trailJson: JSON.stringify(trail) },
    });
  }
  return { type: "FeatureCollection", features };
}

function boxesGeoJSON(boxes) {
  return {
    type: "FeatureCollection",
    features: boxes.map((b) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [b.longitude, b.latitude],
      },
      properties: { id: b.id, boxJson: JSON.stringify(b) },
    })),
  };
}

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
  const popupRef = useRef(null);
  const boxesRef = useRef(boxes);
  const trailsRef = useRef(trails);
  boxesRef.current = boxes;
  trailsRef.current = trails;
  const staticOriginRef = useRef(staticOrigin);
  staticOriginRef.current = staticOrigin;
  const onSelectBoxRef = useRef(onSelectBox);
  onSelectBoxRef.current = onSelectBox;
  const centerRef = useRef(center);
  centerRef.current = center;

  const [mapError, setMapError] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);

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

    let cancelled = false;
    let ro = null;

    setMapError(null);
    setMapLoading(true);

    try {
      const maplibregl = loadMaplibreSync();
      if (cancelled || containerRef.current !== el) {
        setMapLoading(false);
        return undefined;
      }

      if (!maplibregl.supported()) {
        setMapError("WebGL indisponible sur ce navigateur.");
        setMapLoading(false);
        return undefined;
      }

      const c = centerRef.current;
      const map = new maplibregl.Map({
        container: el,
        style: CARTO_VOYAGER_STYLE,
        center: [c[1], c[0]],
        zoom: 12,
        attributionControl: true,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-left");

      const showPopup = (html, lngLat) => {
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          offset: 14,
          closeButton: true,
          maxWidth: "320px",
        })
          .setLngLat(lngLat)
          .setHTML(html)
          .addTo(map);
      };

      const onMapError = (e) => {
        const msg = e?.error?.message || "Erreur de chargement de la carte";
        if (!cancelled) setMapError(msg);
      };
      map.on("error", onMapError);

      map.on("load", () => {
        if (cancelled) return;
        map.addSource("trails", {
          type: "geojson",
          data: trailsGeoJSON([]),
        });
        map.addLayer({
          id: "trails-line",
          type: "line",
          source: "trails",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0F766E",
            "line-width": 4,
            "line-opacity": 0.88,
          },
        });
        map.addLayer({
          id: "trails-hit",
          type: "line",
          source: "trails",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#000",
            "line-opacity": 0,
            "line-width": 14,
          },
        });

        map.addSource("boxes", {
          type: "geojson",
          data: boxesGeoJSON([]),
        });
        map.addLayer({
          id: "boxes-circle",
          type: "circle",
          source: "boxes",
          paint: {
            "circle-radius": 9,
            "circle-color": "#0F766E",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.on("mouseenter", "boxes-circle", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "boxes-circle", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "trails-hit", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "trails-hit", () => {
          map.getCanvas().style.cursor = "";
        });

        map.on("click", "boxes-circle", (e) => {
          const f = e.features?.[0];
          if (!f?.properties?.boxJson) return;
          try {
            const box = JSON.parse(f.properties.boxJson);
            onSelectBoxRef.current?.(box.id);
            showPopup(buildBoxPopupHtml(box), e.lngLat);
          } catch (_err) {
            /* ignore */
          }
        });

        map.on("click", "trails-hit", (e) => {
          const f = e.features?.[0];
          if (!f?.properties?.trailJson) return;
          try {
            const trail = JSON.parse(f.properties.trailJson);
            showPopup(
              buildTrailPopupHtml(trail, staticOriginRef.current),
              e.lngLat
            );
          } catch (_err) {
            /* ignore */
          }
        });

        map.on("click", (evt) => {
          const feats = map.queryRenderedFeatures(evt.point, {
            layers: ["boxes-circle", "trails-hit"],
          });
          if (!feats.length) {
            popupRef.current?.remove();
            popupRef.current = null;
          }
        });

        try {
          map.getSource("trails").setData(trailsGeoJSON(trailsRef.current));
          map.getSource("boxes").setData(boxesGeoJSON(boxesRef.current));
        } catch (_e) {
          /* ignore */
        }
      });

      mapRef.current = map;

      ro = new ResizeObserver(() => {
        map.resize();
      });
      ro.observe(el);
      requestAnimationFrame(() => map.resize());

      if (!cancelled) setMapLoading(false);
    } catch (err) {
      if (!cancelled) {
        setMapError(
          err?.message
            ? String(err.message)
            : "Impossible de charger le moteur de carte."
        );
        setMapLoading(false);
      }
    }

    return () => {
      cancelled = true;
      ro?.disconnect();
      const m = mapRef.current;
      if (m) {
        try {
          m.remove();
        } catch (_e) {
          /* ignore */
        }
      }
      mapRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recentrage via useEffect dédié
  }, [inFixedPane]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource?.("boxes")) return;
    try {
      map.getSource("trails").setData(trailsGeoJSON(trails));
      map.getSource("boxes").setData(boxesGeoJSON(boxes));
    } catch (_e) {
      /* style not ready */
    }
  }, [boxes, trails]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded?.()) return;
    map.easeTo({
      center: [center[1], center[0]],
      duration: 450,
      essential: true,
    });
  }, [center[0], center[1]]);

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
        {mapLoading && !mapError ? (
          <View style={[StyleSheet.absoluteFillObject, styles.loadingOverlay]}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={styles.loadingText}>Chargement de la carte…</Text>
          </View>
        ) : null}
        {mapError ? (
          <View style={[StyleSheet.absoluteFillObject, styles.errorOverlay]}>
            <Text style={styles.fallbackTitle}>Carte</Text>
            <Text style={styles.fallbackText}>{mapError}</Text>
          </View>
        ) : null}
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
  loadingOverlay: {
    backgroundColor: "rgba(238, 244, 240, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#5C6F66",
  },
  errorOverlay: {
    backgroundColor: "rgba(238, 244, 240, 0.96)",
    padding: 16,
    justifyContent: "center",
    zIndex: 2,
  },
  fallbackTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
    color: "#0C1B16",
  },
  fallbackText: {
    fontSize: 14,
    color: "#5C6F66",
  },
});

export default ExplorerWebMap;
