import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

export default function NativeExplorerMap({
  center,
  boxes,
  trails,
  onSelectBox,
}) {
  const mapRef = useRef(null);

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
    mapRef.current?.animateToRegion(region, 280);
  }, [region]);

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
        return { id: trail.id, coordinates };
      })
      .filter((t) => t.coordinates.length > 1);
  }, [trails]);

  return (
    <MapView ref={mapRef} style={styles.map} initialRegion={region}>
      {trailPolylines.map((t) => (
        <Polyline
          key={t.id}
          coordinates={t.coordinates}
          strokeColor="#0F766E"
          strokeWidth={4}
        />
      ))}
      {boxes.map((box) => (
        <Marker
          key={box.id}
          coordinate={{
            latitude: box.latitude,
            longitude: box.longitude,
          }}
          title={box.title}
          description={`${box.city} · ${(box.price_cents / 100).toFixed(2)} €`}
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
