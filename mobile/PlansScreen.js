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
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

function noteItemsFromPlanDetail(detail) {
  if (!detail) return [];
  const items = [];
  const planName = detail.name || `Plan #${detail.id}`;
  const trailLabel = detail.trail_name || detail.territory || "Trace";
  if (String(detail.notes || "").trim()) {
    items.push({
      key: `plan-notes-${detail.id}`,
      kind: "plan",
      planId: detail.id,
      planName,
      trailLabel,
      title: "Note générale du plan",
      body: String(detail.notes).trim(),
    });
  }
  const boxes = Array.isArray(detail.boxes) ? detail.boxes : [];
  for (const b of boxes) {
    const c = String(b.plan_box_comment || "").trim();
    if (!c) continue;
    items.push({
      key: `box-${detail.id}-${b.id}`,
      kind: "box",
      planId: detail.id,
      planName,
      trailLabel,
      title: b.name || `Box #${b.id}`,
      body: c,
    });
  }
  const trailNotes = Array.isArray(detail.trail_notes)
    ? detail.trail_notes
    : [];
  trailNotes.forEach((n, idx) => {
    const body = String(n.note || "").trim();
    if (!body) return;
    items.push({
      key: `tn-${detail.id}-${n.id ?? idx}`,
      kind: "trail_note",
      planId: detail.id,
      planName,
      trailLabel,
      title: `Point GPS ${idx + 1}`,
      body,
      meta:
        n.point_lat != null && n.point_lon != null
          ? `${Number(n.point_lat).toFixed(5)}, ${Number(n.point_lon).toFixed(5)}`
          : null,
    });
  });
  return items;
}

