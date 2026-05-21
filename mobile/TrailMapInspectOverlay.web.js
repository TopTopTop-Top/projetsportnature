import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import TrailElevationProfile from "./TrailElevationProfile";
import { getTrailAltitudeMeta, probeTrailAtDist } from "./trailProfile";
import TrailAltitudeBadge from "./TrailAltitudeBadge";

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

/**
 * Panneau flottant sur la carte (desktop) : fiche trace + profil altimétrique interactif.
 */
export default function TrailMapInspectOverlay({
  trail,
  probe,
  onProbeChange,
  onChartHoverActive,
}) {
  const handleChartProbe = useCallback(
    (distKm) => {
      if (!trail) return;
      if (distKm == null) {
        onProbeChange?.(null);
        return;
      }
      const p = probeTrailAtDist(trail, distKm);
      if (p) onProbeChange?.({ ...p, trailId: Number(trail.id) });
    },
    [trail, onProbeChange]
  );

  const handleChartHoverStart = useCallback(() => {
    onChartHoverActive?.(true);
  }, [onChartHoverActive]);

  const handleChartHoverEnd = useCallback(() => {
    onChartHoverActive?.(false);
  }, [onChartHoverActive]);

  const handleCardLeave = useCallback(() => {
    onChartHoverActive?.(false);
    onProbeChange?.(null);
  }, [onChartHoverActive, onProbeChange]);

  if (!trail) return null;

  const altMeta = getTrailAltitudeMeta(trail);
  const diff =
    DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty || "—";

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View
        style={styles.card}
        pointerEvents="auto"
        onMouseLeave={handleCardLeave}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {trail.name || "Trace"}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {trail.territory || "Territoire"} · {diff}
          </Text>
          <TrailAltitudeBadge trail={trail} />
        </View>
        <View style={styles.statsBar}>
          <StatPill
            icon="📏"
            value={`${Number(trail.distance_km || 0).toFixed(1)} km`}
          />
          {altMeta.status === "profile" ? (
            <StatPill icon="↗" value={`D+ ${altMeta.elevationM} m`} />
          ) : null}
          {probe ? (
            <StatPill
              icon="📍"
              value={`${Number(probe.distKm || 0).toFixed(1)} km`}
              highlight
            />
          ) : null}
        </View>
        {altMeta.canShowElevationChart ? (
          <TrailElevationProfile
            trail={trail}
            probe={probe}
            variant="overlay"
            interactive
            onProbeAtDist={handleChartProbe}
            onChartHoverStart={handleChartHoverStart}
            onChartHoverEnd={handleChartHoverEnd}
          />
        ) : (
          <TrailElevationProfile trail={trail} probe={null} variant="overlay" />
        )}
        <Text style={styles.hint}>
          {altMeta.canShowElevationChart
            ? "Survole le tracé sur la carte ou la courbe — synchronisation bidirectionnelle."
            : altMeta.canShowMapHighlight
            ? "Survol carte : distance depuis le départ uniquement (pas d’altitude sur ce GPX)."
            : "Importe un GPX avec géométrie et altitudes pour activer le suivi."}
        </Text>
      </View>
    </View>
  );
}

function StatPill({ icon, value, highlight }) {
  return (
    <View style={[styles.pill, highlight && styles.pillHighlight]}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <Text style={[styles.pillText, highlight && styles.pillTextHighlight]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    zIndex: 1200,
    pointerEvents: "box-none",
  },
  card: {
    width: "100%",
    maxWidth: 720,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.1)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: {
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 22,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  statsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillHighlight: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  pillIcon: {
    fontSize: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  pillTextHighlight: {
    color: "#C2410C",
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    fontWeight: "600",
  },
});
