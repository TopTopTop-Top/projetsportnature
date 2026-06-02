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
import {
  buildTrailMapPoints,
  trailMapPointId,
  mapPointDomId,
  planBoxDomId,
} from "./trailMapPoints";
import {
  RelevanceBadge,
  RelevanceVoteRow,
  formatPlanSignals,
  formatRelevanceLine,
} from "./relevanceIndicators";
import IntentGuideBanner from "./IntentGuideBanner";
import {
  planBoxHasActiveBooking,
  formatPlanBoxSlot,
  planBoxApprovalLabel,
} from "./planBoxReservation";

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

function webHoverHandlers(onEnter, onLeave) {
  if (Platform.OS !== "web") return {};
  return { onMouseEnter: onEnter, onMouseLeave: onLeave };
}

function scrollToDomId(domId) {
  if (Platform.OS !== "web" || typeof document === "undefined" || !domId) {
    return;
  }
  try {
    document
      .getElementById(domId)
      ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  } catch {
    /* noop */
  }
}

function planGpsSource(selectedKind) {
  return selectedKind === "discover" ? "shared_preview" : "plan";
}

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

function defaultMapCenter(mapLat, mapLon) {
  return [Number(mapLat) || 45.8992, Number(mapLon) || 6.1294];
}

function PlanPreviewMap({
  detail,
  selectedKind,
  trails,
  staticOrigin,
  mapLat,
  mapLon,
  fullHeight = false,
  highlightedMapPointId = null,
  highlightedPlanBoxId = null,
  onMapPointHover,
  onMapPointClick,
  onPlanBoxHover,
  onSelectBox,
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
    autoFitDataKey: `plan-${selectedKind || "mine"}-${detail?.id ?? "new"}`,
    followExternalCenter: false,
    recenterNonce,
    onSelectBox: (boxId) => {
      const bid = Number(boxId);
      if (Number.isFinite(bid)) {
        onSelectBox?.(bid);
        onPlanBoxHover?.(bid);
        scrollToDomId(planBoxDomId(bid));
      }
    },
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
          highlightedMapPointId={highlightedMapPointId}
          highlightedPlanBoxId={highlightedPlanBoxId}
          onMapPointHover={onMapPointHover}
          onMapPointClick={onMapPointClick}
          onPlanBoxHover={onPlanBoxHover}
          staticOrigin={staticOrigin || ""}
        />
      ) : (
        <NativeExplorerMap
          {...common}
          onSelectBox={(boxId) => {
            const bid = Number(boxId);
            if (Number.isFinite(bid)) onSelectBox?.(bid);
          }}
        />
      )}
    </View>
  );
}

