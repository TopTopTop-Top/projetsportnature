import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const theme = {
  primary: "#0D9488",
  inkMuted: "#64748B",
  ink: "#0F172A",
  border: "#E2E8F0",
  surfaceMuted: "#F0FDFA",
};

export function formatRelevanceLine(avg, count, { empty = "Pas encore noté" } = {}) {
  const n = Number(count) || 0;
  const a = Number(avg) || 0;
  if (!n) return empty;
  return `Pertinence ${a.toFixed(1)}/5 · ${n} vote${n > 1 ? "s" : ""}`;
}

export function formatHostRatingShort(box) {
  const n = Number(box?.host_review_count) || 0;
  const avg = Number(box?.host_avg_score) || 0;
  if (!n) return null;
  return `Hôte ★ ${avg.toFixed(1)} (${n})`;
}

export function formatTrailSignals(trail) {
  const parts = [];
  const rel = formatRelevanceLine(
    trail?.relevance_avg_score,
    trail?.relevance_count,
    { empty: "" }
  );
  if (rel) parts.push(rel);
  const tips = Number(trail?.tip_count) || 0;
  if (tips > 0) parts.push(`${tips} conseil${tips > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "Trace sans signal pour l’instant";
}

export function formatPlanSignals(plan) {
  const parts = [];
  const rel = formatRelevanceLine(
    plan?.relevance_avg_score,
    plan?.relevance_count,
    { empty: "" }
  );
  if (rel) parts.push(rel);
  const forks = Number(plan?.fork_count) || 0;
  if (forks > 0) parts.push(`${forks} reprise${forks > 1 ? "s" : ""}`);
  const boxes = Number(plan?.selected_box_count ?? plan?.box_count) || 0;
  if (boxes > 0) parts.push(`${boxes} box`);
  return parts.length ? parts.join(" · ") : "Plan sans signal pour l’instant";
}

export function RelevanceBadge({ avg, count, compact }) {
  const n = Number(count) || 0;
  const a = Number(avg) || 0;
  if (!n) {
    return (
      <View style={[styles.badge, styles.badgeMuted]}>
        <Text style={[styles.badgeText, styles.badgeTextMuted]}>
          {compact ? "—" : "Nouveau"}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeActive]}>
      <Text style={[styles.badgeText, styles.badgeTextActive]}>
        ★ {a.toFixed(1)} ({n})
      </Text>
    </View>
  );
}

export function RelevanceVoteRow({
  label = "Ta note de pertinence",
  myScore = null,
  disabled,
  disabledReason,
  onVote,
}) {
  const current = Number(myScore);
  const locked = Boolean(disabled || disabledReason);
  return (
    <View style={styles.voteWrap}>
      <Text style={styles.voteLabel}>{label}</Text>
      {locked ? (
        <Text style={styles.voteDisabled}>
          {disabledReason ||
            "Tu ne peux pas noter pour l’instant (parcours non éligible)."}
        </Text>
      ) : (
        <>
          <View style={styles.voteStars}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = Number.isFinite(current) && star <= current;
              return (
                <TouchableOpacity
                  key={`rel-star-${star}`}
                  disabled={locked}
                  onPress={() => onVote?.(star)}
                  style={styles.voteStarBtn}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.voteStar,
                      active ? styles.voteStarOn : styles.voteStarOff,
                    ]}
                  >
                    ★
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.voteHint}>
            1 = peu pertinent · 5 = très utile · réservation terminée requise
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeMuted: {
    backgroundColor: "#F8FAFC",
    borderColor: theme.border,
  },
  badgeActive: {
    backgroundColor: theme.surfaceMuted,
    borderColor: "#99F6E4",
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  badgeTextMuted: { color: theme.inkMuted },
  badgeTextActive: { color: "#0F766E" },
  voteWrap: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "#F8FAFC",
  },
  voteLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.ink,
    marginBottom: 6,
  },
  voteStars: { flexDirection: "row", gap: 4 },
  voteStarBtn: { padding: 4 },
  voteStar: { fontSize: 26, lineHeight: 30 },
  voteStarOn: { color: "#F59E0B" },
  voteStarOff: { color: "#CBD5E1" },
  voteHint: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: theme.inkMuted,
  },
  voteDisabled: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: "#B45309",
    fontWeight: "600",
  },
});
