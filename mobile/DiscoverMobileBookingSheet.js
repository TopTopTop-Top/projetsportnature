import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";
import FunnelSteps from "./FunnelSteps";
import { toggleTagInText, textHasTag } from "./outdoorNeeds";

/**
 * Bottom sheet mobile : box choisie → créneau → besoins → envoi.
 */
export default function DiscoverMobileBookingSheet({
  visible,
  box,
  projectLabel,
  bookingDate,
  onDateChange,
  startTime,
  onStartChange,
  endTime,
  onEndChange,
  specialRequest,
  onSpecialRequestChange,
  needChips = [],
  DateTimeSelector,
  formatOfferLines,
  onClose,
  onSubmit,
  onRequestRavito,
}) {
  const [needsOpen, setNeedsOpen] = useState(false);
  if (!visible || !box) return null;

  const price = (Number(box.price_cents || 0) / 100).toFixed(2);
  const offerLines = typeof formatOfferLines === "function"
    ? formatOfferLines(box).slice(0, 3)
    : [];
  const activeNeeds = (needChips || []).filter((c) =>
    textHasTag(specialRequest, c)
  );

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
              <Text style={styles.kicker}>Réserver</Text>
              <Text style={styles.title} numberOfLines={2}>
                {box.title || "Box"}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {[box.city, `${price} €`, projectLabel]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={18} color={theme.inkMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {offerLines.map((line, i) => (
              <Text key={`off-${i}`} style={styles.offerLine}>
                • {line}
              </Text>
            ))}

            <FunnelSteps activeId="ask" compact />

            <Text style={styles.sectionLabel}>Créneau d’arrivée</Text>
            {DateTimeSelector ? (
              <DateTimeSelector
                dateValue={bookingDate}
                onDateChange={onDateChange}
                startValue={startTime}
                onStartChange={onStartChange}
                endValue={endTime}
                onEndChange={onEndChange}
              />
            ) : null}

            <TouchableOpacity
              style={styles.needsToggle}
              onPress={() => setNeedsOpen((v) => !v)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.needsToggleTitle}>
                  Besoins
                  {activeNeeds.length ? ` (${activeNeeds.length})` : ""}
                </Text>
                <Text style={styles.needsToggleMeta} numberOfLines={1}>
                  {activeNeeds.length
                    ? activeNeeds.slice(0, 3).join(" · ")
                    : "Eau, snacks, régimes…"}
                </Text>
              </View>
              <Ionicons
                name={needsOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.inkMuted}
              />
            </TouchableOpacity>

            {needsOpen ? (
              <View style={styles.needsBody}>
                <View style={styles.chipRow}>
                  {needChips.map((chip) => {
                    const on = textHasTag(specialRequest, chip);
                    return (
                      <TouchableOpacity
                        key={`need-${chip}`}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() =>
                          onSpecialRequestChange?.(
                            toggleTagInText(specialRequest || "", chip)
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.input, styles.area]}
                  placeholder="Précisions (sans gluten, arrivée ~14h…)"
                  placeholderTextColor={theme.inkMuted}
                  value={specialRequest}
                  onChangeText={onSpecialRequestChange}
                  multiline
                />
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={onSubmit}
              activeOpacity={0.88}
            >
              <Ionicons name="send-outline" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Envoyer la demande</Text>
            </TouchableOpacity>
            {onRequestRavito ? (
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={onRequestRavito}
                activeOpacity={0.85}
              >
                <Text style={styles.btnGhostText}>Ravito GPS ici</Text>
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
    backgroundColor: "rgba(16, 22, 20, 0.45)",
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    maxHeight: "82%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
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
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceMuted,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.ink,
    fontFamily: theme.fontDisplay,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: theme.inkMuted,
  },
  body: { maxHeight: 420 },
  offerLine: {
    fontSize: 12,
    color: theme.inkMuted,
    marginBottom: 2,
  },
  sectionLabel: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "800",
    color: theme.inkMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  needsToggle: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.surfaceMuted,
  },
  needsToggleTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.ink,
  },
  needsToggleMeta: {
    marginTop: 2,
    fontSize: 12,
    color: theme.inkMuted,
  },
  needsBody: { marginTop: 8 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  chipOn: {
    backgroundColor: theme.ink,
    borderColor: theme.ink,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.ink,
  },
  chipTextOn: { color: "#fff" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.ink,
    backgroundColor: theme.surface,
  },
  area: { minHeight: 64, textAlignVertical: "top" },
  footer: { marginTop: 8, gap: 8 },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  btnGhost: {
    alignItems: "center",
    paddingVertical: 8,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.inkMuted,
  },
});
