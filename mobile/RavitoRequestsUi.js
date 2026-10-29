import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ATHLETE_NEED_TAGS,
  RAVITO_OFFER_TAGS,
  toggleTagInText,
  textHasTag,
} from "./outdoorNeeds";
import theme from "./theme";

function Btn({ label, onPress, primary, loading, icon }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={[styles.btn, primary && styles.btnPrimary]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#fff" : theme.primary} size="small" />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={primary ? "#fff" : theme.primary}
              style={{ marginRight: 6 }}
            />
          ) : null}
          <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const RADIUS_KM_OPTIONS = [2, 5, 10, 15, 20];

export function RavitoRequestModal({
  visible,
  onClose,
  point,
  bookingDate,
  startTime,
  endTime,
  specialRequest: initialSpecialRequest,
  slotPicker,
  onSubmit,
}) {
  const [latText, setLatText] = useState("");
  const [lonText, setLonText] = useState("");
  const [note, setNote] = useState("");
  const [radiusKm, setRadiusKm] = useState("5");
  const [specialRequest, setSpecialRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setError("");
    setNote("");
    setRadiusKm("5");
    setSpecialRequest(initialSpecialRequest || "");
    if (point) {
      setLatText(String(point.lat));
      setLonText(String(point.lon));
    } else {
      setLatText("");
      setLonText("");
    }
  }, [visible, point, initialSpecialRequest]);

  const handleSubmit = async () => {
    const lat = parseFloat(String(latText).replace(",", "."));
    const lon = parseFloat(String(lonText).replace(",", "."));
    const radius = parseFloat(String(radiusKm).replace(",", "."));
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      setError("Coordonnées GPS invalides.");
      return;
    }
    if (!bookingDate || !startTime || !endTime) {
      setError("Choisis un créneau (date et plage horaire) avant d’envoyer.");
      return;
    }
    const slotStart = String(startTime).slice(0, 5);
    const slotEnd = String(endTime).slice(0, 5);
    const toMin = (t) => {
      const [h, m] = String(t).split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    if (toMin(slotEnd) <= toMin(slotStart)) {
      setError("L’heure de fin doit être après l’heure de début.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body = {
        pointLat: lat,
        pointLon: lon,
        bookingDate,
        startTime,
        endTime,
        radiusKm: Number.isFinite(radius) ? radius : 5,
      };
      if (point?.trailId != null) body.trailId = Number(point.trailId);
      if (point?.distKm != null && Number.isFinite(Number(point.distKm))) {
        body.distKm = Number(point.distKm);
      }
      if (note.trim()) body.note = note.trim();
      if (specialRequest.trim()) body.specialRequest = specialRequest.trim();
      await onSubmit(body);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Envoi impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Demander un ravito ici</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.lead}>
              Les hôtes proches pourront proposer un ravito sur place (accueil,
              eau, transfert…). Avec une trace active, le point est enregistré dans
              ton plan. Tu retiens une proposition puis tu réserves la box si besoin.
            </Text>
            {slotPicker ? (
              <View style={styles.slotBlock}>{slotPicker}</View>
            ) : null}
            <Text style={styles.label}>Latitude / longitude</Text>
            <View style={styles.coordRow}>
              <TextInput
                style={[styles.input, styles.coordInput]}
                value={latText}
                onChangeText={setLatText}
                keyboardType="decimal-pad"
                placeholder="Latitude"
              />
              <TextInput
                style={[styles.input, styles.coordInput]}
                value={lonText}
                onChangeText={setLonText}
                keyboardType="decimal-pad"
                placeholder="Longitude"
              />
            </View>
            {point?.source === "probe" ? (
              <Text style={styles.hint}>Point sur la trace (carte / profil)</Text>
            ) : point?.source === "map" ? (
              <Text style={styles.hint}>Point choisi sur la carte</Text>
            ) : null}
            <Text style={styles.label}>Rayon de recherche (km)</Text>
            <View style={styles.chipRow}>
              {RADIUS_KM_OPTIONS.map((km) => {
                const on = String(radiusKm) === String(km);
                return (
                  <TouchableOpacity
                    key={`rkm-${km}`}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setRadiusKm(String(km))}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {km} km
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.label}>Tes besoins (allègement sac)</Text>
            <View style={styles.chipRow}>
              {ATHLETE_NEED_TAGS.slice(0, 8).map((chip) => {
                const on = textHasTag(specialRequest, chip);
                return (
                  <TouchableOpacity
                    key={`need-${chip}`}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setSpecialRequest((prev) => toggleTagInText(prev, chip))
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
              value={specialRequest}
              onChangeText={setSpecialRequest}
              multiline
              placeholder="Ex. 2 L d’eau + barres, sans gluten…"
            />
            <Text style={styles.label}>Note pour le ravitailleur</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Groupe, allergies, couleur maillot, ETA…"
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            <Btn label="Annuler" onPress={onClose} />
            <Btn
              label="Publier la demande"
              primary
              icon="megaphone-outline"
              loading={submitting}
              onPress={handleSubmit}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function RavitoAthleteRequestsSection({
  token,
  apiFetch,
  onAcceptProposal,
  refreshNonce = 0,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await apiFetch("/ravito-requests/mine", { token });
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch]);

  useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const openDetail = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    try {
      const d = await apiFetch(`/ravito-requests/${id}`, { token });
      setDetail(d);
    } catch {
      setDetail(null);
    }
  };

  const accept = async (requestId, proposalId) => {
    setBusyId(proposalId);
    try {
      const result = await apiFetch(
        `/ravito-requests/${requestId}/proposals/${proposalId}/accept`,
        { method: "POST", token }
      );
      await onAcceptProposal?.(result);
      await load();
      setExpandedId(null);
      setDetail(null);
    } catch (err) {
      Alert.alert("Erreur", err?.message || "Acceptation impossible.");
    } finally {
      setBusyId(null);
    }
  };

  if (!token) return null;
  if (loading && rows.length === 0) {
    return <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />;
  }
  if (rows.length === 0) {
    return (
      <Text style={styles.empty}>
        Aucune demande de ravito. Depuis la carte, place un point puis « Demander un
        ravito ici ».
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((r) => (
        <View key={`rr-${r.id}`} style={styles.card}>
          <TouchableOpacity onPress={() => openDetail(r.id)} activeOpacity={0.85}>
            <Text style={styles.cardTitle}>
              Point {Number(r.pointLat).toFixed(4)}°, {Number(r.pointLon).toFixed(4)}°
            </Text>
            <Text style={styles.cardMeta}>
              {r.status} · {r.bookingDate} {r.startTime}–{r.endTime} · rayon{" "}
              {r.radiusKm} km
            </Text>
            {r.trailName ? (
              <Text style={styles.cardMeta}>Trace : {r.trailName}</Text>
            ) : null}
            {r.routePlanId ? (
              <Text style={styles.cardMeta}>
                Lié au plan n°{r.routePlanId} (onglet Plans)
              </Text>
            ) : null}
            <Text style={styles.cardMeta}>
              {r.proposalCount || 0} proposition(s)
            </Text>
          </TouchableOpacity>
          {expandedId === r.id && detail?.proposals?.length ? (
            <View style={styles.propList}>
              {detail.proposals.map((p) => (
                <View key={`p-${p.id}`} style={styles.propCard}>
                  <Text style={styles.propTitle}>
                    {p.mobileRavito || p.boxId == null
                      ? "Ravito mobile (sans box)"
                      : p.boxTitle}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {p.hostName}
                    {p.boxCity ? ` · ${p.boxCity}` : ""}
                    {p.distanceToPointKm != null
                      ? ` · ${p.distanceToPointKm.toFixed(1)} km du point`
                      : ""}
                  </Text>
                  {p.message ? (
                    <Text style={styles.cardMeta}>{p.message}</Text>
                  ) : null}
                  {r.status === "open" && p.status === "pending" ? (
                    <Btn
                      label={
                        p.mobileRavito || p.boxId == null
                          ? "Accepter ce ravito mobile"
                          : "Choisir et réserver"
                      }
                      primary
                      loading={busyId === p.id}
                      onPress={() => accept(r.id, p.id)}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : expandedId === r.id ? (
            <Text style={styles.cardMeta}>Aucune proposition pour l’instant.</Text>
          ) : null}
        </View>
      ))}
      <Btn label="Actualiser" onPress={load} />
    </View>
  );
}

export function RavitoHostRequestsSection({
  token,
  apiFetch,
  hostBoxes,
  refreshNonce = 0,
  volunteerLat = null,
  volunteerLon = null,
  allowMobileWithoutBox = true,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proposeFor, setProposeFor] = useState(null);
  const [boxId, setBoxId] = useState(null);
  const [mobileMode, setMobileMode] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = [];
      const lat = Number(volunteerLat);
      const lon = Number(volunteerLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        qs.push(`lat=${encodeURIComponent(lat)}`);
        qs.push(`lon=${encodeURIComponent(lon)}`);
        qs.push("radiusKm=8");
      }
      const path =
        qs.length > 0
          ? `/ravito-requests/for-host?${qs.join("&")}`
          : "/ravito-requests/for-host";
      const list = await apiFetch(path, { token });
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch, volunteerLat, volunteerLon]);

  useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const submitProposal = async () => {
    if (!proposeFor) return;
    const useMobile =
      mobileMode || !boxId || !(hostBoxes && hostBoxes.length);
    if (useMobile && !message.trim()) {
      Alert.alert(
        "Message requis",
        "Pour un ravito mobile (sans box), décris ce que tu apportes (eau, snacks, timing…)."
      );
      return;
    }
    if (!useMobile && !message.trim()) {
      Alert.alert(
        "Message requis",
        "Décris ce que tu proposes sur place (accueil, eau, transfert…)."
      );
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/ravito-requests/${proposeFor}/proposals`, {
        method: "POST",
        token,
        body: useMobile
          ? { mobileRavito: true, message: message.trim() }
          : { boxId: Number(boxId), message: message.trim() },
      });
      setProposeFor(null);
      setMessage("");
      setBoxId(null);
      setMobileMode(false);
      await load();
    } catch (err) {
      Alert.alert("Erreur", err?.message || "Envoi impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) return null;
  if (loading && rows.length === 0) {
    return <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} />;
  }
  if (rows.length === 0) {
    return (
      <Text style={styles.empty}>
        Aucune demande de ravito à proximité pour le moment
        {allowMobileWithoutBox
          ? " (box ou ravito mobile)."
          : " de tes box."}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((r) => (
        <View key={`hr-${r.id}`} style={styles.card}>
          <Text style={styles.cardTitle}>
            {r.athleteName || "Athlète"} · {r.bookingDate}
          </Text>
          <Text style={styles.cardMeta}>
            Point GPS · {r.startTime}–{r.endTime} · rayon {r.radiusKm} km
            {r.nearestBoxKm != null
              ? ` · ta box la plus proche ≈ ${r.nearestBoxKm.toFixed(1)} km`
              : ""}
          </Text>
          {r.note ? <Text style={styles.cardMeta}>{r.note}</Text> : null}
          {r.specialRequest ? (
            <Text style={styles.cardMeta}>Besoin : {r.specialRequest}</Text>
          ) : null}
          {r.myProposalId ? (
            <Text style={styles.hint}>Tu as déjà répondu à cette demande.</Text>
          ) : (
            <Btn
              label="Proposer mon ravito"
              primary
              onPress={() => {
                setProposeFor(r.id);
                const firstBox = hostBoxes?.[0]?.id ?? null;
                setBoxId(firstBox);
                setMobileMode(!firstBox);
              }}
            />
          )}
        </View>
      ))}
      <Btn label="Actualiser" onPress={load} />

      <Modal visible={proposeFor != null} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Proposer ton ravito</Text>
            <Text style={styles.lead}>
              Tu peux proposer une de tes box, ou un ravito mobile (tu te
              déplaces au point GPS, sans box fixe) — comme un livreur Uber Eats
              outdoor.
            </Text>
            {allowMobileWithoutBox ? (
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !mobileMode && styles.chipOn]}
                  onPress={() => setMobileMode(false)}
                >
                  <Text
                    style={[styles.chipText, !mobileMode && styles.chipTextOn]}
                  >
                    Avec une box
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, mobileMode && styles.chipOn]}
                  onPress={() => {
                    setMobileMode(true);
                    setBoxId(null);
                  }}
                >
                  <Text
                    style={[styles.chipText, mobileMode && styles.chipTextOn]}
                  >
                    Ravito mobile (sans box)
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!mobileMode
              ? (hostBoxes || []).map((b) => (
                  <TouchableOpacity
                    key={`hb-${b.id}`}
                    style={[
                      styles.boxPick,
                      Number(boxId) === Number(b.id) && styles.boxPickOn,
                    ]}
                    onPress={() => {
                      setBoxId(b.id);
                      setMobileMode(false);
                    }}
                  >
                    <Text style={styles.propTitle}>{b.title}</Text>
                    <Text style={styles.cardMeta}>{b.city}</Text>
                  </TouchableOpacity>
                ))
              : null}
            {!mobileMode && (!hostBoxes || hostBoxes.length === 0) ? (
              <Text style={styles.lead}>
                Pas de box : passe en mode « Ravito mobile ».
              </Text>
            ) : null}
            <Text style={styles.label}>Ce que tu apportes</Text>
            <View style={styles.chipRow}>
              {RAVITO_OFFER_TAGS.map((chip) => {
                const on = textHasTag(message, chip);
                return (
                  <TouchableOpacity
                    key={`offer-${chip}`}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setMessage((prev) => toggleTagInText(prev, chip))
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
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder={
                mobileMode
                  ? "Ex. 2 L d’eau + snacks, j’arrive ~10 min avant…"
                  : "Ex. accueil box, eau chaude, pause assise…"
              }
            />
            <View style={styles.footer}>
              <Btn
                label="Annuler"
                onPress={() => {
                  setProposeFor(null);
                  setMobileMode(false);
                }}
              />
              <Btn
                label="Proposer mon aide"
                primary
                loading={submitting}
                onPress={submitProposal}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius?.lg || 22,
    margin: 16,
    padding: 18,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.3,
    fontFamily: theme.fontDisplay,
  },
  body: { maxHeight: 400 },
  lead: { fontSize: 13, color: theme.inkMuted, lineHeight: 18, marginBottom: 10 },
  slotBlock: { marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "700", color: theme.inkMuted, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
  },
  chipOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
  chipText: { fontSize: 13, fontWeight: "600", color: theme.inkMuted },
  chipTextOn: { color: theme.primary },
  coordRow: { flexDirection: "row", gap: 8 },
  coordInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius?.sm || 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: theme.surfaceMuted,
    color: theme.ink,
  },
  area: { minHeight: 64, textAlignVertical: "top", marginTop: 8 },
  hint: { fontSize: 12, color: theme.primary, marginTop: 6, fontWeight: "600" },
  slot: { fontSize: 12, color: theme.inkMuted, marginTop: 10 },
  err: { color: theme.danger, marginTop: 8 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radius?.sm || 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnPrimary: { backgroundColor: theme.primary, borderColor: theme.primary },
  btnText: { fontSize: 14, fontWeight: "700", color: theme.primary },
  btnTextPrimary: { color: "#fff" },
  list: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: theme.radius?.md || 16,
    padding: 14,
    backgroundColor: theme.surface,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.2,
    fontFamily: theme.fontDisplay,
  },
  cardMeta: { fontSize: 12, color: theme.inkMuted, marginTop: 4 },
  propList: { marginTop: 10, gap: 8 },
  propCard: {
    borderTopWidth: 1,
    borderTopColor: theme.borderSoft,
    paddingTop: 8,
  },
  propTitle: { fontSize: 14, fontWeight: "700", color: theme.ink },
  empty: { fontSize: 13, color: theme.inkMuted, lineHeight: 18 },
  boxPick: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius?.sm || 12,
    padding: 12,
    marginTop: 8,
    backgroundColor: theme.surfaceMuted,
  },
  boxPickOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
});
