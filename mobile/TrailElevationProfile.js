import React, { useMemo } from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
import {
  getTrailProfileStats,
  terrainLabelFromGrade,
  gradePercentAtDist,
} from "./trailProfile";

const CHART_H = 128;
const CHART_W = 320;

function slopeColor(gradePct) {
  if (gradePct == null) return "#94A3B8";
  if (gradePct >= 12) return "#DC2626";
  if (gradePct >= 5) return "#EA580C";
  if (gradePct > -5) return "#16A34A";
  if (gradePct > -12) return "#2563EB";
  return "#4338CA";
}

function buildChartSeries(trail) {
  const stats = getTrailProfileStats(trail);
  const { points, hasElevationData, minEle, maxEle, totalDistKm } = stats;
  if (!points.length || totalDistKm <= 0) {
    return { stats, series: [], hasElevationData: false };
  }
  if (!hasElevationData || minEle == null || maxEle == null) {
    return { stats, series: [], hasElevationData: false };
  }
  const span = Math.max(maxEle - minEle, 1);
  const pad = span * 0.08;
  const yMin = minEle - pad;
  const yMax = maxEle + pad;
  const ySpan = Math.max(yMax - yMin, 1);
  const series = points.map((p, idx) => {
    const prev = idx > 0 ? points[idx - 1] : p;
    const grade =
      idx > 0 && p.eleM != null && prev.eleM != null
        ? ((p.eleM - prev.eleM) / Math.max(0.001, (p.distKm - prev.distKm) * 1000)) *
          100
        : null;
    return {
      x: (p.distKm / totalDistKm) * CHART_W,
      y: CHART_H - ((p.eleM - yMin) / ySpan) * CHART_H,
      distKm: p.distKm,
      eleM: p.eleM,
      gradePct: grade != null ? Number(grade.toFixed(1)) : null,
    };
  });
  return { stats, series, hasElevationData: true, yMin, yMax, totalDistKm };
}

