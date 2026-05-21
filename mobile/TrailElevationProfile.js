import React, { useMemo, useRef, useCallback } from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
import {
  getTrailProfileStats,
  getTrailAltitudeMeta,
  terrainLabelFromGrade,
  gradePercentAtDist,
} from "./trailProfile";

const CHART_H_INLINE = 128;
const CHART_H_OVERLAY = 200;
const CHART_H_RAIL = 168;
const CHART_W_INLINE = 320;
const CHART_W_OVERLAY = 680;
const CHART_W_RAIL = 276;

function slopeColor(gradePct) {
  if (gradePct == null) return "#94A3B8";
  if (gradePct >= 12) return "#DC2626";
  if (gradePct >= 5) return "#EA580C";
  if (gradePct > -5) return "#16A34A";
  if (gradePct > -12) return "#2563EB";
  return "#4338CA";
}

function buildChartSeries(trail, chartW, chartH) {
  const stats = getTrailProfileStats(trail);
  const { points, hasElevationData, minEle, maxEle, totalDistKm } = stats;
  if (!points.length || totalDistKm <= 0) {
    return { stats, series: [], hasElevationData: false, chartW, chartH };
  }
  if (!hasElevationData || minEle == null || maxEle == null) {
    return { stats, series: [], hasElevationData: false, chartW, chartH };
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
        ? ((p.eleM - prev.eleM) /
            Math.max(0.001, (p.distKm - prev.distKm) * 1000)) *
          100
        : null;
    return {
      x: (p.distKm / totalDistKm) * chartW,
      y: chartH - ((p.eleM - yMin) / ySpan) * chartH,
      distKm: p.distKm,
      eleM: p.eleM,
      gradePct: grade != null ? Number(grade.toFixed(1)) : null,
    };
  });
  return {
    stats,
    series,
    hasElevationData: true,
    yMin,
    yMax,
    totalDistKm,
    chartW,
    chartH,
  };
}

function probeYOnChart(probe, stats, chartH) {
  if (probe?.eleM == null || stats.minEle == null || stats.maxEle == null) {
    return null;
  }
  const span = Math.max(stats.maxEle - stats.minEle, 1);
  const pad = span * 0.08;
  const yMin = stats.minEle - pad;
  const yMax = stats.maxEle + pad;
  const ySpan = Math.max(yMax - yMin, 1);
  return chartH - ((probe.eleM - yMin) / ySpan) * chartH;
}

function WebElevationChart({
  series,
  probe,
  stats,
  chartW,
  chartH,
  interactive,
  onProbeAtDist,
  onChartHoverStart,
  onChartHoverEnd,
}) {
  const svgRef = useRef(null);

  const handlePointer = useCallback(
    (clientX, rect) => {
      if (!interactive || !onProbeAtDist || !stats.totalDistKm) return;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onProbeAtDist(frac * stats.totalDistKm);
    },
    [interactive, onProbeAtDist, stats.totalDistKm]
  );

  if (!series.length) return null;
  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${chartW} ${chartH} L 0 ${chartH} Z`;
  const probeX =
    probe?.distKm != null && stats.totalDistKm > 0
      ? (probe.distKm / stats.totalDistKm) * chartW
      : null;
  const probeY = probe ? probeYOnChart(probe, stats, chartH) : null;

  const pointerHandlers =
    Platform.OS === "web" && interactive
      ? {
          onMouseMove: (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            handlePointer(e.clientX, rect);
          },
          onMouseEnter: () => onChartHoverStart?.(),
          onMouseLeave: () => {
            onChartHoverEnd?.();
          },
          style: { display: "block", cursor: "crosshair" },
        }
      : { style: { display: "block" } };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chartW} ${chartH}`}
      width="100%"
      height={chartH}
      preserveAspectRatio="none"
      {...pointerHandlers}
    >
      <defs>
        <linearGradient id="ravitobox-elev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#FEF9C3" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={`grid-${f}`}
          x1={chartW * f}
          y1={0}
          x2={chartW * f}
          y2={chartH}
          stroke="rgba(148,163,184,0.25)"
          strokeWidth="1"
        />
      ))}
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
            strokeWidth={interactive ? 4.5 : 3.5}
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
            y2={chartH}
            stroke="#EA580C"
            strokeWidth="2"
            opacity="0.95"
          />
          {probeY != null ? (
            <circle
              cx={probeX}
              cy={probeY}
              r="7"
              fill="#EA580C"
              stroke="#fff"
              strokeWidth="2.5"
            />
          ) : null}
        </>
      ) : null}
      <text x={4} y={12} fontSize="9" fill="#64748B" fontWeight="600">
        {stats.maxEle} m
      </text>
      <text x={4} y={chartH - 4} fontSize="9" fill="#64748B" fontWeight="600">
        {stats.minEle} m
      </text>
      <text
        x={chartW - 4}
        y={chartH - 4}
        fontSize="9"
        fill="#64748B"
        fontWeight="600"
        textAnchor="end"
      >
        {stats.totalDistKm.toFixed(0)} km
      </text>
    </svg>
  );
}

