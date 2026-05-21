import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import TrailElevationProfile from "./TrailElevationProfile";
import {
  getTrailAltitudeMeta,
  getTrailRouteLengthKm,
  probeTrailAtDist,
  formatTrailProbeCoords,
} from "./trailProfile";
import TrailAltitudeBadge from "./TrailAltitudeBadge";

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

/**
 * Colonne profil entre panneau gauche et carte (desktop) — design épuré.
 */
export default function TrailProfileRail({
  trail,
  probe,
  probeLocked = false,
  onProbeChange,
  onChartHoverActive,
  onProbeLock,
}) {
  const handleChartProbe = useCallback(
    (distKm) => {
      if (!trail) return;
      if (distKm == null) {
        if (!probeLocked) onProbeChange?.(null);
        return;
      }
      const p = probeTrailAtDist(trail, distKm);
      if (p) onProbeChange?.({ ...p, trailId: Number(trail.id) });
    },
    [trail, onProbeChange, probeLocked]
  );

  const handleChartHoverStart = useCallback(() => {
    onChartHoverActive?.(true);
  }, [onChartHoverActive]);

  const handleChartHoverEnd = useCallback(() => {
    onChartHoverActive?.(false);
    if (!probeLocked) onProbeChange?.(null);
  }, [onChartHoverActive, onProbeChange, probeLocked]);

  const handleChartClick = useCallback(() => {
    onProbeLock?.(true);
  }, [onProbeLock]);

  const handleClearProbe = useCallback(() => {
    onProbeLock?.(false);
    onProbeChange?.(null);
  }, [onProbeLock, onProbeChange]);

  if (!trail) return null;

  const altMeta = getTrailAltitudeMeta(trail);
  const diff = DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty || "—";
  const routeLenKm = getTrailRouteLengthKm(trail);
  const totalKm = routeLenKm > 0 ? routeLenKm.toFixed(1) : Number(trail.distance_km || 0).toFixed(1);
  const pct =
    probe?.distKm != null && routeLenKm > 0
      ? Math.min(100, Math.round((Number(probe.distKm) / routeLenKm) * 100))
      : null;

  return (
    <View style={styles.rail}>
      <ScrollView
        style={styles.railScroll}
        contentContainerStyle={styles.railScrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Trace active</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {trail.name || "Sans nom"}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {trail.territory || "—"} · {diff}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat label="Distance" value={`${totalKm} km`} />
          {altMeta.status === "profile" ? (
            <Stat label="Dénivelé" value={`${altMeta.elevationM} m`} />
          ) : (
            <Stat label="Dénivelé" value="—" muted />
          )}
          {probe ? (
            <Stat
              label="Position"
              value={`${Number(probe.distKm).toFixed(1)} km`}
              accent
            />
          ) : null}
        </View>

        <TrailAltitudeBadge trail={trail} compact />

        {pct != null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}

        <View style={styles.chartZone}>
          {altMeta.canShowElevationChart ? (
            <TrailElevationProfile
              trail={trail}
              probe={probe}
              variant="rail"
              interactive
              onProbeAtDist={handleChartProbe}
              onChartHoverStart={handleChartHoverStart}
              onChartHoverEnd={handleChartHoverEnd}
              onProbeClick={handleChartClick}
            />
          ) : (
            <TrailElevationProfile trail={trail} probe={null} variant="rail" />
          )}
        </View>

        {probe ? (
          <View style={styles.probeStrip}>
            <Text style={styles.probeKm}>{Number(probe.distKm).toFixed(1)} km</Text>
            {probe.eleM != null ? (
              <Text style={styles.probeDetail}>{probe.eleM} m</Text>
            ) : null}
            {probe.gainM != null ? (
              <Text style={styles.probeDetail}>D+ {Math.round(probe.gainM)} m</Text>
            ) : null}
            {probe.terrainLabel ? (
              <Text style={styles.probeTerrain} numberOfLines={1}>
                {probe.terrainLabel}
              </Text>
            ) : null}
            <Text style={styles.probeCoords} numberOfLines={2}>
              {formatTrailProbeCoords(probe)}
            </Text>
            {probeLocked ? (
              <Pressable onPress={handleClearProbe} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Déverrouiller</Text>
              </Pressable>
            ) : (
              <Text style={styles.probeHint}>
                Clic sur la courbe ou le tracé pour figer le point
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.hint}>
            Survole la carte ou la courbe · clic pour figer
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, accent, muted }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          accent && styles.statValueAccent,
          muted && styles.statValueMuted,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8EFE9",
    overflow: "hidden",
    shadowColor: "rgba(6, 45, 38, 0.12)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  railScroll: {
    flex: 1,
    minHeight: 0,
  },
  railScrollContent: {
    paddingBottom: 16,
  },
  hero: {
    backgroundColor: "#062D26",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 19,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  stat: {
    flex: 1,
    minWidth: 72,
    backgroundColor: "#F7FAF8",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E8EFE9",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  statValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: "#0C1B16",
  },
  statValueAccent: {
    color: "#EA580C",
  },
  statValueMuted: {
    color: "#94A3B8",
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: "#E8EFE9",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#14B8A6",
    borderRadius: 2,
  },
  chartZone: {
    minHeight: 168,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  probeStrip: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 4,
  },
  probeKm: {
    fontSize: 14,
    fontWeight: "800",
    color: "#C2410C",
  },
  probeDetail: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
  },
  probeTerrain: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
  },
  probeCoords: {
    fontSize: 10,
    fontWeight: "600",
    color: "#78350F",
    fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
  },
  probeHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#B45309",
  },
  clearBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#FFEDD5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C2410C",
  },
  hint: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },
});
