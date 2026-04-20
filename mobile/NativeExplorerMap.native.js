import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

function boxHostRatingSnippet(box) {
  const n = Number(box.host_review_count || 0);
  const avg = Number(box.host_avg_score || 0);
  if (!n) return "Hôte : pas encore d'avis";
  return `Hôte ${avg.toFixed(1)}/5 (${n} avis)`;
}

export default function NativeExplorerMap({
  center,
  boxes,
  trails,
  selectedTrailIds = [],
  selectedBoxId,
  onSelectBox,
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
    >
      {trailPolylines.map((t) => (
        <Polyline
          key={t.id}
          coordinates={t.coordinates}
          strokeColor={t.isSelected ? "#14B8A6" : "#0F766E"}
          strokeWidth={t.isSelected ? 6 : 4}
        />
      ))}
      {boxes.map((box) => (
        <Marker
          key={box.id}
          coordinate={{
            latitude: box.latitude,
            longitude: box.longitude,
          }}
          pinColor={
            Number(box.id) === Number(selectedBoxId) ? "#14B8A6" : undefined
          }
          title={box.title}
          description={`${box.city} · ${(box.price_cents / 100).toFixed(
            2
          )} € · ${boxHostRatingSnippet(box)}`}
          onPress={() => onSelectBox(box.id)}
        />
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
});
