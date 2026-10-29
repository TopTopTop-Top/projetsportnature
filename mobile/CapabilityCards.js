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
                size={18}
                color={on ? "#fff" : theme.ink}
              />
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.title, on && styles.titleOn]}>{c.title}</Text>
              <Text style={styles.subtitle}>{c.subtitle}</Text>
            </View>
            <Ionicons
              name={on ? "checkmark" : "add"}
              size={18}
              color={on ? theme.primary : theme.inkMuted}
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
    gap: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.surface,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.borderSoft,
    backgroundColor: theme.surface,
    ...(Platform.OS === "web"
      ? { transition: "background-color 140ms ease" }
      : null),
  },
  cardOn: {
    backgroundColor: theme.surfaceMuted,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceMuted,
  },
  iconWrapOn: {
    backgroundColor: theme.ink,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  titleOn: {
    color: theme.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  hint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
    paddingHorizontal: 2,
  },
});
