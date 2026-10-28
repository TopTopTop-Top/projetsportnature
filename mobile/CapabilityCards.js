import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";

const CARDS = [
  {
    key: "user",
    title: "Utilisateur",
    subtitle: "Réserver des box, demander un ravito sur le trajet.",
    icon: "walk-outline",
  },
  {
    key: "host",
    title: "Hôte",
    subtitle: "Publier une box fixe (eau, nourriture, accès).",
    icon: "home-outline",
  },
  {
    key: "ravito",
    title: "Ravitailleur",
    subtitle: "Aider un coureur au point GPS, même sans box.",
    icon: "bicycle-outline",
  },
];

/**
 * Choix des casquettes — un compte, plusieurs activités (cumulables).
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
            style={[styles.card, on && styles.cardOn]}
            onPress={() => toggle(c.key)}
            activeOpacity={0.88}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
              <Ionicons
                name={c.icon}
                size={22}
                color={on ? theme.white : theme.primary}
              />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.title, on && styles.titleOn]}>{c.title}</Text>
              <Text style={styles.subtitle}>{c.subtitle}</Text>
            </View>
            <Ionicons
              name={on ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={on ? theme.primary : theme.border}
            />
          </TouchableOpacity>
        );
      })}
      <Text style={styles.hint}>
        Tu peux tout cumuler. Change d’avis quand tu veux dans Compte.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surface,
    ...(Platform.OS === "web"
      ? { transition: "border-color 160ms ease, background-color 160ms ease" }
      : null),
  },
  cardOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.chipBg,
    borderWidth: 1,
    borderColor: theme.chipBorder,
  },
  iconWrapOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.2,
  },
  titleOn: {
    color: theme.secondary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
  },
});