function PlanListCard({
  plan,
  selected,
  onPress,
  onOpenMap,
  onToggleVisibility,
  onFork,
  isMine,
  busy,
}) {
  const pid = Number(plan.id);
  const shared = String(plan.visibility) === "shared";
  const boxCount =
    Number(plan.selected_box_count ?? plan.box_count) || 0;
  const tipCount = Number(plan.tip_count) || 0;

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
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginTop: 4,
        }}
      >
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
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={(e) => {
            e?.stopPropagation?.();
            onOpenMap?.();
          }}
        >
          <Ionicons name="map-outline" size={14} color={theme.primary} />
          <Text style={styles.cardActionText}>Carte</Text>
        </TouchableOpacity>
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
  onOpenMap,
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
  const items = noteItemsFromPlanDetail(detail);
  const boxes = Array.isArray(detail.boxes) ? detail.boxes : [];

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
      <TouchableOpacity style={styles.primaryBtn} onPress={onOpenMap}>
        <Ionicons name="map" size={16} color="#fff" />
        <Text style={styles.primaryBtnText}>Voir sur la carte</Text>
      </TouchableOpacity>
      <Text style={styles.detailSection}>Box ({boxes.length})</Text>
      {boxes.length === 0 ? (
        <Text style={styles.emptyHint}>Aucune box dans ce plan.</Text>
      ) : (
        boxes.map((b) => (
          <View key={`db-${b.id}`} style={styles.noteRow}>
            <Text style={styles.noteKind}>Box</Text>
            <Text style={styles.noteTitle}>{b.name || `Box #${b.id}`}</Text>
            {b.plan_box_comment ? (
              <Text style={styles.noteBody}>{b.plan_box_comment}</Text>
            ) : (
              <Text style={styles.noteEmpty}>Pas de note</Text>
            )}
          </View>
        ))
      )}
      <Text style={styles.detailSection}>Registre des notes</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyHint}>
          Aucune note enregistrée (plan, box ou point GPS).
        </Text>
      ) : (
        items.map((item) => (
          <View key={item.key} style={styles.noteRow}>
            <Text style={styles.noteKind}>
              {item.kind === "plan"
                ? "Plan"
                : item.kind === "box"
                  ? "Box"
                  : "GPS"}
            </Text>
            <Text style={styles.noteTitle}>{item.title}</Text>
            <Text style={styles.noteBody}>{item.body}</Text>
            {item.meta ? (
              <Text style={styles.noteMeta}>{item.meta}</Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

export default function PlansScreen({ appMain = {} }) {
  const {
    user,
    city,
    routePlans,
    routePlanBusy,
    actionsRef,
  } = appMain;
  const isFocused = useIsFocused();
  const [section, setSection] = useState("private");
  const [search, setSearch] = useState("");
  const [discoverPlans, setDiscoverPlans] = useState([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedKind, setSelectedKind] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [notesFeed, setNotesFeed] = useState([]);
  const [notesFeedBusy, setNotesFeedBusy] = useState(false);

  const isAuthed = Boolean(user);

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
      const hay = [
        p.name,
        p.trail_name,
        p.territory,
        p.notes,
      ]
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
      const hay = [
        p.name,
        p.trail_name,
        p.territory,
        p.notes,
      ]
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

  const openOnMap = useCallback(
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

  const buildNotesFeed = useCallback(async () => {
    if (!isAuthed || !(routePlans || []).length) return;
    setNotesFeedBusy(true);
    setNotesFeed([]);
    try {
      const allItems = [];
      for (const plan of routePlans) {
        const pid = Number(plan.id);
        if (!Number.isFinite(pid)) continue;
        const hasNotes =
          String(plan.notes || "").trim() ||
          Number(plan.tip_count) > 0 ||
          Number(plan.selected_box_count) > 0;
        if (!hasNotes) continue;
        const d = await actionsRef.current.loadRoutePlanDetail?.(pid);
        if (!d) continue;
        allItems.push(...noteItemsFromPlanDetail(d));
      }
      setNotesFeed(allItems);
    } finally {
      setNotesFeedBusy(false);
    }
  }, [isAuthed, routePlans, actionsRef]);

  useEffect(() => {
    if (section !== "notes" || !isFocused) return;
    buildNotesFeed();
  }, [section, isFocused, buildNotesFeed]);

  const listForSection =
    section === "private"
      ? myPrivate
      : section === "shared_mine"
        ? myShared
        : section === "discover"
          ? discoverFiltered
          : [];

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
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
          Bibliothèque de tes parcours. Les badges ★ résument la pertinence (votes
          1–5, sans discussion). Les box s’appuient sur les avis après
          réservation (note hôte).
        </Text>

        <View style={styles.tabRow}>
          {[
            { id: "private", label: "Mes privés" },
            { id: "shared_mine", label: "Mes publics" },
            { id: "discover", label: "Découverte" },
            { id: "notes", label: "Notes" },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabChip, section === t.id && styles.tabChipActive]}
              onPress={() => {
                setSection(t.id);
                setSelectedId(null);
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

        {section !== "notes" ? (
          <>
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
                      ? "Aucun plan public à ton nom. Passe un plan en « Public » depuis cette liste ou depuis la Carte."
                      : "Aucun plan public trouvé pour cette zone. Essaie une autre ville dans le profil ou la Carte."}
                </Text>
              ) : (
                listForSection.map((plan) => {
                  const pid = Number(plan.id);
                  const kind =
                    section === "discover" ? "discover" : "mine";
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
                      onOpenMap={() => openOnMap(pid, kind)}
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
                onOpenMap={() => openOnMap(selectedId, selectedKind)}
              />
            ) : null}
          </>
        ) : (
          <View>
            {!isAuthed ? (
              <Text style={styles.emptyHint}>
                Connecte-toi pour parcourir tes notes de plans.
              </Text>
            ) : (
              <>
                <Text style={styles.notesLegend}>
                  Plan = note générale · Box = commentaire par box · GPS =
                  point enregistré sur la trace du plan. Les conseils publics
                  (violet) restent sur la trace, dans la Carte → Communauté.
                </Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={buildNotesFeed}
                  disabled={notesFeedBusy}
                >
                  <Text style={styles.secondaryBtnText}>
                    {notesFeedBusy ? "Chargement…" : "Actualiser le registre"}
                  </Text>
                </TouchableOpacity>
                {notesFeedBusy && notesFeed.length === 0 ? (
                  <ActivityIndicator
                    style={{ marginVertical: 12 }}
                    color={theme.primary}
                  />
                ) : null}
                {notesFeed.length === 0 && !notesFeedBusy ? (
                  <Text style={styles.emptyHint}>
                    Aucune note enregistrée dans tes plans pour l’instant.
                  </Text>
                ) : (
                  notesFeed.map((item) => (
                    <View key={item.key} style={styles.noteRow}>
                      <Text style={styles.noteKind}>
                        {item.kind === "plan"
                          ? "Plan"
                          : item.kind === "box"
                            ? "Box"
                            : "GPS"}
                      </Text>
                      <Text style={styles.noteMeta}>
                        {item.planName} · {item.trailLabel}
                      </Text>
                      <Text style={styles.noteTitle}>{item.title}</Text>
                      <Text style={styles.noteBody}>{item.body}</Text>
                      {item.meta ? (
                        <Text style={styles.noteMeta}>{item.meta}</Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => openOnMap(item.planId, "mine")}
                      >
                        <Text style={styles.linkText}>Ouvrir sur la carte</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
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
  detailSection: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.hero,
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    marginBottom: 12,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: "700", color: theme.primary },
  noteRow: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    marginBottom: 8,
  },
  noteKind: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
  },
  noteTitle: { fontSize: 13, fontWeight: "700", color: theme.ink, marginTop: 2 },
  noteBody: { fontSize: 12, color: theme.ink, marginTop: 4, lineHeight: 17 },
  noteMeta: { fontSize: 11, color: theme.inkMuted, marginTop: 2 },
  noteEmpty: { fontSize: 11, color: theme.inkMuted, fontStyle: "italic" },
  emptyHint: { fontSize: 13, color: theme.inkMuted, lineHeight: 18 },
  notesLegend: {
    fontSize: 11,
    lineHeight: 15,
    color: theme.inkMuted,
    marginBottom: 10,
  },
  linkText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
    marginTop: 6,
  },
});
