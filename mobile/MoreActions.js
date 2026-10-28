import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";

/**
 * Actions secondaires repliées — garde l’écran lisible.
 */
export default function MoreActions({
  label = "Plus d’actions",
  children,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children) return null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>{label}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.inkMuted}
        />
      </TouchableOpacity>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius?.sm || 8,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surface,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.inkMuted,
  },
  body: {
    marginTop: 8,
    gap: 6,
  },
});
