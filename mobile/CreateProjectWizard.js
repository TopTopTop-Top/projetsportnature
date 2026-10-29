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
import FunnelSteps from "./FunnelSteps";
import {
  PROJECT_ACTIVITIES,
  ATHLETE_NEED_TAGS,
  toggleTagInText,
  textHasTag,
} from "./outdoorNeeds";

/**
 * Assistant 3 étapes : infos → tracé → suite (box / ravito).
 */
export default function CreateProjectWizard({
  visible,
  onClose,
  trails = [],
  busy = false,
  onCreate,
  onUploadGpx,
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [activity, setActivity] = useState("trail_run");
  const [needs, setNeeds] = useState("");
  const [trailId, setTrailId] = useState(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [uploading, setUploading] = useState(false);

  const myTrails = useMemo(() => {
    const list = Array.isArray(trails) ? trails : [];
    return list.slice(0, 40);
  }, [trails]);

  const reset = () => {
    setStep(0);
    setName("");
    setActivity("trail_run");
    setNeeds("");
    setTrailId(null);
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
      setError("Donne un nom à ton projet (min. 3 caractères).");
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
      const tid = Number(trail?.id || trail?.trail?.id);
      if (Number.isFinite(tid) && tid > 0) {
        setTrailId(tid);
      } else {
        setError("Import OK mais trace introuvable — choisis-la dans la liste.");
      }
    } catch (e) {
      setError(e?.message || "Import GPX impossible.");
    } finally {
      setUploading(false);
    }
  };

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
            <Text style={styles.title}>
              {step === 2 ? "Projet créé" : "Nouveau projet"}
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={Platform.OS === "web"}
          >
            {step < 2 ? <FunnelSteps activeId="ask" compact /> : null}

            {step === 0 ? (
              <>
                <Text style={styles.lead}>
                  Une sortie où tu allèges le sac : box et/ou ravito GPS sur ton
                  parcours.
                </Text>
                <Text style={styles.label}>Nom du projet</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex. Ultra Chartreuse — allègement"
                  placeholderTextColor={theme.inkMuted}
                />
                <Text style={styles.label}>Activité</Text>
                <View style={styles.chipRow}>
                  {PROJECT_ACTIVITIES.map((a) => {
                    const on = activity === a.id;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => setActivity(a.id)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[styles.chipText, on && styles.chipTextOn]}
                        >
                          {a.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.label}>Besoins globaux (optionnel)</Text>
                <View style={styles.chipRow}>
                  {ATHLETE_NEED_TAGS.slice(0, 8).map((chip) => {
                    const on = textHasTag(needs, chip);
                    return (
                      <TouchableOpacity
                        key={chip}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() =>
                          setNeeds((prev) => toggleTagInText(prev, chip))
                        }
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[styles.chipText, on && styles.chipTextOn]}
                        >
                          {chip}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

            {step === 1 ? (
              <>
                <Text style={styles.lead}>
                  Lie un tracé GPX pour voir les box / ravitos proches et poser
                  tes étapes.
                </Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={handleUpload}
                  disabled={uploading || busy}
                  activeOpacity={0.85}
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.uploadBtnText}>
                        Importer mon GPX
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.label}>Ou choisir une trace existante</Text>
                {myTrails.length === 0 ? (
                  <Text style={styles.hint}>
                    Aucune trace encore — importe un GPX ci-dessus.
                  </Text>
                ) : (
                  myTrails.map((t) => {
                    const tid = Number(t.id);
                    const on = Number(trailId) === tid;
                    return (
                      <TouchableOpacity
                        key={`tr-${tid}`}
                        style={[styles.trailRow, on && styles.trailRowOn]}
                        onPress={() => setTrailId(tid)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.trailTitle}>
                          {t.name || `Trace #${tid}`}
                        </Text>
                        <Text style={styles.hint}>
                          {[t.territory, t.activity].filter(Boolean).join(" · ")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            ) : null}

            {step === 2 && created ? (
              <>
                <View style={styles.successCard}>
                  <Ionicons
                    name="checkmark-circle"
                    size={36}
                    color={theme.success}
                  />
                  <Text style={styles.successTitle}>
                    {created.name || "Projet prêt"}
                  </Text>
                  <Text style={styles.hint}>
                    Prochaine étape : ajoute des box sur le tracé ou demande un
                    ravito GPS. Chaque étape = demande → validation → paiement.
                  </Text>
                </View>
              </>
            ) : null}

            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            {step === 0 ? (
              <>
                <TouchableOpacity style={styles.secBtn} onPress={handleClose}>
                  <Text style={styles.secBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.priBtn}
                  onPress={goNextFromInfo}
                >
                  <Text style={styles.priBtnText}>Continuer</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {step === 1 ? (
              <>
                <TouchableOpacity
                  style={styles.secBtn}
                  onPress={() => setStep(0)}
                  disabled={busy}
                >
                  <Text style={styles.secBtnText}>Retour</Text>
                </TouchableOpacity>
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
                    <Text style={styles.priBtnText}>Créer le projet</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
            {step === 2 ? (
              <TouchableOpacity style={styles.priBtn} onPress={handleClose}>
                <Text style={styles.priBtnText}>Voir mon projet</Text>
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
    backgroundColor: "rgba(11, 31, 24, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "web" ? 16 : 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.ink,
  },
  body: {
    paddingHorizontal: 16,
    maxHeight: 480,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.inkMuted,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.inkMuted,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.ink,
    backgroundColor: theme.surfaceMuted,
  },
  area: {
    minHeight: 72,
    textAlignVertical: "top",
    marginTop: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surface,
  },
  chipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.inkMuted,
  },
  chipTextOn: {
    color: theme.primary,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  uploadBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  trailRow: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: theme.surface,
  },
  trailRowOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  trailTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
  },
  successCard: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.ink,
    textAlign: "center",
  },
  err: {
    marginTop: 10,
    color: theme.danger,
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  secBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secBtnText: {
    fontWeight: "700",
    color: theme.ink,
  },
  priBtn: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  priBtnDisabled: {
    opacity: 0.5,
  },
  priBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});
