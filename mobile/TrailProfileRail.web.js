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
import { isEntryPublishedOnTrail } from "./explorerSavedProbesStorage";
import { isPlanTrailNoteMapVisible } from "./trailMapPoints";
import TrailAltitudeBadge from "./TrailAltitudeBadge";
import {
  planBoxValidationLabel,
  planBoxApprovalLabel,
  planBoxHasActiveBooking,
  formatPlanBoxSlot,
  formatPlanBoxPrice,
  planBoxStatusColors,
} from "./planBoxReservation";
import {
  trailMapPointId,
  tipMapPointId,
  mapPointDomId,
  planBoxDomId,
} from "./trailMapPoints";
import { formatPlanSignals } from "./relevanceIndicators";
import { MAP_PANEL_SELECTION, MAP_SEL } from "./mapSelectionVisual";
import theme from "./theme";

function webHoverHandlers(onEnter, onLeave) {
  if (Platform.OS !== "web") return {};
  return {
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
  };
}

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
  onExitTrailSelection,
  onSaveRoutePlan,
  routePlanBusy = false,
  routePlanSaveName = "",
  onRoutePlanSaveNameChange,
  routePlanDraftNotes = "",
  onRoutePlanDraftNotesChange,
  pickedBoxCount = 0,
  pickedBoxes = [],
  linkableBoxes = [],
  plansForTrail = [],
  selectedPlanId = null,
  onSelectPlan,
  activePlan = null,
  onUpsertPickedBoxesToPlan,
  onApplyPlanToMap,
  onSaveActivePlanDrafts,
  onBookBox,
  onRequestRavito,
  onFocusBox,
  focusedBoxId = null,
  planNameDraft = "",
  onPlanNameDraftChange,
  planNotesDraft = "",
  onPlanNotesDraftChange,
  onUpdateSavedProbeLinkedBox,
  hasActivePlan = false,
  isAuthed = false,
  trailGeneralNotes = "",
  isTrailCreator = false,
  trailTips = [],
  sharedPlans = [],
  sharedPlansBusy = false,
  onRefreshCommunity,
  onForkSharedPlan,
  sharedPlanPreview = null,
  sharedPlanPreviewBusy = false,
  onSelectSharedPlan,
  onShowSharedPlanOnMap,
  onFocusPlanTrailNote,
  onTogglePlanTrailNoteMapVisible,
  onDeletePlanTrailNote,
  trailNoteDraftById = {},
  onPlanTrailNoteDraftChange,
  onSavePlanTrailNote,
  highlightedMapPointId = null,
  onHighlightMapPoint,
  highlightedPlanBoxId = null,
  onHighlightPlanBox,
  boxCommentDraftById = {},
  onBoxCommentDraftChange,
  onSavePlanBoxComment,
  editingPlanBookingId = null,
  planBookingDraft = null,
  onPlanBookingDraftChange,
  onStartEditPlanBoxBooking,
  onCancelEditPlanBoxBooking,
  onSavePlanBoxBooking,
  onOpenReservations,
  hostPendingBookingByBoxId,
  onHostDecideBooking,
  onPublishTrailTip,
  onPublishEntryTip,
  onUnpublishEntryTip,
  onDeleteTrailTip,
  onToggleIncludeInPlan,
  trailTipsForEntry = [],
  trailIsPublic = true,
  onToggleTrailPublic,
  activePlanVisibility = "private",
  onSetPlanVisibility,
  onWorkspaceTabChange,
  onShowCommunityChange,
}) {
  /** Un seul panneau : sortie + points. Communauté = tiroir secondaire. */
  const [showCommunity, setShowCommunity] = useState(false);
  useEffect(() => {
    onWorkspaceTabChange?.("plan");
  }, [onWorkspaceTabChange]);
  useEffect(() => {
    onShowCommunityChange?.(showCommunity);
  }, [showCommunity, onShowCommunityChange]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const scrollTo = (domId) => {
      if (!domId) return;
      const el = document.getElementById(domId);
      el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    };
    if (highlightedMapPointId) {
      scrollTo(mapPointDomId(highlightedMapPointId));
    } else if (highlightedPlanBoxId != null) {
      scrollTo(planBoxDomId(highlightedPlanBoxId));
    }
  }, [highlightedMapPointId, highlightedPlanBoxId]);
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

  const activeSortieName = hasActivePlan
    ? activePlan?.name || `Sortie #${activePlan?.id}`
    : null;
  const activePointCount = Array.isArray(activePlan?.trail_notes)
    ? activePlan.trail_notes.length
    : 0;
  const activeBoxCount =
    (Number(activePlan?.validated_box_count) || 0) +
    (Number(activePlan?.pending_box_count) || 0);

  const savePointLabel = hasActivePlan
    ? `Ajouter à « ${activeSortieName} »`
    : "Créer la sortie et ajouter ce point";

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
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Trace active</Text>
            {onExitTrailSelection ? (
              <Pressable
                onPress={onExitTrailSelection}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Quitter la trace sélectionnée"
              >
                <Text style={styles.heroExit}>Quitter</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {trail.name || "Sans nom"}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {trail.territory || "—"} · {diff}
          </Text>
          {isTrailCreator && onToggleTrailPublic ? (
            <Pressable
              onPress={() => onToggleTrailPublic(!trailIsPublic)}
              style={[
                styles.trailPublicToggle,
                trailIsPublic && styles.trailPublicToggleOn,
              ]}
            >
              <Text
                style={[
                  styles.trailPublicToggleText,
                  trailIsPublic && styles.trailPublicToggleTextOn,
                ]}
              >
                {trailIsPublic
                  ? "Trace visible dans le catalogue public"
                  : "Trace masquée du catalogue (toi seul)"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sortieBanner}>
          <Text style={styles.sortieBannerKicker}>Sortie active</Text>
          <Text style={styles.sortieBannerTitle} numberOfLines={1}>
            {activeSortieName || "Aucune — le 1er point en crée une"}
          </Text>
          <Text style={styles.sortieBannerMeta}>
            {activeBoxCount} box · {activePointCount} point
            {activePointCount === 1 ? "" : "s"}
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
            <Text style={styles.probeKm}>
              {Number(probe.distKm).toFixed(1)} km
            </Text>
            {probe.eleM != null ? (
              <Text style={styles.probeDetail}>{probe.eleM} m</Text>
            ) : null}
            {probe.gainM != null ? (
              <Text style={styles.probeDetail}>
                D+ {Math.round(probe.gainM)} m
              </Text>
            ) : null}
            {probe.terrainLabel ? (
              <Text style={styles.probeTerrain} numberOfLines={1}>
                {probe.terrainLabel}
              </Text>
            ) : null}
            <Text style={styles.probeCoords} numberOfLines={2}>
              {formatTrailProbeCoords(probe)}
            </Text>
            <Text style={styles.probeBelongHint}>
              Ce point ira dans la sortie ci-dessus (éditable ensuite).
            </Text>
            <View style={styles.probeActions}>
              <Pressable
                onPress={onSaveProbe}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Text style={styles.actionBtnTextPrimary}>{savePointLabel}</Text>
              </Pressable>
              {onRequestRavito && Number.isFinite(probe?.lat) ? (
                <Pressable
                  onPress={onRequestRavito}
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                >
                  <Text style={styles.actionBtnTextPrimary}>
                    Demander un ravito
                  </Text>
                </Pressable>
              ) : null}
              {isTrailCreator && probe ? (
                <Pressable
                  onPress={onPublishTrailTip}
                  style={[styles.actionBtn, styles.actionBtnCreator]}
                >
                  <Text style={styles.actionBtnText}>
                    Publier conseil public
                  </Text>
                </Pressable>
              ) : null}
              {probeLocked ? (
                <Pressable onPress={handleClearProbe} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>Déverrouiller</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>
            Clique la carte ou la courbe, puis ajoute le point à ta sortie.
          </Text>
        )}

        <TrailPlanHub
          isAuthed={isAuthed}
          routePlanBusy={routePlanBusy}
          pickedBoxCount={pickedBoxCount}
          pickedBoxes={pickedBoxes}
          savedProbeCount={0}
          plansForTrail={plansForTrail}
          selectedPlanId={selectedPlanId}
          onSelectPlan={onSelectPlan}
          activePlan={activePlan}
          routePlanSaveName={routePlanSaveName}
          onRoutePlanSaveNameChange={onRoutePlanSaveNameChange}
          routePlanDraftNotes={routePlanDraftNotes}
          onRoutePlanDraftNotesChange={onRoutePlanDraftNotesChange}
          planNameDraft={planNameDraft}
          onPlanNameDraftChange={onPlanNameDraftChange}
          planNotesDraft={planNotesDraft}
          onPlanNotesDraftChange={onPlanNotesDraftChange}
          hasActivePlan={hasActivePlan}
          onSaveRoutePlan={onSaveRoutePlan}
          onUpsertPickedBoxesToPlan={onUpsertPickedBoxesToPlan}
          onApplyPlanToMap={onApplyPlanToMap}
          onSaveActivePlanDrafts={onSaveActivePlanDrafts}
          onBookBox={onBookBox}
          onFocusBox={onFocusBox}
          focusedBoxId={focusedBoxId}
          activePlanVisibility={activePlanVisibility}
          onSetPlanVisibility={onSetPlanVisibility}
          onForkSharedPlan={onForkSharedPlan}
          onFocusPlanTrailNote={onFocusPlanTrailNote}
          onTogglePlanTrailNoteMapVisible={onTogglePlanTrailNoteMapVisible}
          onDeletePlanTrailNote={onDeletePlanTrailNote}
          trailNoteDraftById={trailNoteDraftById}
          onPlanTrailNoteDraftChange={onPlanTrailNoteDraftChange}
          onSavePlanTrailNote={onSavePlanTrailNote}
          highlightedMapPointId={highlightedMapPointId}
          onHighlightMapPoint={onHighlightMapPoint}
          highlightedPlanBoxId={highlightedPlanBoxId}
          onHighlightPlanBox={onHighlightPlanBox}
          boxCommentDraftById={boxCommentDraftById}
          onBoxCommentDraftChange={onBoxCommentDraftChange}
          onSavePlanBoxComment={onSavePlanBoxComment}
          editingPlanBookingId={editingPlanBookingId}
          planBookingDraft={planBookingDraft}
          onPlanBookingDraftChange={onPlanBookingDraftChange}
          onStartEditPlanBoxBooking={onStartEditPlanBoxBooking}
          onCancelEditPlanBoxBooking={onCancelEditPlanBoxBooking}
          onSavePlanBoxBooking={onSavePlanBoxBooking}
          onOpenReservations={onOpenReservations}
          hostPendingBookingByBoxId={hostPendingBookingByBoxId}
          onHostDecideBooking={onHostDecideBooking}
        />

        <Pressable
          onPress={() => setShowCommunity((v) => !v)}
          style={styles.communityToggle}
        >
          <Text style={styles.communityToggleText}>
            {showCommunity
              ? "Masquer la communauté"
              : "Voir conseils & sorties communautaires"}
          </Text>
        </Pressable>
        {showCommunity ? (
          <CommunityPanel
            trailGeneralNotes={trailGeneralNotes}
            isTrailCreator={isTrailCreator}
            trailTips={trailTips}
            sharedPlans={sharedPlans}
            sharedPlansBusy={sharedPlansBusy}
            sharedPlanPreview={sharedPlanPreview}
            sharedPlanPreviewBusy={sharedPlanPreviewBusy}
            isAuthed={isAuthed}
            onRefresh={onRefreshCommunity}
            onSelectSharedPlan={onSelectSharedPlan}
            onShowSharedPlanOnMap={onShowSharedPlanOnMap}
            onForkPlan={onForkSharedPlan}
            onDeleteTrailTip={onDeleteTrailTip}
            highlightedMapPointId={highlightedMapPointId}
            onHighlightMapPoint={onHighlightMapPoint}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function CommunityPanel({
  trailGeneralNotes,
  isTrailCreator,
  trailTips,
  sharedPlans,
  sharedPlansBusy,
  sharedPlanPreview,
  sharedPlanPreviewBusy,
  isAuthed,
  onRefresh,
  onSelectSharedPlan,
  onShowSharedPlanOnMap,
  onForkPlan,
  onDeleteTrailTip,
  highlightedMapPointId = null,
  onHighlightMapPoint,
}) {
  const previewId = sharedPlanPreview ? Number(sharedPlanPreview.id) : null;
  return (
    <View style={styles.communityBlock}>
      <Text style={styles.communityTitle}>Communauté sur cette trace</Text>
      <Text style={styles.communityIntro}>
        Conseils officiels du créateur et plans partagés par d’autres athlètes.
        Tu peux repartir d’un plan partagé pour créer le tien (box et créneaux à
        adapter).
      </Text>
      <Pressable onPress={onRefresh} style={styles.communityRefresh}>
        <Text style={styles.communityRefreshText}>
          {sharedPlansBusy ? "Actualisation…" : "Actualiser"}
        </Text>
      </Pressable>

      {String(trailGeneralNotes || "").trim() ? (
        <View style={styles.communityCard}>
          <Text style={styles.communityCardLabel}>Note du créateur (trace)</Text>
          <Text style={styles.communityCardBody}>{trailGeneralNotes}</Text>
        </View>
      ) : null}

      <Text style={styles.communitySectionLabel}>
        Conseils sur le tracé ({trailTips.length})
      </Text>
      {isTrailCreator ? (
        <Text style={styles.communityHint}>
          Publie ou retire des conseils point par point (Composer ou ci-dessous).
          Retirer du public n’efface pas ton brouillon local.
        </Text>
      ) : null}
      {trailTips.length === 0 ? (
        <Text style={styles.communityEmpty}>Aucun conseil publié pour l’instant.</Text>
      ) : (
        trailTips.map((tip, tipIdx) => {
          const tipPointId = tipMapPointId(tip.id ?? tipIdx);
          const tipHi = highlightedMapPointId === tipPointId;
          return (
          <View
            key={`tip-${tip.id}`}
            style={[styles.communityCard, tipHi && styles.mapPointRowHighlight]}
            {...webHoverHandlers(
              () => onHighlightMapPoint?.(tipPointId),
              () => onHighlightMapPoint?.(null)
            )}
          >
            <Text style={styles.communityCardLabel}>
              {tip.label || "Conseil"} · {tip.author_label || "—"}
            </Text>
            <Text style={styles.communityCardBody}>{tip.note}</Text>
            {tip.dist_km != null ? (
              <Text style={styles.communityCardMeta}>
                {Number(tip.dist_km).toFixed(1)} km sur le tracé
              </Text>
            ) : null}
            {isTrailCreator && onDeleteTrailTip ? (
              <Pressable
                onPress={() => onDeleteTrailTip(tip.id)}
                style={styles.communityDeleteBtn}
              >
                <Text style={styles.communityDeleteText}>
                  Retirer du public
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
        })
      )}

      <Text style={styles.communitySectionLabel}>
        Plans partagés ({sharedPlans.length})
      </Text>
      <Text style={styles.communityHint}>
        Touche un plan pour voir le détail (notes GPS, box). Les points s’affichent
        sur la carte : violet = conseils · orange = plan partagé · survol = lien
        panneau ↔ carte.
      </Text>
      {!isAuthed ? (
        <Text style={styles.communityHint}>
          Connecte-toi pour copier un plan partagé sur ton compte.
        </Text>
      ) : null}
      {sharedPlans.length === 0 ? (
        <Text style={styles.communityEmpty}>
          Aucun plan partagé. Partage le tien depuis Mon plan (bouton ci-dessous
          quand un plan est actif).
        </Text>
      ) : (
        sharedPlans.map((plan) => {
          const pid = Number(plan.id);
          const selected =
            Number.isFinite(previewId) && previewId === pid;
          const detail = selected ? sharedPlanPreview : null;
          const previewBoxes = Array.isArray(detail?.boxes) ? detail.boxes : [];
          const previewNotes = Array.isArray(detail?.trail_notes)
            ? detail.trail_notes
            : [];
          return (
            <Pressable
              key={`shared-${plan.id}`}
              onPress={() => onSelectSharedPlan?.(pid)}
              style={[
                styles.communityCard,
                selected && styles.communityCardSelected,
              ]}
            >
              <Text style={styles.communityCardLabel}>
                {plan.name} · {plan.author_label || "Athlète"}
              </Text>
              <Text style={styles.communityCardMeta}>
                {formatPlanSignals(plan)}
                {selected ? " · sélectionné" : ""}
              </Text>
              {plan.notes ? (
                <Text
                  style={styles.communityCardBody}
                  numberOfLines={selected ? undefined : 3}
                >
                  {plan.notes}
                </Text>
              ) : null}
              {selected && sharedPlanPreviewBusy ? (
                <Text style={styles.communityCardMeta}>Chargement du détail…</Text>
              ) : null}
              {selected && detail && !sharedPlanPreviewBusy ? (
                <View style={styles.communityPreviewDetail}>
                  {previewBoxes.length > 0 ? (
                    <>
                      <Text style={styles.communityPreviewLabel}>Box du plan</Text>
                      {previewBoxes.map((b) => (
                        <Text
                          key={`prev-box-${b.id}`}
                          style={styles.communityPreviewItem}
                          numberOfLines={2}
                        >
                          · {b.title || "Box"}
                          {b.city ? ` (${b.city})` : ""}
                        </Text>
                      ))}
                    </>
                  ) : null}
                  {previewNotes.length > 0 ? (
                    <>
                      <Text style={styles.communityPreviewLabel}>
                        Notes GPS ({previewNotes.length})
                      </Text>
                      {previewNotes.map((n, idx) => {
                        const ptId = trailMapPointId(
                          "shared_preview",
                          n.id,
                          idx
                        );
                        const hi = highlightedMapPointId === ptId;
                        return (
                          <View
                            key={`prev-note-${n.id || idx}`}
                            nativeID={mapPointDomId(ptId)}
                            style={[
                              styles.communityPreviewItem,
                              hi && styles.mapPointTextHighlight,
                            ]}
                            {...webHoverHandlers(
                              () => onHighlightMapPoint?.(ptId),
                              () => onHighlightMapPoint?.(null)
                            )}
                          >
                            <Text numberOfLines={4}>
                              · {n.note || "(sans texte)"}
                            </Text>
                          </View>
                        );
                      })}
                    </>
                  ) : (
                    <Text style={styles.communityEmpty}>
                      Aucune note GPS sur ce plan partagé.
                    </Text>
                  )}
                  <View style={styles.planBtnRow}>
                    {onShowSharedPlanOnMap ? (
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          onShowSharedPlanOnMap(detail);
                        }}
                        style={[styles.actionBtn, styles.planBtnHalf]}
                      >
                        <Text style={styles.actionBtnText}>Voir sur la carte</Text>
                      </Pressable>
                    ) : null}
                    {isAuthed && onForkPlan ? (
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          onForkPlan(pid);
                        }}
                        style={[
                          styles.actionBtn,
                          styles.actionBtnPrimary,
                          styles.planBtnHalf,
                        ]}
                      >
                        <Text style={styles.actionBtnTextPrimary}>
                          Créer mon plan
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {!selected && isAuthed && onForkPlan ? (
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onForkPlan(pid);
                  }}
                  style={[styles.actionBtn, { marginTop: 8 }]}
                >
                  <Text style={styles.actionBtnText}>
                    Copier sans ouvrir le détail
                  </Text>
                </Pressable>
              ) : null}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function TrailPlanHub({
  isAuthed,
  routePlanBusy,
  pickedBoxCount,
  pickedBoxes,
  savedProbeCount,
  plansForTrail,
  selectedPlanId,
  onSelectPlan,
  activePlan,
  routePlanSaveName,
  onRoutePlanSaveNameChange,
  routePlanDraftNotes,
  onRoutePlanDraftNotesChange,
  planNameDraft,
  onPlanNameDraftChange,
  planNotesDraft,
  onPlanNotesDraftChange,
  hasActivePlan,
  onSaveRoutePlan,
  onUpsertPickedBoxesToPlan,
  onApplyPlanToMap,
  onSaveActivePlanDrafts,
  onBookBox,
  onFocusBox,
  focusedBoxId = null,
  activePlanVisibility = "private",
  onSetPlanVisibility,
  onForkSharedPlan,
  onFocusPlanTrailNote,
  onTogglePlanTrailNoteMapVisible,
  onDeletePlanTrailNote,
  trailNoteDraftById = {},
  onPlanTrailNoteDraftChange,
  onSavePlanTrailNote,
  highlightedMapPointId = null,
  onHighlightMapPoint,
  highlightedPlanBoxId = null,
  onHighlightPlanBox,
  boxCommentDraftById = {},
  onBoxCommentDraftChange,
  onSavePlanBoxComment,
  editingPlanBookingId = null,
  planBookingDraft = null,
  onPlanBookingDraftChange,
  onStartEditPlanBoxBooking,
  onCancelEditPlanBoxBooking,
  onSavePlanBoxBooking,
  onOpenReservations,
  hostPendingBookingByBoxId,
  onHostDecideBooking,
}) {
  const planBoxes = Array.isArray(activePlan?.boxes) ? activePlan.boxes : [];
  const planTrailNotes = Array.isArray(activePlan?.trail_notes)
    ? activePlan.trail_notes
    : [];

  return (
    <View style={styles.planSaveBlock}>
      <Text style={styles.planWorkflow}>
        Chaque point cliqué sur la carte appartient à la sortie sélectionnée
        ci-dessous. Modifie le texte, ou × pour supprimer.
      </Text>

      {isAuthed && plansForTrail.length > 0 ? (
        <View style={styles.planChipsWrap}>
          <Text style={styles.planSubLabel}>Mes sorties sur cette trace</Text>
          <View style={styles.planChipsRow}>
            {plansForTrail.slice(0, 6).map((plan) => {
              const pid = Number(plan.id);
              const active = Number(selectedPlanId) === pid;
              return (
                <Pressable
                  key={`rail-plan-${pid}`}
                  onPress={() => onSelectPlan?.(pid)}
                  style={[styles.planChip, active && styles.planChipActive]}
                >
                  <Text
                    style={[
                      styles.planChipText,
                      active && styles.planChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {plan.name || `Sortie #${pid}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {hasActivePlan && activePlan ? (
        <View style={styles.planActiveCard}>
          <Text style={styles.planActiveTitle}>
            Points de « {activePlan.name} »
          </Text>
          <Text style={styles.planActiveMeta}>
            {(activePlan.validated_box_count || 0) +
              (activePlan.pending_box_count || 0)}{" "}
            box ·{" "}
            {Array.isArray(activePlan.trail_notes)
              ? activePlan.trail_notes.length
              : 0}{" "}
            point
            {(Array.isArray(activePlan.trail_notes)
              ? activePlan.trail_notes.length
              : 0) === 1
              ? ""
              : "s"}
          </Text>
          {onPlanNameDraftChange ? (
            <TextInput
              style={styles.planSaveInput}
              value={planNameDraft}
              onChangeText={onPlanNameDraftChange}
              placeholder="Nom de la sortie"
              placeholderTextColor={theme.inkMuted}
            />
          ) : null}
          {onPlanNotesDraftChange ? (
            <TextInput
              style={[styles.planSaveInput, styles.planNotesInput]}
              value={planNotesDraft}
              onChangeText={onPlanNotesDraftChange}
              placeholder="Note générale de la sortie (optionnel)"
              placeholderTextColor={theme.inkMuted}
              multiline
            />
          ) : null}
          <View style={styles.planBtnRow}>
            {onSaveActivePlanDrafts ? (
              <Pressable
                onPress={onSaveActivePlanDrafts}
                style={[styles.actionBtn, styles.planBtnHalf]}
              >
                <Text style={styles.actionBtnText}>Sauver nom & note</Text>
              </Pressable>
            ) : null}
            {onApplyPlanToMap ? (
              <Pressable
                onPress={() => onApplyPlanToMap(activePlan)}
                style={[styles.actionBtn, styles.planBtnHalf]}
              >
                <Text style={styles.actionBtnText}>Voir sur carte</Text>
              </Pressable>
            ) : null}
          </View>
          {onSetPlanVisibility ? (
            <Pressable
              onPress={() =>
                onSetPlanVisibility(
                  activePlanVisibility === "shared" ? "private" : "shared"
                )
              }
              style={[
                styles.shareToggle,
                activePlanVisibility === "shared" && styles.shareToggleOn,
              ]}
            >
              <Text
                style={[
                  styles.shareToggleText,
                  activePlanVisibility === "shared" &&
                    styles.shareToggleTextOn,
                ]}
              >
                {activePlanVisibility === "shared"
                  ? "Sortie partagée — visible en communauté"
                  : "Partager cette sortie (communauté)"}
              </Text>
            </Pressable>
          ) : null}
          {onForkSharedPlan && activePlan?.id ? (
            <Pressable
              onPress={() => onForkSharedPlan(Number(activePlan.id))}
              style={[styles.actionBtn, { marginTop: 6 }]}
            >
              <Text style={styles.actionBtnText}>Dupliquer cette sortie</Text>
            </Pressable>
          ) : null}
          {planTrailNotes.length > 0 ? (
            <View style={styles.planTrailNotesSection}>
              <Text style={styles.planSubLabel}>
                Points de cette sortie ({planTrailNotes.length})
              </Text>
              {planTrailNotes.map((n, idx) => {
                const nid = Number(n.id);
                const ptId = trailMapPointId("plan", n.id, idx);
                const hi = highlightedMapPointId === ptId;
                const onMap = isPlanTrailNoteMapVisible(n);
                const isRavito =
                  n.ravito_request_id != null ||
                  String(n.note || "").startsWith("🟣");
                const draftText = String(
                  trailNoteDraftById[nid] ?? n.note ?? ""
                );
                return (
                  <View
                    key={`plan-trail-note-${n.id || idx}`}
                    style={[
                      styles.planTrailNoteRow,
                      hi && styles.mapPointRowHighlight,
                      !onMap && styles.savedCardExcluded,
                    ]}
                  >
                    <View style={styles.savedStatusRow}>
                      {isRavito ? (
                        <Text style={styles.savedBadgeRavito}>Ravito</Text>
                      ) : (
                        <Text style={styles.savedBadgeDraft}>Point</Text>
                      )}
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          onTogglePlanTrailNoteMapVisible?.(n.id, !onMap);
                        }}
                        style={[
                          styles.savedIncludeChip,
                          onMap && styles.savedIncludeChipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.savedIncludeChipText,
                            onMap && styles.savedIncludeChipTextOn,
                          ]}
                        >
                          {onMap ? "Carte" : "Masqué"}
                        </Text>
                      </Pressable>
                      {onDeletePlanTrailNote ? (
                        <Pressable
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            onDeletePlanTrailNote(n.id);
                          }}
                          hitSlop={10}
                          style={styles.savedRemoveBtn}
                        >
                          <Text style={styles.savedRemoveText}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable
                      nativeID={mapPointDomId(ptId)}
                      onPress={() => onFocusPlanTrailNote?.(n, "plan", idx)}
                      {...webHoverHandlers(
                        () => onHighlightMapPoint?.(ptId),
                        () => onHighlightMapPoint?.(null)
                      )}
                    >
                      {n.point_lat != null && n.point_lon != null ? (
                        <Text style={styles.planTrailNoteMeta}>
                          {Number(n.point_lat).toFixed(4)}°,{" "}
                          {Number(n.point_lon).toFixed(4)}° · centrer
                        </Text>
                      ) : null}
                    </Pressable>
                    <TextInput
                      style={[styles.planSaveInput, { marginTop: 6 }]}
                      value={draftText}
                      onChangeText={(v) =>
                        onPlanTrailNoteDraftChange?.(nid, v)
                      }
                      placeholder="Texte du point / infos"
                      placeholderTextColor={theme.inkMuted}
                      multiline
                    />
                    {onSavePlanTrailNote ? (
                      <Pressable
                        onPress={() => onSavePlanTrailNote(nid)}
                        style={[styles.actionBtn, { marginTop: 6 }]}
                      >
                        <Text style={styles.actionBtnText}>Sauver le point</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.planSaveHint}>
          Pas encore de sortie — clique un point sur la carte puis
          « Créer la sortie et ajouter ce point ».
        </Text>
      )}

      {pickedBoxes.length > 0 ? (
        <View style={styles.planBoxesSection}>
          <Text style={styles.planSubLabel}>
            Box cochées ({pickedBoxCount})
          </Text>
          {pickedBoxes.map((b) => {
            const bid = Number(b.id);
            const rowFocused =
              Number(focusedBoxId) === bid ||
              Number(highlightedPlanBoxId) === bid;
            return (
            <View
              key={`picked-box-${b.id}`}
              style={[
                styles.planBoxRow,
                rowFocused && styles.mapPointRowHighlight,
              ]}
            >
              <Pressable
                style={styles.planBoxRowMain}
                onPress={() => {
                  onHighlightPlanBox?.(bid);
                  onFocusBox?.(b.id);
                }}
              >
                <Text style={styles.planBoxTitle} numberOfLines={1}>
                  {b.title}
                </Text>
                <Text style={styles.planBoxMeta} numberOfLines={1}>
                  {b.city || "—"}
                  {b.inPlan ? " · dans le plan" : " · à ajouter au plan"}
                </Text>
              </Pressable>
              {onBookBox ? (
                <Pressable
                  onPress={() => onBookBox(b.id)}
                  style={styles.planBoxBookBtn}
                >
                  <Text style={styles.planBoxBookText}>Réserver</Text>
                </Pressable>
              ) : null}
            </View>
            );
          })}
          {onUpsertPickedBoxesToPlan ? (
            <Pressable
              onPress={onUpsertPickedBoxesToPlan}
              disabled={routePlanBusy || !isAuthed}
              style={[styles.actionBtn, styles.planSyncBtn]}
            >
              <Text style={styles.actionBtnText}>
                {hasActivePlan
                  ? "Ajouter les box cochées à la sortie"
                  : "Créer une sortie avec ces box"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.planSaveHint}>
          Coche des box sur la carte pour les lier à cette sortie.
        </Text>
      )}

      {hasActivePlan && planBoxes.length > 0 ? (
        <View style={styles.planBoxesSection}>
          <Text style={styles.planSubLabel}>Box de la sortie</Text>
          <Text style={styles.planSaveHint}>
            Créneau réservé, validation hôte et note de plan par box.
          </Text>
          {planBoxes.map((b) => (
            <PlanBoxReservationCard
              key={`plan-box-${b.id}`}
              nativeID={planBoxDomId(b.id)}
              box={b}
              highlighted={Number(highlightedPlanBoxId) === Number(b.id)}
              onHighlightBox={() => onHighlightPlanBox?.(Number(b.id))}
              onUnhighlightBox={() => onHighlightPlanBox?.(null)}
              planId={activePlan?.id}
              commentDraft={String(boxCommentDraftById[Number(b.id)] ?? "")}
              onCommentChange={(text) =>
                onBoxCommentDraftChange?.(Number(b.id), text)
              }
              onSaveComment={() =>
                onSavePlanBoxComment?.(Number(b.id))
              }
              onFocusBox={() => onFocusBox?.(Number(b.id))}
              onBookBox={() => onBookBox?.(Number(b.id))}
              editingBookingId={editingPlanBookingId}
              bookingDraft={planBookingDraft}
              onBookingDraftChange={onPlanBookingDraftChange}
              onStartEditBooking={() => onStartEditPlanBoxBooking?.(b)}
              onCancelEditBooking={onCancelEditPlanBoxBooking}
              onSaveBooking={onSavePlanBoxBooking}
              onOpenReservations={onOpenReservations}
              hostPendingBooking={
                typeof hostPendingBookingByBoxId === "function"
                  ? hostPendingBookingByBoxId(Number(b.id))
                  : null
              }
              onHostDecideBooking={onHostDecideBooking}
            />
          ))}
        </View>
      ) : null}

      {!isAuthed ? (
        <Text style={styles.planSaveWarn}>
          Connecte-toi pour sauvegarder sur ton compte.
        </Text>
      ) : null}

      {!hasActivePlan ? (
        <>
          <TextInput
            style={styles.planSaveInput}
            value={routePlanSaveName}
            onChangeText={onRoutePlanSaveNameChange}
            placeholder="Nom de la nouvelle sortie (optionnel)"
            placeholderTextColor={theme.inkMuted}
          />
          {onRoutePlanDraftNotesChange ? (
            <TextInput
              style={[styles.planSaveInput, styles.planNotesInput]}
              value={routePlanDraftNotes}
              onChangeText={onRoutePlanDraftNotesChange}
              placeholder="Note générale (optionnel)"
              placeholderTextColor={theme.inkMuted}
              multiline
            />
          ) : null}
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
                ? "Création…"
                : "Créer la sortie (trace + box cochées)"}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function PlanBoxReservationCard({
  nativeID: domId,
  box,
  highlighted = false,
  onHighlightBox,
  onUnhighlightBox,
  commentDraft,
  onCommentChange,
  onSaveComment,
  onFocusBox,
  onBookBox,
  editingBookingId,
  bookingDraft,
  onBookingDraftChange,
  onStartEditBooking,
  onCancelEditBooking,
  onSaveBooking,
  onOpenReservations,
  hostPendingBooking = null,
  onHostDecideBooking,
}) {
  const boxId = Number(box.id);
  const status = String(box.validation_status || "pending");
  const colors = planBoxStatusColors(status);
  const hasBooking = planBoxHasActiveBooking(box);
  const slotLabel = formatPlanBoxSlot(box);
  const priceLabel = formatPlanBoxPrice(box);
  const bookingId = Number(box.latest_booking_id);
  const isEditing =
    Number.isFinite(bookingId) &&
    bookingId > 0 &&
    Number(editingBookingId) === bookingId;
  const approval = String(box.latest_approval_status || "");

  return (
    <View
      nativeID={domId}
      style={[
        styles.planBoxReservationCard,
        {
          borderColor: highlighted ? theme.primary : colors.border,
          backgroundColor: highlighted ? theme.primarySoft : colors.bg,
        },
        highlighted && styles.mapPointRowHighlight,
      ]}
    >
      <Pressable
        onPress={() => {
          onHighlightBox?.();
          onFocusBox?.();
        }}
        style={styles.planBoxRowMain}
      >
        <Text style={styles.planBoxTitle} numberOfLines={1}>
          {box.title || "Box"}
        </Text>
        <Text style={styles.planBoxMeta} numberOfLines={1}>
          {box.city || "—"}
        </Text>
      </Pressable>

      <View style={styles.planBoxStatusRow}>
        <Text style={[styles.planBoxStatusBadge, { color: colors.text }]}>
          {planBoxValidationLabel(status)}
        </Text>
        {hasBooking ? (
          <Text style={styles.planBoxStatusSub}>
            {planBoxApprovalLabel(approval)}
          </Text>
        ) : null}
      </View>

      {hostPendingBooking ? (
        <View style={styles.planBoxHostBlock}>
          <Text style={styles.planBoxEditTitle}>
            Demande reçue sur ta box (hôte)
          </Text>
          <Text style={styles.planBoxBookingLine}>
            {hostPendingBooking.athlete_full_name || "Athlète"} ·{" "}
            {hostPendingBooking.booking_date}{" "}
            {hostPendingBooking.start_time}–{hostPendingBooking.end_time}
          </Text>
          <Text style={styles.planBoxStatusSub}>
            {planBoxApprovalLabel(hostPendingBooking.approval_status)}
          </Text>
          <View style={styles.planBoxActionsRow}>
            {onHostDecideBooking ? (
              <>
                <Pressable
                  onPress={() =>
                    onHostDecideBooking(
                      Number(hostPendingBooking.id),
                      "accept"
                    )
                  }
                  style={[
                    styles.planBoxActionBtn,
                    styles.planBoxActionBtnPrimary,
                  ]}
                >
                  <Text style={styles.planBoxActionBtnTextPrimary}>
                    Valider
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    onHostDecideBooking(
                      Number(hostPendingBooking.id),
                      "reject"
                    )
                  }
                  style={styles.planBoxActionBtn}
                >
                  <Text style={styles.planBoxActionBtnText}>Refuser</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {hasBooking ? (
        <View style={styles.planBoxBookingDetail}>
          <Text style={styles.planBoxBookingLine}>
            <Text style={styles.planBoxBookingLabel}>Créneau : </Text>
            {slotLabel || "—"}
          </Text>
          {priceLabel ? (
            <Text style={styles.planBoxBookingLine}>
              <Text style={styles.planBoxBookingLabel}>Montant : </Text>
              {priceLabel}
            </Text>
          ) : null}
          {box.latest_booking_special_request ? (
            <Text style={styles.planBoxBookingLine} numberOfLines={4}>
              <Text style={styles.planBoxBookingLabel}>Demande : </Text>
              {box.latest_booking_special_request}
            </Text>
          ) : null}
          {box.plan_box_comment ? (
            <Text style={styles.planBoxBookingLine} numberOfLines={3}>
              <Text style={styles.planBoxBookingLabel}>Note plan : </Text>
              {box.plan_box_comment}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.planBoxNoBooking}>
          Pas encore de réservation active pour cette box.
        </Text>
      )}

      <TextInput
        style={styles.planBoxCommentInput}
        placeholder="Note box dans ton plan (stratégie, matos…)"
        placeholderTextColor={theme.inkMuted}
        value={commentDraft}
        onChangeText={onCommentChange}
        multiline
      />
      {onSaveComment ? (
        <Pressable onPress={onSaveComment} style={styles.planBoxSmallBtn}>
          <Text style={styles.planBoxSmallBtnText}>Sauver note box</Text>
        </Pressable>
      ) : null}

      {isEditing && bookingDraft && onBookingDraftChange ? (
        <View style={styles.planBoxEditBlock}>
          <Text style={styles.planBoxEditTitle}>Modifier le créneau</Text>
          <TextInput
            style={styles.planSaveInput}
            placeholder="Date (AAAA-MM-JJ)"
            placeholderTextColor={theme.inkMuted}
            value={bookingDraft.bookingDate || ""}
            onChangeText={(v) =>
              onBookingDraftChange({ ...bookingDraft, bookingDate: v })
            }
          />
          <View style={styles.planBoxTimeRow}>
            <TextInput
              style={[styles.planSaveInput, styles.planBoxTimeInput]}
              placeholder="Début (HH:MM)"
              placeholderTextColor={theme.inkMuted}
              value={bookingDraft.startTime || ""}
              onChangeText={(v) =>
                onBookingDraftChange({ ...bookingDraft, startTime: v })
              }
            />
            <TextInput
              style={[styles.planSaveInput, styles.planBoxTimeInput]}
              placeholder="Fin (HH:MM)"
              placeholderTextColor={theme.inkMuted}
              value={bookingDraft.endTime || ""}
              onChangeText={(v) =>
                onBookingDraftChange({ ...bookingDraft, endTime: v })
              }
            />
          </View>
          <TextInput
            style={[styles.planSaveInput, styles.planNotesInput]}
            placeholder="Demande spéciale"
            placeholderTextColor={theme.inkMuted}
            value={bookingDraft.specialRequest || ""}
            onChangeText={(v) =>
              onBookingDraftChange({ ...bookingDraft, specialRequest: v })
            }
            multiline
          />
          <View style={styles.planBtnRow}>
            <Pressable
              onPress={onSaveBooking}
              style={[styles.actionBtn, styles.actionBtnPrimary, styles.planBtnHalf]}
            >
              <Text style={styles.actionBtnTextPrimary}>Enregistrer</Text>
            </Pressable>
            <Pressable
              onPress={onCancelEditBooking}
              style={[styles.actionBtn, styles.planBtnHalf]}
            >
              <Text style={styles.actionBtnText}>Annuler</Text>
            </Pressable>
          </View>
          <Text style={styles.planSaveHint}>
            La modification doit être validée par l'hôte.
          </Text>
        </View>
      ) : (
        <View style={styles.planBoxActionsRow}>
          {hasBooking && onStartEditBooking ? (
            <Pressable
              onPress={onStartEditBooking}
              style={[styles.planBoxActionBtn, styles.planBoxActionBtnPrimary]}
            >
              <Text style={styles.planBoxActionBtnTextPrimary}>
                Modifier créneau
              </Text>
            </Pressable>
          ) : onBookBox ? (
            <Pressable
              onPress={onBookBox}
              style={[styles.planBoxActionBtn, styles.planBoxActionBtnPrimary]}
            >
              <Text style={styles.planBoxActionBtnTextPrimary}>Réserver</Text>
            </Pressable>
          ) : null}
          {onOpenReservations ? (
            <Pressable onPress={onOpenReservations} style={styles.planBoxActionBtn}>
              <Text style={styles.planBoxActionBtnText}>Mes réservations</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SavedProbeCard({
  entry,
  linkableBoxes = [],
  trailTips = [],
  isTrailCreator = false,
  onFocus,
  onRemove,
  onSaveNotes,
  onLinkBoxChange,
  onPublishEntry,
  onUnpublishEntry,
  onToggleIncludeInPlan,
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
  const linkedId = Number(entry.linkedBoxId);
  const linkedBox = linkableBoxes.find((b) => Number(b.id) === linkedId);
  const isPublic = isEntryPublishedOnTrail(entry, trailTips);
  const includeInPlan = entry.includeInPlan !== false;

  return (
    <View
      style={[
        styles.savedCard,
        isPublic && styles.savedCardPublicLinked,
        !includeInPlan && styles.savedCardExcluded,
      ]}
    >
      <View style={styles.savedStatusRow}>
        {isPublic ? (
          <Text style={styles.savedBadgePublic}>Public (violet)</Text>
        ) : (
          <Text style={styles.savedBadgeDraft}>Brouillon seul</Text>
        )}
        <Pressable
          onPress={() => onToggleIncludeInPlan?.(entry.id, !includeInPlan)}
          style={[
            styles.savedIncludeChip,
            includeInPlan && styles.savedIncludeChipOn,
          ]}
        >
          <Text
            style={[
              styles.savedIncludeChipText,
              includeInPlan && styles.savedIncludeChipTextOn,
            ]}
          >
            {includeInPlan ? "Dans mon plan" : "Hors plan"}
          </Text>
        </Pressable>
      </View>
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
      {isTrailCreator ? (
        <View style={styles.savedPubRow}>
          {isPublic && onUnpublishEntry ? (
            <Pressable
              onPress={() => onUnpublishEntry(entry)}
              style={[styles.actionBtn, styles.savedUnpublishBtn]}
            >
              <Text style={styles.actionBtnText}>Retirer du public</Text>
            </Pressable>
          ) : onPublishEntry ? (
            <Pressable
              onPress={() => onPublishEntry(entry)}
              style={[styles.actionBtn, styles.actionBtnCreator]}
            >
              <Text style={styles.actionBtnText}>Publier en public</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {expanded ? (
        <View style={styles.savedNoteEditor}>
          {linkableBoxes.length > 0 && onLinkBoxChange ? (
            <View style={styles.linkBoxRow}>
              <Text style={styles.linkBoxLabel}>Lier à une box</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.linkBoxScroll}
              >
                <Pressable
                  onPress={() => onLinkBoxChange(null)}
                  style={[
                    styles.linkBoxChip,
                    !Number.isFinite(linkedId) && styles.linkBoxChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.linkBoxChipText,
                      !Number.isFinite(linkedId) && styles.linkBoxChipTextActive,
                    ]}
                  >
                    Aucune
                  </Text>
                </Pressable>
                {linkableBoxes.map((b) => {
                  const active = linkedId === Number(b.id);
                  return (
                    <Pressable
                      key={`link-box-${b.id}-${entry.id}`}
                      onPress={() => onLinkBoxChange(b.id)}
                      style={[
                        styles.linkBoxChip,
                        active && styles.linkBoxChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.linkBoxChipText,
                          active && styles.linkBoxChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {b.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          {linkedBox ? (
            <Text style={styles.linkedBoxPreview}>
              Lié à : {linkedBox.title}
            </Text>
          ) : null}
          <TextInput
            style={styles.savedNoteInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Conseil, pause, box, accès, danger…"
            placeholderTextColor={theme.inkMuted}
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
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.borderSoft,
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
  workspaceLegend: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  workspaceLegendText: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.inkMuted,
  },
  workspaceLegendBold: {
    fontWeight: "800",
    color: theme.primary,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 10,
    marginTop: 8,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.surfaceMuted,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabBtnActive: {
    backgroundColor: theme.hero,
    borderColor: theme.hero,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.ink,
  },
  tabBtnTextActive: {
    color: theme.white,
  },
  sortieBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: theme.primary,
  },
  sortieBannerKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.75)",
  },
  sortieBannerTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    color: theme.white,
    fontFamily: theme.fontDisplay,
  },
  sortieBannerMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
  },
  probeBelongHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  communityToggle: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: "center",
  },
  communityToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.primary,
    fontFamily: theme.font,
  },
  composerHintBox: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    backgroundColor: theme.warnBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.warnBorder,
  },
  composerHintTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.warn,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  composerHintText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: theme.warn,
  },
  actionBtnCreator: {
    backgroundColor: theme.primary,
    borderColor: theme.primaryPressed,
  },
  communityBlock: {
    marginHorizontal: 10,
    marginTop: 4,
    padding: 12,
    gap: 8,
  },
  communityTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.hero,
  },
  communityIntro: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.ink,
  },
  communityRefresh: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.border,
  },
  communityRefreshText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.ink,
  },
  communitySectionLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "800",
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  communityCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 8,
  },
  communityCardSelected: {
    borderColor: theme.primary,
    borderWidth: 2,
    backgroundColor: theme.primarySoft,
  },
  communityPreviewDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.warnBorder,
  },
  communityPreviewLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.warn,
    marginTop: 6,
    marginBottom: 4,
  },
  communityPreviewItem: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.ink,
    marginBottom: 4,
  },
  communityCardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.ink,
  },
  communityCardBody: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: theme.ink,
  },
  communityCardMeta: {
    marginTop: 4,
    fontSize: 10,
    color: theme.inkMuted,
  },
  communityHint: {
    fontSize: 10,
    color: theme.inkMuted,
    lineHeight: 14,
  },
  communityEmpty: {
    fontSize: 11,
    color: theme.inkMuted,
    fontStyle: "italic",
  },
  communityDeleteBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  communityDeleteText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.danger,
  },
  shareToggle: {
    marginTop: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  shareToggleOn: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  shareToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.inkMuted,
    textAlign: "center",
  },
  shareToggleTextOn: {
    color: theme.primary,
    fontWeight: "700",
  },
  hero: {
    backgroundColor: theme.hero,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  heroExit: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.heroAccent,
    textDecorationLine: "underline",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 0,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.white,
    lineHeight: 19,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  trailPublicToggle: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  trailPublicToggleOn: {
    borderColor: theme.heroAccent,
    backgroundColor: "rgba(197, 217, 138, 0.2)",
  },
  trailPublicToggleText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  trailPublicToggleTextOn: {
    color: theme.heroAccent,
  },
  probeExplain: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: theme.warn,
    fontWeight: "600",
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
    backgroundColor: theme.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  statValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: theme.ink,
  },
  statValueAccent: {
    color: theme.primary,
  },
  statValueMuted: {
    color: theme.inkMuted,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: theme.borderSoft,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.mapTeal,
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
    backgroundColor: theme.primarySoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.warnBorder,
    gap: 4,
  },
  probeKm: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.warn,
  },
  probeDetail: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.warn,
  },
  probeTerrain: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.warn,
  },
  probeCoords: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.warn,
    fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
  },
  probeHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: theme.warn,
  },
  probeLockedLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.warn,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  actionBtnPrimary: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
  },
  actionBtnTextPrimary: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.white,
  },
  planSaveBlock: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.primarySoft,
    gap: 8,
  },
  planWorkflow: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.ink,
  },
  planSubLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  planChipsWrap: {
    gap: 6,
  },
  planChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  planChip: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planChipActive: {
    backgroundColor: theme.hero,
    borderColor: theme.hero,
  },
  planChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.ink,
    maxWidth: 140,
  },
  planChipTextActive: {
    color: theme.white,
  },
  planActiveCard: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.status.validated.border,
    gap: 6,
  },
  planActiveTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.hero,
  },
  planTrailNotesSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 6,
  },
  planTrailNoteRow: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planTrailNoteText: {
    fontSize: 11,
    color: theme.ink,
    lineHeight: 15,
  },
  planTrailNoteMeta: {
    marginTop: 4,
    fontSize: 10,
    color: theme.inkMuted,
  },
  mapPointRowHighlight: {
    ...MAP_PANEL_SELECTION,
  },
  mapPointTextHighlight: {
    backgroundColor: MAP_SEL.focusSoft,
    borderRadius: 6,
    paddingHorizontal: 4,
    fontWeight: "700",
    color: MAP_SEL.ink,
  },
  planActiveMeta: {
    fontSize: 11,
    color: theme.inkMuted,
  },
  planBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  planBtnHalf: {
    flex: 1,
  },
  planBoxesSection: {
    gap: 6,
  },
  planBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planBoxRowMain: {
    flex: 1,
    minWidth: 0,
  },
  planBoxTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
  },
  planBoxMeta: {
    fontSize: 10,
    color: theme.inkMuted,
    marginTop: 2,
  },
  planBoxBookBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.hero,
  },
  planBoxBookText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.white,
  },
  planBoxReservationCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    gap: 6,
  },
  planBoxStatusRow: {
    gap: 2,
  },
  planBoxStatusBadge: {
    fontSize: 11,
    fontWeight: "800",
  },
  planBoxStatusSub: {
    fontSize: 10,
    color: theme.inkMuted,
  },
  planBoxBookingDetail: {
    gap: 4,
    paddingVertical: 4,
  },
  planBoxBookingLine: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.ink,
  },
  planBoxBookingLabel: {
    fontWeight: "700",
    color: theme.ink,
  },
  planBoxNoBooking: {
    fontSize: 10,
    color: theme.inkMuted,
    fontStyle: "italic",
  },
  planBoxCommentInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 11,
    color: theme.ink,
    backgroundColor: theme.surface,
    minHeight: 44,
    textAlignVertical: "top",
  },
  planBoxSmallBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  planBoxSmallBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.primary,
  },
  planBoxHostBlock: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.status.validated.border,
    gap: 6,
  },
  planBoxEditBlock: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 6,
  },
  planBoxEditTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.ink,
  },
  planBoxTimeRow: {
    flexDirection: "row",
    gap: 8,
  },
  planBoxTimeInput: {
    flex: 1,
  },
  planBoxActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  planBoxActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  planBoxActionBtnPrimary: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  planBoxActionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.ink,
  },
  planBoxActionBtnTextPrimary: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.white,
  },
  planSyncBtn: {
    marginTop: 2,
  },
  planNotesInput: {
    minHeight: 56,
    textAlignVertical: "top",
  },
  linkBoxRow: {
    marginBottom: 8,
  },
  linkBoxLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.inkMuted,
    marginBottom: 4,
  },
  linkBoxScroll: {
    flexGrow: 0,
  },
  linkBoxChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.surfaceMuted,
    marginRight: 6,
    borderWidth: 1,
    borderColor: theme.border,
  },
  linkBoxChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  linkBoxChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.ink,
    maxWidth: 120,
  },
  linkBoxChipTextActive: {
    color: theme.white,
  },
  linkedBoxPreview: {
    fontSize: 10,
    color: theme.primary,
    fontWeight: "600",
    marginBottom: 6,
  },
  planSaveTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.primary,
    letterSpacing: 0.1,
  },
  planSaveHint: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.inkMuted,
    lineHeight: 15,
  },
  planSaveWarn: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.warn,
  },
  planSaveInput: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    fontSize: 13,
    fontWeight: "600",
    color: theme.ink,
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
    borderColor: theme.status.validated.border,
    backgroundColor: theme.primarySoft,
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
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  savedClearAll: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.inkMuted,
  },
  savedHint: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.inkMuted,
    lineHeight: 14,
  },
  savedCard: {
    gap: 6,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    paddingBottom: 4,
  },
  savedCardPublicLinked: {
    borderColor: theme.status.validated.border,
    backgroundColor: theme.status.validated.bg,
  },
  savedCardExcluded: {
    opacity: 0.72,
  },
  savedStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
  savedBadgePublic: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
  },
  savedBadgeDraft: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.inkMuted,
    textTransform: "uppercase",
  },
  savedBadgeRavito: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
  },
  savedIncludeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  savedIncludeChipOn: {
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  savedIncludeChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.inkMuted,
  },
  savedIncludeChipTextOn: {
    color: theme.primary,
  },
  savedPubRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 6,
  },
  savedUnpublishBtn: {
    flex: 1,
    backgroundColor: theme.dangerSoft,
    borderColor: theme.status.rejected.border,
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
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.pickedSoft,
  },
  savedRowLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.primary,
  },
  savedRowMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: theme.ink,
  },
  savedRowCoords: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: theme.inkMuted,
    fontFamily: Platform.OS === "web" ? "ui-monospace, monospace" : undefined,
  },
  savedNotePreview: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: theme.ink,
    lineHeight: 15,
  },
  savedNoteBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.status.validated.border,
  },
  savedNoteBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.status.validated.fg,
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
    borderColor: theme.status.validated.border,
    backgroundColor: theme.surface,
    fontSize: 12,
    fontWeight: "500",
    color: theme.ink,
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
    backgroundColor: theme.primary,
  },
  savedNoteSaveText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.white,
  },
  savedNoteDelete: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.border,
  },
  savedNoteDeleteText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.inkMuted,
  },
  savedRemoveBtn: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: theme.dangerSoft,
    borderWidth: 1,
    borderColor: theme.status.rejected.border,
  },
  savedRemoveText: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.danger,
    lineHeight: 20,
  },
  hint: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: "600",
    color: theme.inkMuted,
    textAlign: "center",
  },
});