function NativeElevationChart({ series, probe, stats, chartH }) {
  if (!series.length) return null;
  const chartW = CHART_W_INLINE;
  const probeLeft =
    probe?.distKm != null && stats.totalDistKm > 0
      ? `${((probe.distKm / stats.totalDistKm) * 100).toFixed(2)}%`
      : null;
  return (
    <View style={[styles.nativeChart, { height: chartH }]}>
      {series.map((p, i) => (
        <View
          key={`col-${i}`}
          style={[
            styles.nativeCol,
            {
              left: `${(p.x / chartW) * 100}%`,
              height: `${((chartH - p.y) / chartH) * 100}%`,
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

export default function TrailElevationProfile({
  trail,
  probe = null,
  variant = "inline",
  interactive = false,
  onProbeAtDist,
  onChartHoverStart,
  onChartHoverEnd,
}) {
  const isOverlay = variant === "overlay";
  const isRail = variant === "rail";
  const chartW = isRail
    ? CHART_W_RAIL
    : isOverlay
    ? CHART_W_OVERLAY
    : CHART_W_INLINE;
  const chartH = isRail
    ? CHART_H_RAIL
    : isOverlay
    ? CHART_H_OVERLAY
    : CHART_H_INLINE;

  const chart = useMemo(
    () => (trail ? buildChartSeries(trail, chartW, chartH) : null),
    [trail, chartW, chartH]
  );
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
  const altMeta = getTrailAltitudeMeta(trail);
  const { stats, series, hasElevationData } = chart;
  const showChart = altMeta.canShowElevationChart && hasElevationData;

  if (!stats.points.length) {
    return (
      <View
        style={[
          styles.wrap,
          isOverlay && styles.wrapOverlay,
          isRail && styles.wrapRail,
        ]}
      >
        {!isOverlay && !isRail ? (
          <Text style={styles.title}>Profil altimétrique</Text>
        ) : null}
        <Text style={styles.empty}>Pas de géométrie pour cette trace.</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        isOverlay && styles.wrapOverlay,
        isRail && styles.wrapRail,
      ]}
    >
      {!isOverlay && !isRail ? (
        <Text style={styles.title}>Profil altimétrique</Text>
      ) : null}
      {!isOverlay && !isRail ? (
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
      ) : null}
      {!showChart ? (
        <View style={styles.noElevBox}>
          <Text style={styles.noElevTitle}>
            {altMeta.status === "none"
              ? "Pas de profil altimétrique"
              : "Profil altimétrique non disponible"}
          </Text>
          <Text style={styles.empty}>
            {altMeta.missingMessage ||
              "Re-importe un GPX contenant des altitudes (<ele>)."}
          </Text>
          {altMeta.status === "gain_only" && altMeta.elevationM > 0 ? (
            <Text style={styles.noElevHint}>
              D+ enregistré pour cette trace : {altMeta.elevationM} m (sans
              courbe ni suivi carte).
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={[
              styles.chartBox,
              isOverlay && styles.chartBoxOverlay,
              isRail && styles.chartBoxRail,
              { height: isRail ? chartH : chartH },
            ]}
          >
            {Platform.OS === "web" ? (
              <WebElevationChart
                series={series}
                probe={probe}
                stats={stats}
                chartW={chartW}
                chartH={chartH}
                interactive={interactive}
                onProbeAtDist={onProbeAtDist}
                onChartHoverStart={onChartHoverStart}
                onChartHoverEnd={onChartHoverEnd}
              />
            ) : (
              <NativeElevationChart
                series={series}
                probe={probe}
                stats={stats}
                chartH={chartH}
              />
            )}
          </View>
          <View style={[styles.legendRow, isRail && styles.legendRowRail]}>
            <LegendDot color="#EA580C" label="Montée" />
            <LegendDot color="#16A34A" label="Plat" />
            <LegendDot color="#2563EB" label="Descente" />
          </View>
        </>
      )}
      {!isOverlay && !isRail && probe ? (
        <View style={styles.probeBox}>
          <Text style={styles.probeTitle}>Point sur le tracé</Text>
          <Text style={styles.probeValue}>
            {Number(probe.distKm || 0).toFixed(2)} km
            {probe.eleM != null ? ` · ${probe.eleM} m` : ""}
            {probe.gainM != null ? ` · D+ ${Math.round(probe.gainM)} m` : ""}
          </Text>
          <Text style={[styles.probeTerrain, { color: slopeColor(activeGrade) }]}>
            {activeTerrain}
            {activeGrade != null
              ? ` (${activeGrade > 0 ? "+" : ""}${activeGrade} %)`
              : ""}
          </Text>
        </View>
      ) : null}
      {!isOverlay && !isRail && !probe && showChart ? (
        <Text style={styles.hint}>
          {Platform.OS === "web"
            ? "Survole le tracé ou la courbe ci-dessus."
            : "Tape près du tracé sur la carte."}
        </Text>
      ) : null}
      {isOverlay && probe ? (
        <View style={styles.overlayProbeRow}>
          <Text style={styles.overlayProbeText}>
            <Text style={styles.overlayProbeStrong}>
              {Number(probe.distKm || 0).toFixed(1)} km
            </Text>
            {probe.eleM != null ? ` · ${probe.eleM} m` : ""}
            {probe.gainM != null ? ` · D+ ${Math.round(probe.gainM)} m` : ""}
            {" · "}
            <Text style={{ color: slopeColor(activeGrade) }}>{activeTerrain}</Text>
          </Text>
        </View>
      ) : null}
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
  wrapOverlay: {
    marginTop: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
  },
  wrapRail: {
    flex: 1,
    marginTop: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    minHeight: 0,
  },
  chartBoxRail: {
    flex: 1,
    minHeight: 100,
    borderColor: "#E8EFE9",
    backgroundColor: "#FAFAF9",
    borderRadius: 12,
  },
  legendRowRail: {
    marginTop: 4,
    gap: 8,
    paddingHorizontal: 2,
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
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#FFFFFF",
  },
  chartBoxOverlay: {
    borderColor: "#E2E8F0",
    borderRadius: 12,
  },
  nativeChart: {
    flex: 1,
    position: "relative",
    backgroundColor: "#FFFBEB",
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
  overlayProbeRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  overlayProbeText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
    lineHeight: 18,
  },
  overlayProbeStrong: {
    fontWeight: "800",
    color: "#0F172A",
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
  noElevBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  noElevTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 6,
  },
  noElevHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309",
    lineHeight: 17,
  },
});
