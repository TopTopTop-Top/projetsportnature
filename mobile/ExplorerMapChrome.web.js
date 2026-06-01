import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

/**
 * Contrôles compacts sur la carte (sans masquer le tracé).
 */
export default function ExplorerMapChrome({
  probe,
  probeLocked = false,
  onToggleProbeLock,
  onExitTrail,
}) {
  const km =
    probe?.distKm != null ? `${Number(probe.distKm).toFixed(1)} km` : null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} pointerEvents="auto">
        <Text style={styles.status} numberOfLines={1}>
          {probeLocked
            ? km
              ? `Point figé · ${km}`
              : "Point figé"
            : "Suivi dynamique · survole la trace"}
        </Text>
        <View style={styles.actions}>
          {probeLocked ? (
            <Pressable
              onPress={() => onToggleProbeLock?.(false)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reprendre le suivi dynamique sur la trace"
            >
              <Text style={styles.btnPrimaryText}>Suivi dynamique</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onToggleProbeLock?.(true)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Figer un point sur la trace"
            >
              <Text style={styles.btnGhostText}>Figuer</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onExitTrail}
            style={({ pressed }) => [
              styles.btn,
              styles.btnDanger,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Quitter la trace sélectionnée"
          >
            <Text style={styles.btnDangerText}>Quitter trace</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 10,
    right: 10,
    left: 52,
    zIndex: 1300,
    alignItems: "flex-end",
    pointerEvents: "box-none",
  },
  bar: {
    maxWidth: 340,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 118, 110, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  status: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 6,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
  },
  btn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnPrimary: {
    backgroundColor: "#0F766E",
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  btnGhost: {
    backgroundColor: "#F0FDF9",
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  btnGhostText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
  },
  btnDanger: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  btnDangerText: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "700",
  },
});
