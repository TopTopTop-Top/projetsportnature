import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";
import { isGuideDismissed, dismissGuide } from "./uiPrefsStorage";

/**
 * Bloc court « que faire ici » — dismissible (1ère visite).
 */
export default function IntentGuideBanner({
  title,
  lines = [],
  guideId,
}) {
  const [hidden, setHidden] = useState(() =>
    guideId ? isGuideDismissed(guideId) : false
  );

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
            <Ionicons name="close" size={16} color={theme.inkMuted} />
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
    borderWidth: 1,
    borderColor: theme.infoBorder,
    backgroundColor: theme.infoBg,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSoft,
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
