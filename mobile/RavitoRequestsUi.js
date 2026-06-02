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

const theme = {
  primary: "#0F766E",
  ink: "#0F172A",
  inkMuted: "#64748B",
  border: "#E2E8F0",
  bg: "#F8FAFC",
};

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

export function RavitoRequestModal({
  visible,
  onClose,
  point,
  bookingDate,
  startTime,
  endTime,
  specialRequest: initialSpecialRequest,
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
      setError("Choisis un créneau (date et heures) avant d’envoyer.");
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
              Les hôtes proches pourront proposer leur box. Tu retiens une proposition
              puis tu réserves comme d’habitude.
            </Text>
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
            <Text style={styles.label}>Rayon (km)</Text>
            <TextInput
              style={styles.input}
              value={radiusKm}
              onChangeText={setRadiusKm}
              keyboardType="decimal-pad"
            />
            <Text style={styles.label}>Besoin sur place</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Eau, abri…"
            />
            <Text style={styles.label}>Message créneau</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={specialRequest}
              onChangeText={setSpecialRequest}
              multiline
            />
            <Text style={styles.slot}>
              {bookingDate} · {startTime} → {endTime}
            </Text>
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            <Btn label="Annuler" onPress={onClose} />
            <Btn
              label="Publier"
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
            <Text style={styles.cardMeta}>
              {r.proposalCount || 0} proposition(s)
            </Text>
          </TouchableOpacity>
          {expandedId === r.id && detail?.proposals?.length ? (
            <View style={styles.propList}>
              {detail.proposals.map((p) => (
                <View key={`p-${p.id}`} style={styles.propCard}>
                  <Text style={styles.propTitle}>{p.boxTitle}</Text>
                  <Text style={styles.cardMeta}>
                    {p.hostName} · {p.boxCity}
                    {p.distanceToPointKm != null
                      ? ` · ${p.distanceToPointKm.toFixed(1)} km du point`
                      : ""}
                  </Text>
                  {p.message ? (
                    <Text style={styles.cardMeta}>{p.message}</Text>
                  ) : null}
                  {r.status === "open" && p.status === "pending" ? (
                    <Btn
                      label="Choisir et réserver"
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
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [proposeFor, setProposeFor] = useState(null);
  const [boxId, setBoxId] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await apiFetch("/ravito-requests/for-host", { token });
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

  const submitProposal = async () => {
    if (!proposeFor || !boxId) return;
    setSubmitting(true);
    try {
      await apiFetch(`/ravito-requests/${proposeFor}/proposals`, {
        method: "POST",
        token,
        body: { boxId: Number(boxId), message: message.trim() || undefined },
      });
      setProposeFor(null);
      setMessage("");
      setBoxId(null);
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
        Aucune demande de ravito à proximité de tes box pour le moment.
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
            Point GPS · rayon {r.radiusKm} km
            {r.nearestBoxKm != null
              ? ` · ta box la plus proche ≈ ${r.nearestBoxKm.toFixed(1)} km`
              : ""}
          </Text>
          {r.note ? <Text style={styles.cardMeta}>{r.note}</Text> : null}
          {r.myProposalId ? (
            <Text style={styles.hint}>Tu as déjà proposé une box.</Text>
          ) : (
            <Btn
              label="Proposer ma box"
              primary
              onPress={() => {
                setProposeFor(r.id);
                setBoxId(hostBoxes[0]?.id ?? null);
              }}
            />
          )}
        </View>
      ))}
      <Btn label="Actualiser" onPress={load} />

      <Modal visible={proposeFor != null} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Proposer une box</Text>
            {(hostBoxes || []).map((b) => (
              <TouchableOpacity
                key={`hb-${b.id}`}
                style={[
                  styles.boxPick,
                  Number(boxId) === Number(b.id) && styles.boxPickOn,
                ]}
                onPress={() => setBoxId(b.id)}
              >
                <Text style={styles.propTitle}>{b.title}</Text>
                <Text style={styles.cardMeta}>{b.city}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.input, styles.area]}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder="Message (optionnel)"
            />
            <View style={styles.footer}>
              <Btn label="Annuler" onPress={() => setProposeFor(null)} />
              <Btn
                label="Envoyer"
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
    backgroundColor: "#fff",
    borderRadius: 14,
    margin: 16,
    padding: 16,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "700", color: theme.ink },
  body: { maxHeight: 400 },
  lead: { fontSize: 13, color: theme.inkMuted, lineHeight: 18, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "700", color: theme.inkMuted, marginTop: 8 },
  coordRow: { flexDirection: "row", gap: 8 },
  coordInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    backgroundColor: theme.bg,
  },
  area: { minHeight: 64, textAlignVertical: "top", marginTop: 8 },
  hint: { fontSize: 12, color: theme.primary, marginTop: 6 },
  slot: { fontSize: 12, color: theme.inkMuted, marginTop: 10 },
  err: { color: "#DC2626", marginTop: 8 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnPrimary: { backgroundColor: theme.primary, borderColor: theme.primary },
  btnText: { fontSize: 14, fontWeight: "600", color: theme.primary },
  btnTextPrimary: { color: "#fff" },
  list: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: theme.ink },
  cardMeta: { fontSize: 12, color: theme.inkMuted, marginTop: 4 },
  propList: { marginTop: 10, gap: 8 },
  propCard: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 8,
  },
  propTitle: { fontSize: 14, fontWeight: "600", color: theme.ink },
  empty: { fontSize: 13, color: theme.inkMuted, lineHeight: 18 },
  boxPick: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  boxPickOn: { borderColor: theme.primary, backgroundColor: "#F0FDFA" },
});
