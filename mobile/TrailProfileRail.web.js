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
  onFocusBox,
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
  onPublishTrailTip,
  onDeleteTrailTip,
  activePlanVisibility = "private",
  onSetPlanVisibility,
}) {
  const [workspaceTab, setWorkspaceTab] = useState("composer");
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
                Point figé — clic ailleurs sur la courbe ou le tracé pour suivre à nouveau
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
          activePlanVisibility={activePlanVisibility}
          onSetPlanVisibility={onSetPlanVisibility}
          onForkSharedPlan={onForkSharedPlan}
          savedProbeCount={savedProbes.length}
        />
        ) : null}

        {workspaceTab === "community" ? (
          <CommunityPanel
            trailGeneralNotes={trailGeneralNotes}
            isTrailCreator={isTrailCreator}
            trailTips={trailTips}
            sharedPlans={sharedPlans}
            sharedPlansBusy={sharedPlansBusy}
            isAuthed={isAuthed}
            onRefresh={onRefreshCommunity}
            onForkPlan={onForkSharedPlan}
            onDeleteTrailTip={onDeleteTrailTip}
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
  isAuthed,
  onRefresh,
  onForkPlan,
  onDeleteTrailTip,
}) {
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
        trailTips.map((tip) => (
          <View key={`tip-${tip.id}`} style={styles.communityCard}>
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
        ))
      )}

      <Text style={styles.communitySectionLabel}>
        Plans partagés ({sharedPlans.length})
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
        sharedPlans.map((plan) => (
          <View key={`shared-${plan.id}`} style={styles.communityCard}>
            <Text style={styles.communityCardLabel}>
              {plan.name} · {plan.author_label || "Athlète"}
            </Text>
            <Text style={styles.communityCardMeta}>
              {plan.box_count || 0} box · {plan.tip_count || 0} conseil(s) GPS
            </Text>
            {plan.notes ? (
              <Text style={styles.communityCardBody} numberOfLines={3}>
                {plan.notes}
              </Text>
            ) : null}
            {isAuthed && onForkPlan ? (
              <Pressable
                onPress={() => onForkPlan(Number(plan.id))}
                style={[styles.actionBtn, styles.actionBtnPrimary, { marginTop: 8 }]}
              >
                <Text style={styles.actionBtnTextPrimary}>
                  Créer mon plan à partir de celui-ci
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))
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
  activePlanVisibility = "private",
  onSetPlanVisibility,
  onForkSharedPlan,
}) {
  const planBoxes = Array.isArray(activePlan?.boxes) ? activePlan.boxes : [];

  return (
    <View style={styles.planSaveBlock}>
      <Text style={styles.planSaveTitle}>Mon plan (compte RavitoBox)</Text>
      <Text style={styles.planWorkflow}>
        Enregistre box cochées et/ou brouillons cochés « dans le plan ». La trace
        est optionnelle. Réservations : Réserver par box. Partage du plan :
        Communauté.
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
          {pickedBoxes.map((b) => (
            <View key={`picked-box-${b.id}`} style={styles.planBoxRow}>
              <Pressable
                style={styles.planBoxRowMain}
                onPress={() => onFocusBox?.(b.id)}
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
          ))}
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
          {planBoxes.map((b) => {
            const status = String(b.validation_status || "pending");
            const bookingStatus = String(
              b.latest_booking_status || ""
            ).toLowerCase();
            const hasBooking =
              bookingStatus &&
              bookingStatus !== "cancelled" &&
              bookingStatus !== "canceled";
            return (
              <View key={`plan-box-${b.id}`} style={styles.planBoxRow}>
                <Pressable
                  style={styles.planBoxRowMain}
                  onPress={() => onFocusBox?.(Number(b.id))}
                >
                  <Text style={styles.planBoxTitle} numberOfLines={1}>
                    {b.title || "Box"}
                  </Text>
                  <Text style={styles.planBoxMeta} numberOfLines={1}>
                    {status}
                    {hasBooking ? " · créneau lié" : " · pas encore réservée"}
                  </Text>
                </Pressable>
                {onBookBox ? (
                  <Pressable
                    onPress={() => onBookBox(Number(b.id))}
                    style={styles.planBoxBookBtn}
                  >
                    <Text style={styles.planBoxBookText}>Réserver</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
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
