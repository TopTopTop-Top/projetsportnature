import "react-native-gesture-handler";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
  Modal,
} from "react-native";
import NativeExplorerMap from "./NativeExplorerMap";
import ExplorerWebMap from "./ExplorerWebMap";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, useIsFocused } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

const PROD_API_BASE_URL = "https://projetsportnature.onrender.com/api";
const DEV_API_BASE_URL = "http://localhost:3000/api";
/**
 * En dev: fallback local pour éviter d'appeler Render par erreur.
 * Tu peux toujours forcer une autre URL via EXPO_PUBLIC_API_URL.
 */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? DEV_API_BASE_URL : PROD_API_BASE_URL);

/** Origine du serveur (fichiers statiques /uploads, sans /api). */
const API_STATIC_ORIGIN = API_BASE_URL.replace(/\/api\/?$/i, "");

function absoluteUploadUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_STATIC_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance minimale (km) d’une box aux sommets des polylines des traces. */
function minDistanceKmFromBoxToTrails(box, trailsList) {
  const lat = Number(box.latitude);
  const lon = Number(box.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity;
  let minD = Infinity;
  for (const trail of trailsList) {
    let positions = [];
    try {
      if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
    } catch {
      positions = [];
    }
    if (!Array.isArray(positions)) continue;
    for (const pt of positions) {
      const p = Array.isArray(pt) ? pt : null;
      if (!p || p.length < 2) continue;
      const plat = Number(p[0]);
      const plng = Number(p[1]);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
      const d = haversineKm(lat, lon, plat, plng);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/** Distance minimale (km) d’un point GPS aux sommets du tracé (approximation). */
function minDistanceKmPointToTrail(trail, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity;
  let positions = [];
  try {
    if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
  } catch {
    positions = [];
  }
  if (!Array.isArray(positions)) return Infinity;
  let minD = Infinity;
  for (const pt of positions) {
    const p = Array.isArray(pt) ? pt : null;
    if (!p || p.length < 2) continue;
    const plat = Number(p[0]);
    const plng = Number(p[1]);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
    const d = haversineKm(lat, lon, plat, plng);
    if (d < minD) minD = d;
  }
  return minD;
}

function pointInBounds(lat, lon, bounds) {
  if (!bounds) return true;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= Number(bounds.south) &&
    lat <= Number(bounds.north) &&
    lon >= Number(bounds.west) &&
    lon <= Number(bounds.east)
  );
}

function trailTouchesBounds(trail, bounds) {
  if (!bounds) return true;
  let positions = [];
  try {
    if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
  } catch {
    positions = [];
  }
  if (!Array.isArray(positions) || positions.length === 0) return false;
  for (const pt of positions) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lat = Number(pt[0]);
    const lon = Number(pt[1]);
    if (pointInBounds(lat, lon, bounds)) return true;
  }
  return false;
}

const theme = {
  bg: "#EEF4F0",
  surface: "#FFFFFF",
  surfaceMuted: "#F7FAF8",
  ink: "#0C1B16",
  inkMuted: "#5C6F66",
  border: "#D4E0D8",
  borderSoft: "#E8EFE9",
  hero: "#062D26",
  heroAccent: "#14B8A6",
  primary: "#0F766E",
  primaryPressed: "#0D5F59",
  secondaryInk: "#1E293B",
  chipBg: "#F0FDF9",
  chipBorder: "#99F6E4",
  infoBg: "#ECFDF5",
  infoBorder: "#A7F3D0",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  shadow: "rgba(6, 45, 38, 0.12)",
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ROLE_LABELS = { athlete: "Athlète", host: "Hôte", both: "Les deux" };
const WEB_READABLE =
  Platform.OS === "web"
    ? { maxWidth: 520, width: "100%", alignSelf: "center" }
    : {};
const AUTH_COLUMN =
  Platform.OS === "web"
    ? { maxWidth: 440, width: "100%", alignSelf: "center" }
    : {};

/** Espace sous le contenu pour défiler au-delà de la barre d’onglets (surtout le web). */
const TABBAR_SCROLL_PADDING = Platform.OS === "web" ? 120 : 48;

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (Platform.OS === "web" && typeof console !== "undefined") {
      console.error(
        "[RavitoBox] render error",
        error?.message,
        info?.componentStack
      );
    }
  }

  render() {
    if (this.state.error) {
      const msg = String(
        this.state.error?.message || this.state.error || "Erreur"
      );
      return (
        <View
          style={{
            flex: 1,
            padding: 24,
            justifyContent: "center",
            backgroundColor: theme.bg,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
            RavitoBox
          </Text>
          <Text style={{ color: theme.inkMuted, marginBottom: 12 }}>
            Une erreur a empêché l’affichage de l’application.
          </Text>
          <Text
            style={{ fontSize: 13, color: "#991B1B", marginBottom: 20 }}
            selectable
          >
            {msg}
          </Text>
          {Platform.OS === "web" ? (
            <TouchableOpacity
              onPress={() => globalThis.location?.reload?.()}
              style={[styles.primaryButton, { alignSelf: "flex-start" }]}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Recharger la page</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}

function boxWaterLabel(box) {
  const w = box.has_water;
  return w === 1 || w === true || w === "1" ? "Oui" : "Non";
}

function parseBoxCriteria(box) {
  try {
    const raw = box?.criteria_json;
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseBookingChangeRequest(booking) {
  try {
    const raw = booking?.change_request_json;
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function bookingSpecialRequestLabel(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "Aucune";
}

function bookingChangePreviewText(booking, draft) {
  if (!draft) return null;
  const currentSlot = `${booking?.booking_date || "?"} ${
    booking?.start_time || "?"
  }-${booking?.end_time || "?"}`;
  const proposedSlot = `${draft?.bookingDate || "?"} ${
    draft?.startTime || "?"
  }-${draft?.endTime || "?"}`;
  return (
    `Actuel: ${currentSlot}\n` +
    `Proposé: ${proposedSlot}\n` +
    `Demande actuelle: ${bookingSpecialRequestLabel(
      booking?.special_request
    )}\n` +
    `Demande proposée: ${bookingSpecialRequestLabel(draft?.specialRequest)}`
  );
}

function parseNotificationData(notification) {
  try {
    const raw = notification?.data_json;
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function bookingApprovalLabel(status) {
  switch (status) {
    case "accepted":
      return "Acceptée";
    case "rejected":
      return "Refusée";
    case "pending_host_confirmation":
      return "En attente validation hôte";
    case "pending_athlete_confirmation":
      return "En attente validation athlète";
    case "cancelled_box_deleted":
      return "Annulée (box supprimée)";
    default:
      return "En attente";
  }
}

function parseBookingDateTimeLocal(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!d || !t) return null;
  const iso = `${d}T${t.length === 5 ? `${t}:00` : t}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function canShowBookingAccessInfo(booking, now = new Date()) {
  const start = parseBookingDateTimeLocal(
    booking?.booking_date,
    booking?.start_time
  );
  const end = parseBookingDateTimeLocal(
    booking?.booking_date,
    booking?.end_time
  );
  if (!start || !end) return false;
  const before = Number(booking?.access_display_before_min ?? 15);
  const after = Number(booking?.access_display_after_min ?? 15);
  const openAt = new Date(start.getTime() - Math.max(0, before) * 60 * 1000);
  const closeAt = new Date(end.getTime() + Math.max(0, after) * 60 * 1000);
  return now >= openAt && now <= closeAt;
}

function bookingAccessMethodLabel(method) {
  const m = String(method || "");
  if (m === "manual_meetup") return "Remise en main propre";
  if (m === "padlock_code") return "Code cadenas manuel";
  if (m === "digital_code") return "Code digital temporaire";
  if (m === "key_lockbox") return "Boîte à clé";
  return "Accès";
}

/** Libellé lieu depuis la réponse GET /geocode/reverse (ou payload Nominatim brut). */
function geocodePayloadToCityLabel(data) {
  if (!data || typeof data !== "object") return null;
  const from =
    (typeof data.placeLabel === "string" && data.placeLabel.trim()) ||
    (typeof data.city === "string" && data.city.trim()) ||
    "";
  if (from) return from;
  const display =
    (typeof data.displayName === "string" && data.displayName) ||
    (typeof data.display_name === "string" && data.display_name) ||
    "";
  if (display) {
    const first = display.split(",")[0]?.trim();
    if (first) return first;
  }
  const addr =
    data.address && typeof data.address === "object" ? data.address : null;
  if (addr) {
    const a =
      (typeof addr.city === "string" && addr.city.trim()) ||
      (typeof addr.town === "string" && addr.town.trim()) ||
      (typeof addr.village === "string" && addr.village.trim()) ||
      (typeof addr.municipality === "string" && addr.municipality.trim()) ||
      "";
    if (a) return a;
  }
  return null;
}

async function geocodeCityToLatLon(query, { signal, token } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return null;
  try {
    const data = await apiFetch(`/geocode/search?q=${encodeURIComponent(q)}`, {
      signal,
      token,
    });
    const lat = Number(data?.lat);
    const lon = Number(data?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (_e) {
    return null;
  }
}

function explorerListSourceLabelFr(source) {
  if (source === "viewport") return "Zone visible";
  if (source === "city") return "Par ville";
  if (source === "nearby") return "Par GPS";
  return "—";
}

const AuthUiContext = createContext(null);

/** Données / actions des écrans connectés — évite de définir les écrans dans App (sinon React Navigation remonte la carte à chaque render). */
const AppMainContext = createContext(null);

function useAppMain() {
  const ctx = useContext(AppMainContext);
  if (!ctx) {
    throw new Error(
      "useAppMain doit être utilisé sous AppMainContext (session connectée)."
    );
  }
  return ctx;
}

const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

const HOST_CRITERIA_OPTIONS = [
  "Douche",
  "WC",
  "Abri pluie",
  "Prise électrique",
  "Parking vélo",
  "Pompe vélo",
  "Kit réparation",
  "Snacks sucrés",
  "Snacks salés",
  "Option vegan",
  "Sans gluten",
  "Eau fraîche",
];

function formatDateHuman(dateText) {
  if (!dateText) return "?";
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateLongFr(dateText) {
  if (!dateText) return "?";
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatPublicRatingLine(stats) {
  const n = Number(stats?.count || 0);
  const avg = Number(stats?.avg_score || 0);
  if (!n) return "Pas encore d'avis";
  return `Note moyenne ${avg.toFixed(1)}/5 · ${n} avis`;
}

function formatHostRatingLine(box) {
  if (!box) return "Hôte : pas encore d'avis";
  const n = Number(box.host_review_count || 0);
  const avg = Number(box.host_avg_score || 0);
  const name = box.host_full_name ? `${box.host_full_name} · ` : "";
  if (!n) return `${name}Pas encore d'avis`;
  return `${name}Note ${avg.toFixed(1)}/5 (${n} avis)`;
}

function parseTimeToParts(t) {
  if (!t || typeof t !== "string") return { h: 8, m: 0 };
  const [a, b] = t.split(":");
  const h = Math.min(23, Math.max(0, Number.parseInt(a, 10) || 0));
  const m = Math.min(59, Math.max(0, Number.parseInt(b, 10) || 0));
  return { h, m };
}

function partsToTime(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(hhmm) {
  const { h, m } = parseTimeToParts(hhmm);
  return h * 60 + m;
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildBookingVigilances(
  box,
  bookingDate,
  startTime,
  endTime,
  specialRequest
) {
  const warnings = [];
  const blocking = [];
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    blocking.push("L'heure de fin doit être après l'heure de début.");
  }
  const today = todayIsoDate();
  if (bookingDate && bookingDate < today) {
    blocking.push("La date choisie est dans le passé.");
  }
  if (!specialRequest?.trim()) {
    warnings.push(
      "Tu n'as pas indiqué de demande spéciale (allergies, nombre de personnes, type de vélo, horaire d'arrivée, etc.). Plus l'hôte en sait, mieux c'est."
    );
  }
  if (
    box?.availability_note &&
    String(box.availability_note).trim().length > 4
  ) {
    warnings.push(
      "Ce box a une note de disponibilité de l'hôte : vérifie que ton créneau et ton usage sont compatibles."
    );
  }
  const crit = box ? parseBoxCriteria(box) : [];
  if (crit.length > 0) {
    warnings.push(
      "Ce box affiche des critères ou services précis : assure-toi d'y correspondre avant d'envoyer la demande."
    );
  }
  if (box?.criteria_note && String(box.criteria_note).trim().length > 4) {
    warnings.push(
      "L'hôte a ajouté des précisions dans « critères » : relis-les avant de confirmer."
    );
  }
  return { warnings, blocking };
}

function parseIsoToLocalParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day))
    return null;
  return { y, m: mo, day };
}

function isoFromYmd(y, monthIndex, day) {
  return `${y}-${String(monthIndex + 1).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}

function calendarCellsForMonth(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells;
}

function difficultyBadgeStyle(level) {
  switch (level) {
    case "easy":
      return { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" };
    case "hard":
      return { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" };
    default:
      return { bg: "#FEF3C7", fg: "#B45309", border: "#FDE68A" };
  }
}

function parseFieldErrorsFromApiError(errObj) {
  if (!errObj || typeof errObj !== "object") return [];
  const fieldErrors = errObj.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return [];
  const out = [];
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (!Array.isArray(msgs) || msgs.length === 0) continue;
    const first = String(msgs[0] || "").trim();
    if (!first) continue;
    out.push(`${field}: ${first}`);
  }
  return out;
}

async function apiFetch(path, { method = "GET", body, token, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text.slice(0, 180) || "Réponse invalide du serveur");
    }
  }
  if (!response.ok) {
    const err = data.error;
    const fieldMsgs = parseFieldErrorsFromApiError(err);
    const msg =
      typeof err === "string"
        ? err
        : fieldMsgs.length > 0
        ? fieldMsgs.join(" · ")
        : err && typeof err === "object"
        ? JSON.stringify(err)
        : response.status === 404
        ? `Endpoint API introuvable: ${method} ${path}`
        : "Erreur réseau ou serveur";
    throw new Error(msg);
  }
  return data;
}

/** Sur le web, Alert.alert est souvent no-op ou peu visible — utiliser window.alert. */
function userAlert(title, message) {
  const body = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === "web") {
    window.alert(body);
  } else {
    Alert.alert(title, message || undefined);
  }
}

function confirmDestructive(title, message) {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

function Section({ title, subtitle, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon ? (
          <View style={styles.sectionIconWrap}>
            <Ionicons name={icon} size={20} color={theme.primary} />
          </View>
        ) : null}
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function PrimaryButton({ label, onPress, icon, disabled, loading, compact }) {
  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        disabled && styles.buttonDisabled,
        Platform.OS === "web" && { cursor: "pointer" },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color="#fff"
              style={styles.buttonIconLeft}
              pointerEvents="none"
            />
          ) : null}
          <Text style={styles.primaryButtonText} pointerEvents="none">
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress, icon, compact }) {
  return (
    <TouchableOpacity
      style={[
        styles.secondaryButton,
        compact && styles.secondaryButtonCompact,
        Platform.OS === "web" && { cursor: "pointer" },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color="#fff"
          style={styles.buttonIconLeft}
          pointerEvents="none"
        />
      ) : null}
      <Text style={styles.secondaryButtonText} pointerEvents="none">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Bouton discret (bordure) — suppressions / actions secondaires. */
function OutlineButton({ label, onPress, icon, danger, compact, stretch }) {
  return (
    <TouchableOpacity
      style={[
        styles.outlineButton,
        compact && styles.outlineButtonCompact,
        danger && styles.outlineButtonDanger,
        stretch && styles.outlineButtonStretch,
        Platform.OS === "web" && { cursor: "pointer" },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={compact ? 16 : 17}
          color={danger ? "#B91C1C" : theme.secondaryInk}
          style={styles.buttonIconLeft}
          pointerEvents="none"
        />
      ) : null}
      <Text
        style={[
          styles.outlineButtonText,
          compact && styles.outlineButtonTextCompact,
          danger && styles.outlineButtonTextDanger,
        ]}
        pointerEvents="none"
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);
const CAL_WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function maxBookableIso() {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + 365);
  return isoFromYmd(t.getFullYear(), t.getMonth(), t.getDate());
}

function TimePairPicker({ label, value, onChange }) {
  const { h, m } = parseTimeToParts(value);
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.timePairRow}>
        <View style={styles.timePairCol}>
          <Text style={styles.helperText}>Heures</Text>
          <ScrollView
            style={styles.timeDropdownScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {HOUR_OPTIONS.map((hh) => (
              <TouchableOpacity
                key={`${label}-h-${hh}`}
                style={[
                  styles.timeDropdownItem,
                  h === hh && styles.timeDropdownItemActive,
                ]}
                onPress={() => onChange(partsToTime(hh, m))}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.timeDropdownItemText,
                    h === hh && styles.timeDropdownItemTextActive,
                  ]}
                >
                  {String(hh).padStart(2, "0")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.timePairCol}>
          <Text style={styles.helperText}>Minutes</Text>
          <ScrollView
            style={styles.timeDropdownScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {MINUTE_OPTIONS.map((mm) => (
              <TouchableOpacity
                key={`${label}-m-${mm}`}
                style={[
                  styles.timeDropdownItem,
                  m === mm && styles.timeDropdownItemActive,
                ]}
                onPress={() => onChange(partsToTime(h, mm))}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.timeDropdownItemText,
                    m === mm && styles.timeDropdownItemTextActive,
                  ]}
                >
                  {String(mm).padStart(2, "0")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function DateTimeSelector({
  dateValue,
  onDateChange,
  startValue,
  onStartChange,
  endValue,
  onEndChange,
}) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(dateValue);
  const [draftStart, setDraftStart] = useState(startValue);
  const [draftEnd, setDraftEnd] = useState(endValue);
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseIsoToLocalParts(dateValue || todayIsoDate());
    return p
      ? { y: p.y, m: p.m }
      : { y: new Date().getFullYear(), m: new Date().getMonth() };
  });

  useEffect(() => {
    if (!open) return;
    setDraftDate(dateValue);
    setDraftStart(startValue);
    setDraftEnd(endValue);
    const p = parseIsoToLocalParts(dateValue || todayIsoDate());
    if (p) setViewMonth({ y: p.y, m: p.m });
  }, [open, dateValue, startValue, endValue]);

  const openModal = () => {
    setDraftDate(dateValue || todayIsoDate());
    setDraftStart(startValue);
    setDraftEnd(endValue);
    const p = parseIsoToLocalParts(dateValue || todayIsoDate());
    if (p) setViewMonth({ y: p.y, m: p.m });
    setOpen(true);
  };

  const setDraftStartSafe = (t) => {
    setDraftStart(t);
    setDraftEnd((prev) => {
      if (timeToMinutes(prev) <= timeToMinutes(t)) {
        const mins = timeToMinutes(t) + 60;
        if (mins >= 24 * 60) return "23:59";
        return partsToTime(Math.floor(mins / 60), mins % 60);
      }
      return prev;
    });
  };

  const apply = () => {
    const ds = draftDate || todayIsoDate();
    const st = draftStart || "08:00";
    const en = draftEnd || "09:00";
    if (timeToMinutes(en) <= timeToMinutes(st)) {
      userAlert("Horaires", "L'heure de fin doit être après l'heure de début.");
      return;
    }
    onDateChange(ds);
    onStartChange(st);
    onEndChange(en);
    setOpen(false);
  };

  const today = todayIsoDate();
  const maxIso = maxBookableIso();
  const isSelectableIso = (iso) => {
    if (!iso) return false;
    if (iso < today) return false;
    if (iso > maxIso) return false;
    return true;
  };

  const shiftMonth = (delta) => {
    setViewMonth((vm) => {
      const d = new Date(vm.y, vm.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const cells = calendarCellsForMonth(viewMonth.y, viewMonth.m);
  const monthTitle = new Date(viewMonth.y, viewMonth.m, 1).toLocaleDateString(
    "fr-FR",
    { month: "long", year: "numeric" }
  );

  return (
    <View>
      <Text style={styles.fieldLabel}>Créneau</Text>
      <TouchableOpacity
        style={styles.dateTimeSummary}
        onPress={openModal}
        activeOpacity={0.85}
      >
        <Ionicons name="calendar-outline" size={22} color={theme.primary} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.dateTimeSummaryTitle}>
            {formatDateLongFr(dateValue || todayIsoDate())}
          </Text>
          <Text style={styles.dateTimeSummarySub}>
            {startValue} – {endValue}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.inkMuted} />
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalSheetHeader}>
              <Text style={styles.modalSheetTitle}>Date et horaires</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.ink} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.modalSheetBody}
            >
              <View style={styles.calendarNav}>
                <TouchableOpacity
                  onPress={() => shiftMonth(-1)}
                  style={styles.calendarNavBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={theme.primary}
                  />
                </TouchableOpacity>
                <Text style={styles.calendarMonthTitle}>{monthTitle}</Text>
                <TouchableOpacity
                  onPress={() => shiftMonth(1)}
                  style={styles.calendarNavBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={theme.primary}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarWeekRow}>
                {CAL_WEEKDAY_LABELS.map((w, i) => (
                  <Text key={`wd-${i}`} style={styles.calendarWeekCell}>
                    {w}
                  </Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {cells.map((day, idx) => {
                  if (day == null) {
                    return (
                      <View key={`e-${idx}`} style={styles.calendarDayCell} />
                    );
                  }
                  const iso = isoFromYmd(viewMonth.y, viewMonth.m, day);
                  const sel = draftDate === iso;
                  const dis = !isSelectableIso(iso);
                  return (
                    <TouchableOpacity
                      key={iso}
                      style={[
                        styles.calendarDayCell,
                        sel && styles.calendarDayCellSelected,
                        dis && styles.calendarDayCellDisabled,
                      ]}
                      disabled={dis}
                      onPress={() => setDraftDate(iso)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          sel && styles.calendarDayTextSelected,
                          dis && styles.calendarDayTextDisabled,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TimePairPicker
                label="Heure de début"
                value={draftStart}
                onChange={setDraftStartSafe}
              />
              <TimePairPicker
                label="Heure de fin"
                value={draftEnd}
                onChange={setDraftEnd}
              />
            </ScrollView>
            <View style={styles.modalSheetFooter}>
              <OutlineButton
                compact
                label="Annuler"
                icon="close-circle-outline"
                onPress={() => setOpen(false)}
              />
              <PrimaryButton
                compact
                label="Valider"
                icon="checkmark-outline"
                onPress={apply}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function UserReviewsModal({ visible, userId, title, onClose }) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!visible || !userId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/users/${userId}/reviews`)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) setPayload({ error: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, userId]);

  const displayName =
    payload?.user?.full_name || title || `Utilisateur #${userId}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, styles.userReviewsSheet]}>
          <View style={styles.modalSheetHeader}>
            <Text style={styles.modalSheetTitle} numberOfLines={2}>
              {title || "Profil & avis"}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.ink} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.userReviewsLoading}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : payload?.error ? (
            <Text style={styles.emptyText}>{payload.error}</Text>
          ) : (
            <ScrollView
              style={styles.modalSheetBody}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.profileCard}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {String(displayName).trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.profileName}>{displayName}</Text>
                {payload?.user?.city ? (
                  <Text style={styles.cardMeta}>{payload.user.city}</Text>
                ) : null}
              </View>
              <Text style={styles.cardMeta}>
                {formatPublicRatingLine(payload?.stats)}
              </Text>
              {(payload?.reviews || []).map((r) => (
                <View key={`pub-rev-${r.id}`} style={styles.card}>
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardTitle}>{r.score}/5</Text>
                  <Text style={styles.cardMeta}>
                    {r.reviewer_name || "Utilisateur"} ·{" "}
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                  </Text>
                  {r.comment ? (
                    <Text style={styles.cardAvailability}>{r.comment}</Text>
                  ) : null}
                </View>
              ))}
              {Array.isArray(payload?.reviews) &&
              payload.reviews.length === 0 ? (
                <Text style={styles.emptyText}>Aucun avis pour le moment.</Text>
              ) : null}
            </ScrollView>
          )}
          <View style={styles.modalSheetFooter}>
            <PrimaryButton compact label="Fermer" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BookingConfirmModal({
  visible,
  box,
  bookingDate,
  startTime,
  endTime,
  specialRequest,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!box) return null;
  const { warnings, blocking } = buildBookingVigilances(
    box,
    bookingDate,
    startTime,
    endTime,
    specialRequest
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, styles.bookingConfirmSheet]}>
          <View style={styles.modalSheetHeader}>
            <Text style={styles.modalSheetTitle}>Confirmer la réservation</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              disabled={submitting}
            >
              <Ionicons name="close" size={26} color={theme.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalSheetBody}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.bookingRecapTitle}>Récapitulatif</Text>
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>{box.title}</Text>
              <Text style={styles.cardMeta}>
                {box.city} · {(Number(box.price_cents || 0) / 100).toFixed(2)} €
              </Text>
              <Text style={styles.cardAvailability}>
                {formatHostRatingLine(box)}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              Date : {formatDateLongFr(bookingDate)} · {startTime} → {endTime}
            </Text>
            {specialRequest?.trim() ? (
              <Text style={styles.cardAvailability}>
                Demande : {specialRequest.trim()}
              </Text>
            ) : (
              <Text style={styles.cardAvailability}>
                Aucune demande spéciale saisie.
              </Text>
            )}
            {blocking.length > 0 ? (
              <View style={[styles.infoBanner, { borderColor: "#FECACA" }]}>
                <Text style={styles.infoBannerTitle}>À corriger</Text>
                {blocking.map((t, i) => (
                  <Text key={`blk-${i}`} style={styles.infoBannerText}>
                    • {t}
                  </Text>
                ))}
              </View>
            ) : null}
            {warnings.length > 0 ? (
              <View style={[styles.infoBanner, { marginTop: 10 }]}>
                <Text style={styles.infoBannerTitle}>Points de vigilance</Text>
                {warnings.map((t, i) => (
                  <Text key={`warn-${i}`} style={styles.infoBannerText}>
                    • {t}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={styles.helperText}>
              En confirmant, tu envoies une demande à l'hôte (acceptation ou
              refus possible).
            </Text>
          </ScrollView>
          <View style={styles.modalSheetFooter}>
            <OutlineButton
              compact
              label="Modifier"
              icon="create-outline"
              onPress={onClose}
              disabled={submitting}
            />
            <PrimaryButton
              compact
              label={submitting ? "Envoi…" : "Confirmer l'envoi"}
              icon="checkmark-circle-outline"
              onPress={onConfirm}
              disabled={submitting || blocking.length > 0}
              loading={submitting}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SwipeActionRow({
  children,
  onDelete,
  onEdit,
  deleteLabel = "Supprimer",
  editLabel = "Modifier",
}) {
  const swipeRef = useRef(null);
  const closeRow = () => swipeRef.current?.close?.();
  const renderRightActions = () => (
    <View style={styles.swipeActionsWrap}>
      {onEdit ? (
        <TouchableOpacity
          style={[styles.swipeActionBtn, styles.swipeEditAction]}
          onPress={() => {
            closeRow();
            onEdit();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={16} color="#fff" />
          <Text style={styles.swipeActionText}>{editLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.swipeActionBtn, styles.swipeDeleteAction]}
        onPress={() => {
          closeRow();
          onDelete?.();
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="trash-outline" size={16} color="#fff" />
        <Text style={styles.swipeActionText}>{deleteLabel}</Text>
      </TouchableOpacity>
    </View>
  );
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={36}
    >
      {children}
    </Swipeable>
  );
}

function ExplorerScreen() {
  const {
    boxes,
    trails,
    trailsForMap,
    city,
    setCity,
    mapLat,
    mapLon,
    setMapLat,
    setMapLon,
    setSelectedBoxId,
    selectedBoxId,
    selectedBox,
    canBook,
    canHost,
    user,
    mapShowTrails,
    setMapShowTrails,
    mapTrailDifficultyFilter,
    setMapTrailDifficultyFilter,
    mapTrailsScope,
    setMapTrailsScope,
    mapTrailPickIds,
    setMapTrailPickIds,
    selectedTrailId,
    setSelectedTrailId,
    mapBoxSelectionMode,
    setMapBoxSelectionMode,
    mapPickedBoxIds,
    setMapPickedBoxIds,
    mapBoxSort,
    setMapBoxSort,
    mapTrailListSort,
    setMapTrailListSort,
    boxesForExplorerList,
    trailsForExplorerList,
    boxesForMap,
    mapShowBoxes,
    setMapShowBoxes,
    mapBoxCriteriaTags,
    setMapBoxCriteriaTags,
    mapNearTrailsMode,
    setMapNearTrailsMode,
    mapNearTrailPickIds,
    setMapNearTrailPickIds,
    mapListSource,
    setMapListSource,
    mapBoxesNearTrailsOnly,
    setMapBoxesNearTrailsOnly,
    mapTrailProximityKm,
    setMapTrailProximityKm,
    setMapViewportBounds,
    mapExplorerRecenterNonce,
    mapExplorerCameraFollowSearch,
    setMapExplorerCameraFollowSearch,
    mapExplorerLastSearchAt,
    mapExplorerLastSearchSource,
    bookingDate,
    setBookingDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    specialRequest,
    setSpecialRequest,
    webMapCenter,
    openUserReviews,
    actionsRef,
  } = useAppMain();

  const trailsOnMap = Array.isArray(trailsForMap) ? trailsForMap : [];
  const boxesOnMap = Array.isArray(boxesForMap) ? boxesForMap : [];
  const safePickedBoxIds = useMemo(
    () =>
      Array.isArray(mapPickedBoxIds)
        ? mapPickedBoxIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))
        : [],
    [mapPickedBoxIds]
  );
  const trailsForPickList = useMemo(() => {
    return Array.isArray(trailsForMap) ? trailsForMap : [];
  }, [trailsForMap]);
  const selectedTrail = useMemo(
    () =>
      trails.find((trail) => Number(trail.id) === Number(selectedTrailId)) ||
      null,
    [trails, selectedTrailId]
  );
  const explorerSelectionLock =
    safePickedBoxIds.length > 0 || mapTrailPickIds.length > 0;
  const prioritizedExplorerBoxes = useMemo(() => {
    if (selectedBoxId == null) return boxesForExplorerList;
    const sid = Number(selectedBoxId);
    const list = Array.isArray(boxesForExplorerList)
      ? [...boxesForExplorerList]
      : [];
    list.sort((a, b) => {
      const aSel = Number(a.id) === sid ? 1 : 0;
      const bSel = Number(b.id) === sid ? 1 : 0;
      return bSel - aSel;
    });
    return list;
  }, [boxesForExplorerList, selectedBoxId]);
  const prioritizedExplorerTrails = useMemo(() => {
    if (selectedTrailId == null) return trailsForExplorerList;
    const sid = Number(selectedTrailId);
    const list = Array.isArray(trailsForExplorerList)
      ? [...trailsForExplorerList]
      : [];
    list.sort((a, b) => {
      const aSel = Number(a.id) === sid ? 1 : 0;
      const bSel = Number(b.id) === sid ? 1 : 0;
      return bSel - aSel;
    });
    return list;
  }, [trailsForExplorerList, selectedTrailId]);
  const toggleExplorerPickedBox = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      setSelectedBoxId(bid);
      setMapBoxSelectionMode("picked");
      setMapPickedBoxIds((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        return base.includes(bid)
          ? base.filter((id) => id !== bid)
          : [...base, bid];
      });
    },
    [setMapBoxSelectionMode, setMapPickedBoxIds, setSelectedBoxId]
  );
  const toggleExplorerPickedTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      setSelectedTrailId(tid);
      setMapTrailsScope("picked");
      setMapTrailPickIds((prev) =>
        prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
      );
    },
    [setMapTrailsScope, setMapTrailPickIds, setSelectedTrailId]
  );
  const focusExplorerBox = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      setSelectedBoxId(bid);
    },
    [setSelectedBoxId]
  );
  const focusExplorerTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      setSelectedTrailId(tid);
    },
    [setSelectedTrailId]
  );
  const handleExplorerMapLongPress = useCallback(
    (lat, lng) => {
      const plat = Number(lat);
      const plng = Number(lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
      let nearestBox = null;
      let nearestBoxDistKm = Infinity;
      for (const box of boxesOnMap) {
        const bLat = Number(box.latitude);
        const bLng = Number(box.longitude);
        if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
        const d = haversineKm(plat, plng, bLat, bLng);
        if (d < nearestBoxDistKm) {
          nearestBoxDistKm = d;
          nearestBox = box;
        }
      }
      let nearestTrail = null;
      let nearestTrailDistKm = Infinity;
      for (const trail of trailsOnMap) {
        const d = minDistanceKmPointToTrail(trail, plat, plng);
        if (d < nearestTrailDistKm) {
          nearestTrailDistKm = d;
          nearestTrail = trail;
        }
      }
      const boxHit = nearestBox && nearestBoxDistKm <= 0.12;
      const trailHit = nearestTrail && nearestTrailDistKm <= 0.12;
      if (!boxHit && !trailHit) return;
      if (boxHit && (!trailHit || nearestBoxDistKm <= nearestTrailDistKm)) {
        const bid = Number(nearestBox.id);
        setSelectedBoxId(bid);
        if (safePickedBoxIds.includes(bid) && explorerSelectionLock) return;
        toggleExplorerPickedBox(bid);
        return;
      }
      if (trailHit) {
        const tid = Number(nearestTrail.id);
        setSelectedTrailId(tid);
        if (mapTrailPickIds.includes(tid) && explorerSelectionLock) return;
        toggleExplorerPickedTrail(tid);
      }
    },
    [
      boxesOnMap,
      trailsOnMap,
      safePickedBoxIds,
      mapTrailPickIds,
      explorerSelectionLock,
      toggleExplorerPickedBox,
      toggleExplorerPickedTrail,
      setSelectedBoxId,
      setSelectedTrailId,
    ]
  );
  const { width: viewportWidth } = useWindowDimensions();
  const [showBoxFilters, setShowBoxFilters] = useState(false);
  const [showTrailFilters, setShowTrailFilters] = useState(false);

  useEffect(() => {
    actionsRef.current.loadTrails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webSplit = Platform.OS === "web";
  const webDesktopSplit = webSplit && viewportWidth >= 1080;

  const explorerScrollContent = (
    <>
      <Section
        title="Carte & hôtes"
        subtitle={
          canHost && !canBook
            ? "Vue hôte : les athlètes réservent depuis leur compte."
            : "Repère les box, les tracés GPX importés, et les hôtes les plus proches."
        }
        icon="map-outline"
      >
        <Text style={styles.fieldLabel}>Charger la liste des box</Text>
        <Text style={styles.helperText}>
          Choisis la source : la liste se met à jour automatiquement après ta
          saisie (pas besoin de bouton « charger »).
        </Text>
        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
          <TouchableOpacity
            style={[
              styles.roleChip,
              mapListSource === "viewport" && styles.roleChipActive,
            ]}
            onPress={() => {
              setMapExplorerCameraFollowSearch(true);
              setMapListSource("viewport");
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                mapListSource === "viewport" && styles.roleChipTextActive,
              ]}
            >
              Zone visible
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleChip,
              mapListSource === "city" && styles.roleChipActive,
            ]}
            onPress={() => {
              setMapExplorerCameraFollowSearch(true);
              setMapListSource("city");
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                mapListSource === "city" && styles.roleChipTextActive,
              ]}
            >
              Par ville
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleChip,
              mapListSource === "nearby" && styles.roleChipActive,
            ]}
            onPress={() => {
              setMapExplorerCameraFollowSearch(true);
              setMapListSource("nearby");
            }}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                mapListSource === "nearby" && styles.roleChipTextActive,
              ]}
            >
              Par GPS (lat / lon)
            </Text>
          </TouchableOpacity>
        </View>
        {mapListSource === "viewport" ? (
          <Text style={styles.helperText}>
            Déplace ou zoome la carte : la liste et les marqueurs suivent la
            zone affichée à l’écran (mise à jour automatique).
          </Text>
        ) : null}
        {mapListSource === "nearby" ? (
          <>
            <Text style={styles.inputLabel}>
              Coordonnées GPS du centre carte
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Latitude (ex. 45.8992)"
              placeholderTextColor={theme.inkMuted}
              value={mapLat}
              onChangeText={(v) => {
                setMapLat(v);
                setMapExplorerCameraFollowSearch(true);
                setMapListSource("nearby");
              }}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Longitude (ex. 6.1294)"
              placeholderTextColor={theme.inkMuted}
              value={mapLon}
              onChangeText={(v) => {
                setMapLon(v);
                setMapExplorerCameraFollowSearch(true);
                setMapListSource("nearby");
              }}
              keyboardType="decimal-pad"
            />
          </>
        ) : mapListSource === "city" ? (
          <>
            <Text style={styles.inputLabel}>Ville</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. Annecy"
              placeholderTextColor={theme.inkMuted}
              value={city}
              onChangeText={(v) => {
                setCity(v);
                setMapExplorerCameraFollowSearch(true);
                setMapListSource("city");
              }}
            />
          </>
        ) : null}
        <View style={styles.statBanner}>
          <View style={styles.statBannerIcon}>
            <Ionicons name="cube-outline" size={22} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statBannerTitle}>
              {boxes.length === 0
                ? "Aucune box dans cette recherche"
                : `${boxes.length} box affichée${boxes.length > 1 ? "s" : ""}`}
            </Text>
            <Text style={styles.statBannerText}>
              {mapListSource === "city"
                ? `Recherche par ville (automatique). ${
                    webSplit
                      ? "Carte : OSM · marqueurs = box ; lignes = traces."
                      : "Carte native : marqueurs et tracés."
                  }`
                : mapListSource === "viewport"
                ? `Zone visible sur la carte (automatique). ${
                    webSplit
                      ? "Carte : OSM · marqueurs = box ; lignes = traces."
                      : "Carte native : marqueurs et tracés."
                  }`
                : `Box les plus proches du point lat/lon (automatique). ${
                    webSplit
                      ? "Carte : OSM · marqueurs = box ; lignes = traces."
                      : "Carte native : marqueurs et tracés."
                  }`}
            </Text>
          </View>
        </View>
        <View style={styles.explorerSearchMeta}>
          <Text style={styles.explorerSearchMetaText}>
            Dernière liste :{" "}
            {explorerListSourceLabelFr(mapExplorerLastSearchSource)} ·{" "}
            {mapExplorerLastSearchAt != null
              ? new Date(mapExplorerLastSearchAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "—"}
          </Text>
          {!mapExplorerCameraFollowSearch ? (
            <>
              <Text style={styles.explorerSearchMetaHint}>
                Vue carte découplée (tu as déplacé la carte). La liste continue
                de se mettre à jour ; touche « Recentrer » pour aligner la carte
                sur la recherche.
              </Text>
              <OutlineButton
                compact
                stretch
                label="Recentrer sur les résultats"
                icon="locate-outline"
                onPress={() =>
                  actionsRef.current.recenterExplorerMapOnResults?.()
                }
              />
            </>
          ) : null}
        </View>
        <Text style={styles.helperText}>
          Filtres et sélections déplacés dans « Liste des box » et « Liste des
          traces » pour éviter de se perdre. Ici, tu gardes uniquement la source
          de recherche et la carte.
        </Text>
        <View style={styles.explorerSelectionSummary}>
          <Text style={styles.explorerSelectionSummaryText}>
            Sélection active : {safePickedBoxIds.length} box ·{" "}
            {mapTrailPickIds.length} trace
            {mapTrailPickIds.length > 1 ? "s" : ""}
          </Text>
          <Text style={styles.explorerSelectionSummaryHint}>
            Appui court carte = focus. Appui long = sélection. Verrou sélection
            actif automatiquement dès qu'au moins 1 élément est sélectionné.
          </Text>
        </View>
        {!webSplit ? (
          <NativeExplorerMap
            center={webMapCenter}
            boxes={boxesOnMap}
            trails={trailsOnMap}
            selectedTrailIds={mapTrailPickIds}
            selectedBoxId={selectedBoxId}
            onSelectBox={focusExplorerBox}
            onSelectTrail={focusExplorerTrail}
            onMapLongPress={handleExplorerMapLongPress}
            onVisibleBoundsChange={setMapViewportBounds}
            onPanDrag={() => actionsRef.current.markExplorerMapUserGesture?.()}
            followExternalCenter={
              mapExplorerCameraFollowSearch &&
              !(mapListSource === "viewport" && selectedBoxId == null)
            }
            recenterNonce={mapExplorerRecenterNonce}
          />
        ) : null}
        {selectedBox ? (
          <View style={styles.selectedHostCard}>
            <Text style={styles.selectedLabel}>Box sélectionnée</Text>
            <Text style={styles.cardTitle}>{selectedBox.title}</Text>
            <Text style={styles.cardMeta}>
              {selectedBox.city} · {(selectedBox.price_cents / 100).toFixed(2)}{" "}
              €
              {selectedBox.distance_km != null && (
                <> · ≈ {Number(selectedBox.distance_km).toFixed(1)} km</>
              )}
            </Text>
            {selectedBox.host_user_id != null ? (
              <>
                <Text style={styles.cardAvailability}>
                  {formatHostRatingLine(selectedBox)}
                </Text>
                <OutlineButton
                  compact
                  stretch
                  label="Profil, notes et commentaires de l'hôte"
                  icon="person-circle-outline"
                  onPress={() =>
                    openUserReviews(
                      selectedBox.host_user_id,
                      "Hôte — profil & avis"
                    )
                  }
                />
              </>
            ) : null}
            {canBook ? (
              <>
                <Text style={styles.helperText}>
                  Créneau dans « Créneau & demande ». Un récapitulatif et des
                  points de vigilance s’affichent avant l’envoi.
                </Text>
                <PrimaryButton
                  compact
                  label="Réserver ce box (avec le créneau ci-dessous)"
                  icon="calendar-outline"
                  onPress={() => actionsRef.current.bookBox(selectedBox.id)}
                />
              </>
            ) : (
              <Text style={styles.roleHintOnlyHost}>
                Compte hôte : la réservation est faite par les athlètes.
              </Text>
            )}
          </View>
        ) : null}
        {selectedTrail ? (
          <View style={styles.selectedHostCard}>
            <Text style={styles.selectedLabel}>Trace sélectionnée</Text>
            <Text style={styles.cardTitle}>{selectedTrail.name}</Text>
            <Text style={styles.cardMeta}>
              {selectedTrail.territory} · {selectedTrail.distance_km} km · D+
              {selectedTrail.elevation_m ?? 0} m ·{" "}
              {DIFFICULTY_LABELS[selectedTrail.difficulty] ||
                selectedTrail.difficulty}
            </Text>
            {selectedTrail.notes ? (
              <Text style={styles.cardAvailability} numberOfLines={3}>
                {selectedTrail.notes}
              </Text>
            ) : null}
            <OutlineButton
              compact
              stretch
              label="Voir uniquement cette trace"
              icon="filter-outline"
              onPress={() =>
                actionsRef.current.isolateTrailOnMap(selectedTrail.id)
              }
            />
          </View>
        ) : null}
      </Section>

      {canBook ? (
        <>
          <Section
            title="Créneau & demande"
            subtitle="Horaires et message optionnel pour l’hôte (allergies, groupe, etc.)."
            icon="time-outline"
          >
            <DateTimeSelector
              dateValue={bookingDate}
              onDateChange={setBookingDate}
              startValue={startTime}
              onStartChange={setStartTime}
              endValue={endTime}
              onEndChange={setEndTime}
            />
            <Text style={styles.inputLabel}>Demande spéciale (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex. groupe de 4, sans gluten, besoin d’eau en bouteille…"
              placeholderTextColor={theme.inkMuted}
              value={specialRequest}
              onChangeText={setSpecialRequest}
              multiline
            />
          </Section>
        </>
      ) : null}

      <Section title="Liste des box" icon="list-outline">
        <OutlineButton
          compact
          label={
            showBoxFilters ? "Masquer filtres box" : "Afficher filtres box"
          }
          icon={showBoxFilters ? "chevron-up-outline" : "options-outline"}
          onPress={() => setShowBoxFilters((v) => !v)}
        />
        {showBoxFilters ? (
          <>
            <Text style={styles.fieldLabel}>Affichage des box</Text>
            <Text style={styles.helperText}>
              Précision automatique par zoom : la liste et la carte ne gardent
              que les box dans la zone visible.
            </Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleChip, mapShowBoxes && styles.roleChipActive]}
                onPress={() => setMapShowBoxes(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    mapShowBoxes && styles.roleChipTextActive,
                  ]}
                >
                  Afficher
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  !mapShowBoxes && styles.roleChipActive,
                ]}
                onPress={() => setMapShowBoxes(false)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    !mapShowBoxes && styles.roleChipTextActive,
                  ]}
                >
                  Masquer
                </Text>
              </TouchableOpacity>
            </View>
            {mapShowBoxes ? (
              <>
                <Text style={styles.fieldLabel}>Critères des box</Text>
                <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                  {HOST_CRITERIA_OPTIONS.map((label) => {
                    const active = mapBoxCriteriaTags.includes(label);
                    return (
                      <TouchableOpacity
                        key={`map-crit-${label}`}
                        style={[
                          styles.roleChip,
                          active && styles.roleChipActive,
                        ]}
                        onPress={() =>
                          setMapBoxCriteriaTags((prev) =>
                            active
                              ? prev.filter((x) => x !== label)
                              : [...prev, label]
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            active && styles.roleChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {mapBoxCriteriaTags.length > 0 ? (
                  <OutlineButton
                    label="Effacer les critères"
                    icon="close-circle-outline"
                    compact
                    onPress={() => setMapBoxCriteriaTags([])}
                  />
                ) : null}
                <Text style={styles.fieldLabel}>Sélection des box</Text>
                <View style={styles.roleRow}>
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      mapBoxSelectionMode === "all" && styles.roleChipActive,
                    ]}
                    onPress={() => setMapBoxSelectionMode("all")}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        mapBoxSelectionMode === "all" &&
                          styles.roleChipTextActive,
                      ]}
                    >
                      Toutes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      mapBoxSelectionMode === "picked" && styles.roleChipActive,
                    ]}
                    onPress={() => setMapBoxSelectionMode("picked")}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        mapBoxSelectionMode === "picked" &&
                          styles.roleChipTextActive,
                      ]}
                    >
                      Sélection…
                    </Text>
                  </TouchableOpacity>
                </View>
                {mapBoxSelectionMode === "picked" ? (
                  <>
                    <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                      <OutlineButton
                        compact
                        label="Effacer sélection box"
                        icon="close-circle-outline"
                        onPress={() => setMapPickedBoxIds([])}
                      />
                    </View>
                    <ScrollView
                      style={styles.trailPickScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {boxes.map((box) => {
                        const bid = Number(box.id);
                        const sel = safePickedBoxIds.includes(bid);
                        return (
                          <TouchableOpacity
                            key={`pick-box-${box.id}`}
                            style={[
                              styles.trailPickRow,
                              sel && styles.trailPickRowActive,
                            ]}
                            onPress={() => {
                              toggleExplorerPickedBox(
                                Number.isFinite(bid) ? bid : box.id
                              );
                            }}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={sel ? "checkbox" : "square-outline"}
                              size={22}
                              color={theme.primary}
                            />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={styles.cardTitle}>{box.title}</Text>
                              <Text style={styles.cardMeta}>
                                {box.city} ·{" "}
                                {(Number(box.price_cents || 0) / 100).toFixed(
                                  2
                                )}{" "}
                                €
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}
                <Text style={styles.fieldLabel}>Lien box ↔ traces</Text>
                <View style={styles.roleRow}>
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      !mapBoxesNearTrailsOnly && styles.roleChipActive,
                    ]}
                    onPress={() => setMapBoxesNearTrailsOnly(false)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        !mapBoxesNearTrailsOnly && styles.roleChipTextActive,
                      ]}
                    >
                      Toutes (liste)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      mapBoxesNearTrailsOnly && styles.roleChipActive,
                    ]}
                    onPress={() => setMapBoxesNearTrailsOnly(true)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        mapBoxesNearTrailsOnly && styles.roleChipTextActive,
                      ]}
                    >
                      Près des tracés
                    </Text>
                  </TouchableOpacity>
                </View>
                {mapBoxesNearTrailsOnly ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Distance max. au tracé (km)"
                      placeholderTextColor={theme.inkMuted}
                      value={mapTrailProximityKm}
                      onChangeText={setMapTrailProximityKm}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.fieldLabel}>Tracés de référence</Text>
                    <View style={styles.roleRow}>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          mapNearTrailsMode === "visible" &&
                            styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearTrailsMode("visible")}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            mapNearTrailsMode === "visible" &&
                              styles.roleChipTextActive,
                          ]}
                        >
                          Tracés visibles
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          mapNearTrailsMode === "picked" &&
                            styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearTrailsMode("picked")}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            mapNearTrailsMode === "picked" &&
                              styles.roleChipTextActive,
                          ]}
                        >
                          Tracés choisis
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {mapNearTrailsMode === "picked" ? (
                      <ScrollView
                        style={styles.trailPickScroll}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {trailsForPickList.map((trail) => {
                          const tid = Number(trail.id);
                          const sel = mapNearTrailPickIds.includes(tid);
                          return (
                            <TouchableOpacity
                              key={`near-pick-tr-${trail.id}`}
                              style={[
                                styles.trailPickRow,
                                sel && styles.trailPickRowActive,
                              ]}
                              onPress={() => {
                                setMapNearTrailPickIds((prev) =>
                                  prev.includes(tid)
                                    ? prev.filter((x) => x !== tid)
                                    : [...prev, tid]
                                );
                              }}
                              activeOpacity={0.85}
                            >
                              <Ionicons
                                name={sel ? "checkbox" : "square-outline"}
                                size={22}
                                color={theme.primary}
                              />
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.cardTitle}>
                                  {trail.name}
                                </Text>
                                <Text style={styles.cardMeta}>
                                  {trail.territory}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        <Text style={styles.fieldLabel}>Trier la liste</Text>
        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
          {[
            { id: "default", label: "Défaut" },
            { id: "rating_desc", label: "Notes ↓" },
            { id: "rating_asc", label: "Notes ↑" },
            { id: "price_asc", label: "Prix ↑" },
            { id: "price_desc", label: "Prix ↓" },
          ].map((opt) => (
            <TouchableOpacity
              key={`box-sort-${opt.id}`}
              style={[
                styles.roleChip,
                mapBoxSort === opt.id && styles.roleChipActive,
              ]}
              onPress={() => setMapBoxSort(opt.id)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  mapBoxSort === opt.id && styles.roleChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <FlatList
          data={prioritizedExplorerBoxes}
          scrollEnabled={false}
          keyExtractor={(item) => `${item.id}`}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                Number(selectedBoxId) === Number(item.id)
                  ? { borderColor: theme.primary, borderWidth: 2 }
                  : null,
              ]}
            >
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View
                style={[
                  styles.selectionPill,
                  safePickedBoxIds.includes(Number(item.id))
                    ? styles.selectionPillActive
                    : styles.selectionPillIdle,
                  Platform.OS === "web"
                    ? {
                        transitionProperty:
                          "transform, box-shadow, background-color",
                        transitionDuration: "160ms",
                        transitionTimingFunction: "ease-out",
                        transform: safePickedBoxIds.includes(Number(item.id))
                          ? "translateY(-1px)"
                          : "translateY(0px)",
                        boxShadow: safePickedBoxIds.includes(Number(item.id))
                          ? "0 6px 12px rgba(20, 184, 166, 0.22)"
                          : "none",
                      }
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.selectionPillText,
                    safePickedBoxIds.includes(Number(item.id))
                      ? styles.selectionPillTextActive
                      : styles.selectionPillTextIdle,
                  ]}
                >
                  {safePickedBoxIds.includes(Number(item.id))
                    ? "Sélectionnée"
                    : "Non sélectionnée"}
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.city} · {(item.price_cents / 100).toFixed(2)} €
                {item.distance_km != null &&
                  ` · ≈ ${Number(item.distance_km).toFixed(1)} km`}
              </Text>
              <Text style={styles.cardAvailability}>
                {formatHostRatingLine(item)}
              </Text>
              <Text style={styles.cardDetailLine}>
                {item.capacity_liters ?? "?"} L · Eau : {boxWaterLabel(item)}
              </Text>
              {parseBoxCriteria(item).length > 0 ? (
                <Text style={styles.cardAvailability} numberOfLines={2}>
                  Critères: {parseBoxCriteria(item).join(" · ")}
                </Text>
              ) : null}
              {item.criteria_note ? (
                <Text style={styles.cardAvailability} numberOfLines={2}>
                  {item.criteria_note}
                </Text>
              ) : null}
              {item.availability_note ? (
                <Text style={styles.cardAvailability} numberOfLines={2}>
                  {item.availability_note}
                </Text>
              ) : null}
              <OutlineButton
                label="Voir sur la carte"
                icon="location-outline"
                stretch
                onPress={() => setSelectedBoxId(item.id)}
              />
              <OutlineButton
                compact
                stretch
                label={
                  safePickedBoxIds.includes(Number(item.id))
                    ? "Retirer de la sélection"
                    : "Ajouter à la sélection"
                }
                icon={
                  safePickedBoxIds.includes(Number(item.id))
                    ? "remove-circle-outline"
                    : "add-circle-outline"
                }
                onPress={() => {
                  const bid = Number(item.id);
                  toggleExplorerPickedBox(bid);
                }}
              />
              {canBook ? (
                <>
                  <Text style={styles.helperText}>
                    Créneau dans « Créneau & demande ». Un récapitulatif et des
                    points de vigilance s’affichent avant l’envoi.
                  </Text>
                  <PrimaryButton
                    compact
                    label="Réserver"
                    icon="checkmark-circle-outline"
                    onPress={() => actionsRef.current.bookBox(item.id)}
                  />
                </>
              ) : null}
            </View>
          )}
        />
      </Section>

      <Section
        title="Liste des traces"
        subtitle="Même ensemble que sur la carte. Sélection et filtres ici."
        icon="navigate-outline"
      >
        <OutlineButton
          compact
          label={
            showTrailFilters
              ? "Masquer filtres traces"
              : "Afficher filtres traces"
          }
          icon={showTrailFilters ? "chevron-up-outline" : "options-outline"}
          onPress={() => setShowTrailFilters((v) => !v)}
        />
        {showTrailFilters ? (
          <>
            <Text style={styles.fieldLabel}>Affichage des traces</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  mapShowTrails && styles.roleChipActive,
                ]}
                onPress={() => setMapShowTrails(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    mapShowTrails && styles.roleChipTextActive,
                  ]}
                >
                  Afficher
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  !mapShowTrails && styles.roleChipActive,
                ]}
                onPress={() => setMapShowTrails(false)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    !mapShowTrails && styles.roleChipTextActive,
                  ]}
                >
                  Masquer
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Portée des traces</Text>
            <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
              {[
                { id: "all", label: "Toutes" },
                ...(user
                  ? [
                      { id: "mine", label: "Les miennes" },
                      { id: "others", label: "Les autres" },
                    ]
                  : []),
                { id: "picked", label: "Sélection…" },
              ].map((opt) => (
                <TouchableOpacity
                  key={`trail-scope-${opt.id}`}
                  style={[
                    styles.roleChip,
                    mapTrailsScope === opt.id && styles.roleChipActive,
                  ]}
                  onPress={() => setMapTrailsScope(opt.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      mapTrailsScope === opt.id && styles.roleChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {mapTrailsScope === "picked" ? (
              <>
                <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                  <OutlineButton
                    compact
                    label="Mes traces (liste)"
                    icon="person-outline"
                    onPress={() => {
                      if (!user?.id) return;
                      const uid = Number(user.id);
                      setMapTrailPickIds(
                        trailsForPickList
                          .filter((tr) => Number(tr.creator_user_id) === uid)
                          .map((tr) => Number(tr.id))
                      );
                    }}
                  />
                  <OutlineButton
                    compact
                    label="Effacer sélection"
                    icon="close-circle-outline"
                    onPress={() => setMapTrailPickIds([])}
                  />
                </View>
                <ScrollView
                  style={styles.trailPickScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {trailsForPickList.map((trail) => {
                    const tid = Number(trail.id);
                    const sel = mapTrailPickIds.includes(tid);
                    const mine =
                      user && Number(trail.creator_user_id) === Number(user.id);
                    return (
                      <TouchableOpacity
                        key={`pick-tr-${trail.id}`}
                        style={[
                          styles.trailPickRow,
                          sel && styles.trailPickRowActive,
                        ]}
                        onPress={() => {
                          toggleExplorerPickedTrail(tid);
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={sel ? "checkbox" : "square-outline"}
                          size={22}
                          color={theme.primary}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.cardTitle}>{trail.name}</Text>
                          <Text style={styles.cardMeta}>
                            {trail.territory} ·{" "}
                            {DIFFICULTY_LABELS[trail.difficulty] ||
                              trail.difficulty}
                            {mine ? " · Mienne" : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
            <Text style={styles.helperText}>
              Précision automatique par zoom : plus tu zoomes, plus la liste des
              traces se réduit à la zone visible de la carte.
            </Text>
            <Text style={styles.fieldLabel}>Difficulté</Text>
            <View style={styles.roleRow}>
              {["all", "easy", "medium", "hard"].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.roleChip,
                    mapTrailDifficultyFilter === d && styles.roleChipActive,
                  ]}
                  onPress={() => setMapTrailDifficultyFilter(d)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      mapTrailDifficultyFilter === d &&
                        styles.roleChipTextActive,
                    ]}
                  >
                    {d === "all" ? "Tous" : DIFFICULTY_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.fieldLabel}>Trier la liste</Text>
        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
          {[
            { id: "default", label: "Défaut" },
            { id: "distance_desc", label: "Distance ↓" },
            { id: "distance_asc", label: "Distance ↑" },
            { id: "elevation_desc", label: "D+ ↓" },
            { id: "elevation_asc", label: "D+ ↑" },
            { id: "difficulty_easy", label: "Facile d’abord" },
            { id: "difficulty_hard", label: "Difficile d’abord" },
          ].map((opt) => (
            <TouchableOpacity
              key={`trail-sort-${opt.id}`}
              style={[
                styles.roleChip,
                mapTrailListSort === opt.id && styles.roleChipActive,
              ]}
              onPress={() => setMapTrailListSort(opt.id)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  mapTrailListSort === opt.id && styles.roleChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!mapShowTrails ? (
          <Text style={styles.emptyText}>
            Active « Afficher » dans « Tracés sur la carte » pour voir les
            tracés ici.
          </Text>
        ) : (
          <FlatList
            data={prioritizedExplorerTrails}
            scrollEnabled={false}
            keyExtractor={(item) => `trail-li-${item.id}`}
            renderItem={({ item: trail }) => {
              const mine =
                user && Number(trail.creator_user_id) === Number(user.id);
              const tid = Number(trail.id);
              const isPicked = mapTrailPickIds.includes(tid);
              return (
                <View
                  style={[
                    styles.card,
                    isPicked || Number(selectedTrailId) === tid
                      ? { borderColor: theme.primary, borderWidth: 2 }
                      : null,
                  ]}
                >
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardTitle}>{trail.name}</Text>
                  <View
                    style={[
                      styles.selectionPill,
                      isPicked
                        ? styles.selectionPillActive
                        : styles.selectionPillIdle,
                      Platform.OS === "web"
                        ? {
                            transitionProperty:
                              "transform, box-shadow, background-color",
                            transitionDuration: "160ms",
                            transitionTimingFunction: "ease-out",
                            transform: isPicked
                              ? "translateY(-1px)"
                              : "translateY(0px)",
                            boxShadow: isPicked
                              ? "0 6px 12px rgba(20, 184, 166, 0.22)"
                              : "none",
                          }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectionPillText,
                        isPicked
                          ? styles.selectionPillTextActive
                          : styles.selectionPillTextIdle,
                      ]}
                    >
                      {isPicked ? "Sélectionnée" : "Non sélectionnée"}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {trail.territory} · {trail.distance_km} km · D+
                    {trail.elevation_m ?? 0} m ·{" "}
                    {DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty}
                    {mine ? " · Mienne" : ""}
                  </Text>
                  {trail.notes ? (
                    <Text style={styles.cardAvailability} numberOfLines={2}>
                      {trail.notes}
                    </Text>
                  ) : null}
                  <OutlineButton
                    label="Voir sur la carte"
                    icon="location-outline"
                    stretch
                    onPress={() =>
                      actionsRef.current.centerMapOnTrail(trail.id)
                    }
                  />
                  <Text style={styles.helperText}>
                    Recentre la carte sur le tracé (centre approximatif du GPX).
                  </Text>
                  <PrimaryButton
                    compact
                    label="Cette trace seule (filtre)"
                    icon="filter-outline"
                    onPress={() =>
                      actionsRef.current.isolateTrailOnMap(trail.id)
                    }
                  />
                  <OutlineButton
                    compact
                    stretch
                    label={
                      isPicked
                        ? "Retirer de la sélection"
                        : "Ajouter à la sélection"
                    }
                    icon={
                      isPicked ? "remove-circle-outline" : "add-circle-outline"
                    }
                    onPress={() => toggleExplorerPickedTrail(tid)}
                  />
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Aucune trace avec les filtres actuels.
              </Text>
            }
          />
        )}
      </Section>
    </>
  );

  if (webSplit) {
    if (webDesktopSplit) {
      return (
        <SafeAreaView style={styles.screen} edges={["left", "right"]}>
          <View style={styles.explorerWebSplitRow}>
            <View style={styles.explorerWebPanel}>
              <ScrollView
                style={styles.explorerWebPanelScroll}
                contentContainerStyle={styles.explorerWebPanelContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {explorerScrollContent}
              </ScrollView>
            </View>
            <View style={styles.explorerWebMapPane}>
              <View
                style={[
                  styles.explorerWebMapHost,
                  styles.explorerWebMapHostDesktop,
                ]}
              >
                <Text style={styles.webMapPaneCaption}>
                  Carte — molette : zoom · glisser : déplacer
                </Text>
                <View
                  style={[
                    styles.explorerWebMapInner,
                    styles.explorerWebMapInnerDesktop,
                  ]}
                >
                  <ExplorerWebMap
                    center={webMapCenter}
                    boxes={boxesOnMap}
                    trails={trailsOnMap}
                    selectedTrailIds={mapTrailPickIds}
                    selectedBoxId={selectedBoxId}
                    onSelectBox={focusExplorerBox}
                    onSelectTrail={focusExplorerTrail}
                    onMapLongPress={handleExplorerMapLongPress}
                    onVisibleBoundsChange={setMapViewportBounds}
                    onUserMapGesture={() =>
                      actionsRef.current.markExplorerMapUserGesture?.()
                    }
                    autoFitToData={false}
                    followExternalCenter={
                      mapExplorerCameraFollowSearch &&
                      !(mapListSource === "viewport" && selectedBoxId == null)
                    }
                    recenterNonce={mapExplorerRecenterNonce}
                    staticOrigin={API_STATIC_ORIGIN}
                    inFixedPane
                  />
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={styles.explorerWebColumn}>
          <ScrollView
            style={styles.explorerWebScroll}
            contentContainerStyle={[
              styles.content,
              WEB_READABLE,
              { paddingBottom: 12 },
            ]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {explorerScrollContent}
          </ScrollView>
          <View style={styles.explorerWebMapHost}>
            <Text style={styles.webMapPaneCaption}>
              Carte — molette : zoom · glisser : déplacer
            </Text>
            <View style={styles.explorerWebMapInner}>
              <ExplorerWebMap
                center={webMapCenter}
                boxes={boxesOnMap}
                trails={trailsOnMap}
                selectedTrailIds={mapTrailPickIds}
                selectedBoxId={selectedBoxId}
                onSelectBox={focusExplorerBox}
                onSelectTrail={focusExplorerTrail}
                onMapLongPress={handleExplorerMapLongPress}
                onVisibleBoundsChange={setMapViewportBounds}
                onUserMapGesture={() =>
                  actionsRef.current.markExplorerMapUserGesture?.()
                }
                autoFitToData={false}
                followExternalCenter={
                  mapExplorerCameraFollowSearch &&
                  !(mapListSource === "viewport" && selectedBoxId == null)
                }
                recenterNonce={mapExplorerRecenterNonce}
                staticOrigin={API_STATIC_ORIGIN}
                inFixedPane
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.content,
          WEB_READABLE,
          { paddingBottom: TABBAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {explorerScrollContent}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrailsScreen() {
  const {
    trails,
    mapLat,
    mapLon,
    webDropHover,
    setWebDropHover,
    user,
    mapShowTrails,
    setMapShowTrails,
    mapTrailDifficultyFilter,
    setMapTrailDifficultyFilter,
    mapTrailsScope,
    setMapTrailsScope,
    mapTrailPickIds,
    setMapTrailPickIds,
    selectedTrailId,
    setSelectedTrailId,
    actionsRef,
  } = useAppMain();

  const webGpxInputRef = useRef(null);

  useEffect(() => {
    actionsRef.current.loadTrails();
  }, [actionsRef]);

  const myTrails = useMemo(() => {
    if (user?.id == null) return [];
    const uid = Number(user.id);
    return trails.filter((t) => Number(t.creator_user_id) === uid);
  }, [trails, user?.id]);

  const tracesFiltered = useMemo(() => {
    const uid = user?.id != null ? Number(user.id) : null;
    let list = trails;
    if (mapTrailsScope === "mine" && uid != null) {
      list = list.filter((t) => Number(t.creator_user_id) === uid);
    } else if (mapTrailsScope === "others" && uid != null) {
      list = list.filter((t) => Number(t.creator_user_id) !== uid);
    } else if (mapTrailsScope === "picked") {
      const set = new Set(
        (mapTrailPickIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );
      list = list.filter((t) => set.has(Number(t.id)));
    }
    if (mapTrailDifficultyFilter !== "all") {
      list = list.filter((t) => t.difficulty === mapTrailDifficultyFilter);
    }
    return list;
  }, [
    trails,
    user?.id,
    mapTrailsScope,
    mapTrailPickIds,
    mapTrailDifficultyFilter,
  ]);

  const allSelectableTrails = useMemo(() => {
    const uid = user?.id != null ? Number(user.id) : null;
    if (mapTrailsScope === "mine" && uid != null) {
      return trails.filter((t) => Number(t.creator_user_id) === uid);
    }
    if (mapTrailsScope === "others" && uid != null) {
      return trails.filter((t) => Number(t.creator_user_id) !== uid);
    }
    return trails;
  }, [trails, user?.id, mapTrailsScope]);
  const prioritizedTracesFiltered = useMemo(() => {
    if (selectedTrailId == null) return tracesFiltered;
    const sid = Number(selectedTrailId);
    const list = Array.isArray(tracesFiltered) ? [...tracesFiltered] : [];
    list.sort((a, b) => {
      const aSel = Number(a.id) === sid ? 1 : 0;
      const bSel = Number(b.id) === sid ? 1 : 0;
      return bSel - aSel;
    });
    return list;
  }, [tracesFiltered, selectedTrailId]);

  const trailsMapList = useMemo(
    () => (mapShowTrails ? tracesFiltered : []),
    [mapShowTrails, tracesFiltered]
  );

  const togglePickedTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      setSelectedTrailId(tid);
      setMapTrailPickIds((prev) =>
        prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
      );
    },
    [setMapTrailPickIds, setSelectedTrailId]
  );
  const trailsSelectionLock = mapTrailPickIds.length > 0;
  const handleTrailsMapLongPress = useCallback(
    (lat, lng) => {
      const plat = Number(lat);
      const plng = Number(lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
      let nearestTrail = null;
      let nearestTrailDistKm = Infinity;
      for (const trail of trailsMapList) {
        const d = minDistanceKmPointToTrail(trail, plat, plng);
        if (d < nearestTrailDistKm) {
          nearestTrailDistKm = d;
          nearestTrail = trail;
        }
      }
      if (!nearestTrail || nearestTrailDistKm > 0.12) return;
      const tid = Number(nearestTrail.id);
      setSelectedTrailId(tid);
      if (mapTrailPickIds.includes(tid) && trailsSelectionLock) return;
      setMapTrailsScope("picked");
      togglePickedTrail(tid);
    },
    [
      trailsMapList,
      mapTrailPickIds,
      trailsSelectionLock,
      setSelectedTrailId,
      setMapTrailsScope,
      togglePickedTrail,
    ]
  );

  const webDropProps =
    Platform.OS === "web"
      ? {
          onDragEnter: (e) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            setWebDropHover(true);
          },
          onDragOver: (e) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            setWebDropHover(true);
          },
          onDragLeave: (e) => {
            e.preventDefault?.();
            setWebDropHover(false);
          },
          onDrop: (e) => {
            e.preventDefault?.();
            e.stopPropagation?.();
            setWebDropHover(false);
            const dt = e?.dataTransfer ?? e?.nativeEvent?.dataTransfer;
            const f = dt?.files?.[0];
            actionsRef.current.uploadGpxWebFile(f);
          },
        }
      : {};
  const webDropZoneStyle = {
    marginTop: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: webDropHover ? theme.primary : theme.border,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 118,
    backgroundColor: webDropHover ? "#ECFDF5" : "#F7FAF9",
    boxShadow: webDropHover
      ? "0 10px 26px rgba(15, 118, 110, 0.18)"
      : "0 6px 16px rgba(15, 23, 42, 0.08)",
    transition: "all 140ms ease-out",
  };

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.content,
          WEB_READABLE,
          { paddingBottom: TABBAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        keyboardShouldPersistTaps="handled"
      >
        <Section
          title="Traces locales"
          subtitle="Athlètes et hôtes : importez vos GPX. Tracés visibles sur la carte (web et appli)."
          icon="footsteps-outline"
        >
          {Platform.OS === "web" ? (
            <>
              {React.createElement("input", {
                ref: webGpxInputRef,
                type: "file",
                accept: ".gpx,application/gpx+xml",
                style: {
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                  overflow: "hidden",
                  clip: "rect(0,0,0,0)",
                },
                onChange: (ev) => {
                  const f = ev.target?.files?.[0];
                  ev.target.value = "";
                  if (f) actionsRef.current.uploadGpxWebFile(f);
                },
              })}
              {React.createElement(
                "div",
                {
                  style: webDropZoneStyle,
                  ...webDropProps,
                },
                <Ionicons
                  name="cloud-upload-outline"
                  size={28}
                  color={theme.primary}
                />,
                <Text style={styles.dropZoneText}>
                  Glisse-depose ton fichier GPX ici
                </Text>,
                <Text style={styles.dropZoneHint}>
                  Depose le fichier ou utilise le bouton d'import juste dessous
                </Text>
              )}
            </>
          ) : null}
          <View style={styles.localGpxHintCard}>
            <View style={styles.localGpxHintTitleRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={theme.primary}
              />
              <Text style={[styles.localGpxHintTitle, { marginLeft: 6 }]}>
                Import rapide
              </Text>
            </View>
            <Text style={styles.localGpxHintText}>
              Les filtres juste en dessous pilotent automatiquement cette liste
              et la carte.
            </Text>
            <SecondaryButton
              label="Importer un GPX"
              icon="cloud-upload-outline"
              onPress={() =>
                Platform.OS === "web"
                  ? webGpxInputRef.current?.click?.()
                  : actionsRef.current.uploadGpx()
              }
            />
          </View>
        </Section>

        <Section
          title="Filtres traces"
          subtitle="Même logique que l’onglet Carte (partie traces)."
          icon="options-outline"
        >
          <Text style={styles.fieldLabel}>
            Affichage des traces sur la carte
          </Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleChip, mapShowTrails && styles.roleChipActive]}
              onPress={() => setMapShowTrails(true)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  mapShowTrails && styles.roleChipTextActive,
                ]}
              >
                Afficher
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleChip, !mapShowTrails && styles.roleChipActive]}
              onPress={() => setMapShowTrails(false)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  !mapShowTrails && styles.roleChipTextActive,
                ]}
              >
                Masquer
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Source traces</Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {[
              { id: "all", label: "Toutes" },
              ...(user
                ? [
                    { id: "mine", label: "Les miennes" },
                    { id: "others", label: "Les autres" },
                  ]
                : []),
              { id: "picked", label: "Sélection…" },
            ].map((opt) => (
              <TouchableOpacity
                key={`trail-scope-${opt.id}`}
                style={[
                  styles.roleChip,
                  mapTrailsScope === opt.id && styles.roleChipActive,
                ]}
                onPress={() => setMapTrailsScope(opt.id)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    mapTrailsScope === opt.id && styles.roleChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Difficulté</Text>
          <View style={styles.roleRow}>
            {["all", "easy", "medium", "hard"].map((d) => (
              <TouchableOpacity
                key={`trail-diff-${d}`}
                style={[
                  styles.roleChip,
                  mapTrailDifficultyFilter === d && styles.roleChipActive,
                ]}
                onPress={() => setMapTrailDifficultyFilter(d)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    mapTrailDifficultyFilter === d && styles.roleChipTextActive,
                  ]}
                >
                  {d === "all" ? "Tous" : DIFFICULTY_LABELS[d]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mapTrailsScope === "picked" ? (
            <>
              <Text style={styles.fieldLabel}>Traces sélectionnées</Text>
              {allSelectableTrails.map((trail) => {
                const tid = Number(trail.id);
                const isPicked = mapTrailPickIds.includes(tid);
                return (
                  <TouchableOpacity
                    key={`trace-pick-${trail.id}`}
                    style={styles.card}
                    onPress={() => togglePickedTrail(tid)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardAccent} />
                    <Text style={styles.cardTitle}>{trail.name}</Text>
                    <Text style={styles.cardMeta}>
                      {trail.territory} · {trail.distance_km} km
                    </Text>
                    <Text style={styles.cardAvailability}>
                      {isPicked ? "Sélectionnée" : "Non sélectionnée"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </Section>

        <Section
          title="Carte des traces"
          subtitle="La sélection hors carte s'affiche ici en surbrillance."
          icon="map-outline"
        >
          {Platform.OS === "web" ? (
            <ExplorerWebMap
              center={[
                parseFloat(mapLat) || 45.8992,
                parseFloat(mapLon) || 6.1294,
              ]}
              boxes={[]}
              trails={trailsMapList}
              selectedTrailIds={mapTrailPickIds}
              selectedBoxId={null}
              onSelectBox={() => {}}
              onSelectTrail={(id) => setSelectedTrailId(id)}
              onMapLongPress={handleTrailsMapLongPress}
              followExternalCenter={false}
              autoFitToData
              staticOrigin={API_STATIC_ORIGIN}
            />
          ) : (
            <NativeExplorerMap
              center={[
                parseFloat(mapLat) || 45.8992,
                parseFloat(mapLon) || 6.1294,
              ]}
              boxes={[]}
              trails={trailsMapList}
              selectedTrailIds={mapTrailPickIds}
              selectedBoxId={null}
              onSelectBox={() => {}}
              onSelectTrail={(id) => setSelectedTrailId(id)}
              onMapLongPress={handleTrailsMapLongPress}
              followExternalCenter={false}
            />
          )}
        </Section>

        <Section
          title="Liste des traces"
          subtitle="Sélectionne une ou plusieurs traces : surbrillance carte + affichage selon filtres."
          icon="list-outline"
        >
          {user && myTrails.length > 0 ? (
            <View style={{ marginBottom: 12 }}>
              <OutlineButton
                danger
                stretch
                label="Supprimer toutes mes traces"
                icon="trash-outline"
                onPress={() => actionsRef.current.deleteAllMyTrails()}
              />
            </View>
          ) : null}
          {prioritizedTracesFiltered.map((trail) => {
            const isMine =
              user?.id != null &&
              Number(trail.creator_user_id) === Number(user.id);
            const tid = Number(trail.id);
            const isPicked = mapTrailPickIds.includes(tid);
            const b = difficultyBadgeStyle(trail.difficulty);
            return (
              <SwipeActionRow
                key={`trail-list-${trail.id}`}
                onDelete={
                  isMine
                    ? () => actionsRef.current.deleteTrail(trail.id, trail.name)
                    : undefined
                }
                deleteLabel="Supprimer"
              >
                <View
                  style={[
                    styles.card,
                    isPicked || Number(selectedTrailId) === tid
                      ? { borderColor: theme.primary, borderWidth: 2 }
                      : null,
                  ]}
                >
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardTitle}>{trail.name}</Text>
                  <View
                    style={[
                      styles.selectionPill,
                      isPicked
                        ? styles.selectionPillActive
                        : styles.selectionPillIdle,
                      Platform.OS === "web"
                        ? {
                            transitionProperty:
                              "transform, box-shadow, background-color",
                            transitionDuration: "160ms",
                            transitionTimingFunction: "ease-out",
                            transform: isPicked
                              ? "translateY(-1px)"
                              : "translateY(0px)",
                            boxShadow: isPicked
                              ? "0 6px 12px rgba(20, 184, 166, 0.22)"
                              : "none",
                          }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectionPillText,
                        isPicked
                          ? styles.selectionPillTextActive
                          : styles.selectionPillTextIdle,
                      ]}
                    >
                      {isPicked ? "Sélectionnée" : "Non sélectionnée"}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {trail.territory} · {trail.distance_km} km · D+{" "}
                    {trail.elevation_m} m{isMine ? " · Mienne" : ""}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: b.bg, borderColor: b.border },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: b.fg }]}>
                      {DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty}
                    </Text>
                  </View>
                  <OutlineButton
                    stretch
                    label={
                      isPicked
                        ? "Retirer de la sélection"
                        : "Ajouter à la sélection"
                    }
                    icon={
                      isPicked ? "remove-circle-outline" : "add-circle-outline"
                    }
                    onPress={() => {
                      setMapTrailsScope("picked");
                      togglePickedTrail(tid);
                    }}
                  />
                  {absoluteUploadUrl(trail.gpx_url) ? (
                    <OutlineButton
                      stretch
                      label="Ouvrir / télécharger GPX"
                      icon="download-outline"
                      onPress={() =>
                        Linking.openURL(absoluteUploadUrl(trail.gpx_url))
                      }
                    />
                  ) : null}
                </View>
              </SwipeActionRow>
            );
          })}
          {tracesFiltered.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune trace avec les filtres actuels.
            </Text>
          ) : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function HostScreen() {
  const {
    user,
    hostForm,
    setHostForm,
    hostEditingBoxId,
    hostReverseGeocode,
    setHostReverseGeocode,
    hostBoxes,
    hostRefunds,
    actionsRef,
  } = useAppMain();
  const canHostLocal = user?.role === "host" || user?.role === "both";
  const isFocused = useIsFocused();
  const scrollRef = useRef(null);
  const hostLat = Number(hostForm.latitude) || 45.8992;
  const hostLon = Number(hostForm.longitude) || 6.1294;
  const [hostMapSelectedBoxId, setHostMapSelectedBoxId] = useState(null);
  const [hostMapShowBoxes, setHostMapShowBoxes] = useState(true);
  const [hostMapSelectionMode, setHostMapSelectionMode] = useState("all");
  const [hostPickedBoxIds, setHostPickedBoxIds] = useState([]);

  const toggleHostPickedBox = useCallback((boxId) => {
    const bid = Number(boxId);
    if (!Number.isFinite(bid)) return;
    setHostPickedBoxIds((prev) =>
      prev.includes(bid) ? prev.filter((id) => id !== bid) : [...prev, bid]
    );
  }, []);
  const selectedHostMapBox = useMemo(
    () =>
      hostBoxes.find((b) => Number(b.id) === Number(hostMapSelectedBoxId)) ||
      null,
    [hostBoxes, hostMapSelectedBoxId]
  );
  const hostBoxesForMap = useMemo(() => {
    if (!hostMapShowBoxes) return [];
    if (hostMapSelectionMode !== "picked") return hostBoxes;
    const set = new Set(hostPickedBoxIds.map((id) => Number(id)));
    return hostBoxes.filter((b) => set.has(Number(b.id)));
  }, [hostMapShowBoxes, hostMapSelectionMode, hostPickedBoxIds, hostBoxes]);
  const hostSelectionLock = hostPickedBoxIds.length > 0;
  const handleHostMapLongPress = useCallback(
    (lat, lng) => {
      const plat = Number(lat);
      const plng = Number(lng);
      if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
      let nearestBox = null;
      let nearestDist = Infinity;
      for (const box of hostBoxesForMap) {
        const bLat = Number(box.latitude);
        const bLng = Number(box.longitude);
        if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
        const d = haversineKm(plat, plng, bLat, bLng);
        if (d < nearestDist) {
          nearestDist = d;
          nearestBox = box;
        }
      }
      if (!nearestBox || nearestDist > 0.12) return;
      const bid = Number(nearestBox.id);
      setHostMapSelectedBoxId(bid);
      if (hostPickedBoxIds.includes(bid) && hostSelectionLock) return;
      setHostMapSelectionMode("picked");
      toggleHostPickedBox(bid);
    },
    [
      hostBoxesForMap,
      hostPickedBoxIds,
      hostSelectionLock,
      setHostMapSelectedBoxId,
      setHostMapSelectionMode,
      toggleHostPickedBox,
    ]
  );

  const prioritizedHostBoxes = useMemo(() => {
    if (hostMapSelectedBoxId == null) return hostBoxes;
    const sid = Number(hostMapSelectedBoxId);
    const list = Array.isArray(hostBoxes) ? [...hostBoxes] : [];
    list.sort((a, b) => {
      const aSel = Number(a.id) === sid ? 1 : 0;
      const bSel = Number(b.id) === sid ? 1 : 0;
      return bSel - aSel;
    });
    return list;
  }, [hostBoxes, hostMapSelectedBoxId]);

  useEffect(() => {
    if (!canHostLocal || !isFocused) return;
    actionsRef.current.loadHostBoxes();
    actionsRef.current.loadHostRefunds?.();
    return undefined;
  }, [canHostLocal, isFocused, actionsRef]);

  useEffect(() => {
    if (hostEditingBoxId == null) return;
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }, [hostEditingBoxId]);

  useEffect(() => {
    setHostPickedBoxIds((prev) =>
      prev.filter((id) => hostBoxes.some((b) => Number(b.id) === Number(id)))
    );
    setHostMapSelectedBoxId((prev) =>
      prev != null && hostBoxes.some((b) => Number(b.id) === Number(prev))
        ? prev
        : null
    );
  }, [hostBoxes]);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.content,
          WEB_READABLE,
          { paddingBottom: TABBAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        keyboardShouldPersistTaps="handled"
      >
        <Section
          title="Publier un box"
          subtitle="Accueille des sportifs et propose ton point ravito."
          icon="storefront-outline"
        >
          {!canHostLocal ? (
            <View style={styles.infoBanner}>
              <Ionicons
                name="lock-closed-outline"
                size={22}
                color={theme.primary}
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoBannerTitle}>Rôle hôte requis</Text>
                <Text style={styles.infoBannerText}>
                  Passe en « Hôte » ou « Les deux » depuis ton profil (nouveau
                  compte) pour publier.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {hostEditingBoxId != null ? (
                <View style={[styles.infoBanner, { marginBottom: 10 }]}>
                  <Ionicons
                    name="create-outline"
                    size={22}
                    color={theme.primary}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoBannerTitle}>
                      Modification du box n°{hostEditingBoxId}
                    </Text>
                    <Text style={styles.infoBannerText}>
                      Ajuste les champs puis enregistre, ou annule pour revenir
                      à un nouveau box vierge.
                    </Text>
                    <OutlineButton
                      label="Annuler la modification"
                      icon="close-circle-outline"
                      compact
                      onPress={() => actionsRef.current.cancelHostBoxEdit()}
                    />
                  </View>
                </View>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Titre du box"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.title}
                onChangeText={(v) => setHostForm((s) => ({ ...s, title: v }))}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description du box : présentation, accès, consignes… (un seul champ texte)"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.description}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, description: v }))
                }
                multiline
              />
              <Text style={styles.fieldLabel}>Disponibilités</Text>
              <TextInput
                style={styles.input}
                placeholder="Disponibilités (ex: week-end matin)"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.availabilityNote}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, availabilityNote: v }))
                }
                multiline
              />
              <Text style={styles.fieldLabel}>Localisation</Text>
              <Text style={styles.helperText}>
                Place le point sur la carte ou saisis les coordonnées : la ville
                est proposée automatiquement (tu peux la corriger).
              </Text>
              {Platform.OS === "web" ? (
                <View style={{ marginTop: 8, marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>
                    Carte — clique précisément (zoom max si besoin)
                  </Text>
                  <ExplorerWebMap
                    center={[hostLat, hostLon]}
                    boxes={[]}
                    trails={[]}
                    onSelectBox={() => {}}
                    onPickLocation={(lat, lng) =>
                      actionsRef.current.setHostLocationFromMap(lat, lng)
                    }
                    draftPoint={[hostLat, hostLon]}
                    pickerMode
                    inFixedPane={false}
                  />
                </View>
              ) : null}
              <Text style={styles.inputLabel}>Coordonnées GPS</Text>
              <TextInput
                style={styles.input}
                placeholder="Latitude"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.latitude}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, latitude: v }))
                }
                keyboardType="decimal-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="Longitude"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.longitude}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, longitude: v }))
                }
                keyboardType="decimal-pad"
              />
              <Text style={styles.helperText}>
                Position enregistrée : {hostLat.toFixed(6)},{" "}
                {hostLon.toFixed(6)}
              </Text>
              <OutlineButton
                label="Utiliser cette position comme centre de l’onglet Carte"
                icon="locate-outline"
                stretch
                onPress={() => actionsRef.current.syncExplorerMapFromHost()}
              />
              <Text style={styles.inputLabel}>Ville (base de données)</Text>
              {hostReverseGeocode.status === "loading" ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.helperText, { marginLeft: 10 }]}>
                    Recherche du lieu à partir des coordonnées…
                  </Text>
                </View>
              ) : null}
              {hostReverseGeocode.message ? (
                <Text
                  style={[
                    styles.helperText,
                    {
                      color:
                        hostReverseGeocode.status === "error"
                          ? "#B91C1C"
                          : "#92400E",
                      marginBottom: 8,
                    },
                  ]}
                >
                  {hostReverseGeocode.message}
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Remplie automatiquement depuis le point bleu"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.city}
                onChangeText={(v) => {
                  setHostReverseGeocode({ status: "idle", message: "" });
                  setHostForm((s) => ({ ...s, city: v }));
                }}
              />
              <Text style={styles.fieldLabel}>
                Prix par réservation (centimes)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 700 = 7,00 €"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.priceCents}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, priceCents: v }))
                }
                keyboardType="number-pad"
              />
              <Text style={styles.fieldLabel}>Code d'accès de ton box</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 458912 (modifiable par l'hôte)"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.accessCode}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, accessCode: v }))
                }
              />
              <Text style={styles.fieldLabel}>Type d'accès</Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                {[
                  { id: "manual_meetup", label: "Remise en main propre" },
                  { id: "padlock_code", label: "Code cadenas manuel" },
                  { id: "digital_code", label: "Code digital temporaire" },
                  { id: "key_lockbox", label: "Boîte à clé" },
                ].map((opt) => (
                  <TouchableOpacity
                    key={`access-method-${opt.id}`}
                    style={[
                      styles.roleChip,
                      hostForm.accessMethod === opt.id && styles.roleChipActive,
                    ]}
                    onPress={() =>
                      setHostForm((s) => ({ ...s, accessMethod: opt.id }))
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        hostForm.accessMethod === opt.id &&
                          styles.roleChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Instructions d'accès</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Ex: rendez-vous devant la porte nord, code du cadenas, consignes..."
                placeholderTextColor={theme.inkMuted}
                value={hostForm.accessInstructions}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, accessInstructions: v }))
                }
                multiline
              />
              <Text style={styles.fieldLabel}>
                Fenêtre d'affichage des infos d'accès (minutes)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Avant début (ex: 15)"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.accessDisplayBeforeMin}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, accessDisplayBeforeMin: v }))
                }
                keyboardType="number-pad"
              />
              <TextInput
                style={styles.input}
                placeholder="Après fin (ex: 15)"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.accessDisplayAfterMin}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, accessDisplayAfterMin: v }))
                }
                keyboardType="number-pad"
              />
              <Text style={styles.fieldLabel}>Capacité totale (litres)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 20"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.capacityLiters}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, capacityLiters: v }))
                }
                keyboardType="number-pad"
              />
              <Text style={styles.fieldLabel}>Eau disponible ?</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    hostForm.hasWater && styles.roleChipActive,
                  ]}
                  onPress={() => setHostForm((s) => ({ ...s, hasWater: true }))}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      hostForm.hasWater && styles.roleChipTextActive,
                    ]}
                  >
                    Oui
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    !hostForm.hasWater && styles.roleChipActive,
                  ]}
                  onPress={() =>
                    setHostForm((s) => ({ ...s, hasWater: false }))
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      !hostForm.hasWater && styles.roleChipTextActive,
                    ]}
                  >
                    Non
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Critères disponibles</Text>
              <View style={styles.roleRow}>
                {HOST_CRITERIA_OPTIONS.map((label) => {
                  const active = hostForm.criteriaTags.includes(label);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.roleChip, active && styles.roleChipActive]}
                      onPress={() =>
                        setHostForm((s) => ({
                          ...s,
                          criteriaTags: active
                            ? s.criteriaTags.filter((c) => c !== label)
                            : [...s.criteriaTags, label],
                        }))
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          active && styles.roleChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <PrimaryButton
                compact
                label={
                  hostEditingBoxId != null
                    ? "Enregistrer les modifications"
                    : "Publier mon box"
                }
                icon={
                  hostEditingBoxId != null ? "save-outline" : "rocket-outline"
                }
                onPress={() => actionsRef.current.createHostBox()}
              />
            </>
          )}
        </Section>
        {canHostLocal ? (
          <Section
            title="Mes box actives"
            subtitle="Glisse une ligne vers la gauche pour modifier ou supprimer."
            icon="layers-outline"
          >
            <Text style={styles.fieldLabel}>Affichage carte</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  hostMapShowBoxes && styles.roleChipActive,
                ]}
                onPress={() => setHostMapShowBoxes(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    hostMapShowBoxes && styles.roleChipTextActive,
                  ]}
                >
                  Afficher
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  !hostMapShowBoxes && styles.roleChipActive,
                ]}
                onPress={() => setHostMapShowBoxes(false)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    !hostMapShowBoxes && styles.roleChipTextActive,
                  ]}
                >
                  Masquer
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Source boxes sur carte</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  hostMapSelectionMode === "all" && styles.roleChipActive,
                ]}
                onPress={() => setHostMapSelectionMode("all")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    hostMapSelectionMode === "all" && styles.roleChipTextActive,
                  ]}
                >
                  Toutes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  hostMapSelectionMode === "picked" && styles.roleChipActive,
                ]}
                onPress={() => setHostMapSelectionMode("picked")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    hostMapSelectionMode === "picked" &&
                      styles.roleChipTextActive,
                  ]}
                >
                  Sélection…
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.explorerSelectionSummary}>
              <Text style={styles.explorerSelectionSummaryText}>
                Sélection active : {hostPickedBoxIds.length} box
                {hostPickedBoxIds.length > 1 ? "s" : ""}
              </Text>
              <Text style={styles.explorerSelectionSummaryHint}>
                Appui court carte = focus. Appui long = sélection. Verrou
                sélection actif automatiquement dès qu'au moins 1 box est
                sélectionnée.
              </Text>
            </View>
            {hostBoxes.length > 0 ? (
              Platform.OS === "web" ? (
                <ExplorerWebMap
                  center={
                    hostMapSelectedBoxId != null
                      ? [
                          Number(
                            hostBoxes.find(
                              (b) =>
                                Number(b.id) === Number(hostMapSelectedBoxId)
                            )?.latitude
                          ) || hostLat,
                          Number(
                            hostBoxes.find(
                              (b) =>
                                Number(b.id) === Number(hostMapSelectedBoxId)
                            )?.longitude
                          ) || hostLon,
                        ]
                      : [hostLat, hostLon]
                  }
                  boxes={hostBoxesForMap}
                  trails={[]}
                  selectedBoxId={hostMapSelectedBoxId}
                  onSelectBox={(id) => {
                    setHostMapSelectedBoxId(id);
                  }}
                  onMapLongPress={handleHostMapLongPress}
                  autoFitToData
                  followExternalCenter={false}
                />
              ) : (
                <NativeExplorerMap
                  center={[hostLat, hostLon]}
                  boxes={hostBoxesForMap}
                  trails={[]}
                  selectedBoxId={hostMapSelectedBoxId}
                  onSelectBox={(id) => {
                    setHostMapSelectedBoxId(id);
                  }}
                  onMapLongPress={handleHostMapLongPress}
                  followExternalCenter={false}
                />
              )
            ) : null}
            {selectedHostMapBox ? (
              <View style={styles.selectedHostCard}>
                <Text style={styles.selectedLabel}>Box sélectionnée</Text>
                <Text style={styles.cardTitle}>{selectedHostMapBox.title}</Text>
                <Text style={styles.cardMeta}>
                  {selectedHostMapBox.city} ·{" "}
                  {(Number(selectedHostMapBox.price_cents || 0) / 100).toFixed(
                    2
                  )}{" "}
                  €
                </Text>
                <Text style={styles.cardDetailLine}>
                  Code d'accès :{" "}
                  {selectedHostMapBox.access_code || "(non défini)"}
                </Text>
              </View>
            ) : null}
            {hostBoxes.length > 0 ? (
              <View style={{ marginBottom: 12, gap: 10 }}>
                <Text style={styles.helperText}>
                  Swipe vers la gauche pour afficher les actions de chaque box.
                </Text>
                <OutlineButton
                  danger
                  stretch
                  label="Supprimer tous mes box"
                  icon="trash-outline"
                  onPress={() => actionsRef.current.deleteAllHostBoxes()}
                />
              </View>
            ) : null}
            {prioritizedHostBoxes.map((box) => (
              <SwipeActionRow
                key={`host-box-${box.id}`}
                onEdit={() => actionsRef.current.startEditingHostBox(box)}
                onDelete={() =>
                  actionsRef.current.deleteHostBox(box.id, box.title)
                }
                editLabel="Modifier"
                deleteLabel="Supprimer"
              >
                <View style={styles.card}>
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardTitle}>{box.title}</Text>
                  <View
                    style={[
                      styles.selectionPill,
                      hostPickedBoxIds.includes(Number(box.id))
                        ? styles.selectionPillActive
                        : styles.selectionPillIdle,
                      Platform.OS === "web"
                        ? {
                            transitionProperty:
                              "transform, box-shadow, background-color",
                            transitionDuration: "160ms",
                            transitionTimingFunction: "ease-out",
                            transform: hostPickedBoxIds.includes(Number(box.id))
                              ? "translateY(-1px)"
                              : "translateY(0px)",
                            boxShadow: hostPickedBoxIds.includes(Number(box.id))
                              ? "0 6px 12px rgba(20, 184, 166, 0.22)"
                              : "none",
                          }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectionPillText,
                        hostPickedBoxIds.includes(Number(box.id))
                          ? styles.selectionPillTextActive
                          : styles.selectionPillTextIdle,
                      ]}
                    >
                      {hostPickedBoxIds.includes(Number(box.id))
                        ? "Sélectionnée"
                        : "Non sélectionnée"}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {box.city} · {(box.price_cents / 100).toFixed(2)} €
                  </Text>
                  <Text style={styles.cardDetailLine}>
                    Code d'accès : {box.access_code || "(non défini)"}
                  </Text>
                  <Text style={styles.cardDetailLine}>
                    {box.capacity_liters ?? "?"} L · Eau : {boxWaterLabel(box)}
                  </Text>
                  {parseBoxCriteria(box).length > 0 ? (
                    <Text style={styles.cardAvailability}>
                      Critères: {parseBoxCriteria(box).join(" · ")}
                    </Text>
                  ) : null}
                  {box.criteria_note ? (
                    <Text style={styles.cardAvailability}>
                      {box.criteria_note}
                    </Text>
                  ) : null}
                  {box.description ? (
                    <Text style={styles.cardAvailability}>
                      {box.description}
                    </Text>
                  ) : null}
                  {box.availability_note ? (
                    <Text style={styles.cardAvailability}>
                      {box.availability_note}
                    </Text>
                  ) : null}
                  <OutlineButton
                    compact
                    stretch
                    label={
                      hostPickedBoxIds.includes(Number(box.id))
                        ? "Retirer de la sélection"
                        : "Ajouter à la sélection"
                    }
                    icon={
                      hostPickedBoxIds.includes(Number(box.id))
                        ? "remove-circle-outline"
                        : "add-circle-outline"
                    }
                    onPress={() => {
                      setHostMapSelectionMode("picked");
                      setHostMapSelectedBoxId(box.id);
                      toggleHostPickedBox(box.id);
                    }}
                  />
                </View>
              </SwipeActionRow>
            ))}
            {hostBoxes.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune box active pour le moment.
              </Text>
            ) : null}
          </Section>
        ) : null}
        {canHostLocal ? (
          <Section
            title="Queue remboursements"
            subtitle="Phase A simulée : remboursements en attente de traitement."
            icon="cash-outline"
          >
            {hostRefunds.map((r) => (
              <View key={`refund-${r.id}`} style={styles.card}>
                <View style={styles.cardAccent} />
                <Text style={styles.cardTitle}>
                  {r.box_title || `Box #${r.box_id || "?"}`}
                </Text>
                <Text style={styles.cardMeta}>
                  {r.athlete_full_name || "Athlète"} ·{" "}
                  {(Number(r.amount_cents || 0) / 100).toFixed(2)} € ·{" "}
                  {r.status === "done" ? "Traité" : "En attente"}
                </Text>
                {r.reason ? (
                  <Text style={styles.cardAvailability}>
                    Motif: {String(r.reason)}
                  </Text>
                ) : null}
                {r.status !== "done" ? (
                  <PrimaryButton
                    compact
                    label="Marquer remboursé"
                    icon="checkmark-circle-outline"
                    onPress={() => actionsRef.current.markRefundDone?.(r.id)}
                  />
                ) : null}
              </View>
            ))}
            {hostRefunds.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun remboursement en attente.
              </Text>
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileScreen() {
  const { user, myReviewsSummary, myReviews, actionsRef } = useAppMain();
  const isFocused = useIsFocused();
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;
  const canEnableBoth = user?.role !== "both";

  useEffect(() => {
    if (!isFocused) return;
    actionsRef.current.loadMyReviews?.();
  }, [isFocused, actionsRef]);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.content,
          WEB_READABLE,
          { paddingBottom: TABBAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        keyboardShouldPersistTaps="handled"
      >
        <Section
          title="Mon profil"
          subtitle="Compte connecté."
          icon="person-outline"
        >
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {(user?.full_name || "?").trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileName}>{user?.full_name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.profileRolePill}>
              <Text style={styles.profileRoleText}>{roleLabel}</Text>
            </View>
          </View>
        </Section>
        <Section
          title="Réputation"
          subtitle="Notes reçues par les autres utilisateurs."
          icon="star-outline"
        >
          <Text style={styles.cardMeta}>
            Note moyenne: {Number(myReviewsSummary?.avg_score || 0).toFixed(2)}{" "}
            / 5{" · "}
            {Number(myReviewsSummary?.count || 0)} avis
          </Text>
          {myReviews.slice(0, 6).map((r) => (
            <View key={`my-review-${r.id}`} style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>{r.score}/5</Text>
              <Text style={styles.cardMeta}>
                {r.reviewer_name || "Utilisateur"} ·{" "}
                {new Date(r.created_at).toLocaleDateString("fr-FR")}
              </Text>
              {r.comment ? (
                <Text style={styles.cardAvailability}>{r.comment}</Text>
              ) : null}
            </View>
          ))}
          {myReviews.length === 0 ? (
            <Text style={styles.emptyText}>Pas encore d'avis reçus.</Text>
          ) : null}
          {user?.id ? (
            <OutlineButton
              compact
              stretch
              label="Voir tous les avis (fenêtre dédiée)"
              icon="open-outline"
              onPress={() =>
                openUserReviews(user.id, "Ma réputation — tous les avis")
              }
            />
          ) : null}
        </Section>
        <PrimaryButton
          label="Rafraîchir la session"
          icon="refresh-outline"
          onPress={() => actionsRef.current.refreshSession()}
        />
        {canEnableBoth ? (
          <PrimaryButton
            label="Activer mode Athlète + Hôte"
            icon="swap-horizontal-outline"
            onPress={() => actionsRef.current.updateMyRole("both")}
          />
        ) : null}
        <SecondaryButton
          label="Se déconnecter"
          icon="log-out-outline"
          onPress={() => actionsRef.current.logout()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ReservationsScreen() {
  const {
    canHost,
    canBook,
    hostBookings,
    athleteBookings,
    notifications,
    openUserReviews,
    actionsRef,
  } = useAppMain();
  const isFocused = useIsFocused();
  const [editingHostBookingId, setEditingHostBookingId] = useState(null);
  const [hostBookingDraft, setHostBookingDraft] = useState({
    bookingDate: "",
    startTime: "",
    endTime: "",
    specialRequest: "",
  });
  const [editingAthleteBookingId, setEditingAthleteBookingId] = useState(null);
  const [athleteBookingDraft, setAthleteBookingDraft] = useState({
    bookingDate: "",
    startTime: "",
    endTime: "",
    specialRequest: "",
  });
  const [reservationTab, setReservationTab] = useState(
    canHost && !canBook ? "host" : "athlete"
  );
  const [notifUnreadOnly, setNotifUnreadOnly] = useState(false);

  useEffect(() => {
    if (canHost && canBook) return;
    if (canHost) {
      setReservationTab("host");
      return;
    }
    if (canBook) {
      setReservationTab("athlete");
    }
  }, [canHost, canBook]);

  useEffect(() => {
    if (!isFocused) return;
    if (canHost) actionsRef.current.loadHostBookings();
    if (canBook) actionsRef.current.loadAthleteBookings();
    actionsRef.current.loadNotifications({ unreadOnly: notifUnreadOnly });
    actionsRef.current.markAllNotificationsRead?.();
    const id = setInterval(() => {
      if (canHost) actionsRef.current.loadHostBookings();
      if (canBook) actionsRef.current.loadAthleteBookings();
      actionsRef.current.loadNotifications({ unreadOnly: notifUnreadOnly });
    }, 12000);
    return () => clearInterval(id);
  }, [canHost, canBook, isFocused, actionsRef, notifUnreadOnly]);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.content,
          WEB_READABLE,
          { paddingBottom: TABBAR_SCROLL_PADDING },
        ]}
        showsVerticalScrollIndicator={Platform.OS === "web"}
        keyboardShouldPersistTaps="handled"
      >
        {canHost && canBook ? (
          <View style={[styles.roleRow, { marginBottom: 8 }]}>
            <TouchableOpacity
              style={[
                styles.roleChip,
                reservationTab === "host" && styles.roleChipActive,
              ]}
              onPress={() => setReservationTab("host")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  reservationTab === "host" && styles.roleChipTextActive,
                ]}
              >
                Reçues (hôte)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.roleChip,
                reservationTab === "athlete" && styles.roleChipActive,
              ]}
              onPress={() => setReservationTab("athlete")}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  reservationTab === "athlete" && styles.roleChipTextActive,
                ]}
              >
                Mes réservations
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {notifications?.length > 0 ? (
          <Section
            title="Notifications"
            subtitle="Mises à jour automatiques liées à tes réservations et box."
            icon="notifications-outline"
          >
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  !notifUnreadOnly && styles.roleChipActive,
                ]}
                onPress={() => setNotifUnreadOnly(false)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    !notifUnreadOnly && styles.roleChipTextActive,
                  ]}
                >
                  Toutes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  notifUnreadOnly && styles.roleChipActive,
                ]}
                onPress={() => setNotifUnreadOnly(true)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    notifUnreadOnly && styles.roleChipTextActive,
                  ]}
                >
                  Non lues
                </Text>
              </TouchableOpacity>
            </View>
            {notifications.slice(0, 6).map((n) => (
              <View key={`notif-${n.id}`} style={styles.card}>
                <View style={styles.cardAccent} />
                <Text style={styles.cardTitle}>
                  {n.title || "Notification"}
                </Text>
                {n.body ? (
                  <Text style={styles.cardAvailability}>{n.body}</Text>
                ) : null}
                {(() => {
                  const data = parseNotificationData(n);
                  if (!data?.before || !data?.after) return null;
                  const changedFields = Array.isArray(data.changedFields)
                    ? data.changedFields
                    : [];
                  return (
                    <Text style={styles.cardAvailability}>
                      Avant: {data.before.city || "?"} ·{" "}
                      {(
                        (Number(data.before.priceCents || 0) || 0) / 100
                      ).toFixed(2)}{" "}
                      €{"\n"}
                      Après: {data.after.city || "?"} ·{" "}
                      {(
                        (Number(data.after.priceCents || 0) || 0) / 100
                      ).toFixed(2)}{" "}
                      €
                      {changedFields.length > 0
                        ? `\nChangements:\n${changedFields
                            .map(
                              (f) => `- ${f.label}: ${f.before} -> ${f.after}`
                            )
                            .join("\n")}`
                        : ""}
                    </Text>
                  );
                })()}
                <Text style={styles.cardMeta}>
                  {new Date(n.created_at).toLocaleString("fr-FR")}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {canHost && reservationTab !== "athlete" ? (
          <Section
            title="Réservations reçues (hôte)"
            subtitle="Accepte ou refuse les demandes des athlètes."
            icon="calendar-outline"
          >
            {editingHostBookingId != null ? (
              <View style={[styles.infoBanner, { marginBottom: 10 }]}>
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={theme.primary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBannerTitle}>
                    Modifier la réservation n°{editingHostBookingId}
                  </Text>
                  <DateTimeSelector
                    dateValue={hostBookingDraft.bookingDate}
                    onDateChange={(v) =>
                      setHostBookingDraft((s) => ({ ...s, bookingDate: v }))
                    }
                    startValue={hostBookingDraft.startTime}
                    onStartChange={(v) =>
                      setHostBookingDraft((s) => ({ ...s, startTime: v }))
                    }
                    endValue={hostBookingDraft.endTime}
                    onEndChange={(v) =>
                      setHostBookingDraft((s) => ({ ...s, endTime: v }))
                    }
                  />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Demande spéciale (optionnel)"
                    placeholderTextColor={theme.inkMuted}
                    value={hostBookingDraft.specialRequest}
                    onChangeText={(v) =>
                      setHostBookingDraft((s) => ({ ...s, specialRequest: v }))
                    }
                    multiline
                  />
                  <OutlineButton
                    stretch
                    label="Enregistrer la réservation"
                    icon="save-outline"
                    onPress={async () => {
                      await actionsRef.current.updateHostBooking(
                        editingHostBookingId,
                        hostBookingDraft
                      );
                      setEditingHostBookingId(null);
                    }}
                  />
                  <OutlineButton
                    compact
                    label="Annuler"
                    icon="close-circle-outline"
                    onPress={() => setEditingHostBookingId(null)}
                  />
                </View>
              </View>
            ) : null}
            {hostBookings.map((b) => {
              const approval = b.approval_status || "pending";
              const changeDraft = parseBookingChangeRequest(b);
              return (
                <SwipeActionRow
                  key={`host-booking-${b.id}`}
                  onEdit={() => {
                    setEditingHostBookingId(b.id);
                    setHostBookingDraft({
                      bookingDate: b.booking_date || "",
                      startTime: b.start_time || "",
                      endTime: b.end_time || "",
                      specialRequest: b.special_request || "",
                    });
                  }}
                  onDelete={() =>
                    actionsRef.current.deleteHostBooking(
                      b.id,
                      b.box_title || `Box #${b.box_id}`
                    )
                  }
                  editLabel="Modifier"
                  deleteLabel="Supprimer"
                >
                  <View style={styles.card}>
                    <View style={styles.cardAccent} />
                    <Text style={styles.cardTitle}>
                      {b.box_title || `Box #${b.box_id}`}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {b.athlete_full_name || "Athlète"} · {b.booking_date}{" "}
                      {b.start_time}-{b.end_time}
                    </Text>
                    <Text style={styles.cardDetailLine}>
                      Statut: {bookingApprovalLabel(approval)} · prix{" "}
                      {(Number(b.amount_cents || 0) / 100).toFixed(2)} € · gain
                      hôte{" "}
                      {(Number(b.host_earnings_cents || 0) / 100).toFixed(2)} €
                    </Text>
                    <Text style={styles.cardDetailLine}>
                      Paiement: {b.payment_status || "simulated_unpaid"} ·
                      remboursement: {b.refund_status || "none"}
                    </Text>
                    {b.special_request ? (
                      <Text style={styles.cardAvailability}>
                        Demande: {b.special_request}
                      </Text>
                    ) : null}
                    {changeDraft ? (
                      <Text style={styles.cardAvailability}>
                        {bookingChangePreviewText(b, changeDraft)}
                      </Text>
                    ) : null}
                    {approval === "pending" ||
                    approval === "pending_host_confirmation" ? (
                      <>
                        <PrimaryButton
                          compact
                          label={
                            approval === "pending"
                              ? "Accepter"
                              : "Valider la modif"
                          }
                          icon="checkmark-outline"
                          onPress={() =>
                            actionsRef.current.decideHostBooking(b.id, "accept")
                          }
                        />
                        <SecondaryButton
                          compact
                          label={
                            approval === "pending"
                              ? "Refuser"
                              : "Refuser la modif"
                          }
                          icon="close-outline"
                          onPress={() =>
                            actionsRef.current.decideHostBooking(b.id, "reject")
                          }
                        />
                      </>
                    ) : null}
                    <OutlineButton
                      compact
                      label="Voir timeline"
                      icon="time-outline"
                      onPress={() =>
                        actionsRef.current.showBookingTimeline(b.id)
                      }
                    />
                    {b.status === "completed" ? (
                      <OutlineButton
                        compact
                        label="Noter l'athlète (5★)"
                        icon="star-outline"
                        onPress={() =>
                          actionsRef.current.submitReview({
                            bookingId: b.id,
                            score: 5,
                            comment: "Athlète recommandé.",
                          })
                        }
                      />
                    ) : null}
                  </View>
                </SwipeActionRow>
              );
            })}
            {hostBookings.length === 0 ? (
              <Text style={styles.emptyText}>Aucune réservation reçue.</Text>
            ) : null}
          </Section>
        ) : null}

        {canBook && reservationTab !== "host" ? (
          <Section
            title="Mes réservations (athlète)"
            subtitle="Tes demandes de box : modifier, supprimer ou tout effacer."
            icon="time-outline"
          >
            {editingAthleteBookingId != null ? (
              <View style={[styles.infoBanner, { marginBottom: 10 }]}>
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={theme.primary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBannerTitle}>
                    Modifier ma réservation n°{editingAthleteBookingId}
                  </Text>
                  <DateTimeSelector
                    dateValue={athleteBookingDraft.bookingDate}
                    onDateChange={(v) =>
                      setAthleteBookingDraft((s) => ({ ...s, bookingDate: v }))
                    }
                    startValue={athleteBookingDraft.startTime}
                    onStartChange={(v) =>
                      setAthleteBookingDraft((s) => ({ ...s, startTime: v }))
                    }
                    endValue={athleteBookingDraft.endTime}
                    onEndChange={(v) =>
                      setAthleteBookingDraft((s) => ({ ...s, endTime: v }))
                    }
                  />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Demande spéciale (optionnel)"
                    placeholderTextColor={theme.inkMuted}
                    value={athleteBookingDraft.specialRequest}
                    onChangeText={(v) =>
                      setAthleteBookingDraft((s) => ({
                        ...s,
                        specialRequest: v,
                      }))
                    }
                    multiline
                  />
                  <OutlineButton
                    stretch
                    label="Enregistrer ma réservation"
                    icon="save-outline"
                    onPress={async () => {
                      await actionsRef.current.updateAthleteBooking(
                        editingAthleteBookingId,
                        athleteBookingDraft
                      );
                      setEditingAthleteBookingId(null);
                    }}
                  />
                  <OutlineButton
                    compact
                    label="Annuler"
                    icon="close-circle-outline"
                    onPress={() => setEditingAthleteBookingId(null)}
                  />
                </View>
              </View>
            ) : null}
            {athleteBookings.length > 0 ? (
              <SecondaryButton
                label="Effacer tout mon historique de réservations"
                icon="trash-outline"
                onPress={() => actionsRef.current.deleteAllAthleteBookings()}
              />
            ) : null}
            {athleteBookings.map((b) => {
              const approval = b.approval_status || "pending";
              const changeDraft = parseBookingChangeRequest(b);
              const showAccess = canShowBookingAccessInfo(b);
              return (
                <SwipeActionRow
                  key={`ath-booking-${b.id}`}
                  onEdit={() => {
                    setEditingAthleteBookingId(b.id);
                    setAthleteBookingDraft({
                      bookingDate: b.booking_date || "",
                      startTime: b.start_time || "",
                      endTime: b.end_time || "",
                      specialRequest: b.special_request || "",
                    });
                  }}
                  onDelete={() => actionsRef.current.deleteAthleteBooking(b.id)}
                  editLabel="Modifier"
                  deleteLabel="Supprimer"
                >
                  <View style={styles.card}>
                    <View style={styles.cardAccent} />
                    <Text style={styles.cardTitle}>
                      {b.box_title || `Box #${b.box_id}`}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {[
                        b.box_city,
                        `${b.booking_date} ${b.start_time}–${b.end_time}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {b.host_user_id ? (
                      <>
                        <Text style={styles.cardAvailability}>
                          Hôte : {b.host_full_name || "Hôte"} —{" "}
                          {formatPublicRatingLine({
                            count: b.host_review_count,
                            avg_score: b.host_avg_score,
                          })}
                        </Text>
                        <OutlineButton
                          compact
                          stretch
                          label="Profil, notes et commentaires de l'hôte"
                          icon="person-circle-outline"
                          onPress={() =>
                            openUserReviews(
                              b.host_user_id,
                              `Hôte — ${b.host_full_name || "profil & avis"}`
                            )
                          }
                        />
                      </>
                    ) : null}
                    <Text style={styles.cardDetailLine}>
                      Statut : {bookingApprovalLabel(approval)}
                      {showAccess && b.access_code
                        ? ` · code ${b.access_code}`
                        : ""}
                    </Text>
                    <Text style={styles.cardDetailLine}>
                      Paiement: {b.payment_status || "simulated_unpaid"} ·
                      remboursement: {b.refund_status || "none"}
                    </Text>
                    <Text style={styles.cardDetailLine}>
                      Accès : {bookingAccessMethodLabel(b.access_method)}
                    </Text>
                    {showAccess && b.access_instructions ? (
                      <Text style={styles.cardAvailability}>
                        Instructions : {b.access_instructions}
                      </Text>
                    ) : null}
                    {!showAccess ? (
                      <Text style={styles.cardAvailability}>
                        Les informations d'accès sont masquées hors fenêtre
                        autorisée.
                      </Text>
                    ) : null}
                    {b.special_request ? (
                      <Text style={styles.cardAvailability}>
                        Demande : {b.special_request}
                      </Text>
                    ) : null}
                    {changeDraft ? (
                      <Text style={styles.cardAvailability}>
                        {bookingChangePreviewText(b, changeDraft)}
                      </Text>
                    ) : null}
                    {approval === "pending_athlete_confirmation" ? (
                      <>
                        <PrimaryButton
                          compact
                          label="Valider la modif"
                          icon="checkmark-outline"
                          onPress={() =>
                            actionsRef.current.decideAthleteBookingChange(
                              b.id,
                              "accept"
                            )
                          }
                        />
                        <SecondaryButton
                          compact
                          label="Refuser la modif"
                          icon="close-outline"
                          onPress={() =>
                            actionsRef.current.decideAthleteBookingChange(
                              b.id,
                              "reject"
                            )
                          }
                        />
                      </>
                    ) : null}
                    <OutlineButton
                      compact
                      label="Voir timeline"
                      icon="time-outline"
                      onPress={() =>
                        actionsRef.current.showBookingTimeline(b.id)
                      }
                    />
                    <OutlineButton
                      compact
                      label="Signaler incident d'accès"
                      icon="alert-circle-outline"
                      onPress={() =>
                        actionsRef.current.reportAccessIncident?.({
                          bookingId: b.id,
                          kind: "access_issue",
                          details:
                            "Incident signalé depuis l'application mobile.",
                        })
                      }
                    />
                    {b.status === "completed" ? (
                      <OutlineButton
                        compact
                        label="Noter l'hôte (5★)"
                        icon="star-outline"
                        onPress={() =>
                          actionsRef.current.submitReview({
                            bookingId: b.id,
                            score: 5,
                            comment: "Hôte recommandé.",
                          })
                        }
                      />
                    ) : null}
                  </View>
                </SwipeActionRow>
              );
            })}
            {athleteBookings.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune réservation enregistrée.
              </Text>
            ) : null}
          </Section>
        ) : null}

        {!canHost && !canBook ? (
          <Text style={styles.emptyText}>
            Active un rôle Athlète ou Hôte pour voir tes réservations.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabs() {
  const { canHost } = useAppMain();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        sceneStyle: { flex: 1 },
        headerStyle: {
          backgroundColor: theme.hero,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
        headerTintColor: "#fff",
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.borderSoft,
          paddingTop: 6,
          height: 62,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.inkMuted,
        tabBarIcon: ({ color, size }) => {
          const map = {
            Carte: "map-outline",
            Trails: "navigate-outline",
            Host: "home-outline",
            Reservations: "calendar-outline",
            Profil: "person-circle-outline",
          };
          return (
            <Ionicons
              name={map[route.name] || "ellipse"}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Carte"
        component={ExplorerScreen}
        options={{ title: "Carte" }}
      />
      <Tab.Screen
        name="Trails"
        component={TrailsScreen}
        options={{ title: "Traces" }}
      />
      {canHost ? (
        <Tab.Screen
          name="Host"
          component={HostScreen}
          options={{ title: "Mes box" }}
        />
      ) : null}
      <Tab.Screen
        name="Reservations"
        component={ReservationsScreen}
        options={{ title: "Réservations" }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfileScreen}
        options={{ title: "Profil" }}
      />
    </Tab.Navigator>
  );
}

function AuthenticatedRoot() {
  return <MainTabs />;
}

/** Toute la logique sous RootErrorBoundary pour que les erreurs de rendu (ex. ReferenceError) affichent l’écran d’erreur au lieu d’un blanc. */
function RavitoApp() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const { documentElement, body } = document;
    const prev = {
      htmlH: documentElement.style.height,
      bodyH: body.style.height,
      bodyM: body.style.margin,
    };
    documentElement.style.height = "100%";
    body.style.minHeight = "100vh";
    body.style.height = "100%";
    body.style.margin = "0";
    const root = document.getElementById("root");
    if (root) {
      root.style.flex = "1";
      root.style.minHeight = "100vh";
      root.style.height = "100%";
    }
    return () => {
      documentElement.style.height = prev.htmlH;
      body.style.height = prev.bodyH;
      body.style.margin = prev.bodyM;
      body.style.minHeight = "";
      if (root) {
        root.style.flex = "";
        root.style.minHeight = "";
        root.style.height = "";
      }
    };
  }, []);

  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("athlete");
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);

  const [boxes, setBoxes] = useState([]);
  const [trails, setTrails] = useState([]);
  const [bookingDate, setBookingDate] = useState(() => todayIsoDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [city, setCity] = useState("Annecy");
  const [trailDifficulty, setTrailDifficulty] = useState("medium");
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [selectedTrailId, setSelectedTrailId] = useState(null);
  const [hostForm, setHostForm] = useState({
    title: "",
    description: "",
    availabilityNote: "",
    latitude: "45.8992",
    longitude: "6.1294",
    city: "Annecy",
    priceCents: "700",
    accessCode: "",
    accessMethod: "padlock_code",
    accessInstructions: "",
    accessDisplayBeforeMin: "15",
    accessDisplayAfterMin: "15",
    capacityLiters: "20",
    hasWater: true,
    criteriaTags: [],
  });
  const [hostEditingBoxId, setHostEditingBoxId] = useState(null);
  const [hostReverseGeocode, setHostReverseGeocode] = useState({
    status: "idle",
    message: "",
  });
  const hostGeocodeSeqRef = useRef(0);
  const skipInitialHostGeocodeRef = useRef(true);
  const explorerCityGeocodeSeqRef = useRef(0);
  const explorerSearchSeqRef = useRef(0);
  const [hostBoxes, setHostBoxes] = useState([]);
  const [hostRefunds, setHostRefunds] = useState([]);
  const [hostBookings, setHostBookings] = useState([]);
  const [athleteBookings, setAthleteBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [myReviewsSummary, setMyReviewsSummary] = useState({
    count: 0,
    avg_score: 0,
  });
  const [myReviews, setMyReviews] = useState([]);
  const [userReviewsModal, setUserReviewsModal] = useState({
    visible: false,
    userId: null,
    title: "",
  });
  const [bookingConfirm, setBookingConfirm] = useState({
    visible: false,
    boxId: null,
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [mapLat, setMapLat] = useState("45.8992");
  const [mapLon, setMapLon] = useState("6.1294");
  const [specialRequest, setSpecialRequest] = useState("");
  const [webDropHover, setWebDropHover] = useState(false);
  const [trailListFilter, setTrailListFilter] = useState("all");
  const [mapShowTrails, setMapShowTrails] = useState(true);
  const [mapTrailDifficultyFilter, setMapTrailDifficultyFilter] =
    useState("all");
  const [mapTrailsScope, setMapTrailsScope] = useState("all");
  const [mapTrailPickIds, setMapTrailPickIds] = useState([]);
  const [mapBoxSelectionMode, setMapBoxSelectionMode] = useState("all");
  const [mapPickedBoxIds, setMapPickedBoxIds] = useState([]);
  const [mapBoxSort, setMapBoxSort] = useState("default");
  const [mapTrailListSort, setMapTrailListSort] = useState("default");
  const [mapShowBoxes, setMapShowBoxes] = useState(true);
  const [mapBoxCriteriaTags, setMapBoxCriteriaTags] = useState([]);
  const [mapNearTrailsMode, setMapNearTrailsMode] = useState("visible");
  const [mapNearTrailPickIds, setMapNearTrailPickIds] = useState([]);
  const [mapListSource, setMapListSource] = useState("viewport");
  const [mapViewportBounds, setMapViewportBounds] = useState(null);
  /** Incrémenté pour forcer un recentrage carte (ex. sync depuis Mes box). */
  const [mapExplorerRecenterNonce, setMapExplorerRecenterNonce] = useState(0);
  /** Quand false : la carte ne suit plus la recherche (pan manuel) jusqu'à « Recentrer » ou changement de source. */
  const [mapExplorerCameraFollowSearch, setMapExplorerCameraFollowSearch] =
    useState(true);
  const [mapExplorerLastSearchAt, setMapExplorerLastSearchAt] = useState(null);
  const [mapExplorerLastSearchSource, setMapExplorerLastSearchSource] =
    useState(null);
  const [mapBoxesNearTrailsOnly, setMapBoxesNearTrailsOnly] = useState(false);
  const [mapTrailProximityKm, setMapTrailProximityKm] = useState("3");

  useEffect(() => {
    if (!user) {
      setMapTrailsScope("all");
      setMapTrailPickIds([]);
    }
  }, [user]);

  const isAuthed = useMemo(() => Boolean(token), [token]);
  const canHost = useMemo(
    () => user?.role === "host" || user?.role === "both",
    [user?.role]
  );
  const canBook = useMemo(
    () => user?.role === "athlete" || user?.role === "both",
    [user?.role]
  );

  const trailsForMap = useMemo(() => {
    if (!mapShowTrails) return [];
    let t = trails;
    const uid = user?.id != null ? Number(user.id) : null;
    if (mapTrailsScope === "mine" && uid != null && Number.isFinite(uid)) {
      t = t.filter((tr) => Number(tr.creator_user_id) === uid);
    } else if (
      mapTrailsScope === "others" &&
      uid != null &&
      Number.isFinite(uid)
    ) {
      t = t.filter((tr) => Number(tr.creator_user_id) !== uid);
    } else if (mapTrailsScope === "picked") {
      const set = new Set(
        (mapTrailPickIds || []).map((x) => Number(x)).filter(Number.isFinite)
      );
      t = t.filter((tr) => set.has(Number(tr.id)));
    }
    if (mapTrailDifficultyFilter !== "all") {
      t = t.filter((tr) => tr.difficulty === mapTrailDifficultyFilter);
    }
    if (mapListSource === "viewport" && mapViewportBounds) {
      t = t.filter((tr) => trailTouchesBounds(tr, mapViewportBounds));
    }
    return t;
  }, [
    trails,
    mapShowTrails,
    mapTrailsScope,
    mapTrailPickIds,
    mapTrailDifficultyFilter,
    mapViewportBounds,
    mapListSource,
    user?.id,
  ]);

  const boxesForMap = useMemo(() => {
    if (!mapShowBoxes) return [];
    let list = boxes;
    if (mapListSource === "viewport" && mapViewportBounds) {
      list = list.filter((box) =>
        pointInBounds(
          Number(box.latitude),
          Number(box.longitude),
          mapViewportBounds
        )
      );
    }
    if (mapBoxCriteriaTags?.length > 0) {
      list = list.filter((box) => {
        const tags = parseBoxCriteria(box);
        return mapBoxCriteriaTags.some((c) => tags.includes(c));
      });
    }
    if (mapBoxSelectionMode === "picked") {
      const picks = new Set(
        (mapPickedBoxIds || []).map((x) => Number(x)).filter(Number.isFinite)
      );
      list = list.filter((b) => picks.has(Number(b.id)));
    }
    if (mapBoxesNearTrailsOnly) {
      let proximityTrails = trailsForMap;
      if (mapNearTrailsMode === "picked") {
        const tset = new Set(
          (mapNearTrailPickIds || [])
            .map((x) => Number(x))
            .filter(Number.isFinite)
        );
        proximityTrails = trailsForMap.filter((t) => tset.has(Number(t.id)));
      }
      if (proximityTrails.length === 0) return [];
      const km = Math.max(0.1, parseFloat(mapTrailProximityKm) || 3);
      list = list.filter((box) => {
        const d = minDistanceKmFromBoxToTrails(box, proximityTrails);
        return d <= km;
      });
    }
    return list;
  }, [
    boxes,
    mapViewportBounds,
    mapListSource,
    mapShowBoxes,
    mapBoxCriteriaTags,
    mapBoxSelectionMode,
    mapPickedBoxIds,
    mapBoxesNearTrailsOnly,
    mapNearTrailsMode,
    mapNearTrailPickIds,
    mapTrailProximityKm,
    trailsForMap,
  ]);

  const boxesForExplorerList = useMemo(() => {
    const list = [...boxesForMap];
    const avg = (b) => Number(b.host_avg_score) || 0;
    const cnt = (b) => Number(b.host_review_count) || 0;
    switch (mapBoxSort) {
      case "rating_desc":
        list.sort((a, b) => avg(b) - avg(a) || cnt(b) - cnt(a));
        break;
      case "rating_asc": {
        list.sort((a, b) => {
          const ca = cnt(a);
          const cb = cnt(b);
          if (ca === 0 && cb > 0) return 1;
          if (cb === 0 && ca > 0) return -1;
          if (avg(a) !== avg(b)) return avg(a) - avg(b);
          return ca - cb;
        });
        break;
      }
      case "price_asc":
        list.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0));
        break;
      case "price_desc":
        list.sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0));
        break;
      default:
        if (list.some((b) => b.distance_km != null)) {
          list.sort(
            (a, b) =>
              (Number(a.distance_km) || 1e9) - (Number(b.distance_km) || 1e9)
          );
        }
        break;
    }
    return list;
  }, [boxesForMap, mapBoxSort]);

  const trailsForExplorerList = useMemo(() => {
    const list = [...(trailsForMap || [])];
    const diffRank = (d) => {
      if (d === "easy") return 0;
      if (d === "medium") return 1;
      if (d === "hard") return 2;
      return 3;
    };
    switch (mapTrailListSort) {
      case "distance_desc":
        list.sort(
          (a, b) => (Number(b.distance_km) || 0) - (Number(a.distance_km) || 0)
        );
        break;
      case "distance_asc":
        list.sort(
          (a, b) => (Number(a.distance_km) || 0) - (Number(b.distance_km) || 0)
        );
        break;
      case "elevation_desc":
        list.sort(
          (a, b) => (Number(b.elevation_m) || 0) - (Number(a.elevation_m) || 0)
        );
        break;
      case "elevation_asc":
        list.sort(
          (a, b) => (Number(a.elevation_m) || 0) - (Number(b.elevation_m) || 0)
        );
        break;
      case "difficulty_easy":
        list.sort((a, b) => diffRank(a.difficulty) - diffRank(b.difficulty));
        break;
      case "difficulty_hard":
        list.sort((a, b) => diffRank(b.difficulty) - diffRank(a.difficulty));
        break;
      default:
        list.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "fr")
        );
        break;
    }
    return list;
  }, [trailsForMap, mapTrailListSort]);

  const selectedBox = boxes.find((box) => box.id === selectedBoxId) || null;
  const selectedTrail =
    trails.find((trail) => Number(trail.id) === Number(selectedTrailId)) ||
    null;

  useEffect(() => {
    if (selectedTrailId == null) return;
    const exists = trails.some(
      (trail) => Number(trail.id) === Number(selectedTrailId)
    );
    if (!exists) {
      setSelectedTrailId(null);
    }
  }, [trails, selectedTrailId]);

  /** En ville / GPS : centre = coordonnées de recherche (pas la box sélectionnée), pour éviter carte bloquée loin du point demandé. */
  const webMapCenter = useMemo(() => {
    const lat = parseFloat(mapLat);
    const lon = parseFloat(mapLon);
    const fallbackLat = Number.isFinite(lat) ? lat : 45.8992;
    const fallbackLon = Number.isFinite(lon) ? lon : 6.1294;
    if (mapListSource === "nearby" || mapListSource === "city") {
      return [fallbackLat, fallbackLon];
    }
    if (selectedBox) {
      const bl = Number(selectedBox.latitude);
      const bLng = Number(selectedBox.longitude);
      if (Number.isFinite(bl) && Number.isFinite(bLng)) {
        return [bl, bLng];
      }
    }
    return [fallbackLat, fallbackLon];
  }, [
    mapListSource,
    mapLat,
    mapLon,
    selectedBox?.id,
    selectedBox?.latitude,
    selectedBox?.longitude,
  ]);

  useEffect(() => {
    if (mapListSource === "city") {
      if (boxesForExplorerList.length > 0) {
        setSelectedBoxId((prev) =>
          prev != null && boxesForExplorerList.some((b) => b.id === prev)
            ? prev
            : boxesForExplorerList[0].id
        );
      } else {
        setSelectedBoxId(null);
      }
    }
  }, [mapListSource, boxesForExplorerList]);

  const register = useCallback(async () => {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) {
      userAlert("Nom manquant", "Indique ton nom ou pseudo affiché.");
      return;
    }
    if (!mail || !mail.includes("@")) {
      userAlert("Email invalide", "Vérifie ton adresse email.");
      return;
    }
    if (!password || password.length < 6) {
      userAlert(
        "Mot de passe",
        "Choisis un mot de passe d’au moins 6 caractères."
      );
      return;
    }
    setAuthLoading(true);
    try {
      const result = await apiFetch("/auth/register", {
        method: "POST",
        body: { fullName: name, email: mail, password, role },
      });
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      userAlert("Compte créé", "Bienvenue sur RavitoBox.");
    } catch (error) {
      userAlert("Inscription impossible", error.message);
    } finally {
      setAuthLoading(false);
    }
  }, [fullName, email, password, role]);

  const login = useCallback(async () => {
    const mail = email.trim().toLowerCase();
    if (!mail || !mail.includes("@")) {
      userAlert("Email invalide", "Saisis l’email de ton compte.");
      return;
    }
    if (!password) {
      userAlert("Mot de passe", "Saisis ton mot de passe.");
      return;
    }
    setAuthLoading(true);
    try {
      const result = await apiFetch("/auth/login", {
        method: "POST",
        body: { email: mail, password },
      });
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      userAlert("Connexion", `Bonjour ${result.user.full_name} !`);
    } catch (error) {
      userAlert("Connexion refusée", error.message);
    } finally {
      setAuthLoading(false);
    }
  }, [email, password]);

  const refreshSession = async () => {
    if (!refreshToken) return;
    try {
      const result = await apiFetch("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
      });
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      userAlert("Session", "Token rafraichi");
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const logout = async () => {
    try {
      if (refreshToken) {
        await apiFetch("/auth/logout", {
          method: "POST",
          body: { refreshToken },
        });
      }
    } catch (_error) {
      // noop
    } finally {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setBoxes([]);
      setTrails([]);
      setHostBoxes([]);
      setHostRefunds([]);
      setHostBookings([]);
      setAthleteBookings([]);
      setAuthMode("login");
    }
  };

  const updateMyRole = async (nextRole) => {
    if (!token) return;
    try {
      const result = await apiFetch("/users/me/role", {
        method: "PATCH",
        token,
        body: { role: nextRole },
      });
      setUser(result.user);
      userAlert(
        "Profil mis à jour",
        `Ton rôle est maintenant : ${
          ROLE_LABELS[result.user.role] || result.user.role
        }.`
      );
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadBoxes = async () => {
    const q = city.trim();
    if (q.length < 2) return;
    try {
      const rows = await apiFetch(`/boxes?city=${encodeURIComponent(q)}`);
      setBoxes(rows);
      setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadHostBoxes = async () => {
    if (!token) return;
    try {
      const rows = await apiFetch("/host/boxes", { token });
      setHostBoxes(rows);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadHostBookings = async () => {
    if (!token) return;
    try {
      const rows = await apiFetch("/host/bookings", { token });
      setHostBookings(rows);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadHostRefunds = async () => {
    if (!token) return;
    try {
      const rows = await apiFetch("/host/refunds", { token });
      setHostRefunds(Array.isArray(rows) ? rows : []);
    } catch (error) {
      const msg = String(error?.message || "");
      const missingRoute =
        /Endpoint API introuvable/i.test(msg) ||
        /Cannot GET\s+\/api\/host\/refunds/i.test(msg) ||
        /Not Found/i.test(msg);
      if (missingRoute) {
        // Compat old backend: keep Host tab usable even if refunds endpoint is absent.
        setHostRefunds([]);
        return;
      }
      userAlert("Erreur", error.message);
    }
  };

  const loadAthleteBookings = async () => {
    if (!token) return;
    try {
      const rows = await apiFetch("/bookings", { token });
      setAthleteBookings(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadNotifications = async ({ unreadOnly = false } = {}) => {
    if (!token) return;
    try {
      const rows = await apiFetch(
        `/notifications?unreadOnly=${unreadOnly ? "true" : "false"}`,
        { token }
      );
      setNotifications(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadMyReviews = async () => {
    if (!token || !user?.id) return;
    try {
      const data = await apiFetch(`/users/${user.id}/reviews`);
      setMyReviewsSummary(data?.stats || { count: 0, avg_score: 0 });
      setMyReviews(Array.isArray(data?.reviews) ? data.reviews : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const openUserReviews = useCallback((userId, title = "Profil & avis") => {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return;
    setUserReviewsModal({ visible: true, userId: id, title });
  }, []);

  const closeUserReviews = useCallback(() => {
    setUserReviewsModal({ visible: false, userId: null, title: "" });
  }, []);

  const markAllNotificationsRead = async () => {
    if (!token) return;
    try {
      await apiFetch("/notifications/read-all", {
        method: "PATCH",
        token,
      });
    } catch (_error) {
      // Silent fail: reading notifications should not block core flows.
    }
  };

  const showBookingTimeline = async (bookingId) => {
    if (!token) return;
    try {
      const rows = await apiFetch(`/bookings/${bookingId}/events`, { token });
      const list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) {
        userAlert("Timeline", "Aucun événement pour cette réservation.");
        return;
      }
      const preview = list
        .slice(0, 12)
        .map((evt) => {
          const at = new Date(evt.created_at).toLocaleString("fr-FR");
          const actor = evt.actor_name ? ` (${evt.actor_name})` : "";
          return `- ${at} · ${evt.event_type}${actor}${
            evt.message ? `\n  ${evt.message}` : ""
          }`;
        })
        .join("\n");
      userAlert("Timeline réservation", preview);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const reportAccessIncident = async ({ bookingId, kind, details }) => {
    if (!token) return;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return;
    try {
      await apiFetch(`/bookings/${bid}/incidents`, {
        method: "POST",
        token,
        body: {
          kind: String(kind || "access_issue"),
          details: String(details || "").trim() || "Incident d'accès signalé.",
        },
      });
      userAlert(
        "Incident envoyé",
        "Le signalement d'accès a bien été transmis."
      );
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const markRefundDone = async (refundId) => {
    if (!token) return;
    const rid = Number(refundId);
    if (!Number.isFinite(rid)) return;
    try {
      await apiFetch(`/refunds/${rid}/mark-done`, {
        method: "PATCH",
        token,
      });
      await loadHostRefunds();
      await loadHostBookings();
      await loadAthleteBookings();
      userAlert("Remboursement", "Remboursement marqué comme traité.");
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const submitReview = async ({ bookingId, score = 5, comment = "" }) => {
    if (!token) return;
    try {
      await apiFetch("/reviews", {
        method: "POST",
        token,
        body: {
          bookingId,
          score,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      userAlert("Merci", "Ton avis a bien été enregistré.");
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const runExplorerSearch = useCallback(
    async (params = {}) => {
      const source = params.source ?? mapListSource;
      const q = (params.cityQuery ?? city).trim();
      const lat = parseFloat(params.latText ?? mapLat);
      const lon = parseFloat(params.lonText ?? mapLon);
      const bounds = params.bounds ?? mapViewportBounds;
      const reqId = ++explorerSearchSeqRef.current;
      try {
        if (source === "nearby") {
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const rows = await apiFetch(
            `/boxes/nearby?lat=${lat}&lon=${lon}&limit=35`
          );
          if (reqId !== explorerSearchSeqRef.current) return;
          setBoxes(rows);
          setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
          setMapExplorerLastSearchAt(Date.now());
          setMapExplorerLastSearchSource(source);
          return;
        }
        if (source === "viewport") {
          if (!bounds) return;
          const { south, north, west, east } = bounds;
          if (
            !Number.isFinite(south) ||
            !Number.isFinite(north) ||
            !Number.isFinite(west) ||
            !Number.isFinite(east)
          ) {
            return;
          }
          const rows = await apiFetch(
            `/boxes/bounds?south=${encodeURIComponent(
              south
            )}&west=${encodeURIComponent(west)}&north=${encodeURIComponent(
              north
            )}&east=${encodeURIComponent(east)}&limit=200`
          );
          if (reqId !== explorerSearchSeqRef.current) return;
          setBoxes(rows);
          setSelectedBoxId((prev) =>
            prev != null && rows.some((b) => b.id === prev) ? prev : null
          );
          setMapExplorerLastSearchAt(Date.now());
          setMapExplorerLastSearchSource(source);
          return;
        }
        if (q.length < 2) return;
        const rows = await apiFetch(`/boxes?city=${encodeURIComponent(q)}`);
        if (reqId !== explorerSearchSeqRef.current) return;
        setBoxes(rows);
        setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
        setMapExplorerLastSearchAt(Date.now());
        setMapExplorerLastSearchSource(source);
        return;
      } catch (error) {
        if (reqId !== explorerSearchSeqRef.current) return;
        userAlert("Erreur", error.message);
      }
    },
    [mapListSource, city, mapLat, mapLon, mapViewportBounds]
  );

  const loadNearbyBoxes = async () => {
    const lat = parseFloat(mapLat);
    const lon = parseFloat(mapLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      userAlert("Position", "Indique une latitude et une longitude valides.");
      return;
    }
    await runExplorerSearch({
      source: "nearby",
      latText: String(lat),
      lonText: String(lon),
    });
  };

  const refetchExplorerBoxes = useCallback(async () => {
    await runExplorerSearch();
  }, [runExplorerSearch]);

  useEffect(() => {
    if (mapListSource !== "city") return;
    const q = city.trim();
    if (q.length < 2) return;
    const seq = (explorerCityGeocodeSeqRef.current += 1);
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => {
      void runExplorerSearch({ source: "city", cityQuery: q });
      (async () => {
        try {
          const result = await geocodeCityToLatLon(q, {
            signal: controller?.signal,
            token,
          });
          if (seq !== explorerCityGeocodeSeqRef.current) return;
          if (result) {
            setMapLat(result.lat.toFixed(6));
            setMapLon(result.lon.toFixed(6));
            setMapExplorerCameraFollowSearch(true);
            setMapExplorerRecenterNonce((x) => x + 1);
          }
        } catch (_e) {
          // Si le géocodage externe échoue, on garde le centre actuel.
        }
      })();
    }, 550);
    return () => {
      clearTimeout(t);
      controller?.abort?.();
    };
  }, [city, mapListSource, runExplorerSearch, token]);

  useEffect(() => {
    if (mapListSource !== "nearby") return;
    const t = setTimeout(() => {
      const lat = parseFloat(mapLat);
      const lon = parseFloat(mapLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      void runExplorerSearch({
        source: "nearby",
        latText: String(lat),
        lonText: String(lon),
      });
    }, 550);
    return () => clearTimeout(t);
  }, [mapLat, mapLon, mapListSource, runExplorerSearch]);

  useEffect(() => {
    if (mapListSource !== "viewport") return;
    if (!mapViewportBounds) return;
    const { south, north, west, east } = mapViewportBounds;
    if (
      !Number.isFinite(south) ||
      !Number.isFinite(north) ||
      !Number.isFinite(west) ||
      !Number.isFinite(east)
    ) {
      return;
    }
    const t = setTimeout(() => {
      void runExplorerSearch({
        source: "viewport",
        bounds: mapViewportBounds,
      });
    }, 420);
    return () => clearTimeout(t);
  }, [mapViewportBounds, mapListSource, runExplorerSearch]);

  const syncExplorerMapFromHost = useCallback(() => {
    const lat = parseFloat(hostForm.latitude);
    const lng = parseFloat(hostForm.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      userAlert("Position", "Coordonnées GPS invalides.");
      return;
    }
    setMapExplorerCameraFollowSearch(true);
    setMapLat(lat.toFixed(6));
    setMapLon(lng.toFixed(6));
    setMapListSource("viewport");
    setMapExplorerRecenterNonce((n) => n + 1);
  }, [hostForm.latitude, hostForm.longitude]);

  const loadTrails = async () => {
    try {
      const rows = await apiFetch("/trails");
      setTrails(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  useEffect(() => {
    if (hostEditingBoxId == null) return;
    if (!hostBoxes.some((b) => Number(b.id) === hostEditingBoxId)) {
      setHostEditingBoxId(null);
    }
  }, [hostBoxes, hostEditingBoxId]);

  useEffect(() => {
    const lat = parseFloat(hostForm.latitude);
    const lng = parseFloat(hostForm.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setHostReverseGeocode({ status: "idle", message: "" });
      return;
    }
    if (skipInitialHostGeocodeRef.current) {
      skipInitialHostGeocodeRef.current = false;
      return;
    }
    const seq = ++hostGeocodeSeqRef.current;
    setHostReverseGeocode({ status: "loading", message: "" });
    const t = setTimeout(() => {
      void (async () => {
        try {
          const data = await apiFetch(
            `/geocode/reverse?lat=${encodeURIComponent(
              lat
            )}&lon=${encodeURIComponent(lng)}`
          );
          if (seq !== hostGeocodeSeqRef.current) return;
          const label = geocodePayloadToCityLabel(data);
          if (label) {
            setHostForm((s) => ({ ...s, city: label }));
            setHostReverseGeocode({
              status: "ok",
              message: "",
            });
          } else {
            setHostReverseGeocode({
              status: "warn",
              message:
                "Le service n’a pas renvoyé de nom de lieu pour ce point. Saisis la ville à la main.",
            });
          }
        } catch (error) {
          if (seq !== hostGeocodeSeqRef.current) return;
          setHostReverseGeocode({
            status: "warn",
            message:
              "Service de géocodage indisponible pour le moment. Saisis la ville à la main.",
          });
        }
      })();
    }, 380);
    return () => clearTimeout(t);
  }, [hostForm.latitude, hostForm.longitude]);

  const bookBox = (boxId) => {
    if (!canBook) {
      userAlert(
        "Rôle athlète",
        "Seuls les comptes Athlète ou Les deux peuvent réserver une box."
      );
      return;
    }
    if (!token) {
      userAlert("Connexion", "Connecte-toi pour réserver.");
      return;
    }
    const box = boxes.find((b) => b.id === boxId);
    if (!box) {
      userAlert(
        "Box introuvable",
        "Recharge la liste des box (carte ou ville) puis réessaie."
      );
      return;
    }
    const { blocking } = buildBookingVigilances(
      box,
      bookingDate,
      startTime,
      endTime,
      specialRequest
    );
    if (blocking.length > 0) {
      userAlert("Réservation impossible", blocking.join("\n"));
      return;
    }
    setBookingConfirm({ visible: true, boxId });
  };

  const confirmBookBox = async () => {
    const boxId = bookingConfirm.boxId;
    if (!token || !boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    if (!box) {
      userAlert("Erreur", "Ce box n'est plus dans la liste chargée.");
      setBookingConfirm({ visible: false, boxId: null });
      return;
    }
    const { blocking } = buildBookingVigilances(
      box,
      bookingDate,
      startTime,
      endTime,
      specialRequest
    );
    if (blocking.length > 0) {
      userAlert("Réservation impossible", blocking.join("\n"));
      return;
    }
    setBookingSubmitting(true);
    try {
      const result = await apiFetch("/bookings", {
        method: "POST",
        token,
        body: {
          boxId,
          bookingDate,
          startTime,
          endTime,
          ...(specialRequest.trim()
            ? { specialRequest: specialRequest.trim() }
            : {}),
        },
      });
      setBookingConfirm({ visible: false, boxId: null });
      userAlert(
        "Réservation enregistrée",
        `Code d’accès : ${result.access_code}${
          result.special_request ? `\nDemande : ${result.special_request}` : ""
        }`
      );
      await loadAthleteBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const cancelBookBoxConfirm = () => {
    if (bookingSubmitting) return;
    setBookingConfirm({ visible: false, boxId: null });
  };

  const uploadGpxWithFormData = async (formData) => {
    const response = await fetch(`${API_BASE_URL}/trails/upload-gpx`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 180) || "Upload failed");
      }
    }
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Upload failed"
      );
    }
    return data;
  };

  const uploadGpx = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["*/*"] });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const formData = new FormData();
      formData.append("name", (file.name || "trace").replace(/\.gpx$/i, ""));
      formData.append("territory", city);
      formData.append("difficulty", trailDifficulty);
      formData.append("gpx", {
        uri: file.uri,
        name: file.name || "trace.gpx",
        type: file.mimeType || "application/gpx+xml",
      });

      const data = await uploadGpxWithFormData(formData);
      userAlert(
        "Trace importée",
        `${data.distanceKm} km / D+ ${data.elevationM} m`
      );
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const uploadGpxWebFile = async (file) => {
    if (!file) {
      userAlert(
        "Erreur",
        "Aucun fichier reçu (glisser-déposer ou choisir un fichier)."
      );
      return;
    }
    const name = file.name || "trace.gpx";
    if (!name.toLowerCase().endsWith(".gpx")) {
      userAlert("Format", "Utilise un fichier .gpx");
      return;
    }
    try {
      let formData;
      if (Platform.OS === "web" && typeof globalThis.FormData !== "undefined") {
        formData = new globalThis.FormData();
        formData.append("name", name.replace(/\.gpx$/i, ""));
        formData.append("territory", city);
        formData.append("difficulty", trailDifficulty);
        formData.append("gpx", file, name);
      } else {
        formData = new FormData();
        formData.append("name", name.replace(/\.gpx$/i, ""));
        formData.append("territory", city);
        formData.append("difficulty", trailDifficulty);
        formData.append("gpx", file);
      }
      const data = await uploadGpxWithFormData(formData);
      userAlert(
        "Trace importée",
        `${data.distanceKm} km / D+ ${data.elevationM} m`
      );
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const createHostBox = async () => {
    const body = {
      title: hostForm.title,
      description: hostForm.description,
      latitude: Number(hostForm.latitude),
      longitude: Number(hostForm.longitude),
      city: hostForm.city,
      priceCents: Number(hostForm.priceCents),
      accessCode: hostForm.accessCode?.trim() || undefined,
      accessMethod: hostForm.accessMethod || "padlock_code",
      accessInstructions: hostForm.accessInstructions?.trim() || undefined,
      accessDisplayBeforeMin: Number(hostForm.accessDisplayBeforeMin) || 15,
      accessDisplayAfterMin: Number(hostForm.accessDisplayAfterMin) || 15,
      capacityLiters: Number(hostForm.capacityLiters),
      hasWater: Boolean(hostForm.hasWater),
      availabilityNote: hostForm.availabilityNote?.trim() || undefined,
      criteriaTags: hostForm.criteriaTags,
    };
    try {
      if (hostEditingBoxId != null) {
        const updated = await apiFetch(`/host/boxes/${hostEditingBoxId}`, {
          method: "PATCH",
          token,
          body,
        });
        const impacted = Number(updated?.impactedBookingsCount || 0);
        userAlert(
          "OK",
          impacted > 0
            ? `Ton box a été mis à jour. ${impacted} réservataire(s) ont été notifié(s).`
            : "Ton box a été mis à jour."
        );
        setHostEditingBoxId(null);
        setHostReverseGeocode({ status: "idle", message: "" });
        setHostForm({
          title: "",
          description: "",
          availabilityNote: "",
          latitude: "45.8992",
          longitude: "6.1294",
          city: "Annecy",
          priceCents: "700",
          accessCode: "",
          accessMethod: "padlock_code",
          accessInstructions: "",
          accessDisplayBeforeMin: "15",
          accessDisplayAfterMin: "15",
          capacityLiters: "20",
          hasWater: true,
          criteriaTags: [],
        });
      } else {
        await apiFetch("/host/boxes", {
          method: "POST",
          token,
          body,
        });
        userAlert("Publication", "Ton box est en ligne.");
      }
      await refetchExplorerBoxes();
      await loadHostBoxes();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const startEditingHostBox = useCallback((box) => {
    if (!box) return;
    setHostReverseGeocode({ status: "idle", message: "" });
    setHostForm({
      title: box.title || "",
      description: box.description || "",
      availabilityNote: box.availability_note || "",
      latitude: String(Number(box.latitude)),
      longitude: String(Number(box.longitude)),
      city: box.city || "",
      priceCents: String(box.price_cents ?? 700),
      accessCode: String(box.access_code || ""),
      accessMethod: String(box.access_method || "padlock_code"),
      accessInstructions: String(box.access_instructions || ""),
      accessDisplayBeforeMin: String(box.access_display_before_min ?? 15),
      accessDisplayAfterMin: String(box.access_display_after_min ?? 15),
      capacityLiters: String(box.capacity_liters ?? 20),
      hasWater: box.has_water === 1 || box.has_water === true,
      criteriaTags: parseBoxCriteria(box),
    });
    setHostEditingBoxId(Number(box.id));
  }, []);

  const cancelHostBoxEdit = useCallback(() => {
    setHostEditingBoxId(null);
    setHostReverseGeocode({ status: "idle", message: "" });
    setHostForm({
      title: "",
      description: "",
      availabilityNote: "",
      latitude: "45.8992",
      longitude: "6.1294",
      city: "Annecy",
      priceCents: "700",
      accessCode: "",
      accessMethod: "padlock_code",
      accessInstructions: "",
      accessDisplayBeforeMin: "15",
      accessDisplayAfterMin: "15",
      capacityLiters: "20",
      hasWater: true,
      criteriaTags: [],
    });
  }, []);

  const decideHostBooking = async (bookingId, decision) => {
    if (!token) return;
    try {
      await apiFetch(`/host/bookings/${bookingId}/decision`, {
        method: "PATCH",
        token,
        body: { decision },
      });
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const decideAthleteBookingChange = async (bookingId, decision) => {
    if (!token) return;
    try {
      await apiFetch(`/bookings/${bookingId}/decision`, {
        method: "PATCH",
        token,
        body: { decision },
      });
      await loadAthleteBookings();
      await loadHostBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const updateHostBooking = async (bookingId, draft) => {
    if (!token) return;
    try {
      await apiFetch(`/host/bookings/${bookingId}`, {
        method: "PATCH",
        token,
        body: {
          bookingDate: draft.bookingDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          specialRequest: draft.specialRequest?.trim() || undefined,
        },
      });
      userAlert(
        "Demande envoyée",
        "La modification doit être validée par l'athlète."
      );
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteHostBox = async (boxId, title) => {
    if (!token) return;
    let impactedCount = 0;
    try {
      const impact = await apiFetch(`/host/boxes/${boxId}/deletion-impact`, {
        token,
      });
      impactedCount = Number(impact?.impactedBookingsCount || 0);
    } catch (error) {
      userAlert("Erreur", error.message);
      return;
    }
    const ok = await confirmDestructive(
      "Supprimer ce box ?",
      impactedCount > 0
        ? `« ${
            title || "Box"
          } » a ${impactedCount} réservation(s) active(s). Elles seront annulées et les athlètes notifiés dans l'app.`
        : `« ${title || "Box"} » sera archivé (invisible sur la carte).`
    );
    if (!ok) return;
    try {
      await apiFetch(`/host/boxes/${boxId}`, {
        method: "DELETE",
        token,
        body: { confirmImpact: impactedCount > 0 },
      });
      userAlert(
        "Supprimé",
        impactedCount > 0
          ? `${impactedCount} réservation(s) annulée(s) et notifiée(s).`
          : "Le box a été archivé."
      );
      await refetchExplorerBoxes();
      await loadHostBoxes();
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteHostBoxesByIds = async (ids) => {
    if (!token) return;
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (unique.length === 0) return;
    const n = unique.length;
    const ok = await confirmDestructive(
      n === 1 ? "Supprimer ce box ?" : `Supprimer ${n} box ?`,
      "Action définitive : chaque box et ses réservations liées seront supprimés."
    );
    if (!ok) return;
    try {
      await Promise.all(
        unique.map((id) =>
          apiFetch(`/host/boxes/${id}`, {
            method: "DELETE",
            token,
            body: { confirmImpact: true },
          })
        )
      );
      userAlert("OK", n === 1 ? "Box archivé." : `${n} box archivés.`);
      await refetchExplorerBoxes();
      await loadHostBoxes();
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAllHostBoxes = async () => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer tous tes box ?",
      "Les box seront archivés. Les réservations actives seront annulées avec notification in-app."
    );
    if (!ok) return;
    try {
      await apiFetch("/host/boxes", {
        method: "DELETE",
        token,
        body: { confirmImpact: true },
      });
      userAlert("OK", "Tous tes box ont été archivés.");
      await refetchExplorerBoxes();
      await loadHostBoxes();
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteHostBooking = async (bookingId, label) => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer cette réservation ?",
      `L’entrée « ${label} » disparaîtra de ton historique hôte.`
    );
    if (!ok) return;
    try {
      await apiFetch(`/host/bookings/${bookingId}`, {
        method: "DELETE",
        token,
      });
      await loadHostBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAllHostBookings = async () => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Effacer tout l’historique ?",
      "Toutes les réservations reçues (y compris acceptées ou refusées) seront supprimées."
    );
    if (!ok) return;
    try {
      await apiFetch("/host/bookings", { method: "DELETE", token });
      await loadHostBookings();
      userAlert("OK", "Historique des réservations effacé.");
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const updateAthleteBooking = async (bookingId, draft) => {
    if (!token) return;
    try {
      await apiFetch(`/bookings/${bookingId}`, {
        method: "PATCH",
        token,
        body: {
          bookingDate: draft.bookingDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          specialRequest: draft.specialRequest?.trim() || undefined,
        },
      });
      userAlert(
        "Demande envoyée",
        "La modification doit être validée par l'hôte."
      );
      await loadAthleteBookings();
      await loadHostBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAthleteBooking = async (bookingId) => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer cette réservation ?",
      "Elle disparaîtra de ton historique athlète."
    );
    if (!ok) return;
    try {
      await apiFetch(`/bookings/${bookingId}`, { method: "DELETE", token });
      await loadAthleteBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAllAthleteBookings = async () => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Effacer toutes tes réservations ?",
      "Ton historique de demandes sera vide."
    );
    if (!ok) return;
    try {
      await apiFetch("/bookings", { method: "DELETE", token });
      await loadAthleteBookings();
      userAlert("OK", "Historique effacé.");
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteTrail = async (trailId, name) => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer cette trace ?",
      `« ${name || "Trace"} » sera retirée définitivement.`
    );
    if (!ok) return;
    try {
      await apiFetch(`/trails/${trailId}`, { method: "DELETE", token });
      userAlert("OK", "Trace supprimée.");
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteTrailsByIds = async (ids) => {
    if (!token) return;
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (unique.length === 0) return;
    const n = unique.length;
    const ok = await confirmDestructive(
      n === 1 ? "Supprimer cette trace ?" : `Supprimer ${n} traces ?`,
      "Action définitive."
    );
    if (!ok) return;
    try {
      await Promise.all(
        unique.map((id) =>
          apiFetch(`/trails/${id}`, { method: "DELETE", token })
        )
      );
      userAlert("OK", n === 1 ? "Trace supprimée." : `${n} traces supprimées.`);
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAllMyTrails = async () => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer toutes tes traces ?",
      "Toutes les traces que tu as importées ou créées seront effacées."
    );
    if (!ok) return;
    try {
      await apiFetch("/trails", { method: "DELETE", token });
      userAlert("OK", "Toutes tes traces ont été supprimées.");
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const setHostLocationFromMap = (lat, lng) => {
    const plat = Number(lat);
    const plng = Number(lng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
    const latStr = plat.toFixed(6);
    const lngStr = plng.toFixed(6);
    setHostForm((s) => ({
      ...s,
      latitude: latStr,
      longitude: lngStr,
    }));
  };

  const centerMapOnTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      const trail = trails.find((t) => Number(t.id) === tid);
      if (!trail) {
        userAlert("Trace", "Tracé introuvable.");
        return;
      }
      setSelectedTrailId(tid);
      setMapExplorerCameraFollowSearch(true);
      let positions = [];
      try {
        if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
      } catch {
        positions = [];
      }
      if (!Array.isArray(positions) || positions.length === 0) {
        userAlert("Trace", "Pas de géométrie GPS pour centrer la carte.");
        return;
      }
      let sumLat = 0;
      let sumLng = 0;
      let n = 0;
      for (const pt of positions) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const plat = Number(pt[0]);
        const plng = Number(pt[1]);
        if (Number.isFinite(plat) && Number.isFinite(plng)) {
          sumLat += plat;
          sumLng += plng;
          n += 1;
        }
      }
      if (n === 0) {
        userAlert("Trace", "Géométrie invalide.");
        return;
      }
      setMapLat((sumLat / n).toFixed(5));
      setMapLon((sumLng / n).toFixed(5));
      setMapExplorerRecenterNonce((x) => x + 1);
    },
    [trails]
  );

  const isolateTrailOnMap = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      setMapShowTrails(true);
      setMapTrailsScope("picked");
      setMapTrailPickIds([tid]);
      setSelectedTrailId(tid);
      centerMapOnTrail(tid);
    },
    [centerMapOnTrail]
  );

  const markExplorerMapUserGesture = useCallback(() => {
    setMapExplorerCameraFollowSearch(false);
  }, []);

  const recenterExplorerMapOnResults = useCallback(() => {
    setMapExplorerCameraFollowSearch(true);
    setMapExplorerRecenterNonce((n) => n + 1);
  }, []);

  const actionsRef = useRef({});

  actionsRef.current = {
    loadBoxes,
    loadHostBoxes,
    loadHostBookings,
    loadHostRefunds,
    loadAthleteBookings,
    loadNotifications,
    loadMyReviews,
    openUserReviews,
    markAllNotificationsRead,
    showBookingTimeline,
    reportAccessIncident,
    markRefundDone,
    submitReview,
    loadNearbyBoxes,
    refetchExplorerBoxes,
    markExplorerMapUserGesture,
    recenterExplorerMapOnResults,
    loadTrails,
    bookBox,
    decideHostBooking,
    decideAthleteBookingChange,
    deleteHostBox,
    deleteHostBoxesByIds,
    deleteAllHostBoxes,
    deleteHostBooking,
    deleteAllHostBookings,
    updateHostBooking,
    deleteAthleteBooking,
    deleteAllAthleteBookings,
    updateAthleteBooking,
    setHostLocationFromMap,
    syncExplorerMapFromHost,
    createHostBox,
    startEditingHostBox,
    cancelHostBoxEdit,
    uploadGpx,
    uploadGpxWebFile,
    deleteTrail,
    deleteTrailsByIds,
    deleteAllMyTrails,
    centerMapOnTrail,
    isolateTrailOnMap,
    refreshSession,
    logout,
    updateMyRole,
  };

  const mainContextValue = useMemo(
    () => ({
      boxes,
      trails,
      trailsForMap,
      city,
      setCity,
      mapLat,
      mapLon,
      setMapLat,
      setMapLon,
      hostForm,
      setHostForm,
      hostEditingBoxId,
      hostReverseGeocode,
      setHostReverseGeocode,
      hostBoxes,
      hostRefunds,
      hostBookings,
      athleteBookings,
      notifications,
      myReviewsSummary,
      myReviews,
      user,
      webDropHover,
      setWebDropHover,
      trailDifficulty,
      setTrailDifficulty,
      trailListFilter,
      setTrailListFilter,
      mapShowTrails,
      setMapShowTrails,
      mapTrailDifficultyFilter,
      setMapTrailDifficultyFilter,
      mapTrailsScope,
      setMapTrailsScope,
      boxesForMap,
      mapShowBoxes,
      setMapShowBoxes,
      mapBoxCriteriaTags,
      setMapBoxCriteriaTags,
      mapListSource,
      setMapListSource,
      mapBoxesNearTrailsOnly,
      setMapBoxesNearTrailsOnly,
      mapTrailProximityKm,
      setMapTrailProximityKm,
      mapTrailPickIds,
      setMapTrailPickIds,
      mapBoxSelectionMode,
      setMapBoxSelectionMode,
      mapPickedBoxIds,
      setMapPickedBoxIds,
      mapBoxSort,
      setMapBoxSort,
      mapTrailListSort,
      setMapTrailListSort,
      mapNearTrailsMode,
      setMapNearTrailsMode,
      mapNearTrailPickIds,
      setMapNearTrailPickIds,
      boxesForExplorerList,
      trailsForExplorerList,
      mapViewportBounds,
      setMapViewportBounds,
      mapExplorerRecenterNonce,
      mapExplorerCameraFollowSearch,
      setMapExplorerCameraFollowSearch,
      mapExplorerLastSearchAt,
      mapExplorerLastSearchSource,
      bookingDate,
      setBookingDate,
      startTime,
      setStartTime,
      endTime,
      setEndTime,
      specialRequest,
      setSpecialRequest,
      selectedBoxId,
      setSelectedBoxId,
      selectedTrailId,
      setSelectedTrailId,
      canHost,
      canBook,
      selectedBox,
      selectedTrail,
      webMapCenter,
      openUserReviews,
      closeUserReviews,
      actionsRef,
    }),
    [
      boxes,
      trails,
      trailsForMap,
      city,
      mapLat,
      mapLon,
      hostForm,
      hostEditingBoxId,
      hostReverseGeocode,
      hostBoxes,
      hostRefunds,
      hostBookings,
      athleteBookings,
      notifications,
      myReviewsSummary,
      myReviews,
      user,
      webDropHover,
      trailDifficulty,
      trailListFilter,
      mapShowTrails,
      mapTrailDifficultyFilter,
      mapTrailsScope,
      boxesForMap,
      mapShowBoxes,
      mapBoxCriteriaTags,
      mapListSource,
      mapBoxesNearTrailsOnly,
      mapTrailProximityKm,
      mapTrailPickIds,
      mapBoxSelectionMode,
      mapPickedBoxIds,
      mapBoxSort,
      mapTrailListSort,
      mapNearTrailsMode,
      mapNearTrailPickIds,
      boxesForExplorerList,
      trailsForExplorerList,
      mapViewportBounds,
      mapExplorerRecenterNonce,
      mapExplorerCameraFollowSearch,
      setMapExplorerCameraFollowSearch,
      mapExplorerLastSearchAt,
      mapExplorerLastSearchSource,
      bookingDate,
      startTime,
      endTime,
      specialRequest,
      selectedBoxId,
      selectedTrailId,
      canHost,
      canBook,
      selectedBox,
      selectedTrail,
      webMapCenter,
      openUserReviews,
      closeUserReviews,
    ]
  );

  const authUiValue = useMemo(
    () => ({
      authMode,
      setAuthMode,
      email,
      setEmail,
      password,
      setPassword,
      fullName,
      setFullName,
      role,
      setRole,
      authLoading,
      register,
      login,
    }),
    [authMode, email, password, fullName, role, authLoading, register, login]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthUiContext.Provider value={authUiValue}>
          <NavigationContainer>
            <AppMainContext.Provider value={isAuthed ? mainContextValue : null}>
              <>
                <Stack.Navigator screenOptions={{ headerShown: false }}>
                  {!isAuthed ? (
                    <Stack.Screen name="Auth" component={AuthScreen} />
                  ) : (
                    <Stack.Screen name="Main" component={AuthenticatedRoot} />
                  )}
                </Stack.Navigator>
                {isAuthed ? (
                  <>
                    <UserReviewsModal
                      visible={userReviewsModal.visible}
                      userId={userReviewsModal.userId}
                      title={userReviewsModal.title}
                      onClose={closeUserReviews}
                    />
                    <BookingConfirmModal
                      visible={
                        bookingConfirm.visible &&
                        bookingConfirm.boxId != null &&
                        Boolean(
                          boxes.find((b) => b.id === bookingConfirm.boxId)
                        )
                      }
                      box={
                        boxes.find((b) => b.id === bookingConfirm.boxId) || null
                      }
                      bookingDate={bookingDate}
                      startTime={startTime}
                      endTime={endTime}
                      specialRequest={specialRequest}
                      submitting={bookingSubmitting}
                      onClose={cancelBookBoxConfirm}
                      onConfirm={confirmBookBox}
                    />
                  </>
                ) : null}
              </>
            </AppMainContext.Provider>
          </NavigationContainer>
        </AuthUiContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <RootErrorBoundary>
      <RavitoApp />
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  scrollFlex: {
    flex: 1,
  },
  explorerWebColumn: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  explorerWebSplitRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  explorerWebPanel: {
    width: "38%",
    minWidth: 360,
    maxWidth: 560,
    minHeight: 0,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.bg,
  },
  explorerWebPanelScroll: {
    flex: 1,
    minHeight: 0,
  },
  explorerWebPanelContent: {
    padding: 14,
    paddingBottom: 28,
  },
  explorerWebMapPane: {
    flex: 1,
    minWidth: 0,
  },
  explorerWebScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    maxHeight: "50vh",
  },
  explorerWebMapHost: {
    flex: 1,
    minHeight: 300,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: theme.bg,
  },
  explorerWebMapHostDesktop: {
    minHeight: 0,
    height: "100%",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  explorerWebMapInner: {
    flex: 1,
    minHeight: 300,
    maxHeight: "68vh",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
  explorerWebMapInnerDesktop: {
    minHeight: 0,
    height: "100%",
    maxHeight: undefined,
  },
  webMapPaneCaption: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.inkMuted,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  authScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  authColumn: {
    flex: 1,
    paddingHorizontal: 16,
  },
  authSegment: {
    flexDirection: "row",
    backgroundColor: theme.surfaceMuted,
    borderRadius: 14,
    padding: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  authSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  authSegmentBtnActive: {
    backgroundColor: theme.primary,
  },
  authSegmentIcon: {
    marginRight: 6,
  },
  authSegmentLabel: {
    fontWeight: "700",
    fontSize: 14,
    color: theme.inkMuted,
  },
  authSegmentLabelActive: {
    color: "#fff",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.ink,
    marginBottom: 6,
    marginTop: 12,
  },
  roleHelp: {
    fontSize: 13,
    color: theme.inkMuted,
    marginBottom: 10,
    lineHeight: 19,
  },
  hero: {
    backgroundColor: theme.hero,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 26,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  heroDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.12,
    backgroundColor: theme.heroAccent,
  },
  heroBlob1: {
    width: 180,
    height: 180,
    top: -60,
    right: -40,
  },
  heroBlob2: {
    width: 120,
    height: 120,
    bottom: -30,
    left: -20,
  },
  heroBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroLogoMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(20, 184, 166, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.35)",
  },
  heroKicker: {
    color: theme.heroAccent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#F0FDF9",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroSubtitle: {
    color: "rgba(240, 253, 249, 0.82)",
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
  },
  panel: {
    marginTop: -18,
    marginBottom: 8,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    shadowColor: theme.shadow,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    zIndex: 2,
    position: "relative",
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.ink,
  },
  panelHint: {
    color: theme.inkMuted,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.inkMuted,
    marginTop: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 12,
    color: theme.inkMuted,
    marginTop: 8,
  },
  dateTimeSummary: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.surfaceMuted,
  },
  dateTimeSummaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
  },
  dateTimeSummarySub: {
    fontSize: 14,
    color: theme.inkMuted,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(6, 27, 22, 0.45)",
    justifyContent: "center",
    padding: 18,
  },
  modalSheet: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    maxHeight: "88%",
    overflow: "hidden",
  },
  userReviewsSheet: {
    maxHeight: "92%",
  },
  bookingConfirmSheet: {
    maxHeight: "92%",
  },
  bookingRecapTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.inkMuted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSoft,
  },
  modalSheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: theme.ink,
    paddingRight: 12,
  },
  modalSheetBody: {
    maxHeight: 440,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalSheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: theme.borderSoft,
  },
  calendarNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 8,
  },
  calendarNavBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: theme.surfaceMuted,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.ink,
    textTransform: "capitalize",
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  calendarWeekCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: theme.inkMuted,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  calendarDayCell: {
    width: "14.285%",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayCellSelected: {
    backgroundColor: theme.primary,
    borderRadius: 999,
  },
  calendarDayCellDisabled: {
    opacity: 0.28,
  },
  calendarDayText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.ink,
  },
  calendarDayTextSelected: {
    color: "#fff",
  },
  calendarDayTextDisabled: {
    color: theme.inkMuted,
  },
  timePairRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  timePairCol: {
    flex: 1,
    minWidth: 0,
  },
  timeDropdownScroll: {
    maxHeight: 168,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.surfaceMuted,
  },
  timeDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  timeDropdownItemActive: {
    backgroundColor: theme.chipBg,
  },
  timeDropdownItemText: {
    fontSize: 15,
    color: theme.ink,
    fontWeight: "500",
  },
  timeDropdownItemTextActive: {
    color: theme.primary,
    fontWeight: "700",
  },
  userReviewsLoading: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  trailPickScroll: {
    maxHeight: 220,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 14,
    backgroundColor: theme.surfaceMuted,
  },
  trailPickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSoft,
  },
  trailPickRowActive: {
    backgroundColor: theme.chipBg,
  },
  section: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    shadowColor: theme.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.chipBg,
    borderWidth: 1,
    borderColor: theme.chipBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.ink,
  },
  sectionSubtitle: {
    color: theme.inkMuted,
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: theme.surfaceMuted,
    fontSize: 16,
    color: theme.ink,
  },
  inputHalf: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: theme.surfaceMuted,
    fontSize: 15,
    color: theme.ink,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  roleChip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.surfaceMuted,
  },
  roleChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  roleChipText: {
    color: theme.ink,
    fontWeight: "600",
    fontSize: 14,
  },
  roleChipTextActive: {
    color: "#fff",
  },
  buttonIconLeft: { marginRight: 8 },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    marginTop: 8,
    minHeight: 50,
  },
  primaryButtonCompact: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: theme.secondaryInk,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  secondaryButtonCompact: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 4,
    backgroundColor: theme.surface,
    alignSelf: "flex-start",
  },
  outlineButtonStretch: {
    alignSelf: "stretch",
  },
  outlineButtonCompact: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    marginTop: 2,
    marginBottom: 6,
  },
  outlineButtonDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFBFB",
  },
  outlineButtonText: {
    color: theme.secondaryInk,
    fontWeight: "600",
    fontSize: 14,
  },
  outlineButtonTextCompact: {
    fontSize: 13,
  },
  outlineButtonTextDanger: {
    color: "#B91C1C",
  },
  statBanner: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.infoBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  statBannerIcon: {
    marginRight: 4,
  },
  statBannerTitle: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 15,
  },
  statBannerText: {
    marginTop: 2,
    color: theme.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  explorerSearchMeta: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceMuted,
  },
  explorerSearchMetaText: {
    fontSize: 12,
    color: theme.inkMuted,
    lineHeight: 17,
  },
  explorerSearchMetaHint: {
    marginTop: 6,
    fontSize: 12,
    color: theme.inkMuted,
    lineHeight: 17,
  },
  explorerSelectionSummary: {
    marginTop: 10,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: "#F7FAF9",
  },
  explorerSelectionSummaryText: {
    fontSize: 12,
    color: theme.ink,
    fontWeight: "700",
  },
  explorerSelectionSummaryHint: {
    marginTop: 4,
    fontSize: 12,
    color: theme.inkMuted,
  },
  infoBanner: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.warnBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.warnBorder,
  },
  infoBannerTitle: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 15,
  },
  infoBannerText: {
    marginTop: 2,
    color: theme.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  selectedHostCard: {
    marginTop: 14,
    backgroundColor: theme.infoBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  selectedLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 16,
    padding: 14,
    paddingTop: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.primary,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  hostBoxActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  swipeActionsWrap: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 12,
    marginLeft: 8,
  },
  swipeActionBtn: {
    minWidth: 84,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    gap: 4,
  },
  swipeEditAction: {
    backgroundColor: "#0F766E",
  },
  swipeDeleteAction: {
    backgroundColor: "#B91C1C",
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  selectAllChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceMuted,
    alignSelf: "flex-start",
  },
  selectAllChipText: {
    fontWeight: "600",
    fontSize: 14,
    color: theme.ink,
    marginLeft: 8,
  },
  boxSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingLeft: 4,
  },
  boxSelectLabel: {
    flex: 1,
    fontSize: 13,
    color: theme.inkMuted,
    fontWeight: "600",
    marginLeft: 10,
  },
  cardTitle: {
    fontWeight: "700",
    color: theme.ink,
    fontSize: 16,
    marginBottom: 4,
    paddingLeft: 8,
  },
  cardMeta: {
    color: theme.inkMuted,
    marginBottom: 10,
    fontSize: 14,
    paddingLeft: 8,
  },
  badge: {
    alignSelf: "flex-start",
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: "700",
    fontSize: 12,
  },
  selectionPill: {
    alignSelf: "flex-start",
    marginLeft: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  selectionPillActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#5EEAD4",
  },
  selectionPillIdle: {
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.borderSoft,
  },
  selectionPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  selectionPillTextActive: {
    color: "#0F766E",
  },
  selectionPillTextIdle: {
    color: theme.inkMuted,
  },
  emptyText: {
    color: theme.inkMuted,
    fontStyle: "italic",
    marginTop: 6,
    fontSize: 14,
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: 8,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.chipBg,
    borderWidth: 2,
    borderColor: theme.chipBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.primary,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.ink,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.inkMuted,
    marginTop: 4,
  },
  profileRolePill: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.border,
  },
  profileRoleText: {
    fontWeight: "700",
    color: theme.primary,
    fontSize: 13,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  roleHintOnlyHost: {
    marginTop: 8,
    color: theme.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.border,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 14,
    backgroundColor: theme.surfaceMuted,
  },
  dropZoneActive: {
    borderColor: theme.primary,
    backgroundColor: theme.chipBg,
  },
  dropZoneText: {
    marginTop: 10,
    fontWeight: "700",
    color: theme.ink,
    fontSize: 16,
  },
  dropZoneHint: {
    marginTop: 6,
    fontSize: 13,
    color: theme.inkMuted,
    textAlign: "center",
    maxWidth: 360,
    lineHeight: 18,
  },
  localGpxHintCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: "#F8FBFA",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  localGpxHintTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  localGpxHintTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.ink,
    marginBottom: 8,
  },
  localGpxHintText: {
    color: theme.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  forgotLinkWrap: {
    marginTop: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  forgotLinkText: {
    color: theme.primary,
    fontWeight: "600",
    fontSize: 14,
  },
});

function AuthScreen() {
  const ctx = useContext(AuthUiContext);
  if (!ctx) return null;
  const {
    authMode,
    setAuthMode,
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
    role,
    setRole,
    authLoading,
    register,
    login,
  } = ctx;

  const isRegister = authMode === "register";

  const forgotPasswordHint = () => {
    userAlert(
      "Mot de passe oublié",
      "Il n’y a pas encore de réinitialisation automatique par email.\n\n" +
        "Solution gratuite typique : envoyer un lien signé par email (Resend ou Brevo : " +
        "niveaux gratuits, ou SMTP).\n\n" +
        "Pour ce MVP, recrée un compte avec un autre email ou contacte l’administrateur du service."
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <ScrollView
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.authScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.authColumn, AUTH_COLUMN]}>
          <View style={styles.hero}>
            <View style={styles.heroDecor} pointerEvents="none">
              <View style={[styles.heroBlob, styles.heroBlob1]} />
              <View style={[styles.heroBlob, styles.heroBlob2]} />
            </View>
            <View style={styles.heroBrandRow}>
              <View style={styles.heroLogoMark}>
                <Ionicons name="leaf" size={26} color={theme.heroAccent} />
              </View>
              <View style={styles.heroTitleBlock}>
                <Text style={styles.heroKicker}>Outdoor & ravitaillement</Text>
                <Text style={styles.heroTitle}>RavitoBox</Text>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>
              Réserve un point ravito sur ton parcours et découvre des traces
              GPX locales.
            </Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.authSegment}>
              <TouchableOpacity
                style={[
                  styles.authSegmentBtn,
                  !isRegister && styles.authSegmentBtnActive,
                  Platform.OS === "web" && { cursor: "pointer" },
                ]}
                onPress={() => setAuthMode("login")}
                activeOpacity={0.9}
                disabled={authLoading}
              >
                <Ionicons
                  name="log-in-outline"
                  size={18}
                  color={!isRegister ? "#fff" : theme.inkMuted}
                  style={styles.authSegmentIcon}
                  pointerEvents="none"
                />
                <Text
                  pointerEvents="none"
                  style={[
                    styles.authSegmentLabel,
                    !isRegister && styles.authSegmentLabelActive,
                  ]}
                >
                  Connexion
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.authSegmentBtn,
                  isRegister && styles.authSegmentBtnActive,
                  Platform.OS === "web" && { cursor: "pointer" },
                ]}
                onPress={() => setAuthMode("register")}
                activeOpacity={0.9}
                disabled={authLoading}
              >
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color={isRegister ? "#fff" : theme.inkMuted}
                  style={styles.authSegmentIcon}
                  pointerEvents="none"
                />
                <Text
                  pointerEvents="none"
                  style={[
                    styles.authSegmentLabel,
                    isRegister && styles.authSegmentLabelActive,
                  ]}
                >
                  Inscription
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.panelHint}>
              {isRegister
                ? "Crée un compte : nom affiché, email et mot de passe. Choisis ton rôle."
                : "Connecte-toi uniquement avec ton email et ton mot de passe."}
            </Text>

            {isRegister ? (
              <>
                <Text style={styles.inputLabel}>Nom affiché</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex. Camille Martin"
                  placeholderTextColor={theme.inkMuted}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  editable={!authLoading}
                />
              </>
            ) : null}

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="toi@exemple.com"
              placeholderTextColor={theme.inkMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!authLoading}
            />

            <Text style={styles.inputLabel}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder={
                isRegister ? "Au moins 6 caractères" : "Ton mot de passe"
              }
              placeholderTextColor={theme.inkMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={isRegister ? "newPassword" : "password"}
              autoComplete={isRegister ? "password-new" : "password"}
              editable={!authLoading}
            />

            {isRegister ? (
              <>
                <Text style={styles.fieldLabel}>Ton profil</Text>
                <Text style={styles.roleHelp}>
                  Athlète : réserver des box. Hôte : en publier. Les deux : les
                  deux.
                </Text>
                <View style={styles.roleRow}>
                  {["athlete", "host", "both"].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.roleChip,
                        role === r && styles.roleChipActive,
                        Platform.OS === "web" && { cursor: "pointer" },
                      ]}
                      onPress={() => setRole(r)}
                      activeOpacity={0.85}
                      disabled={authLoading}
                    >
                      <Text
                        pointerEvents="none"
                        style={[
                          styles.roleChipText,
                          role === r && styles.roleChipTextActive,
                        ]}
                      >
                        {ROLE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <PrimaryButton
                  label="Créer mon compte"
                  icon="checkmark-circle-outline"
                  onPress={register}
                  loading={authLoading}
                />
              </>
            ) : (
              <>
                <PrimaryButton
                  label="Se connecter"
                  icon="arrow-forward-outline"
                  onPress={login}
                  loading={authLoading}
                />
                <TouchableOpacity
                  onPress={forgotPasswordHint}
                  style={[
                    styles.forgotLinkWrap,
                    Platform.OS === "web" && { cursor: "pointer" },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotLinkText} pointerEvents="none">
                    Mot de passe oublié ?
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
