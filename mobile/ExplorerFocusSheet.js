import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";

/**
 * Bottom sheet mobile : détail focus box/trace (parité minimale avec le rail web).
 */
export default function ExplorerFocusSheet({
  visible,
  kind, // "box" | "trail"
  title,
  subtitle,
  metaLines = [],
  picked = false,
  canBook = false,
  onClose,
  onTogglePick,
  onBook,
  onSavePlan,
  onCenterMap,
}) {
  if (!visible) return null;

  const kicker = kind === "trail" ? "Trace en focus" : "Box en focus";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>{kicker}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {title || "—"}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={20} color={theme.inkMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {metaLines.map((line, i) => (
              <Text key={`meta-${i}`} style={styles.meta}>
                {line}
              </Text>
            ))}
            <View
              style={[
                styles.pill,
                picked ? styles.pillPicked : styles.pillIdle,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  picked ? styles.pillTextPicked : styles.pillTextIdle,
                ]}
              >
                {picked ? "Dans ton plan" : "Pas encore dans le plan"}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            {onCenterMap ? (
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={onCenterMap}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="locate-outline"
                  size={18}
                  color={theme.primary}
                />
                <Text style={styles.btnOutlineText}>Voir sur la carte</Text>
              </TouchableOpacity>
            ) : null}
            {onTogglePick ? (
              <TouchableOpacity
                style={styles.btnOutline}
                onPress={onTogglePick}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={picked ? "remove-circle-outline" : "add-circle-outline"}
                  size={18}
                  color={theme.primary}
                />
                <Text style={styles.btnOutlineText}>
                  {picked ? "Retirer du plan" : "Ajouter au plan"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {kind === "box" && canBook && onBook ? (
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={onBook}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Choisir le créneau</Text>
              </TouchableOpacity>
            ) : null}
            {kind === "trail" && onSavePlan ? (
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={onSavePlan}
                activeOpacity={0.85}
              >
                <Ionicons name="bookmark-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Enregistrer le plan</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11, 31, 24, 0.45)",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
    maxHeight: "72%",
    borderTopWidth: 1,
    borderColor: theme.borderSoft,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.ink,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: theme.inkMuted,
  },
  body: {
    maxHeight: 160,
  },
  meta: {
    fontSize: 13,
    color: theme.inkMuted,
    marginBottom: 4,
  },
  pill: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  pillPicked: {
    backgroundColor: theme.pickedSoft,
    borderColor: theme.chipBorder,
  },
  pillIdle: {
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.borderSoft,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pillTextPicked: {
    color: theme.picked,
  },
  pillTextIdle: {
    color: theme.inkMuted,
  },
  actions: {
    marginTop: 12,
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: theme.chipBorder,
    backgroundColor: theme.primarySoft,
    borderRadius: theme.radius.md,
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnOutlineText: {
    color: theme.primary,
    fontWeight: "700",
    fontSize: 14,
  },
});
