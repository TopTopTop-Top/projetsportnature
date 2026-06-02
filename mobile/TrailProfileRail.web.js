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
}) {
  const [workspaceTab, setWorkspaceTab] = useState("composer");
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
  }, [highlightedMapPointId, highlightedPlanBoxId, workspaceTab]);
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

        <View style={styles.workspaceLegend}>
          <Text style={styles.workspaceLegendText}>
            <Text style={styles.workspaceLegendBold}>Brouillon</Text> (orange) =
            toi, sur cet appareil ·{" "}
            <Text style={styles.workspaceLegendBold}>Conseil public</Text> (violet)
            = tous, indépendant du brouillon ·{" "}
            <Text style={styles.workspaceLegendBold}>Mon plan</Text> = compte
            (box seules possibles, trace optionnelle)
          </Text>
        </View>

        <View style={styles.tabBar}>
          {[
            { id: "composer", label: "Composer" },
            { id: "plan", label: "Mon plan" },
            { id: "community", label: "Communauté" },
          ].map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setWorkspaceTab(t.id)}
              style={[
                styles.tabBtn,
                workspaceTab === t.id && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  workspaceTab === t.id && styles.tabBtnTextActive,
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {workspaceTab === "composer" ? (
          <>
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
              <Text style={styles.probeLockedLabel}>
                Point figé — survol libre · autre clic sur la courbe ou le tracé déplace le
                point · Déverrouiller pour quitter le mode figé
              </Text>
            ) : (
              <Text style={styles.probeHint}>
                Clic sur la courbe ou le tracé pour figer · survol = suivi libre
              </Text>
            )}
            <Text style={styles.probeExplain}>
              Deux actions distinctes : le brouillon ne retire jamais un conseil
              déjà public pour les autres.
            </Text>
            <View style={styles.probeActions}>
              <Pressable
                onPress={onSaveProbe}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Text style={styles.actionBtnTextPrimary}>
                  Brouillon local
                </Text>
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
                  <Text style={styles.actionBtnText}>Publier en public</Text>
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
            Survole la carte ou la courbe · clic pour figer
          </Text>
        )}

        <View style={styles.composerHintBox}>
          <Text style={styles.composerHintTitle}>Rappel</Text>
          <Text style={styles.composerHintText}>
            Tu peux réserver des box sans trace : quitte la trace ou enregistre un
            plan avec box seules (Mon plan). Coche les points à inclure dans ton
            plan avec la case sur chaque brouillon.
          </Text>
        </View>

        {savedProbes.length > 0 ? (
          <View style={styles.savedBlock}>
            <View style={styles.savedHeader}>
              <Text style={styles.savedTitle}>
                Brouillon — points ({savedProbes.length})
              </Text>
              {onClearSavedProbes ? (
                <Pressable onPress={onClearSavedProbes}>
                  <Text style={styles.savedClearAll}>Tout effacer</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.savedHint}>
              Brouillon ≠ conseil public. Supprimer le brouillon ne retire pas le
              violet pour les autres.
            </Text>
            {savedProbes.map((entry) => (
              <SavedProbeCard
                key={entry.id}
                entry={entry}
                linkableBoxes={linkableBoxes}
                trailTips={trailTipsForEntry}
                isTrailCreator={isTrailCreator}
                onFocus={() => onFocusSavedProbe?.(entry)}
                onRemove={() => onRemoveSavedProbe?.(entry.id)}
                onSaveNotes={(notes) =>
                  onUpdateSavedProbeNotes?.(entry.id, notes)
                }
                onLinkBoxChange={(boxId) =>
                  onUpdateSavedProbeLinkedBox?.(entry.id, boxId)
                }
                onPublishEntry={onPublishEntryTip}
                onUnpublishEntry={onUnpublishEntryTip}
                onToggleIncludeInPlan={onToggleIncludeInPlan}
                onExpandEditor={scrollToBottom}
              />
            ))}
          </View>
        ) : null}
          </>
        ) : null}

        {workspaceTab === "plan" ? (
        <TrailPlanHub
          isAuthed={isAuthed}
          routePlanBusy={routePlanBusy}
          pickedBoxCount={pickedBoxCount}
          pickedBoxes={pickedBoxes}
          savedProbeCount={savedProbes.length}
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
        ) : null}

        {workspaceTab === "community" ? (
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
      <Text style={styles.planSaveTitle}>Mon plan (compte RavitoBox)</Text>
      <Text style={styles.planWorkflow}>
        Enregistre box cochées et/ou brouillons « Dans mon plan ». Pour chaque
        point déjà enregistré ci-dessous, coche « Sur la carte » pour l’afficher
        ou le masquer (sans le supprimer). Réservations : Réserver par box.
      </Text>

      {isAuthed && plansForTrail.length > 0 ? (
        <View style={styles.planChipsWrap}>
          <Text style={styles.planSubLabel}>Plans sur cette trace</Text>
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
                    {plan.name || `Plan #${pid}`}
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
            Plan actif : {activePlan.name}
          </Text>
          <Text style={styles.planActiveMeta}>
            {(activePlan.validated_box_count || 0) + (activePlan.pending_box_count || 0)} box
            · {Array.isArray(activePlan.trail_notes) ? activePlan.trail_notes.length : 0}{" "}
            note(s) enregistrée(s)
          </Text>
          {onPlanNameDraftChange ? (
            <TextInput
              style={styles.planSaveInput}
              value={planNameDraft}
              onChangeText={onPlanNameDraftChange}
              placeholder="Nom du plan"
              placeholderTextColor="#94A3B8"
            />
          ) : null}
          {onPlanNotesDraftChange ? (
            <TextInput
              style={[styles.planSaveInput, styles.planNotesInput]}
              value={planNotesDraft}
              onChangeText={onPlanNotesDraftChange}
              placeholder="Notes générales du plan"
              placeholderTextColor="#94A3B8"
              multiline
            />
          ) : null}
          <View style={styles.planBtnRow}>
            {onSaveActivePlanDrafts ? (
              <Pressable
                onPress={onSaveActivePlanDrafts}
                style={[styles.actionBtn, styles.planBtnHalf]}
              >
                <Text style={styles.actionBtnText}>Sauver nom & notes</Text>
              </Pressable>
            ) : null}
            {onApplyPlanToMap ? (
              <Pressable
                onPress={() => onApplyPlanToMap(activePlan)}
                style={[styles.actionBtn, styles.planBtnHalf]}
              >
                <Text style={styles.actionBtnText}>Carte</Text>
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
                  ? "Plan partagé — visible en Communauté"
                  : "Rendre ce plan public (Communauté)"}
              </Text>
            </Pressable>
          ) : null}
          {onForkSharedPlan && activePlan?.id ? (
            <Pressable
              onPress={() => onForkSharedPlan(Number(activePlan.id))}
              style={[styles.actionBtn, { marginTop: 6 }]}
            >
              <Text style={styles.actionBtnText}>Dupliquer ce plan</Text>
            </Pressable>
          ) : null}
          {planTrailNotes.length > 0 ? (
            <View style={styles.planTrailNotesSection}>
              <Text style={styles.planSubLabel}>
                Points enregistrés ({planTrailNotes.length}) — repère indigo si
                « Sur la carte »
              </Text>
              {planTrailNotes.map((n, idx) => {
                const ptId = trailMapPointId("plan", n.id, idx);
                const hi = highlightedMapPointId === ptId;
                const onMap = isPlanTrailNoteMapVisible(n);
                const isRavito =
                  n.ravito_request_id != null ||
                  String(n.note || "").startsWith("🟣");
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
                        <Text style={styles.savedBadgeDraft}>Waypoint</Text>
                      )}
                      <Pressable
                        onPress={() =>
                          onTogglePlanTrailNoteMapVisible?.(n.id, !onMap)
                        }
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
                          {onMap ? "Sur la carte" : "Hors carte"}
                        </Text>
                      </Pressable>
                      {onDeletePlanTrailNote ? (
                        <Pressable
                          onPress={() => onDeletePlanTrailNote(n.id)}
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
                      <Text style={styles.planTrailNoteText} numberOfLines={4}>
                        {n.note || "(sans texte)"}
                      </Text>
                      {n.point_lat != null && n.point_lon != null ? (
                        <Text style={styles.planTrailNoteMeta}>
                          {Number(n.point_lat).toFixed(4)}°,{" "}
                          {Number(n.point_lon).toFixed(4)}° · toucher = centrer
                        </Text>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.planSaveHint}>
          Pas de plan chargé — enregistre pour créer le lien trace + box + points.
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
                onPress={() => onFocusBox?.(b.id)}
                {...webHoverHandlers(
                  () => onHighlightPlanBox?.(bid),
                  () => onHighlightPlanBox?.(null)
                )}
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
                  ? "Ajouter les box cochées au plan"
                  : "Créer un plan avec ces box"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.planSaveHint}>
          Coche des box sur la carte (clic ou appui long) pour les lier à ce
          plan.
        </Text>
      )}

      {hasActivePlan && planBoxes.length > 0 ? (
        <View style={styles.planBoxesSection}>
          <Text style={styles.planSubLabel}>Box du plan (compte)</Text>
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

      <TextInput
        style={styles.planSaveInput}
        value={routePlanSaveName}
        onChangeText={onRoutePlanSaveNameChange}
        placeholder="Nom du plan (nouveau ou complet)"
        placeholderTextColor="#94A3B8"
      />
      {onRoutePlanDraftNotesChange ? (
        <TextInput
          style={[styles.planSaveInput, styles.planNotesInput]}
          value={routePlanDraftNotes}
          onChangeText={onRoutePlanDraftNotesChange}
          placeholder="Notes plan (stratégie, ravitos…)"
          placeholderTextColor="#94A3B8"
          multiline
        />
      ) : null}
      <Text style={styles.planSaveHint}>
        {pickedBoxCount > 0 ? `${pickedBoxCount} box cochée(s)` : "0 box"}
        {savedProbeCount > 0
          ? ` · ${savedProbeCount} point(s) mémorisé(s) → notes GPS au save`
          : ""}
      </Text>
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
            ? "Enregistrer le plan complet"
            : "Créer le plan (trace + box + points)"}
        </Text>
      </Pressable>
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
          borderColor: highlighted ? "#EA580C" : colors.border,
          backgroundColor: highlighted ? "#FFF7ED" : colors.bg,
        },
        highlighted && styles.mapPointRowHighlight,
      ]}
      {...webHoverHandlers(onHighlightBox, onUnhighlightBox)}
    >
      <Pressable onPress={onFocusBox} style={styles.planBoxRowMain}>
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
        placeholderTextColor="#94A3B8"
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
            placeholderTextColor="#94A3B8"
            value={bookingDraft.bookingDate || ""}
            onChangeText={(v) =>
              onBookingDraftChange({ ...bookingDraft, bookingDate: v })
            }
          />
          <View style={styles.planBoxTimeRow}>
            <TextInput
              style={[styles.planSaveInput, styles.planBoxTimeInput]}
              placeholder="Début (HH:MM)"
              placeholderTextColor="#94A3B8"
              value={bookingDraft.startTime || ""}
              onChangeText={(v) =>
                onBookingDraftChange({ ...bookingDraft, startTime: v })
              }
            />
            <TextInput
              style={[styles.planSaveInput, styles.planBoxTimeInput]}
              placeholder="Fin (HH:MM)"
              placeholderTextColor="#94A3B8"
              value={bookingDraft.endTime || ""}
              onChangeText={(v) =>
                onBookingDraftChange({ ...bookingDraft, endTime: v })
              }
            />
          </View>
          <TextInput
            style={[styles.planSaveInput, styles.planNotesInput]}
            placeholder="Demande spéciale"
            placeholderTextColor="#94A3B8"
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
  workspaceLegend: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  workspaceLegendText: {
    fontSize: 10,
    lineHeight: 14,
    color: "#64748B",
  },
  workspaceLegendBold: {
    fontWeight: "800",
    color: "#0F766E",
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabBtnActive: {
    backgroundColor: "#062D26",
    borderColor: "#062D26",
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  tabBtnTextActive: {
    color: "#FFFFFF",
  },
  composerHintBox: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  composerHintTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  composerHintText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: "#78350F",
  },
  actionBtnCreator: {
    backgroundColor: "#4F46E5",
    borderColor: "#4338CA",
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
    color: "#062D26",
  },
  communityIntro: {
    fontSize: 11,
    lineHeight: 15,
    color: "#475569",
  },
  communityRefresh: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  communityRefreshText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
  },
  communitySectionLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  communityCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  communityCardSelected: {
    borderColor: "#EA580C",
    borderWidth: 2,
    backgroundColor: "#FFF7ED",
  },
  communityPreviewDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#FED7AA",
  },
  communityPreviewLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9A3412",
    marginTop: 6,
    marginBottom: 4,
  },
  communityPreviewItem: {
    fontSize: 10,
    lineHeight: 14,
    color: "#334155",
    marginBottom: 4,
  },
  communityCardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
  },
  communityCardBody: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    color: "#334155",
  },
  communityCardMeta: {
    marginTop: 4,
    fontSize: 10,
    color: "#64748B",
  },
  communityHint: {
    fontSize: 10,
    color: "#64748B",
    lineHeight: 14,
  },
  communityEmpty: {
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  communityDeleteBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  communityDeleteText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#DC2626",
  },
  shareToggle: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  shareToggleOn: {
    backgroundColor: "#ECFDF5",
    borderColor: "#34D399",
  },
  shareToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
  shareToggleTextOn: {
    color: "#047857",
  },
  hero: {
    backgroundColor: "#062D26",
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
    color: "#FBBF24",
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
    color: "#FFFFFF",
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
    borderColor: "#FBBF24",
    backgroundColor: "rgba(251,191,36,0.2)",
  },
  trailPublicToggleText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  trailPublicToggleTextOn: {
    color: "#FBBF24",
  },
  probeExplain: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: "#78350F",
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
  planWorkflow: {
    fontSize: 11,
    lineHeight: 15,
    color: "#475569",
  },
  planSubLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  planChipActive: {
    backgroundColor: "#062D26",
    borderColor: "#062D26",
  },
  planChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
    maxWidth: 140,
  },
  planChipTextActive: {
    color: "#FFFFFF",
  },
  planActiveCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    gap: 6,
  },
  planActiveTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#062D26",
  },
  planTrailNotesSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 6,
  },
  planTrailNoteRow: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  planTrailNoteText: {
    fontSize: 11,
    color: "#0F172A",
    lineHeight: 15,
  },
  planTrailNoteMeta: {
    marginTop: 4,
    fontSize: 10,
    color: "#64748B",
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
    color: "#64748B",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  planBoxRowMain: {
    flex: 1,
    minWidth: 0,
  },
  planBoxTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  planBoxMeta: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  planBoxBookBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#062D26",
  },
  planBoxBookText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
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
    color: "#64748B",
  },
  planBoxBookingDetail: {
    gap: 4,
    paddingVertical: 4,
  },
  planBoxBookingLine: {
    fontSize: 10,
    lineHeight: 14,
    color: "#334155",
  },
  planBoxBookingLabel: {
    fontWeight: "700",
    color: "#0F172A",
  },
  planBoxNoBooking: {
    fontSize: 10,
    color: "#64748B",
    fontStyle: "italic",
  },
  planBoxCommentInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 8,
    fontSize: 11,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
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
    color: "#0D9488",
  },
  planBoxHostBlock: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    gap: 6,
  },
  planBoxEditBlock: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 6,
  },
  planBoxEditTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
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
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  planBoxActionBtnPrimary: {
    borderColor: "#0D9488",
    backgroundColor: "#0D9488",
  },
  planBoxActionBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#334155",
  },
  planBoxActionBtnTextPrimary: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
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
    color: "#64748B",
    marginBottom: 4,
  },
  linkBoxScroll: {
    flexGrow: 0,
  },
  linkBoxChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  linkBoxChipActive: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  linkBoxChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
    maxWidth: 120,
  },
  linkBoxChipTextActive: {
    color: "#FFFFFF",
  },
  linkedBoxPreview: {
    fontSize: 10,
    color: "#0F766E",
    fontWeight: "600",
    marginBottom: 6,
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
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FAFAFA",
    paddingBottom: 4,
  },
  savedCardPublicLinked: {
    borderColor: "#A5B4FC",
    backgroundColor: "#F5F3FF",
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
    color: "#4338CA",
    textTransform: "uppercase",
  },
  savedBadgeDraft: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
  },
  savedBadgeRavito: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0F766E",
    textTransform: "uppercase",
  },
  savedIncludeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  savedIncludeChipOn: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  savedIncludeChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
  },
  savedIncludeChipTextOn: {
    color: "#047857",
  },
  savedPubRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 6,
  },
  savedUnpublishBtn: {
    flex: 1,
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
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
