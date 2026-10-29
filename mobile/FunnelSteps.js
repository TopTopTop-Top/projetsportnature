import React from "react";
import { View, Text, StyleSheet } from "react-native";
import theme from "./theme";
import { FUNNEL_STEPS } from "./outdoorNeeds";

/**
 * Barre d’étapes visuelle : Demande → Validation → Paiement.
 * @param {string} activeId ask | validate | pay
 */
export default function FunnelSteps({ activeId = "ask", compact = false }) {
  const activeIdx = Math.max(
    0,
    FUNNEL_STEPS.findIndex((s) => s.id === activeId)
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {FUNNEL_STEPS.map((step, i) => {
        const done = i < activeIdx;
        const current = i === activeIdx;
        return (
          <View key={step.id} style={styles.step}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                current && styles.dotCurrent,
              ]}
            >
              <Text
                style={[
                  styles.dotText,
                  (done || current) && styles.dotTextOn,
                ]}
              >
                {i + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.title,
                current && styles.titleCurrent,
                done && styles.titleDone,
              ]}
              numberOfLines={1}
            >
              {compact ? step.title.replace(/^\d+\.\s*/, "") : step.title}
            </Text>
            {!compact ? (
              <Text style={styles.short} numberOfLines={2}>
                {step.short}
              </Text>
            ) : null}
            {i < FUNNEL_STEPS.length - 1 ? (
              <View
                style={[styles.connector, done && styles.connectorDone]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  wrapCompact: {
    paddingVertical: 8,
    marginBottom: 10,
  },
  step: {
    flex: 1,
    alignItems: "center",
    position: "relative",
    minWidth: 0,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.border,
    marginBottom: 6,
    zIndex: 1,
  },
  dotDone: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  dotCurrent: {
    backgroundColor: theme.heroAccent,
    borderColor: theme.heroAccent,
  },
  dotText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.inkMuted,
  },
  dotTextOn: {
    color: "#fff",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.inkMuted,
    textAlign: "center",
  },
  titleCurrent: {
    color: theme.ink,
  },
  titleDone: {
    color: theme.primary,
  },
  short: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: theme.inkMuted,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  connector: {
    position: "absolute",
    top: 12,
    left: "55%",
    right: "-55%",
    height: 2,
    backgroundColor: theme.border,
    zIndex: 0,
  },
  connectorDone: {
    backgroundColor: theme.primary,
  },
});
