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
  selectedBoxId,
  onSelectBox,
  onSelectTrail,
  onMapLongPress,
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
        (selectedTrailIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      ),
    [selectedTrailIds]
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
        };
      })
      .filter((t) => t.coordinates.length > 1);
  }, [trails, selectedTrailSet]);

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
    >
      {trailPolylines.map((t) => (
        <React.Fragment key={t.id}>
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
            strokeWidth={t.isSelected ? 6 : 4}
            lineDashPattern={t.isSelected ? undefined : [8, 8]}
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
      {boxes.map((box) => (
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
              Number(box.id) === Number(selectedBoxId) && styles.boxPinSelected,
            ]}
          >
            <Text
              style={[
                styles.boxPinLabel,
                Number(box.id) === Number(selectedBoxId) &&
                  styles.boxPinLabelSelected,
              ]}
            >
              {Number.isFinite(Number(box.price_cents))
                ? `${(Number(box.price_cents) / 100).toFixed(0)}€`
                : "€"}
            </Text>
          </View>
        </Marker>
      ))}
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
    minWidth: 34,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F766E",
    backgroundColor: "#D1FAE5",
    shadowColor: "#0F172A",
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 5,
  },
  boxPinSelected: {
    borderColor: "#0F172A",
    backgroundColor: "#14B8A6",
    transform: [{ scale: 1.06 }],
  },
  boxPinLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#065F46",
  },
  boxPinLabelSelected: {
    color: "#fff",
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
