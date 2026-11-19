import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";

const CARDS = [
  { key: "user", title: "Coureur", icon: "checkmark" },
  { key: "host", title: "Hôte", icon: "add" },
  { key: "ravito", title: "Ravitailleur", icon: "add" },
];

/**
 * Casquettes Figma — pastilles horizontales cumulables.
 */
export default function CapabilityCards({
  value = { user: true, host: false, ravito: false },
  onChange,
  busy = false,
}) {
  const toggle = (key) => {
    if (busy || typeof onChange !== "function") return;
    const next = {
      user: !!value.user,
      host: !!value.host,
      ravito: !!value.ravito,
      [key]: !value[key],
    };
    if (!next.user && !next.host && !next.ravito) {
      next[key] = true;
    }
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      {CARDS.map((c) => {
        const on = !!value[c.key];
        return (
          <TouchableOpacity
            key={c.key}
            style={[styles.pill, on && styles.pillOn]}
            onPress={() => toggle(c.key)}
            activeOpacity={0.88}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Ionicons
              name={on ? "checkmark" : "add"}
              size={14}
              color={on ? "#fff" : theme.primary}
              style={styles.icon}
            />
            <Text style={[styles.label, on && styles.labelOn]}>
              {on ? c.title : `+ ${c.title}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    ...(Platform.OS === "web"
      ? { transition: "background-color 140ms ease" }
      : null),
  },
  pillOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.primary,
    fontFamily: theme.font,
  },
  labelOn: {
    color: "#fff",
  },
});