function WebElevationChart({ series, probe, stats }) {
  if (!series.length) return null;
  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;
  const probeX =
    probe?.distKm != null && stats.totalDistKm > 0
      ? (probe.distKm / stats.totalDistKm) * CHART_W
      : null;
  const probeY =
    probe?.eleM != null && stats.minEle != null && stats.maxEle != null
      ? CHART_H -
        ((probe.eleM - (stats.minEle - (stats.maxEle - stats.minEle) * 0.08)) /
          Math.max(
            stats.maxEle -
              stats.minEle +
              (stats.maxEle - stats.minEle) * 0.16,
            1
          )) *
          CHART_H
      : null;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      width="100%"
      height={CHART_H}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="ravitobox-elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#CCFBF1" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#ravitobox-elev-fill)" />
      {series.map((p, i) =>
        i === 0 ? null : (
          <line
            key={`seg-${i}`}
            x1={series[i - 1].x}
            y1={series[i - 1].y}
            x2={p.x}
            y2={p.y}
            stroke={slopeColor(p.gradePct)}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )
      )}
      {probeX != null ? (
        <>
          <line
            x1={probeX}
            y1={0}
            x2={probeX}
            y2={CHART_H}
            stroke="#F97316"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.9"
          />
          {probeY != null ? (
            <circle cx={probeX} cy={probeY} r="5.5" fill="#F97316" stroke="#fff" strokeWidth="2" />
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

function NativeElevationChart({ series, probe, stats }) {
  if (!series.length) return null;
  const probeLeft =
    probe?.distKm != null && stats.totalDistKm > 0
      ? `${((probe.distKm / stats.totalDistKm) * 100).toFixed(2)}%`
      : null;
  return (
    <View style={styles.nativeChart}>
      {series.map((p, i) => (
        <View
          key={`col-${i}`}
          style={[
            styles.nativeCol,
            {
              left: `${(p.x / CHART_W) * 100}%`,
              height: `${((CHART_H - p.y) / CHART_H) * 100}%`,
              backgroundColor: slopeColor(p.gradePct),
            },
          ]}
        />
      ))}
      {probeLeft != null ? (
        <View style={[styles.nativeProbeLine, { left: probeLeft }]} />
      ) : null}
    </View>
  );
}

export default function TrailElevationProfile({ trail, probe = null }) {
  const chart = useMemo(() => (trail ? buildChartSeries(trail) : null), [trail]);
  const profileRows = useMemo(() => {
    if (!chart?.stats?.points?.length) return [];
    return chart.stats.points.map((p) => [p.distKm, p.gainM, p.eleM]);
  }, [chart]);
  const activeGrade =
    probe?.gradePct != null
      ? probe.gradePct
      : probe?.distKm != null && profileRows.length
      ? gradePercentAtDist(profileRows, probe.distKm)
      : null;
  const activeTerrain =
    probe?.terrainLabel || terrainLabelFromGrade(activeGrade);

  if (!trail || !chart) return null;
  const { stats, series, hasElevationData } = chart;

  if (!stats.points.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Profil altimétrique</Text>
        <Text style={styles.empty}>Pas de géométrie pour cette trace.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Profil altimétrique</Text>
      <View style={styles.statsRow}>
        <Text style={styles.statChip}>
          {stats.totalDistKm.toFixed(1)} km
        </Text>
        <Text style={styles.statChip}>D+ {stats.totalGainM} m</Text>
        {stats.totalLossM > 0 ? (
          <Text style={styles.statChip}>D− {stats.totalLossM} m</Text>
        ) : null}
        {hasElevationData && stats.minEle != null && stats.maxEle != null ? (
          <Text style={styles.statChip}>
            {stats.minEle}–{stats.maxEle} m
          </Text>
        ) : null}
      </View>
      {!hasElevationData ? (
        <Text style={styles.empty}>
          Altitudes GPX absentes pour cette trace. Re-importe ou remplace le GPX
          pour afficher la courbe (montées, plat, descentes).
        </Text>
      ) : (
        <>
          <View style={styles.chartBox}>
            {Platform.OS === "web" ? (
              <WebElevationChart series={series} probe={probe} stats={stats} />
            ) : (
              <NativeElevationChart series={series} probe={probe} stats={stats} />
            )}
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#EA580C" label="Montée" />
            <LegendDot color="#16A34A" label="Plat" />
            <LegendDot color="#2563EB" label="Descente" />
          </View>
        </>
      )}
      {probe ? (
        <View style={styles.probeBox}>
          <Text style={styles.probeTitle}>Point sur le tracé</Text>
          <Text style={styles.probeValue}>
            {Number(probe.distKm || 0).toFixed(2)} km
            {probe.eleM != null ? ` · ${probe.eleM} m` : ""}
            {probe.gainM != null ? ` · D+ ${Math.round(probe.gainM)} m` : ""}
          </Text>
          <Text style={[styles.probeTerrain, { color: slopeColor(activeGrade) }]}>
            {activeTerrain}
            {activeGrade != null ? ` (${activeGrade > 0 ? "+" : ""}${activeGrade} %)` : ""}
          </Text>
        </View>
      ) : (
        <Text style={styles.hint}>
          {Platform.OS === "web"
            ? "Survole le tracé sur la carte : le curseur orange suit ta position sur le profil."
            : "Tape près du tracé sur la carte pour positionner le curseur sur le profil."}
        </Text>
      )}
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F8FFFE",
    borderRadius: 14,
    padding: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  statChip: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
  },
  chartBox: {
    height: CHART_H,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#FFFFFF",
  },
  nativeChart: {
    flex: 1,
    height: CHART_H,
    position: "relative",
    backgroundColor: "#F0FDFA",
  },
  nativeCol: {
    position: "absolute",
    bottom: 0,
    width: 3,
    marginLeft: -1.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    opacity: 0.92,
  },
  nativeProbeLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: "#F97316",
    opacity: 0.95,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  probeBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#D1FAE5",
  },
  probeTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 4,
  },
  probeValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  probeTerrain: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  empty: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
  },
});
