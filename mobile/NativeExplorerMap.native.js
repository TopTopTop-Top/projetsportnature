import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const TRAIL_DIFFICULTY_COLORS = {
  easy: "#16A34A",
  medium: "#D97706",
  hard: "#DC2626",
};

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

  const trailPolylines = useMemo(() => {
    return trails
      .map((trail) => {
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
        return {
          id: trail.id,
          difficulty: trail.difficulty || "medium",
          coordinates,
          isSelected: selectedTrailSet.has(Number(trail.id)),
          isProximityTrail: proximityTrailSet.has(Number(trail.id)),
        };
      })
      .filter((t) => t.coordinates.length > 1);
  }, [trails, selectedTrailSet, proximityTrailSet]);

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
          {t.isSelected ? (
            <Polyline
              coordinates={t.coordinates}
              strokeColor="rgba(255,255,255,0.92)"
              strokeWidth={10}
            />
          ) : null}
          <Polyline
            coordinates={t.coordinates}
            strokeColor={TRAIL_DIFFICULTY_COLORS[t.difficulty] || "#0F766E"}
            strokeWidth={t.isSelected ? 4 : 2.6}
            lineDashPattern={t.isSelected ? undefined : [6, 10]}
            tappable
            onPress={() => onSelectTrail?.(t.id)}
          />
          {t.isSelected ? (
            <>
              <Marker coordinate={t.coordinates[0]} tracksViewChanges={false}>
                <View style={styles.trailPointStart} />
              </Marker>
              <Marker
                coordinate={t.coordinates[t.coordinates.length - 1]}
                tracksViewChanges={false}
              >
                <View
                  style={[
                    styles.trailPointEnd,
                    {
                      borderColor:
                        TRAIL_DIFFICULTY_COLORS[t.difficulty] || "#0F766E",
                    },
                  ]}
                />
              </Marker>
            </>
          ) : null}
        </React.Fragment>
      ))}
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

const styles = StyleSheet.create({
  map: {
    height: 420,
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
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
  trailPointStart: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#0F172A",
    backgroundColor: "#fff",
  },
  trailPointEnd: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#0F766E",
    backgroundColor: "#0F172A",
  },
});
