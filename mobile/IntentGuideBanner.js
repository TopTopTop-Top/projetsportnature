import React from "react";
import { View, Text, StyleSheet } from "react-native";

const theme = {
  primary: "#0D9488",
  ink: "#0F172A",
  inkMuted: "#64748B",
  border: "#E2E8F0",
  surface: "#F0FDFA",
};

/**
 * Bloc court « que faire ici » pour clarifier le parcours produit.
 */
export default function IntentGuideBanner({ title, lines = [] }) {
  if (!title && (!lines || lines.length === 0)) return null;
  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {lines.map((line, i) => (
        <Text key={`igl-${i}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.ink,
  },
  line: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
  },
});
