import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import theme from "./theme";
import {
  PROJECT_ACTIVITIES,
  ATHLETE_NEED_TAGS,
  toggleTagInText,
  textHasTag,
} from "./outdoorNeeds";

const STEPS = [
  { id: 0, n: "1", label: "Infos" },
  { id: 1, n: "2", label: "Trace / GPX" },
  { id: 2, n: "3", label: "Carte" },
];

const VISIBILITY_OPTIONS = [
  { id: "private", label: "Privée" },
  { id: "shared", label: "Publique" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Formate la saisie en AAAA-MM-JJ au fil de la frappe. */
function formatDateInput(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === value
  );
}

const STEP_TITLES = [
  "D'abord, l'essentiel.",
  "Ajoutez votre trace.",
  "Votre sortie est prête.",
];

/**
 * Assistant 3 étapes (Figma) : infos → trace / GPX → carte.
 */
export default function CreateProjectWizard({
  visible,
  onClose,
  trails = [],
  busy = false,
  onCreate,
  onUploadGpx,
  onContinueToMap,
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [activity, setActivity] = useState("trail_run");
  const [visibility, setVisibility] = useState("private");
  const [needs, setNeeds] = useState("");
  const [needsOpen, setNeedsOpen] = useState(false);
  const [trailId, setTrailId] = useState(null);
  const [uploadedName, setUploadedName] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [uploading, setUploading] = useState(false);

  const myTrails = useMemo(() => {
    const list = Array.isArray(trails) ? [...trails] : [];
    list.sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "fr")
    );
    return list.slice(0, 80);
  }, [trails]);

  const reset = () => {
    setStep(0);
    setName("");
    setDepartureDate("");
    setActivity("trail_run");
    setVisibility("private");
    setNeeds("");
    setNeedsOpen(false);
    setTrailId(null);
    setUploadedName("");
    setError("");
    setCreated(null);
    setUploading(false);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const goNextFromInfo = () => {
    const nm = name.trim();
    if (nm.length < 3) {
      setError("Donne un nom à ta sortie (min. 3 caractères).");
      return;
    }
    if (departureDate && !isValidDate(departureDate)) {
      setError("Date invalide — format AAAA-MM-JJ.");
      return;
    }
    setError("");
    setStep(1);
  };

  const handleCreate = async () => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) {
      setError("Choisis une trace ou importe un GPX.");
      return;
    }
    setError("");
    try {
      const detail = await onCreate?.({
        name: name.trim(),
        activity,
        needs: needs.trim(),
        trailId: tid,
        visibility,
        departureDate: departureDate || null,
      });
      if (detail?.id) {
        setCreated(detail);
        setStep(2);
      }
    } catch (e) {
      setError(e?.message || "Création impossible.");
    }
  };

  const handleUpload = async () => {
    if (!onUploadGpx) return;
    setUploading(true);
    setError("");
    try {
      const trail = await onUploadGpx({
        activity,
        name: name.trim() || undefined,
      });
      if (!trail) return;
      const tid = Number(trail?.id || trail?.trail?.id);
      if (Number.isFinite(tid) && tid > 0) {
        setTrailId(tid);
        setUploadedName(
          String(trail?.name || trail?.trail?.name || "").trim() ||
            "Trace importée"
        );
      } else {
        setError("Import OK mais trace introuvable — choisis-la dans la liste.");
      }
    } catch (e) {
      setError(e?.message || "Import GPX impossible.");
    } finally {
      setUploading(false);
    }
  };

  const goToStep = (target) => {
    if (created || busy) return;
    if (target === step) return;
    if (target < step) {
      setError("");
      setStep(target);
    }
  };

  const renderChip = (key, label, on, onPress) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  const uploadedInList =
    trailId != null && myTrails.some((t) => Number(t.id) === Number(trailId));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>PRÉPARER L'AVENTURE</Text>
              <Text style={styles.title}>{STEP_TITLES[step]}</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={22} color={theme.ink} />
            </TouchableOpacity>
          </View>

          <View style={styles.stepper}>
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.stepTab, active && styles.stepTabActive]}
                  onPress={() => goToStep(s.id)}
                  activeOpacity={done ? 0.7 : 1}
                  disabled={!done}
                >
                  <Text
                    style={[
                      styles.stepNum,
                      (active || done) && styles.stepNumOn,
                    ]}
                  >
                    {s.n}
                  </Text>
                  <Text
                    style={[
                      styles.stepLabel,
                      (active || done) && styles.stepLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={Platform.OS === "web"}
          >
            {step === 0 ? (
              <>
                <Text style={styles.label}>Nom de la sortie</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex. Ultra Chartreuse"
                  placeholderTextColor={theme.inkMuted}
                />

                <Text style={styles.label}>Date de départ</Text>
                <View style={styles.dateWrap}>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={theme.inkMuted}
                  />
                  <TextInput
                    style={styles.dateInput}
                    value={departureDate}
                    onChangeText={(v) => setDepartureDate(formatDateInput(v))}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={theme.inkMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                </View>

                <Text style={styles.label}>Activité</Text>
                <View style={styles.chipRow}>
                  {PROJECT_ACTIVITIES.map((a) =>
                    renderChip(a.id, a.label, activity === a.id, () =>
                      setActivity(a.id)
                    )
                  )}
                </View>

                <Text style={styles.label}>Visibilité</Text>
                <View style={styles.radioRow}>
                  {VISIBILITY_OPTIONS.map((v) => {
                    const on = visibility === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.radioItem}
                        onPress={() => setVisibility(v.id)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <View style={[styles.radio, on && styles.radioOn]}>
                          {on ? <View style={styles.radioDot} /> : null}
                        </View>
                        <Text style={styles.radioLabel}>{v.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.needsToggle}
                  onPress={() => setNeedsOpen((o) => !o)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={needsOpen ? "remove" : "add"}
                    size={16}
                    color={theme.primary}
                  />
                  <Text style={styles.needsToggleText}>
                    Besoins globaux (optionnel)
                  </Text>
                </TouchableOpacity>
                {needsOpen ? (
                  <>
                    <View style={styles.chipRow}>
                      {ATHLETE_NEED_TAGS.slice(0, 8).map((chip) =>
                        renderChip(chip, chip, textHasTag(needs, chip), () =>
                          setNeeds((prev) => toggleTagInText(prev, chip))
                        )
                      )}
                    </View>
                    <TextInput
                      style={[styles.input, styles.area]}
                      value={needs}
                      onChangeText={setNeeds}
                      multiline
                      placeholder="Ex. eau + snacks, sans gluten…"
                      placeholderTextColor={theme.inkMuted}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {step === 1 ? (
              <>
                <TouchableOpacity
                  style={styles.uploadCard}
                  onPress={handleUpload}
                  disabled={uploading || busy}
                  activeOpacity={0.85}
                >
                  {uploading ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : (
                    <>
                      <View style={styles.uploadIcon}>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={22}
                          color={theme.primary}
                        />
                      </View>
                      <Text style={styles.uploadTitle}>
                        Importer un fichier GPX
                      </Text>
                      <Text style={styles.uploadSub}>
                        (.gpx - 20 Mo maximum)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {uploadedName && trailId != null && !uploadedInList ? (
                  <View style={[styles.trailRow, styles.trailRowOn]}>
                    <View style={styles.trailInfo}>
                      <Text style={styles.trailTitle}>{uploadedName}</Text>
                      <Text style={styles.hint}>Importée à l'instant</Text>
                    </View>
                    <View style={[styles.check, styles.checkOn]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  </View>
                ) : null}

                <Text style={styles.sectionLabel}>OU UTILISER UNE TRACE</Text>
                {myTrails.length === 0 ? (
                  <Text style={styles.hint}>
                    Aucune trace encore — importe un GPX ci-dessus.
                  </Text>
                ) : (
                  myTrails.map((t) => {
                    const tid = Number(t.id);
                    const on = Number(trailId) === tid;
                    const meta = [
                      t.territory,
                      Number(t.distance_km) > 0
                        ? `${Math.round(Number(t.distance_km) * 10) / 10} km`
                        : null,
                      Number(t.elevation_m) > 0
                        ? `D+ ${Math.round(Number(t.elevation_m))} m`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TouchableOpacity
                        key={`tr-${tid}`}
                        style={[styles.trailRow, on && styles.trailRowOn]}
                        onPress={() => {
                          setTrailId(tid);
                          setUploadedName("");
                        }}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <View style={styles.trailInfo}>
                          <Text style={styles.trailTitle} numberOfLines={1}>
                            {t.name || `Trace #${tid}`}
                          </Text>
                          {meta ? (
                            <Text style={styles.hint} numberOfLines={1}>
                              {meta}
                            </Text>
                          ) : null}
                        </View>
                        <View style={[styles.check, on && styles.checkOn]}>
                          {on ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            ) : null}

            {step === 2 && created ? (
              <View style={styles.successCard}>
                <View style={styles.successBadge}>
                  <Ionicons name="checkmark" size={30} color={theme.primary} />
                </View>
                <Text style={styles.successTitle}>
                  {created.name || "Sortie prête"}
                </Text>
                <Text style={styles.successText}>
                  Sortie créée. Ouvre la carte pour ajouter des box ou demander
                  un ravito GPS sur le tracé.
                </Text>
              </View>
            ) : null}

            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            {step === 0 ? (
              <TouchableOpacity style={styles.priBtn} onPress={goNextFromInfo}>
                <Text style={styles.priBtnText}>Continuer →</Text>
              </TouchableOpacity>
            ) : null}
            {step === 1 ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.priBtn,
                    (busy || !trailId) && styles.priBtnDisabled,
                  ]}
                  onPress={handleCreate}
                  disabled={busy || !trailId}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.priBtnText}>
                      Créer et ouvrir la carte ↗
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => goToStep(0)}
                  disabled={busy}
                >
                  <Text style={styles.linkBtnText}>← Retour</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {step === 2 ? (
              <TouchableOpacity
                style={styles.priBtn}
                onPress={() => {
                  const plan = created;
                  handleClose();
                  onContinueToMap?.(plan);
                }}
              >
                <Text style={styles.priBtnText}>Continuer sur la carte ↗</Text>
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
    backgroundColor: "rgba(26, 46, 40, 0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.bg,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: "94%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingBottom: Platform.OS === "web" ? 16 : 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 12,
  },
  headerText: { flex: 1 },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: theme.primary,
    marginBottom: 6,
    fontFamily: theme.font,
  },
  title: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.6,
    fontFamily: theme.fontDisplay,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepper: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  stepTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  stepTabActive: { borderBottomColor: theme.primary },
  stepNum: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  stepNumOn: { color: theme.primary },
  stepLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  stepLabelOn: { color: theme.ink, fontWeight: "700" },
  body: {
    paddingHorizontal: 20,
    flexGrow: 0,
  },
  bodyContent: { paddingTop: 8, paddingBottom: 12 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.ink,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: theme.font,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: theme.inkMuted,
    marginTop: 22,
    marginBottom: 10,
    fontFamily: theme.font,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.surface,
    fontFamily: theme.font,
  },
  dateWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    backgroundColor: theme.surface,
  },
  dateInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: theme.ink,
    fontFamily: theme.font,
  },
  area: {
    minHeight: 72,
    textAlignVertical: "top",
    marginTop: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  chipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
    fontFamily: theme.font,
  },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  radioRow: { flexDirection: "row", gap: 24 },
  radioItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: theme.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.primary,
  },
  radioLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.ink,
    fontFamily: theme.font,
  },
  needsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  needsToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.primary,
    fontFamily: theme.font,
  },
  uploadCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.primary,
    borderStyle: "dashed",
    paddingVertical: 28,
    paddingHorizontal: 16,
    marginTop: 14,
    minHeight: 120,
  },
  uploadIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  uploadTitle: {
    color: theme.ink,
    fontWeight: "800",
    fontSize: 15,
    fontFamily: theme.font,
  },
  uploadSub: {
    color: theme.inkMuted,
    fontSize: 13,
    fontFamily: theme.font,
  },
  trailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  trailRowOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  trailInfo: { flex: 1 },
  trailTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
    fontFamily: theme.font,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  checkOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  hint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  successCard: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 12,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.ink,
    textAlign: "center",
    fontFamily: theme.fontDisplay,
  },
  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.inkMuted,
    textAlign: "center",
    fontFamily: theme.font,
  },
  err: {
    marginTop: 12,
    color: theme.danger,
    fontSize: 13,
    fontFamily: theme.font,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  priBtn: {
    width: "100%",
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  priBtnDisabled: { opacity: 0.5 },
  priBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    fontFamily: theme.font,
  },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
});
