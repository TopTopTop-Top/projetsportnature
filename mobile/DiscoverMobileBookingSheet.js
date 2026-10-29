import React, { useEffect, useState } from "react";
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
 * Bottom sheet mobile autonome : créneau → besoins → récap (box déjà choisie).
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
  slotWellFormed,
  onClose,
  onSubmit,
  onRequestRavito,
}) {
  const [step, setStep] = useState(2); // 2 créneau, 3 besoins, 4 récap

  useEffect(() => {
    if (visible) setStep(2);
  }, [visible, box?.id]);

  if (!visible || !box) return null;

  const price = (Number(box.price_cents || 0) / 100).toFixed(2);
  const offerLines =
    typeof formatOfferLines === "function"
      ? formatOfferLines(box).slice(0, 3)
      : [];
  const activeNeeds = (needChips || []).filter((c) =>
    textHasTag(specialRequest, c)
  );
  const slotOk =
    typeof slotWellFormed === "function"
      ? slotWellFormed(bookingDate, startTime, endTime)
      : true;

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
              <Text style={styles.kicker}>
                Réserver une box · étape {step}/4
              </Text>
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

          <View style={styles.steps}>
            {[1, 2, 3, 4].map((n) => (
              <View
                key={`s-${n}`}
                style={[
                  styles.dot,
                  step === n && styles.dotOn,
                  step > n && styles.dotDone,
                  n === 1 && styles.dotDone,
                ]}
              >
                <Text style={[styles.dotText, (step >= n || n === 1) && styles.dotTextOn]}>
                  {n}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 2 ? (
              <>
                <Text style={styles.sectionLabel}>2 · Créneau d’arrivée</Text>
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
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={styles.sectionLabel}>3 · Besoins</Text>
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
              </>
            ) : null}

            {step === 4 ? (
              <>
                <FunnelSteps activeId="ask" compact />
                <Text style={styles.sectionLabel}>4 · Récap</Text>
                {offerLines.map((line, i) => (
                  <Text key={`off-${i}`} style={styles.offerLine}>
                    • {line}
                  </Text>
                ))}
                <Text style={styles.offerLine}>
                  Créneau · {bookingDate} · {startTime}–{endTime}
                </Text>
                <Text style={styles.offerLine}>
                  Besoins ·{" "}
                  {activeNeeds.length
                    ? activeNeeds.join(", ")
                    : specialRequest || "Aucun"}
                </Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {step === 2 ? (
              <TouchableOpacity
                style={[styles.btnPrimary, !slotOk && styles.btnMuted]}
                disabled={!slotOk}
                onPress={() => setStep(3)}
                activeOpacity={0.88}
              >
                <Text style={styles.btnPrimaryText}>Continuer — besoins</Text>
              </TouchableOpacity>
            ) : null}
            {step === 3 ? (
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.btnGhostText}>Retour</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { flex: 1 }]}
                  onPress={() => setStep(4)}
                  activeOpacity={0.88}
                >
                  <Text style={styles.btnPrimaryText}>Voir le récap</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {step === 4 ? (
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={onSubmit}
                  activeOpacity={0.88}
                >
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Envoyer la demande</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.btnGhostText}>Modifier</Text>
                </TouchableOpacity>
                {onRequestRavito ? (
                  <TouchableOpacity
                    style={styles.btnGhost}
                    onPress={onRequestRavito}
                  >
                    <Text style={styles.btnGhostText}>Ravito GPS ici</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
    maxHeight: "84%",
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
  steps: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dotOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  dotDone: {
    backgroundColor: theme.ink,
    borderColor: theme.ink,
  },
  dotText: { fontSize: 12, fontWeight: "800", color: theme.inkMuted },
  dotTextOn: { color: "#fff" },
  body: { maxHeight: 380 },
  sectionLabel: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "800",
    color: theme.inkMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  offerLine: {
    fontSize: 13,
    color: theme.inkMuted,
    marginBottom: 4,
    lineHeight: 18,
  },
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
  footerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  btnMuted: { opacity: 0.45 },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  btnGhost: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.inkMuted,
  },
});