function PlansOverviewMap({
  boxes,
  trails,
  staticOrigin,
  mapLat,
  mapLon,
  fullHeight = false,
}) {
  const center = useMemo(() => defaultMapCenter(mapLat, mapLon), [mapLat, mapLon]);
  const mapHeight = fullHeight ? undefined : Platform.OS === "web" ? 300 : 220;
  const common = {
    center,
    boxes: Array.isArray(boxes) ? boxes : [],
    trails: Array.isArray(trails) ? trails : [],
    selectedTrailIds: [],
    selectedTrailId: null,
    selectedBoxIds: [],
    planBoxIds: [],
    selectedBoxId: null,
    autoFitToData: false,
    followExternalCenter: false,
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
        <ExplorerWebMap {...common} staticOrigin={staticOrigin || ""} />
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
  isOwn,
  isCommunity,
  busy,
}) {
  const pid = Number(plan.id);
  const isPublic = String(plan.visibility) === "shared";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.card,
        isCommunity ? styles.cardCommunity : styles.cardOwnPublic,
        selected && styles.cardSelected,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {plan.name || `Plan #${pid}`}
        </Text>
        {isCommunity ? (
          <View style={[styles.badge, styles.badgeCommunity]}>
            <Text style={[styles.badgeText, styles.badgeTextCommunity]}>
              Communauté
            </Text>
          </View>
        ) : isOwn ? (
          <View style={[styles.badge, styles.badgeOwnPublic]}>
            <Text style={[styles.badgeText, styles.badgeTextOwnPublic]}>
              Mon public
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
        {isOwn && onToggleVisibility ? (
          <TouchableOpacity
            style={styles.cardActionBtn}
            disabled={busy}
            onPress={(e) => {
              e?.stopPropagation?.();
              onToggleVisibility();
            }}
          >
            <Ionicons
              name={isPublic ? "lock-closed-outline" : "globe-outline"}
              size={14}
              color={theme.primary}
            />
            <Text style={styles.cardActionText}>
              {isPublic ? "Passer privé" : "Rendre public"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {isCommunity && onFork ? (
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
  canBook = false,
  onBookPlanBox,
  selectedKind,
  onVoteRelevance,
  voteEligibility,
  highlightedMapPointId,
  highlightedPlanBoxId,
  onHighlightMapPoint,
  onHighlightPlanBox,
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
  const gpsSource = planGpsSource(selectedKind);
  const isCommunityPlan = selectedKind === "discover";

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
      {isAuthed && isCommunityPlan ? (
        <RelevanceVoteRow
          label="Pertinence de ce plan partagé"
          myScore={detail.my_relevance_score}
          disabled={!voteEligibility?.eligible}
          disabledReason={
            voteEligibility?.eligible ? null : voteEligibility?.message
          }
          onVote={(score) =>
            onVoteRelevance?.({
              resourceType: "plan",
              resourceId: Number(detail.id),
              score,
            })
          }
        />
      ) : isAuthed ? (
        <Text style={styles.eligibilityNote}>
          La note de pertinence est réservée aux autres athlètes qui ont terminé
          toutes les box de ce plan (réservations acceptées). Tu la vois dans
          Découverte pour les plans des autres.
        </Text>
      ) : null}
      <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenExplorer}>
        <Ionicons name="compass-outline" size={16} color={theme.primary} />
        <Text style={styles.secondaryBtnText}>
          Ouvrir sur Découvrir (carte + rail)
        </Text>
      </TouchableOpacity>
      <Text style={styles.detailSection}>Box ({boxes.length})</Text>
      {boxes.length === 0 ? (
        <Text style={styles.emptyHint}>Aucune box dans ce plan.</Text>
      ) : (
        boxes.map((b) => {
          const bid = Number(b.id);
          const boxHi = Number(highlightedPlanBoxId) === bid;
          return (
            <View
              key={`db-${b.id}`}
              nativeID={planBoxDomId(bid)}
              style={[styles.noteRow, boxHi && styles.noteRowHighlight]}
              {...webHoverHandlers(
                () => onHighlightPlanBox?.(bid),
                () => onHighlightPlanBox?.(null)
              )}
            >
              <Text style={styles.noteKind}>Box</Text>
              <Text style={styles.noteTitle}>
                {b.title || b.name || `Box #${b.id}`}
              </Text>
              {b.city ? <Text style={styles.noteMeta}>{b.city}</Text> : null}
              {b.plan_box_comment ? (
                <Text style={styles.noteBody}>{b.plan_box_comment}</Text>
              ) : (
                <Text style={styles.noteEmpty}>Pas de commentaire</Text>
              )}
              {planBoxHasActiveBooking(b) ? (
                <Text style={styles.noteMeta}>
                  Réservation : {formatPlanBoxSlot(b) || "—"} ·{" "}
                  {planBoxApprovalLabel(b.latest_approval_status)}
                </Text>
              ) : canBook && onBookPlanBox ? (
                <TouchableOpacity
                  style={styles.bookBoxBtn}
                  onPress={() => onBookPlanBox(bid)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={theme.primary}
                  />
                  <Text style={styles.bookBoxBtnText}>Réserver cette box</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
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
          const ptId = trailMapPointId(gpsSource, n.id, idx);
          const ptHi = highlightedMapPointId === ptId;
          return (
            <View
              key={`gps-${n.id ?? idx}`}
              nativeID={mapPointDomId(ptId)}
              style={[styles.noteRow, ptHi && styles.noteRowHighlight]}
              {...webHoverHandlers(
                () => onHighlightMapPoint?.(ptId),
                () => onHighlightMapPoint?.(null)
              )}
            >
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
    boxes,
    boxesForMap,
    trails,
    trailsForMap,
    routePlans,
    routePlanBusy,
    actionsRef,
    canBook,
    mapLat,
    mapLon,
    staticOrigin,
  } = appMain;
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [section, setSection] = useState("private");
  const [publicFilter, setPublicFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [communityPlans, setCommunityPlans] = useState([]);
  const [communityBusy, setCommunityBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedKind, setSelectedKind] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [voteEligibility, setVoteEligibility] = useState(null);
  const [highlightedMapPointId, setHighlightedMapPointId] = useState(null);
  const [highlightedPlanBoxId, setHighlightedPlanBoxId] = useState(null);

  const isAuthed = Boolean(user);
  const wideLayout = width >= 900;

  const handleMapPointHover = useCallback((pointId) => {
    setHighlightedMapPointId(pointId || null);
    if (pointId) setHighlightedPlanBoxId(null);
  }, []);

  const handlePlanBoxHover = useCallback((boxId) => {
    if (boxId == null || boxId === "") {
      setHighlightedPlanBoxId(null);
      return;
    }
    const bid = Number(boxId);
    setHighlightedPlanBoxId(Number.isFinite(bid) ? bid : null);
    setHighlightedMapPointId(null);
  }, []);

  const handleMapPointClick = useCallback((pt) => {
    if (!pt?.id) return;
    setHighlightedMapPointId(pt.id);
    setHighlightedPlanBoxId(null);
    scrollToDomId(mapPointDomId(pt.id));
  }, []);

  const handleHighlightMapPoint = useCallback((pointId) => {
    setHighlightedMapPointId(pointId || null);
    if (pointId) setHighlightedPlanBoxId(null);
  }, []);

  const handleHighlightPlanBox = useCallback((boxId) => {
    if (boxId == null) {
      setHighlightedPlanBoxId(null);
      return;
    }
    const bid = Number(boxId);
    setHighlightedPlanBoxId(Number.isFinite(bid) ? bid : null);
    setHighlightedMapPointId(null);
  }, []);

  const refreshMine = useCallback(async () => {
    if (!isAuthed) return;
    await actionsRef.current.loadRoutePlans?.();
  }, [isAuthed, actionsRef]);

  const refreshCommunity = useCallback(async () => {
    setCommunityBusy(true);
    try {
      const rows = await actionsRef.current.loadDiscoverRoutePlans?.({
        scope: "others",
        useCity: false,
      });
      setCommunityPlans(Array.isArray(rows) ? rows : []);
    } catch {
      setCommunityPlans([]);
    } finally {
      setCommunityBusy(false);
    }
  }, [actionsRef]);

  useEffect(() => {
    if (!isFocused) return;
    refreshMine();
    refreshCommunity();
  }, [isFocused, refreshMine, refreshCommunity]);

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

  const myPublicPlans = useMemo(() => {
    return (routePlans || []).filter((p) => String(p.visibility) === "shared");
  }, [routePlans]);

  const publicPlansMerged = useMemo(() => {
    const byId = new Map();
    for (const p of myPublicPlans) {
      const pid = Number(p.id);
      if (!Number.isFinite(pid)) continue;
      byId.set(pid, {
        ...p,
        listKind: "mine",
        isOwn: true,
        isCommunity: false,
      });
    }
    for (const p of communityPlans) {
      const pid = Number(p.id);
      if (!Number.isFinite(pid) || byId.has(pid)) continue;
      byId.set(pid, {
        ...p,
        listKind: "discover",
        isOwn: false,
        isCommunity: true,
      });
    }
    return [...byId.values()].sort(
      (a, b) =>
        new Date(b.updated_at || 0).getTime() -
        new Date(a.updated_at || 0).getTime()
    );
  }, [myPublicPlans, communityPlans]);

  const publicPlansFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = publicPlansMerged;
    if (publicFilter === "mine") {
      list = list.filter((p) => p.isOwn);
    } else if (publicFilter === "community") {
      list = list.filter((p) => p.isCommunity);
    }
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
  }, [publicPlansMerged, publicFilter, search]);

  const listForSection =
    section === "private" ? myPrivate : publicPlansFiltered;
  const overviewBoxes = useMemo(
    () =>
      Array.isArray(boxesForMap) && boxesForMap.length > 0
        ? boxesForMap
        : Array.isArray(boxes)
          ? boxes
          : [],
    [boxesForMap, boxes]
  );
  const overviewTrails = useMemo(
    () =>
      Array.isArray(trailsForMap) && trailsForMap.length > 0
        ? trailsForMap
        : Array.isArray(trails)
          ? trails
          : [],
    [trailsForMap, trails]
  );

  const publicCounts = useMemo(
    () => ({
      all: publicPlansMerged.length,
      mine: publicPlansMerged.filter((p) => p.isOwn).length,
      community: publicPlansMerged.filter((p) => p.isCommunity).length,
    }),
    [publicPlansMerged]
  );

  const loadDetail = useCallback(
    async (planId, kind) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid)) return;
      setSelectedId(pid);
      setSelectedKind(kind);
      setDetailBusy(true);
      setDetail(null);
      setVoteEligibility(null);
      setHighlightedMapPointId(null);
      setHighlightedPlanBoxId(null);
      try {
        if (kind === "discover") {
          const d = await actionsRef.current.loadSharedRoutePlan?.(pid);
          setDetail(d || null);
          if (d) {
            const elig =
              await actionsRef.current.checkResourceRelevanceEligibility?.({
                resourceType: "plan",
                resourceId: pid,
              });
            setVoteEligibility(elig || null);
          }
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

  const bookPlanBox = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      if (selectedId != null) {
        openOnExplorer(selectedId, selectedKind);
      }
      actionsRef.current.queueBookBoxOnCarte?.(bid);
    },
    [actionsRef, selectedId, selectedKind, openOnExplorer]
  );

  const toggleVisibility = useCallback(
    async (plan) => {
      const pid = Number(plan.id);
      if (!Number.isFinite(pid)) return;
      const next =
        String(plan.visibility) === "shared" ? "private" : "shared";
      await actionsRef.current.updateRoutePlan?.(pid, { visibility: next });
      await refreshMine();
      await refreshCommunity();
      if (Number(selectedId) === pid) {
        await loadDetail(pid, "mine");
      }
    },
    [actionsRef, refreshMine, refreshCommunity, selectedId, loadDetail]
  );

  const votePlanRelevance = useCallback(
    async (payload) => {
      await actionsRef.current.setResourceRelevance?.(payload);
      const pid = Number(payload?.resourceId);
      const kind = selectedKind;
      if (Number.isFinite(pid)) {
        await loadDetail(pid, kind);
        if (kind === "discover") {
          const elig =
            await actionsRef.current.checkResourceRelevanceEligibility?.({
              resourceType: "plan",
              resourceId: pid,
            });
          setVoteEligibility(elig || null);
        }
      }
      await refreshMine();
      await refreshCommunity();
    },
    [
      actionsRef,
      selectedKind,
      loadDetail,
      refreshMine,
      refreshCommunity,
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

  const mapPane = (
    <View style={[styles.mapPane, wideLayout && styles.mapPaneWide]}>
      <Text style={styles.mapPaneTitle}>
        {selectedId != null ? detail?.name || "Aperçu du plan" : "Carte des plans"}
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
          fullHeight={wideLayout}
          highlightedMapPointId={highlightedMapPointId}
          highlightedPlanBoxId={highlightedPlanBoxId}
          onMapPointHover={handleMapPointHover}
          onMapPointClick={handleMapPointClick}
          onPlanBoxHover={handlePlanBoxHover}
          onSelectBox={handleHighlightPlanBox}
        />
      ) : (
        <PlansOverviewMap
          boxes={overviewBoxes}
          trails={overviewTrails}
          staticOrigin={staticOrigin}
          mapLat={mapLat}
          mapLon={mapLon}
          fullHeight={wideLayout}
        />
      )}
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
        <IntentGuideBanner
          title="Composer — tes plans"
          lines={[
            "Prépare trace, box et points GPS ici ou sur Découvrir (même compte).",
            "Réserver une box : bouton sur chaque box du détail, ou rail Mon plan sur la carte.",
            "Suivi des créneaux et codes d’accès : onglet Réserver uniquement.",
          ]}
        />

          {!wideLayout ? mapPane : null}

          <View style={styles.tabRow}>
            {[
              { id: "private", label: "Mes privés" },
              { id: "public", label: "Plans publics" },
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
                  setVoteEligibility(null);
                  setHighlightedMapPointId(null);
                  setHighlightedPlanBoxId(null);
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

          {section === "public" ? (
            <View style={[styles.tabRow, { marginTop: 0 }]}>
              {[
                { id: "all", label: `Tous (${publicCounts.all})` },
                { id: "mine", label: `Les miens (${publicCounts.mine})` },
                {
                  id: "community",
                  label: `Communauté (${publicCounts.community})`,
                },
              ].map((t) => (
                <TouchableOpacity
                  key={`pf-${t.id}`}
                  style={[
                    styles.filterChip,
                    publicFilter === t.id && styles.filterChipActive,
                  ]}
                  onPress={() => setPublicFilter(t.id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      publicFilter === t.id && styles.filterChipTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un plan, une trace, une ville…"
            placeholderTextColor="#94A3B8"
          />
          {!isAuthed && section === "private" ? (
            <Text style={styles.emptyHint}>
              Connecte-toi pour voir et gérer tes plans.
            </Text>
          ) : null}
          {section === "public" && communityBusy ? (
            <ActivityIndicator
              style={{ marginVertical: 16 }}
              color={theme.primary}
            />
          ) : null}
          {section === "public" || isAuthed ? (
            listForSection.length === 0 ? (
              <Text style={styles.emptyHint}>
                {section === "private"
                  ? "Aucun plan privé. Crée-en un depuis la Carte (trace + Mon plan)."
                  : publicFilter === "community"
                    ? "Aucun plan public d’un autre athlète pour l’instant. Quand quelqu’un partage un plan, il apparaît ici."
                    : publicFilter === "mine"
                      ? "Aucun de tes plans n’est public. Passe un plan en « Public » depuis la Carte ou la liste."
                      : "Aucun plan public. Publie le tien ou explore ceux de la communauté."}
              </Text>
            ) : (
              listForSection.map((plan) => {
                const pid = Number(plan.id);
                const kind = plan.listKind || "mine";
                const selected =
                  Number(selectedId) === pid && selectedKind === kind;
                return (
                  <PlanListCard
                    key={`${kind}-${pid}`}
                    plan={plan}
                    selected={selected}
                    isOwn={Boolean(plan.isOwn)}
                    isCommunity={Boolean(plan.isCommunity)}
                    busy={routePlanBusy}
                    onPress={() => loadDetail(pid, kind)}
                    onToggleVisibility={
                      plan.isOwn
                        ? () => toggleVisibility(plan)
                        : undefined
                    }
                    onFork={
                      plan.isCommunity && isAuthed
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
                canBook={canBook}
                onBookPlanBox={bookPlanBox}
                selectedKind={selectedKind}
                voteEligibility={voteEligibility}
                highlightedMapPointId={highlightedMapPointId}
                highlightedPlanBoxId={highlightedPlanBoxId}
                onHighlightMapPoint={handleHighlightMapPoint}
                onHighlightPlanBox={handleHighlightPlanBox}
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
  cardOwnPublic: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
  },
  cardCommunity: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
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
  badgeOwnPublic: { backgroundColor: "#CCFBF1" },
  badgeCommunity: { backgroundColor: "#FEF3C7" },
  badgeText: { fontSize: 10, fontWeight: "800" },
  badgeTextPrivate: { color: "#475569" },
  badgeTextShared: { color: "#166534" },
  badgeTextOwnPublic: { color: "#0F766E" },
  badgeTextCommunity: { color: "#92400E" },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: "#E0F2FE",
    borderColor: "#7DD3FC",
  },
  filterChipText: { fontSize: 10, fontWeight: "700", color: theme.inkMuted },
  filterChipTextActive: { color: "#0369A1" },
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
  noteRowHighlight: {
    borderColor: theme.primary,
    borderWidth: 2,
    backgroundColor: "#F0FDFA",
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
  bookBoxBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: "#F0FDFA",
  },
  bookBoxBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.primary,
  },
  gpsLegend: {
    fontSize: 11,
    color: theme.inkMuted,
    marginBottom: 8,
    lineHeight: 15,
  },
  emptyHint: { fontSize: 13, color: theme.inkMuted, lineHeight: 18 },
  eligibilityNote: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.inkMuted,
    marginTop: 10,
    fontStyle: "italic",
  },
});
