import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { getTrailAltitudeMeta } from "./trailProfile";
import theme from "./theme";

const VARIANT_STYLES = {
  profile: {
    bg: theme.status.validated.bg,
    border: theme.status.validated.border,
    text: theme.status.validated.fg,
    icon: "⛰",
  },
  gain_only: {
    bg: theme.status.pending.bg,
    border: theme.status.pending.border,
    text: theme.status.pending.fg,
    icon: "↗",
  },
  none: {
    bg: theme.status.muted.bg,
    border: theme.status.muted.border,
    text: theme.status.muted.fg,
    icon: "—",
  },
};

/**
 * Pastille : indique si la trace a un profil altimétrique GPX, seulement un D+, ou rien.
 */
export default function TrailAltitudeBadge({ trail, compact = false }) {
  const meta = useMemo(
    () => (trail ? getTrailAltitudeMeta(trail) : null),
    [trail]
  );
  if (!meta) return null;
  // En compact : ne pas polluer l’UI si aucun dénivelé
  if (compact && meta.status === "none") return null;
  const v = VARIANT_STYLES[meta.status] || VARIANT_STYLES.none;

  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: v.bg, borderColor: v.border },
      ]}
    >
      <Text style={[styles.icon, { color: v.text }]}>{v.icon}</Text>
      <Text
        style={[styles.label, compact && styles.labelCompact, { color: v.text }]}
        numberOfLines={1}
      >
        {compact ? meta.badgeShort : meta.badgeLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 2,
  },
  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  icon: {
    fontSize: 11,
    fontWeight: "800",
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
  },
  labelCompact: {
    fontSize: 10,
  },
});
