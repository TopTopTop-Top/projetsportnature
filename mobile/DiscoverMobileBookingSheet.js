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
import { toggleTagInText, textHasTag } from "./outdoorNeeds";

const STEP_LABELS = [
  { n: 1, label: "Box" },
  { n: 2, label: "Créneau" },
  { n: 3, label: "Besoins" },
  { n: 4, label: "Envoi" },
];

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
              <Text style={styles.kicker}>RÉSERVER UNE BOX</Text>
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
            {STEP_LABELS.map(({ n, label }) => {
              const active = step === n;
              const canGoBack = n >= 2 && n < step;
              return (
                <TouchableOpacity
                  key={`s-${n}`}
                  style={[styles.stepTab, active && styles.stepTabOn]}
                  disabled={!canGoBack}
                  onPress={() => setStep(n)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.stepTabText,
                      (active || n < step) && styles.stepTabTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    {n} {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 2 ? (
              <>
                <Text style={styles.sectionLabel}>Quand passez-vous ?</Text>
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
                <Text style={styles.sectionLabel}>De quoi avez-vous besoin ?</Text>
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
                <Text style={styles.sectionLabel}>Tout est prêt pour l’envoi.</Text>
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
                <View style={styles.infoBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={theme.primary}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={styles.infoBoxText}>
                    Aucun paiement maintenant. L’hôte valide d’abord votre
                    demande ; vous ne payez qu’après son acceptation.
                    {"\n\n"}
                    Annulation : 100 % remboursé au-delà de 48 h avant le
                    créneau, 50 % entre 24 h et 48 h, 0 % à moins de 24 h.
                  </Text>
                </View>
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
                <Text style={styles.btnPrimaryText}>Continuer →</Text>
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
                  <Text style={styles.btnPrimaryText}>Vérifier ma demande →</Text>
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
                  <Text style={styles.btnPrimaryText}>
                    Envoyer ma demande →
                  </Text>
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
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    marginBottom: 14,
  },
  stepTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -StyleSheet.hairlineWidth,
  },
  stepTabOn: { borderBottomColor: theme.primary },
  stepTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  stepTabTextOn: { color: theme.primary },
  body: { maxHeight: 380 },
  sectionLabel: {
    marginBottom: 12,
    fontSize: 20,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.3,
    fontFamily: theme.fontDisplay,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.infoBorder,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.ink,
    fontFamily: theme.font,
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
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.ink,
  },
  chipTextOn: { color: theme.primary },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.ink,
    backgroundColor: theme.surfaceMuted,
  },
  area: { minHeight: 64, textAlignVertical: "top" },
  footer: { marginTop: 8, gap: 8 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnPrimary: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.pill,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  btnMuted: { opacity: 0.45 },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.1,
    fontFamily: theme.font,
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
