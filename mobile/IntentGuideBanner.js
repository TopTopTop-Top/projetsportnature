import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";
import {
  isGuideDismissed,
  dismissGuide,
  isSimpleUi,
} from "./uiPrefsStorage";

/**
 * Aide courte dismissible — discrète (pas de bandeau « promo »).
 * Masquée en mode simple.
 */
export default function IntentGuideBanner({
  title,
  lines = [],
  guideId,
}) {
  const [hidden, setHidden] = useState(() =>
    guideId ? isGuideDismissed(guideId) : false
  );

  if (isSimpleUi()) return null;
  if (hidden || (!title && (!lines || lines.length === 0))) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
        </View>
        {guideId ? (
          <TouchableOpacity
            onPress={() => {
              dismissGuide(guideId);
              setHidden(true);
            }}
            hitSlop={10}
            accessibilityLabel="Masquer cette aide"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={14} color={theme.inkMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
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
    borderWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: theme.primary,
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceMuted,
    borderWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  line: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
});
