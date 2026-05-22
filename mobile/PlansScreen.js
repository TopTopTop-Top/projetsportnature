import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ExplorerWebMap from "./ExplorerWebMap";
import NativeExplorerMap from "./NativeExplorerMap";
import { buildTrailMapPoints } from "./trailMapPoints";
import {
  RelevanceBadge,
  RelevanceVoteRow,
  formatPlanSignals,
  formatRelevanceLine,
} from "./relevanceIndicators";

const theme = {
  primary: "#0D9488",
  hero: "#062D26",
  ink: "#0F172A",
  inkMuted: "#64748B",
  border: "#E2E8F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  bg: "#F1F5F9",
};

const TABBAR_SCROLL_PADDING = Platform.OS === "web" ? 120 : 48;

function formatPlanDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function computePlanMapCenter(detail, trails, fallbackLat, fallbackLon) {
  const pts = [];
  const boxes = Array.isArray(detail?.boxes) ? detail.boxes : [];
  for (const b of boxes) {
    const lat = Number(b.latitude);
    const lng = Number(b.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
  }
  const trailNotes = Array.isArray(detail?.trail_notes) ? detail.trail_notes : [];
  for (const n of trailNotes) {
    const lat = Number(n.point_lat);
    const lng = Number(n.point_lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
  }
  const tid = Number(detail?.trail_id);
  const trail = (trails || []).find((t) => Number(t.id) === tid);
  if (trail?.polyline_json) {
    try {
      const positions = JSON.parse(trail.polyline_json);
      if (Array.isArray(positions)) {
        for (const p of positions) {
          if (Array.isArray(p) && p.length >= 2) {
            const lat = Number(p[0]);
            const lng = Number(p[1]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (pts.length === 0) {
    return [
      Number(fallbackLat) || 45.8992,
      Number(fallbackLon) || 6.1294,
    ];
  }
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of pts) {
    sumLat += lat;
    sumLng += lng;
  }
  return [sumLat / pts.length, sumLng / pts.length];
}

function PlanPreviewMap({
  detail,
  selectedKind,
  trails,
  staticOrigin,
  mapLat,
  mapLon,
  fullHeight = false,
}) {
  const trailId = Number(detail?.trail_id);
  const trail = useMemo(
    () => (trails || []).find((t) => Number(t.id) === trailId) || null,
    [trails, trailId]
  );
  const boxes = Array.isArray(detail?.boxes) ? detail.boxes : [];
  const boxIds = useMemo(
    () => boxes.map((b) => Number(b.id)).filter(Number.isFinite),
    [boxes]
  );
  const trailsOnMap = useMemo(() => (trail ? [trail] : []), [trail]);
  const center = useMemo(
    () => computePlanMapCenter(detail, trails, mapLat, mapLon),
    [detail, trails, mapLat, mapLon]
  );
  const trailMapPoints = useMemo(
    () =>
      buildTrailMapPoints({
        trailId,
        plan: selectedKind === "discover" ? null : detail,
        sharedPreview: selectedKind === "discover" ? detail : null,
      }),
    [detail, trailId, selectedKind]
  );
  const recenterNonce = Number(detail?.id) || 0;
  const mapHeight = fullHeight ? undefined : Platform.OS === "web" ? 300 : 220;

  const common = {
    center,
    boxes,
    trails: trailsOnMap,
    selectedTrailId: Number.isFinite(trailId) ? trailId : null,
    selectedTrailIds: Number.isFinite(trailId) ? [trailId] : [],
    selectedBoxIds: boxIds,
    planBoxIds: boxIds,
    selectedBoxId: boxIds[0] ?? null,
    autoFitToData: true,
    followExternalCenter: false,
    recenterNonce,
    onSelectBox: () => {},
    onSelectTrail: () => {},
  };

  return (
    <View
      style={[
        styles.mapWrap,
        fullHeight ? styles.mapWrapTall : null,
        mapHeight != null ? { height: mapHeight } : null,
      ]}
    >
      {Platform.OS === "web" ? (
        <ExplorerWebMap
          {...common}
          trailMapPoints={trailMapPoints}
          planPointLabelsPermanent
          staticOrigin={staticOrigin || ""}
        />
      ) : (
        <NativeExplorerMap {...common} />
      )}
    </View>
  );
}

function PlanListCard({
  plan,
  selected,
  onPress,
  onToggleVisibility,
  onFork,
  isMine,
  busy,
}) {
  const pid = Number(plan.id);
  const shared = String(plan.visibility) === "shared";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {plan.name || `Plan #${pid}`}
        </Text>
        {isMine ? (
          <View
            style={[
              styles.badge,
              shared ? styles.badgeShared : styles.badgePrivate,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                shared ? styles.badgeTextShared : styles.badgeTextPrivate,
              ]}
            >
              {shared ? "Public" : "Privé"}
            </Text>
          </View>
        ) : (
          <Text style={styles.cardAuthor}>
            {plan.author_label || plan.author_name || "Athlète"}
          </Text>
        )}
      </View>
      <Text style={styles.cardMeta}>
        {plan.trail_name || "Trace"}
        {plan.territory ? ` · ${plan.territory}` : ""}
      </Text>
      <View style={styles.cardSignalsRow}>
        <RelevanceBadge
          avg={plan.relevance_avg_score}
          count={plan.relevance_count}
        />
        <Text style={styles.cardMeta}>
          {formatPlanSignals(plan)}
          {plan.updated_at ? ` · ${formatPlanDate(plan.updated_at)}` : ""}
        </Text>
      </View>
      {String(plan.notes || "").trim() ? (
        <Text style={styles.cardSnippet} numberOfLines={2}>
          {String(plan.notes).trim()}
        </Text>
      ) : null}
      <View style={styles.cardActions}>
        {isMine && onToggleVisibility ? (
          <TouchableOpacity
            style={styles.cardActionBtn}
            disabled={busy}
            onPress={(e) => {
              e?.stopPropagation?.();
              onToggleVisibility();
            }}
          >
            <Ionicons
              name={shared ? "lock-closed-outline" : "globe-outline"}
              size={14}
              color={theme.primary}
            />
            <Text style={styles.cardActionText}>
              {shared ? "Privé" : "Public"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {!isMine && onFork ? (
          <TouchableOpacity
            style={styles.cardActionBtn}
            disabled={busy}
            onPress={(e) => {
              e?.stopPropagation?.();
              onFork?.();
            }}
          >
            <Ionicons name="copy-outline" size={14} color={theme.primary} />
            <Text style={styles.cardActionText}>Copier</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function PlanDetailPanel({
  detail,
  loading,
  onOpenExplorer,
  isAuthed,
  selectedKind,
  onVoteRelevance,
}) {
  if (loading) {
    return (
      <View style={styles.detailPanel}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!detail) return null;
  const boxes = Array.isArray(detail.boxes) ? detail.boxes : [];
  const trailNotes = Array.isArray(detail.trail_notes) ? detail.trail_notes : [];
  const isSharedPreview = selectedKind === "discover";

  return (
    <View style={styles.detailPanel}>
      <Text style={styles.detailTitle}>{detail.name || "Plan"}</Text>
      <Text style={styles.detailMeta}>
        {detail.trail_name || "Trace"}
        {detail.territory ? ` · ${detail.territory}` : ""}
      </Text>
      <Text style={styles.detailMeta}>{formatPlanSignals(detail)}</Text>
      <Text style={styles.detailMeta}>
        {formatRelevanceLine(
          detail.relevance_avg_score,
          detail.relevance_count
        )}
      </Text>
      {String(detail.notes || "").trim() ? (
        <Text style={styles.detailBody}>{String(detail.notes).trim()}</Text>
      ) : null}
      {isAuthed ? (
        <RelevanceVoteRow
          label={
            selectedKind === "discover"
              ? "Ce plan partagé t’inspire ?"
              : "Pertinence de ton plan"
          }
          myScore={detail.my_relevance_score}
          onVote={(score) =>
            onVoteRelevance?.({
              resourceType: "plan",
              resourceId: Number(detail.id),
              score,
            })
          }
        />
      ) : null}
      <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenExplorer}>
        <Ionicons name="compass-outline" size={16} color={theme.primary} />
        <Text style={styles.secondaryBtnText}>
          Composer / réserver sur la Carte
        </Text>
      </TouchableOpacity>
      <Text style={styles.detailSection}>Box ({boxes.length})</Text>
      {boxes.length === 0 ? (
        <Text style={styles.emptyHint}>Aucune box dans ce plan.</Text>
      ) : (
        boxes.map((b) => (
          <View key={`db-${b.id}`} style={styles.noteRow}>
            <Text style={styles.noteKind}>Box</Text>
            <Text style={styles.noteTitle}>{b.title || b.name || `Box #${b.id}`}</Text>
            {b.city ? (
              <Text style={styles.noteMeta}>{b.city}</Text>
            ) : null}
            {b.plan_box_comment ? (
              <Text style={styles.noteBody}>{b.plan_box_comment}</Text>
            ) : (
              <Text style={styles.noteEmpty}>Pas de commentaire</Text>
            )}
          </View>
        ))
      )}
      <Text style={styles.detailSection}>
        Points GPS ({trailNotes.length})
      </Text>
      <Text style={styles.gpsLegend}>
        {isSharedPreview
          ? "Orange sur la carte = plan partagé"
          : "Cyan sur la carte = ton plan"}{" "}
        · numéro = ordre du point
      </Text>
      {trailNotes.length === 0 ? (
        <Text style={styles.emptyHint}>Aucun point GPS enregistré.</Text>
      ) : (
        trailNotes.map((n, idx) => {
          const body = String(n.note || "").trim();
          return (
            <View key={`gps-${n.id ?? idx}`} style={styles.noteRow}>
              <Text style={styles.noteKind}>GPS {idx + 1}</Text>
              <Text style={styles.noteTitle}>
                {body || "Point sans texte"}
              </Text>
              {n.point_lat != null && n.point_lon != null ? (
                <Text style={styles.noteMeta}>
                  {Number(n.point_lat).toFixed(5)},{" "}
                  {Number(n.point_lon).toFixed(5)}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

export default function PlansScreen({ appMain = {} }) {
  const {
    user,
    city,
    trails,
    routePlans,
    routePlanBusy,
    actionsRef,
    mapLat,
    mapLon,
    staticOrigin,
  } = appMain;
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [section, setSection] = useState("private");
  const [search, setSearch] = useState("");
  const [discoverPlans, setDiscoverPlans] = useState([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedKind, setSelectedKind] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const isAuthed = Boolean(user);
  const wideLayout = width >= 900;

  const refreshMine = useCallback(async () => {
    if (!isAuthed) return;
    await actionsRef.current.loadRoutePlans?.();
  }, [isAuthed, actionsRef]);

  const refreshDiscover = useCallback(async () => {
    setDiscoverBusy(true);
    try {
      const rows = await actionsRef.current.loadDiscoverRoutePlans?.({
        city,
      });
      setDiscoverPlans(Array.isArray(rows) ? rows : []);
    } catch {
      setDiscoverPlans([]);
    } finally {
      setDiscoverBusy(false);
    }
  }, [actionsRef, city]);

  useEffect(() => {
    if (!isFocused) return;
    refreshMine();
    refreshDiscover();
  }, [isFocused, refreshMine, refreshDiscover]);

  const myPrivate = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (routePlans || []).filter((p) => {
      if (String(p.visibility) === "shared") return false;
      if (!q) return true;
      const hay = [p.name, p.trail_name, p.territory, p.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [routePlans, search]);

  const myShared = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (routePlans || []).filter((p) => {
      if (String(p.visibility) !== "shared") return false;
      if (!q) return true;
      const hay = [p.name, p.trail_name, p.territory, p.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [routePlans, search]);

  const discoverFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...discoverPlans];
    list.sort((a, b) => {
      const ca = Number(a.relevance_count) || 0;
      const cb = Number(b.relevance_count) || 0;
      if (ca === 0 && cb > 0) return 1;
      if (cb === 0 && ca > 0) return -1;
      const avgDiff =
        (Number(b.relevance_avg_score) || 0) -
        (Number(a.relevance_avg_score) || 0);
      if (avgDiff !== 0) return avgDiff;
      return (Number(b.fork_count) || 0) - (Number(a.fork_count) || 0);
    });
    if (!q) return list;
    return list.filter((p) => {
      const hay = [
        p.name,
        p.trail_name,
        p.territory,
        p.notes,
        p.author_label,
        p.author_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [discoverPlans, search]);

  const listForSection =
    section === "private"
      ? myPrivate
      : section === "shared_mine"
        ? myShared
        : discoverFiltered;

  const loadDetail = useCallback(
    async (planId, kind) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid)) return;
      setSelectedId(pid);
      setSelectedKind(kind);
      setDetailBusy(true);
      setDetail(null);
      try {
        if (kind === "discover") {
          const d = await actionsRef.current.loadSharedRoutePlan?.(pid);
          setDetail(d || null);
        } else {
          const d = await actionsRef.current.loadRoutePlanDetail?.(pid);
          setDetail(d || null);
        }
      } finally {
        setDetailBusy(false);
      }
    },
    [actionsRef]
  );

  const openOnExplorer = useCallback(
    (planId, kind) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid)) return;
      actionsRef.current.queueOpenPlanOnMap?.({
        planId: pid,
        kind: kind === "discover" ? "shared" : "mine",
      });
    },
    [actionsRef]
  );

  const toggleVisibility = useCallback(
    async (plan) => {
      const pid = Number(plan.id);
      if (!Number.isFinite(pid)) return;
      const next =
        String(plan.visibility) === "shared" ? "private" : "shared";
      await actionsRef.current.updateRoutePlan?.(pid, { visibility: next });
      await refreshMine();
      if (Number(selectedId) === pid) {
        await loadDetail(pid, "mine");
      }
    },
    [actionsRef, refreshMine, selectedId, loadDetail]
  );

  const votePlanRelevance = useCallback(
    async (payload) => {
      await actionsRef.current.setResourceRelevance?.(payload);
      const pid = Number(payload?.resourceId);
      const kind = selectedKind;
      if (Number.isFinite(pid)) {
        await loadDetail(pid, kind);
      }
      await refreshMine();
      if (section === "discover") await refreshDiscover();
    },
    [
      actionsRef,
      selectedKind,
      loadDetail,
      refreshMine,
      refreshDiscover,
      section,
    ]
  );

  const forkPlan = useCallback(
    async (plan) => {
      const pid = Number(plan.id);
      if (!Number.isFinite(pid)) return;
      await actionsRef.current.forkRoutePlan?.(pid, {
        name: plan.name ? `Copie · ${plan.name}` : undefined,
      });
      await refreshMine();
      setSection("private");
    },
    [actionsRef, refreshMine]
  );

  const mapPane =
    selectedId != null && (detail || detailBusy) ? (
      <View style={[styles.mapPane, wideLayout && styles.mapPaneWide]}>
        <Text style={styles.mapPaneTitle}>
          {detail?.name || "Aperçu du plan"}
        </Text>
        {detailBusy && !detail ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : detail ? (
          <PlanPreviewMap
            detail={detail}
            selectedKind={selectedKind}
            trails={trails}
            staticOrigin={staticOrigin}
            mapLat={mapLat}
            mapLon={mapLon}
          />
        ) : null}
      </View>
    ) : (
      <View style={styles.mapPlaceholder}>
        <Ionicons name="map-outline" size={28} color={theme.inkMuted} />
        <Text style={styles.mapPlaceholderText}>
          Touche un plan pour afficher la trace, les box et les points GPS ici.
        </Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View style={[styles.root, wideLayout && styles.rootWide]}>
        {wideLayout ? (
          <View style={styles.mapColumn}>{mapPane}</View>
        ) : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: TABBAR_SCROLL_PADDING },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={Platform.OS === "web"}
        >
          <Text style={styles.intro}>
            Bibliothèque de tes parcours. Touche un plan pour l’aperçu sur la
            carte (trace, box, points GPS). Les badges ★ indiquent la
            pertinence (votes 1–5).
          </Text>

          {!wideLayout ? mapPane : null}

          <View style={styles.tabRow}>
            {[
              { id: "private", label: "Mes privés" },
              { id: "shared_mine", label: "Mes publics" },
              { id: "discover", label: "Découverte" },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tabChip,
                  section === t.id && styles.tabChipActive,
                ]}
                onPress={() => {
                  setSection(t.id);
                  setSelectedId(null);
                  setSelectedKind(null);
                  setDetail(null);
                }}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    section === t.id && styles.tabChipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un plan, une trace, une ville…"
            placeholderTextColor="#94A3B8"
          />
          {!isAuthed && section !== "discover" ? (
            <Text style={styles.emptyHint}>
              Connecte-toi pour voir et gérer tes plans.
            </Text>
          ) : null}
          {section === "discover" && discoverBusy ? (
            <ActivityIndicator
              style={{ marginVertical: 16 }}
              color={theme.primary}
            />
          ) : null}
          {isAuthed || section === "discover" ? (
            listForSection.length === 0 ? (
              <Text style={styles.emptyHint}>
                {section === "private"
                  ? "Aucun plan privé. Crée-en un depuis la Carte (trace + Mon plan)."
                  : section === "shared_mine"
                    ? "Aucun plan public à ton nom. Passe un plan en « Public » depuis la liste ou la Carte."
                    : "Aucun plan public trouvé pour cette zone."}
              </Text>
            ) : (
              listForSection.map((plan) => {
                const pid = Number(plan.id);
                const kind = section === "discover" ? "discover" : "mine";
                const selected =
                  Number(selectedId) === pid && selectedKind === kind;
                return (
                  <PlanListCard
                    key={`${kind}-${pid}`}
                    plan={plan}
                    selected={selected}
                    isMine={kind === "mine"}
                    busy={routePlanBusy}
                    onPress={() => loadDetail(pid, kind)}
                    onToggleVisibility={
                      kind === "mine"
                        ? () => toggleVisibility(plan)
                        : undefined
                    }
                    onFork={
                      kind === "discover" && isAuthed
                        ? () => forkPlan(plan)
                        : undefined
                    }
                  />
                );
              })
            )
          ) : null}
          {selectedId != null ? (
            <PlanDetailPanel
              detail={detail}
              loading={detailBusy}
              isAuthed={isAuthed}
              selectedKind={selectedKind}
              onVoteRelevance={votePlanRelevance}
              onOpenExplorer={() => openOnExplorer(selectedId, selectedKind)}
            />
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  root: { flex: 1 },
  rootWide: { flexDirection: "row" },
  mapColumn: {
    flex: 1,
    maxWidth: 480,
    minWidth: 300,
    borderRightWidth: 1,
    borderRightColor: theme.border,
    backgroundColor: theme.surface,
    padding: 12,
  },
  scroll: { flex: 1 },
  content: {
    padding: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  intro: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.inkMuted,
    marginBottom: 12,
  },
  mapPane: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    overflow: "hidden",
  },
  mapPaneWide: { flex: 1, marginBottom: 0 },
  mapPaneTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.hero,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  mapWrap: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  mapWrapTall: {
    flex: 1,
    minHeight: 240,
  },
  mapLoading: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholder: {
    marginBottom: 14,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: "dashed",
    backgroundColor: theme.surface,
    alignItems: "center",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: theme.inkMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  tabChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabChipActive: {
    backgroundColor: theme.hero,
    borderColor: theme.hero,
  },
  tabChipText: { fontSize: 11, fontWeight: "700", color: theme.inkMuted },
  tabChipTextActive: { color: "#fff" },
  searchInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.ink,
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 8,
  },
  cardSelected: { borderColor: theme.primary, borderWidth: 2 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: theme.ink,
  },
  cardAuthor: { fontSize: 11, color: theme.inkMuted, fontWeight: "600" },
  cardSignalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePrivate: { backgroundColor: "#F1F5F9" },
  badgeShared: { backgroundColor: "#DCFCE7" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  badgeTextPrivate: { color: "#475569" },
  badgeTextShared: { color: "#166534" },
  cardMeta: { fontSize: 12, color: theme.inkMuted, marginTop: 4 },
  cardSnippet: { fontSize: 12, color: theme.ink, marginTop: 6 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  cardActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardActionText: { fontSize: 12, fontWeight: "700", color: theme.primary },
  detailPanel: {
    marginTop: 12,
    padding: 14,
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  detailTitle: { fontSize: 17, fontWeight: "800", color: theme.ink },
  detailMeta: { fontSize: 12, color: theme.inkMuted, marginTop: 4 },
  detailBody: {
    fontSize: 13,
    color: theme.ink,
    marginTop: 8,
    lineHeight: 18,
  },
  detailSection: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.hero,
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    marginTop: 12,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700", color: theme.primary },
  noteRow: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    marginBottom: 8,
  },
  noteTitle: { fontSize: 13, fontWeight: "700", color: theme.ink },
  noteBody: { fontSize: 12, color: theme.ink, marginTop: 4, lineHeight: 17 },
  noteMeta: { fontSize: 11, color: theme.inkMuted, marginTop: 2 },
  noteKind: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
  },
  noteEmpty: { fontSize: 11, color: theme.inkMuted, fontStyle: "italic" },
  gpsLegend: {
    fontSize: 11,
    color: theme.inkMuted,
    marginBottom: 8,
    lineHeight: 15,
  },
  emptyHint: { fontSize: 13, color: theme.inkMuted, lineHeight: 18 },
});
