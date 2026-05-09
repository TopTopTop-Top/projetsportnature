import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const TRAIL_DIFFICULTY_COLORS = {
  easy: "#16A34A",
  medium: "#D97706",
  hard: "#DC2626",
};

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
    return TRAIL_DISPLAY_PALETTE[Math.abs(id) % TRAIL_DISPLAY_PALETTE.length];
  }
  return TRAIL_DIFFICULTY_COLORS[difficultyFallback] || "#0F766E";
}

function TrailTeardropPin({ color, dimmed, emphasized }) {
  const scale = emphasized ? 1.08 : 1;
  return (
    <View
      style={[
        styles.trailPinWrap,
        { opacity: dimmed ? 0.78 : 1, transform: [{ scale }] },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.trailPinBubble,
          {
            backgroundColor: color,
            borderColor: "#ffffff",
            borderWidth: 2.5,
          },
        ]}
      >
        <View style={styles.trailPinDot} />
      </View>
      <View
        style={[
          styles.trailPinPoint,
          {
            borderTopColor: color,
          },
        ]}
      />
    </View>
  );
}

export default function NativeExplorerMap({
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
  onPanDrag,
  pickedMapPoint = null,
  followExternalCenter = true,
  recenterNonce = 0,
}) {
  const mapRef = useRef(null);
  const lastRecenterNonceRef = useRef(0);

  const region = useMemo(
    () => ({
      latitude: center[0],
      longitude: center[1],
      latitudeDelta: 0.09,
      longitudeDelta: 0.09,
    }),
    [center[0], center[1]]
  );

  useEffect(() => {
    if (recenterNonce > 0 && recenterNonce !== lastRecenterNonceRef.current) {
      lastRecenterNonceRef.current = recenterNonce;
      mapRef.current?.animateToRegion(region, 280);
      return;
    }
    if (followExternalCenter) {
      mapRef.current?.animateToRegion(region, 280);
    }
  }, [region, followExternalCenter, recenterNonce]);

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

  const trailPolylines = useMemo(() => {
    const rows = trails.map((trail) => {
      let positions = [];
      try {
        if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
      } catch (_e) {
        positions = [];
      }
      const coordinates = positions.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
      const tid = Number(trail.id);
      const lineColor = trailDisplayColor(trail.id, trail.difficulty);
      const isPicked = pickedTrailSet.has(tid);
      const isActive = activeTrailIdNum === tid;
      return {
        id: trail.id,
        difficulty: trail.difficulty || "medium",
        coordinates,
        lineColor,
        isPicked,
        isActive,
        isProximityTrail: proximityTrailSet.has(tid),
      };
    });
    const drawable = rows.filter((t) => t.coordinates.length > 1);
    const nDraw = drawable.length;
    return drawable.map((t) => {
      const dimmedByInactiveSelection =
        activeTrailIdNum != null &&
        nDraw > 1 &&
        Number(t.id) !== activeTrailIdNum;
      const visuallyDimmed = dimmedByInactiveSelection;
      const haloW = t.isActive ? 12 : t.isPicked ? 9 : 7;
      const mainW = t.isActive ? 6.5 : t.isPicked ? 5 : 3.4;
      const haloOp = visuallyDimmed ? 0.08 : t.isActive ? 0.92 : t.isPicked ? 0.58 : 0.42;
      const mainOp = visuallyDimmed ? 0.16 : t.isActive ? 1 : t.isPicked ? 0.88 : 0.82;
      const solidLine = t.isActive || t.isPicked;
      return {
        ...t,
        visuallyDimmed,
        haloW,
        mainW,
        haloOp,
        mainOp,
        solidLine,
      };
    });
  }, [trails, pickedTrailSet, activeTrailIdNum, proximityTrailSet]);

  const reportBounds = (r) => {
    if (typeof onVisibleBoundsChange !== "function" || !r) return;
    const halfLat = r.latitudeDelta / 2;
    const halfLon = r.longitudeDelta / 2;
    onVisibleBoundsChange({
      south: r.latitude - halfLat,
      north: r.latitude + halfLat,
      west: r.longitude - halfLon,
      east: r.longitude + halfLon,
    });
  };

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={region}
      onRegionChangeComplete={reportBounds}
      onPanDrag={typeof onPanDrag === "function" ? onPanDrag : undefined}
      onLongPress={(ev) => {
        const lat = Number(ev?.nativeEvent?.coordinate?.latitude);
        const lng = Number(ev?.nativeEvent?.coordinate?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        onMapLongPress?.(lat, lng);
      }}
      onPress={(ev) => {
        const lat = Number(ev?.nativeEvent?.coordinate?.latitude);
        const lng = Number(ev?.nativeEvent?.coordinate?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        onPickLocation?.(lat, lng);
      }}
    >
      {trailPolylines.map((t) => (
        <React.Fragment key={t.id}>
          {t.isProximityTrail ? (
            <Polyline
              coordinates={t.coordinates}
              strokeColor="rgba(14, 165, 233, 0.20)"
              strokeWidth={Math.max(10, Math.min(30, trailCorridorKm * 7))}
            />
          ) : null}
          <Polyline
            coordinates={t.coordinates}
            strokeColor={`rgba(255,255,255,${t.haloOp})`}
            strokeWidth={t.haloW}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={t.coordinates}
            strokeColor={
              t.mainOp >= 1
                ? t.lineColor
                : hexWithAlpha(t.lineColor, t.mainOp)
            }
            strokeWidth={t.mainW}
            lineDashPattern={t.solidLine ? undefined : [6, 10]}
            lineCap="round"
            lineJoin="round"
            tappable
            onPress={() => onSelectTrail?.(t.id)}
          />
          <Marker
            coordinate={t.coordinates[0]}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={t.isActive ? 800 : t.isPicked ? 600 : 400}
            onPress={() => onSelectTrail?.(t.id)}
          >
            <TrailTeardropPin
              color={t.lineColor}
              dimmed={t.visuallyDimmed}
              emphasized={t.isActive || t.isPicked}
            />
          </Marker>
          {t.isActive ? (
            <Marker
              coordinate={t.coordinates[t.coordinates.length - 1]}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                style={[
                  styles.trailPointEnd,
                  { borderColor: t.lineColor, backgroundColor: "#0F172A" },
                ]}
              />
            </Marker>
          ) : null}
        </React.Fragment>
      ))}
      {pickedMapPoint &&
      Number.isFinite(Number(pickedMapPoint.latitude ?? pickedMapPoint.lat)) &&
      Number.isFinite(
        Number(pickedMapPoint.longitude ?? pickedMapPoint.lng)
      ) ? (
        <Marker
          coordinate={{
            latitude: Number(pickedMapPoint.latitude ?? pickedMapPoint.lat),
            longitude: Number(pickedMapPoint.longitude ?? pickedMapPoint.lng),
          }}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={1000}
        >
          <View style={styles.mapTapPinOuter}>
            <View style={styles.mapTapPinInner} />
          </View>
        </Marker>
      ) : null}
      {boxes.map((box) => {
        const isCompatible =
          compatibleBoxSet.size === 0 || compatibleBoxSet.has(Number(box.id));
        const isPlanBox = planBoxSet.has(Number(box.id));
        const isSelected =
          Number(box.id) === Number(selectedBoxId) ||
          selectedBoxSet.has(Number(box.id));
        return (
          <Marker
            key={box.id}
            coordinate={{
              latitude: box.latitude,
              longitude: box.longitude,
            }}
            tracksViewChanges={false}
            onPress={() => onSelectBox(box.id)}
          >
            <View
              style={[
                styles.boxPin,
                isPlanBox && styles.boxPinPlan,
                dimIncompatibleBoxes && !isCompatible && styles.boxPinDimmed,
                isSelected && styles.boxPinSelected,
                isSelected && isPlanBox && styles.boxPinSelectedPlan,
              ]}
            />
          </Marker>
        );
      })}
    </MapView>
  );
}

function hexWithAlpha(hex, a) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(15,118,110,${a})`;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

const styles = StyleSheet.create({
  map: {
    height: 420,
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  trailPinWrap: {
    alignItems: "center",
  },
  trailPinBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  trailPinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ffffff",
  },
  trailPinPoint: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    backgroundColor: "transparent",
  },
  boxPin: {
    width: 14,
    height: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F766E",
    backgroundColor: "#fff",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  boxPinSelected: {
    borderColor: "#0F172A",
    backgroundColor: "#14B8A6",
    transform: [{ scale: 1.25 }],
  },
  boxPinPlan: {
    borderColor: "#7C3AED",
    backgroundColor: "#F5F3FF",
  },
  boxPinSelectedPlan: {
    borderColor: "#4C1D95",
    backgroundColor: "#A78BFA",
  },
  boxPinDimmed: {
    borderColor: "#94A3B8",
    backgroundColor: "#E2E8F0",
    opacity: 0.65,
  },
  trailPointEnd: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: "#0F172A",
  },
  mapTapPinOuter: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#C2410C",
    backgroundColor: "rgba(251, 191, 36, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapTapPinInner: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#EA580C",
    borderWidth: 1,
    borderColor: "#fff",
  },
});
