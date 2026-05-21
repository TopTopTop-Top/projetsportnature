import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
} from "react-native";
import TrailElevationProfile from "./TrailElevationProfile";
import {
  getTrailAltitudeMeta,
  getTrailRouteLengthKm,
  probeTrailAtDist,
  formatTrailProbeCoords,
} from "./trailProfile";
import TrailAltitudeBadge from "./TrailAltitudeBadge";

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

/**
 * Colonne profil entre panneau gauche et carte (desktop) — design épuré.
 */
export default function TrailProfileRail({
  trail,
  probe,
  probeLocked = false,
  onProbeChange,
  onChartHoverActive,
  onChartHoverEnd,
  onProbeLock,
  savedProbes = [],
  onSaveProbe,
  onRemoveSavedProbe,
  onFocusSavedProbe,
  onUpdateSavedProbeNotes,
  onClearSavedProbes,
  onSaveRoutePlan,
  routePlanBusy = false,
  routePlanSaveName = "",
  onRoutePlanSaveNameChange,
  pickedBoxCount = 0,
  hasActivePlan = false,
  isAuthed = false,
}) {
  const handleChartProbe = useCallback(
    (distKm) => {
      if (!trail) return;
      if (distKm == null) {
        if (!probeLocked) onProbeChange?.(null);
        return;
      }
      const p = probeTrailAtDist(trail, distKm);
      if (p) onProbeChange?.({ ...p, trailId: Number(trail.id) });
    },
    [trail, onProbeChange, probeLocked]
  );

  const handleChartHoverStart = useCallback(() => {
    onChartHoverActive?.(true);
  }, [onChartHoverActive]);

  const handleChartHoverEnd = useCallback(() => {
    onChartHoverEnd?.();
  }, [onChartHoverEnd]);

  const handleChartLock = useCallback(() => {
    onProbeLock?.(true);
  }, [onProbeLock]);

  const handleClearProbe = useCallback(() => {
    onProbeLock?.(false);
    onProbeChange?.(null);
  }, [onProbeLock, onProbeChange]);

  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    });
  }, []);

  if (!trail) return null;

  const altMeta = getTrailAltitudeMeta(trail);
  const diff = DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty || "—";
  const routeLenKm = getTrailRouteLengthKm(trail);
  const totalKm = routeLenKm > 0 ? routeLenKm.toFixed(1) : Number(trail.distance_km || 0).toFixed(1);
  const pct =
    probe?.distKm != null && routeLenKm > 0
      ? Math.min(100, Math.round((Number(probe.distKm) / routeLenKm) * 100))
      : null;

  return (
    <View style={styles.rail}>
      <ScrollView
        ref={scrollRef}
        style={styles.railScroll}
        contentContainerStyle={styles.railScrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        bounces={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Trace active</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {trail.name || "Sans nom"}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {trail.territory || "—"} · {diff}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat label="Distance" value={`${totalKm} km`} />
          {altMeta.status === "profile" ? (
            <Stat label="Dénivelé" value={`${altMeta.elevationM} m`} />
          ) : (
            <Stat label="Dénivelé" value="—" muted />
          )}
          {probe ? (
            <Stat
              label="Position"
              value={`${Number(probe.distKm).toFixed(1)} km`}
              accent
            />
          ) : null}
        </View>

        <TrailAltitudeBadge trail={trail} compact />

        {pct != null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}

        <View style={styles.chartZone}>
          {altMeta.canShowElevationChart ? (
            <TrailElevationProfile
              trail={trail}
              probe={probe}
              variant="rail"
              interactive
              onProbeAtDist={handleChartProbe}
              onChartHoverStart={handleChartHoverStart}
              onChartHoverEnd={handleChartHoverEnd}
              onProbeClick={handleChartLock}
              onProbeLock={onProbeLock}
              probeLocked={probeLocked}
            />
          ) : (
            <TrailElevationProfile trail={trail} probe={null} variant="rail" />
          )}
        </View>

        {probe ? (
          <View style={styles.probeStrip}>
            <Text style={styles.probeKm}>{Number(probe.distKm).toFixed(1)} km</Text>
            {probe.eleM != null ? (
              <Text style={styles.probeDetail}>{probe.eleM} m</Text>
            ) : null}
            {probe.gainM != null ? (
              <Text style={styles.probeDetail}>D+ {Math.round(probe.gainM)} m</Text>
            ) : null}
            {probe.terrainLabel ? (
              <Text style={styles.probeTerrain} numberOfLines={1}>
                {probe.terrainLabel}
              </Text>
            ) : null}
            <Text style={styles.probeCoords} numberOfLines={2}>
              {formatTrailProbeCoords(probe)}
            </Text>
            {probeLocked ? (
              <Text style={styles.probeLockedLabel}>Point figé — zoom libre</Text>
            ) : (
              <Text style={styles.probeHint}>
                Clic sur la courbe ou le tracé pour figer le point
              </Text>
            )}
            <View style={styles.probeActions}>
              <Pressable
                onPress={onSaveProbe}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Text style={styles.actionBtnTextPrimary}>Mémoriser</Text>
              </Pressable>
              {probeLocked ? (
                <Pressable onPress={handleClearProbe} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>Déverrouiller</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>
            Survole la carte ou la courbe · clic pour figer
          </Text>
        )}

        <View style={styles.planSaveBlock}>
          <Text style={styles.planSaveTitle}>Enregistrer le plan</Text>
          <Text style={styles.planSaveHint}>
            Trace active
            {pickedBoxCount > 0 ? ` · ${pickedBoxCount} box cochée(s)` : ""}
            {savedProbes.length > 0
              ? ` · ${savedProbes.length} point(s) mémorisé(s)`
              : ""}
            {hasActivePlan ? " · plan existant mis à jour" : ""}
          </Text>
          {!isAuthed ? (
            <Text style={styles.planSaveWarn}>
              Connecte-toi pour sauvegarder sur ton compte (onglet Resa).
            </Text>
          ) : null}
          <TextInput
            style={styles.planSaveInput}
            value={routePlanSaveName}
            onChangeText={onRoutePlanSaveNameChange}
            placeholder="Nom du plan (optionnel)"
            placeholderTextColor="#94A3B8"
          />
          <Pressable
            onPress={onSaveRoutePlan}
            disabled={routePlanBusy || !isAuthed}
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              styles.planSaveBtn,
              (routePlanBusy || !isAuthed) && styles.planSaveBtnDisabled,
            ]}
          >
            <Text style={styles.actionBtnTextPrimary}>
              {routePlanBusy
                ? "Enregistrement…"
                : hasActivePlan
                ? "Mettre à jour le plan"
                : "Enregistrer le plan complet"}
            </Text>
          </Pressable>
        </View>

        {savedProbes.length > 0 ? (
          <View style={styles.savedBlock}>
            <View style={styles.savedHeader}>
              <Text style={styles.savedTitle}>
                Points mémorisés ({savedProbes.length})
              </Text>
              {onClearSavedProbes ? (
                <Pressable onPress={onClearSavedProbes}>
                  <Text style={styles.savedClearAll}>Tout effacer</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.savedHint}>
              Tips, ravitaillement, box à réserver… (enregistré sur cet appareil)
            </Text>
            {savedProbes.map((entry) => (
              <SavedProbeCard
                key={entry.id}
                entry={entry}
                onFocus={() => onFocusSavedProbe?.(entry)}
                onRemove={() => onRemoveSavedProbe?.(entry.id)}
                onSaveNotes={(notes) =>
                  onUpdateSavedProbeNotes?.(entry.id, notes)
                }
                onExpandEditor={scrollToBottom}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SavedProbeCard({
  entry,
  onFocus,
  onRemove,
  onSaveNotes,
  onExpandEditor,
}) {
  const [draft, setDraft] = useState(entry.notes || "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDraft(entry.notes || "");
  }, [entry.id, entry.notes]);

  useEffect(() => {
    if (expanded) onExpandEditor?.();
  }, [expanded, onExpandEditor]);

  const saveNotes = useCallback(() => {
    onSaveNotes?.(draft);
    setExpanded(false);
  }, [draft, onSaveNotes]);

  const hasNotes = String(entry.notes || "").trim().length > 0;

  return (
    <View style={styles.savedCard}>
      <View style={styles.savedRow}>
        <Pressable
          style={styles.savedRowMain}
          onPress={onFocus}
          onLongPress={() => setExpanded(true)}
        >
          <Text style={styles.savedRowLabel}>{entry.label}</Text>
          <Text style={styles.savedRowMeta} numberOfLines={1}>
            {Number(entry.probe?.distKm || 0).toFixed(1)} km
            {entry.probe?.eleM != null ? ` · ${entry.probe.eleM} m` : ""}
            {entry.probe?.gainM != null
              ? ` · D+ ${Math.round(entry.probe.gainM)} m`
              : ""}
          </Text>
          <Text style={styles.savedRowCoords} numberOfLines={1}>
            {formatTrailProbeCoords(entry.probe)}
          </Text>
          {hasNotes && !expanded ? (
            <Text style={styles.savedNotePreview} numberOfLines={2}>
              {entry.notes}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => {
            setExpanded((v) => {
              const next = !v;
              if (next) onExpandEditor?.();
              return next;
            });
          }}
          style={styles.savedNoteBtn}
        >
          <Text style={styles.savedNoteBtnText}>{expanded ? "▲" : "✎"}</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={styles.savedRemoveBtn}>
          <Text style={styles.savedRemoveText}>×</Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.savedNoteEditor}>
          <TextInput
            style={styles.savedNoteInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Conseil, pause, box, accès, danger…"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.savedNoteActions}>
            <Pressable onPress={saveNotes} style={styles.savedNoteSave}>
              <Text style={styles.savedNoteSaveText}>Enregistrer la note</Text>
            </Pressable>
            {hasNotes ? (
              <Pressable
                onPress={() => {
                  setDraft("");
                  onSaveNotes?.("");
                  setExpanded(false);
                }}
                style={styles.savedNoteDelete}
              >
                <Text style={styles.savedNoteDeleteText}>Effacer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, accent, muted }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          accent && styles.statValueAccent,
          muted && styles.statValueMuted,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8EFE9",
    overflow: "hidden",
    shadowColor: "rgba(6, 45, 38, 0.12)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  railScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web"
      ? { overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }
      : {}),
  },
  railScrollContent: {
    paddingBottom: 120,
    flexGrow: 0,
  },
  hero: {
    backgroundColor: "#062D26",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 19,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  stat: {
    flex: 1,
    minWidth: 72,
    backgroundColor: "#F7FAF8",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E8EFE9",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  statValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: "#0C1B16",
  },
  statValueAccent: {
    color: "#EA580C",
  },
  statValueMuted: {
    color: "#94A3B8",
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: "#E8EFE9",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#14B8A6",
    borderRadius: 2,
  },
  chartZone: {
    height: 168,
    maxHeight: 168,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  probeStrip: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 4,
  },
  probeKm: {
    fontSize: 14,
    fontWeight: "800",
    color: "#C2410C",
  },
  probeDetail: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
  },
  probeTerrain: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B45309",
  },
  probeCoords: {
    fontSize: 10,
    fontWeight: "600",
    color: "#78350F",
    fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
  },
  probeHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: "#B45309",
  },
  probeLockedLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#C2410C",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  probeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDBA74",
    backgroundColor: "#FFFBEB",
  },
  actionBtnPrimary: {
    backgroundColor: "#0F766E",
    borderColor: "#0D9488",
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C2410C",
  },
  actionBtnTextPrimary: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  planSaveBlock: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF4",
    gap: 8,
  },
  planSaveTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  planSaveHint: {
    fontSize: 10,
    fontWeight: "600",
    color: "#065F46",
    lineHeight: 14,
  },
  planSaveWarn: {
    fontSize: 10,
    fontWeight: "600",
    color: "#B45309",
  },
  planSaveInput: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    color: "#0C1B16",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  planSaveBtn: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  planSaveBtnDisabled: {
    opacity: 0.55,
  },
  savedBlock: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    gap: 8,
  },
  savedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  savedTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  savedClearAll: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  savedHint: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    lineHeight: 14,
  },
  savedCard: {
    gap: 6,
  },
  savedRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  savedRowMain: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  savedRowLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F766E",
  },
  savedRowMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#134E4A",
  },
  savedRowCoords: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: "#64748B",
    fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
  },
  savedNotePreview: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: "#134E4A",
    lineHeight: 15,
  },
  savedNoteBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  savedNoteBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0369A1",
  },
  savedNoteEditor: {
    gap: 8,
  },
  savedNoteInput: {
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    color: "#0C1B16",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  savedNoteActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  savedNoteSave: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#0F766E",
  },
  savedNoteSaveText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  savedNoteDelete: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  savedNoteDeleteText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  savedRemoveBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  savedRemoveText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#B91C1C",
    lineHeight: 20,
  },
  hint: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },
});
