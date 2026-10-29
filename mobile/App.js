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
  AppState,
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
import TrailElevationProfile from "./TrailElevationProfile";
import TrailProfileRail from "./TrailProfileRail";
import TrailMapInspectOverlay from "./TrailMapInspectOverlay";
import ExplorerMapChrome from "./ExplorerMapChrome";
import TrailAltitudeBadge from "./TrailAltitudeBadge";
import PlansScreenBase from "./PlansScreen";
import {
  RelevanceBadge,
  RelevanceVoteRow,
  formatTrailSignals,
  formatPlanSignals,
  formatHostRatingShort,
} from "./relevanceIndicators";
import {
  formatTrailElevationSummary,
  probeTrailAt,
} from "./trailProfile";
import {
  planBoxValidationLabel,
  planBoxApprovalLabel,
  planBoxHasActiveBooking,
  formatPlanBoxSlot,
  formatPlanBoxPrice,
  bookingCanAthleteEdit,
  bookingCanAthletePay,
  bookingFunnelStepLabel,
  bookingPaymentLabel,
  isBookingPaid,
} from "./planBoxReservation";
import {
  buildTrailMapPoints,
  trailMapPointId,
  tipMapPointId,
  mapPointDomId,
  planBoxDomId,
} from "./trailMapPoints";
import {
  loadExplorerSavedProbes,
  persistExplorerSavedProbes,
  formatExplorerProbePlanNote,
  syncPublishedTipIdsForTrail,
  isEntryPublishedOnTrail,
} from "./explorerSavedProbesStorage";
import IntentGuideBanner from "./IntentGuideBanner";
import ExplorerFocusSheet from "./ExplorerFocusSheet";
import DiscoverMobileBookingSheet from "./DiscoverMobileBookingSheet";
import MoreActions from "./MoreActions";
import CapabilityCards from "./CapabilityCards";
import FunnelSteps from "./FunnelSteps";
import theme from "./theme";
import { parseMapCoords } from "./geoMap";
import useAthleticFonts from "./useAthleticFonts";
import { getDevicePosition } from "./liveLocation";
import {
  BOX_OFFER_TAGS,
  ATHLETE_NEED_TAGS,
  PROJECT_ACTIVITIES,
  formatBoxOfferLines as formatOutdoorBoxOffer,
  boxWaterLabel as outdoorBoxWaterLabel,
  toggleTagInText,
  textHasTag,
} from "./outdoorNeeds";
import {
  isSimpleUi as readSimpleUiPref,
  setSimpleUi as writeSimpleUiPref,
  getCapabilities,
  setCapabilities as writeCapabilities,
  defaultCapabilitiesFromRole,
  roleFromCapabilities,
} from "./uiPrefsStorage";
import AccountRecoveryCodeModal from "./AccountRecoveryCodeModal";
import {
  RavitoRequestModal,
  RavitoAthleteRequestsSection,
  RavitoHostRequestsSection,
} from "./RavitoRequestsUi";
import {
  readAuthSession,
  writeAuthSession,
  clearAuthSession,
} from "./authSessionStorage";
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

/** Navigation onglets (Carte, Resa, …) — partagée hors MainTabs. */
const mainTabNavigationRef = { current: null };

/** Backend Node (Render « Web Service »), pas l’URL du site statique. */
const PROD_API_BASE_URL = "https://projetsportnature.onrender.com/api";
const DEV_API_BASE_URL = "http://localhost:3000/api";

function withApiSuffix(url) {
  if (!url || typeof url !== "string") return "";
  const t = url.trim().replace(/\/$/, "");
  if (!t) return "";
  return /\/api$/i.test(t) ? t : `${t}/api`;
}

/**
 * URL du backend JSON. En prod web sur Render : si EXPO_PUBLIC_API_URL pointe vers
 * le même hôte que la page (site statique), on utilise PROD_API_BASE_URL — comme
 * pour les box, les écritures doivent frapper le Web Service Node, pas le static.
 */
function getApiBaseUrl() {
  const envRaw =
    typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL
      ? String(process.env.EXPO_PUBLIC_API_URL).trim()
      : "";
  const envNorm = withApiSuffix(envRaw);

  if (__DEV__) {
    return envNorm || DEV_API_BASE_URL;
  }

  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.hostname
  ) {
    const pageOrigin =
      `${window.location.protocol}//${window.location.host}`.replace(/\/$/, "");
    if (envNorm) {
      const apiOrigin = envNorm.replace(/\/api\/?$/i, "").replace(/\/$/, "");
      if (apiOrigin === pageOrigin) {
        return PROD_API_BASE_URL;
      }
    } else if (/-1\.onrender\.com$/i.test(window.location.hostname)) {
      return PROD_API_BASE_URL;
    }
  }

  return envNorm || PROD_API_BASE_URL;
}

const API_BASE_URL = getApiBaseUrl();

/** Origine du serveur (fichiers statiques /uploads, sans /api). */
const API_STATIC_ORIGIN = API_BASE_URL.replace(/\/api\/?$/i, "");

function absoluteUploadUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_STATIC_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

const {
  DEFAULT_AVAILABILITY_SCHEDULE,
  parseAvailabilityScheduleFromBox,
  isSlotMatchingSchedule,
  evaluateBookingAgainstSchedule,
} = require("./boxAvailability");

const HOST_AVAIL_WEEKDAY_LABELS = [
  "Dim",
  "Lun",
  "Mar",
  "Mer",
  "Jeu",
  "Ven",
  "Sam",
];

function cloneDefaultAvailabilitySchedule() {
  return {
    quietHoursEnabled: DEFAULT_AVAILABILITY_SCHEDULE.quietHoursEnabled,
    quietStart: DEFAULT_AVAILABILITY_SCHEDULE.quietStart,
    quietEnd: DEFAULT_AVAILABILITY_SCHEDULE.quietEnd,
    closedWeekdays: [...DEFAULT_AVAILABILITY_SCHEDULE.closedWeekdays],
    blockedRanges: DEFAULT_AVAILABILITY_SCHEDULE.blockedRanges.map((r) => ({
      ...r,
    })),
  };
}

function hostAvailabilityFromBox(box) {
  const p = parseAvailabilityScheduleFromBox(box);
  if (!p) return cloneDefaultAvailabilitySchedule();
  return {
    quietHoursEnabled: p.quietHoursEnabled,
    quietStart: p.quietStart,
    quietEnd: p.quietEnd,
    closedWeekdays: [...p.closedWeekdays],
    blockedRanges: p.blockedRanges.map((r) => ({
      start: r.start,
      end: r.end,
      note: r.note,
    })),
  };
}

const TRAIL_LOCAL_PATCHES_PREFIX = "ravitobox_trail_local_patches_";
const TRAIL_LOCAL_PATCHES_SUFFIX = "_v1";

function trailLocalPatchesStorageKey(userId) {
  const id =
    userId != null && String(userId).trim() !== "" ? String(userId) : "anon";
  return `${TRAIL_LOCAL_PATCHES_PREFIX}${id}${TRAIL_LOCAL_PATCHES_SUFFIX}`;
}

/** Cache hors localStorage (native, même session). */
const trailPatchesMemoryByUser = {};

function readTrailPatchesFromStorage(userId) {
  const key = trailLocalPatchesStorageKey(userId);
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const s = localStorage.getItem(key);
      if (s) {
        const o = JSON.parse(s);
        return o && typeof o === "object" ? o : {};
      }
      return {};
    }
  } catch (_e) {
    // private mode / quota
  }
  return { ...(trailPatchesMemoryByUser[key] || {}) };
}

function writeTrailPatchesToStorage(userId, obj) {
  const key = trailLocalPatchesStorageKey(userId);
  const safe = obj && typeof obj === "object" ? { ...obj } : {};
  trailPatchesMemoryByUser[key] = safe;
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(safe));
    }
  } catch (_e) {
    // ignore
  }
}

/** Applique les champs modifiés en local (API indisponible / 404) sur les lignes serveur. */
function applyTrailLocalPatches(rows, patches, userId) {
  if (!Array.isArray(rows)) return [];
  if (!patches || typeof patches !== "object") return rows;
  const uid = userId != null ? Number(userId) : null;
  return rows.map((t) => {
    const p = patches[String(t.id)];
    if (!p || typeof p !== "object") return t;
    if (uid != null && Number.isFinite(uid)) {
      if (Number(t.creator_user_id) !== uid) return t;
    }
    const { criteriaTags, ...restPatch } = p;
    const out = { ...t, ...restPatch };
    if (Array.isArray(criteriaTags)) {
      out.criteria_json = JSON.stringify(criteriaTags);
    }
    delete out.criteriaTags;
    out._savedLocally = 1;
    return out;
  });
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
  const south = Number(bounds.south);
  const north = Number(bounds.north);
  const west = Number(bounds.west);
  const east = Number(bounds.east);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east)
  ) {
    return false;
  }
  const lonInBounds =
    west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
  return lat >= south && lat <= north && lonInBounds;
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

/* theme importé depuis ./theme (design outdoor unifié) */

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ROLE_LABELS = {
  athlete: "Utilisateur",
  host: "Hôte",
  both: "Multi-casquettes",
};

function formatCapabilitiesLabel(caps) {
  const parts = [];
  if (caps?.user) parts.push("Utilisateur");
  if (caps?.host) parts.push("Hôte");
  if (caps?.ravito) parts.push("Ravitailleur");
  return parts.length ? parts.join(" · ") : "Aucune activité";
}
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
  return outdoorBoxWaterLabel(box);
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

/** Résumé lisible de l’offre d’une box (eau, snacks, notes hôte). */
function formatBoxOfferLines(box) {
  return formatOutdoorBoxOffer(box);
}

const BOOKING_NEED_CHIPS = ATHLETE_NEED_TAGS;

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

function bookingAgendaPhase(booking, now = new Date()) {
  const approval = String(booking?.approval_status || "pending");
  const status = String(booking?.status || "");
  const start = parseBookingDateTimeLocal(
    booking?.booking_date,
    booking?.start_time
  );
  const end = parseBookingDateTimeLocal(
    booking?.booking_date,
    booking?.end_time
  );
  if (
    status === "cancelled" ||
    approval === "cancelled_by_athlete" ||
    approval === "cancelled_box_deleted"
  ) {
    return { key: "cancelled", label: "Annulée", color: "#B91C1C" };
  }
  if (approval === "rejected") {
    return { key: "rejected", label: "Refusée", color: "#B45309" };
  }
  if (approval === "accepted") {
    if (start && end && now >= start && now <= end) {
      return { key: "ongoing", label: "En cours", color: theme.picked || theme.mapTeal };
    }
    if (start && now < start) {
      return { key: "upcoming", label: "Validée et prévue", color: "#0369A1" };
    }
    if (end && now > end) {
      return { key: "past", label: "Passée", color: "#6B7280" };
    }
    return { key: "accepted", label: "Validée", color: "#0369A1" };
  }
  if (
    approval === "pending" ||
    approval === "pending_host_confirmation" ||
    approval === "pending_athlete_confirmation"
  ) {
    return { key: "pending", label: "En attente", color: "#7C3AED" };
  }
  return {
    key: "other",
    label: bookingApprovalLabel(approval),
    color: "#334155",
  };
}

function buildBookingAgendaEntries(bookings, { hostView = false } = {}) {
  const now = new Date();
  return (Array.isArray(bookings) ? bookings : [])
    .map((b) => {
      const start = parseBookingDateTimeLocal(b?.booking_date, b?.start_time);
      const phase = bookingAgendaPhase(b, now);
      const who = hostView
        ? b?.athlete_full_name || "Athlète"
        : b?.host_full_name || "Hôte";
      const place = b?.box_city ? ` · ${b.box_city}` : "";
      return {
        id: b.id,
        dateKey: b?.booking_date || "9999-12-31",
        sortStamp: start ? start.getTime() : Number.MAX_SAFE_INTEGER,
        title: b?.box_title || `Box #${b?.box_id || "?"}`,
        subline: `${who}${place}`,
        slot: `${b?.start_time || "?"}–${b?.end_time || "?"}`,
        phase,
      };
    })
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      if (a.sortStamp !== b.sortStamp) return a.sortStamp - b.sortStamp;
      return Number(a.id || 0) - Number(b.id || 0);
    });
}

function canShowBookingAccessInfo(booking, now = new Date()) {
  const approval = String(booking?.approval_status || "pending");
  if (approval !== "accepted") return false;
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

/** Libellé trace lisible (ignore hashes / ids techniques). */
function cleanTrailLabel(name) {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (!t || t.length > 48) return null;
  if (/^[a-f0-9_]{10,}/i.test(t)) return null;
  if (/^[0-9a-f-]{20,}$/i.test(t)) return null;
  return t;
}

/** Récap court d’un projet pour aperçu avant activation. */
function planPreviewRecap(plan) {
  if (!plan) {
    return {
      title: "Curiosité",
      lines: [
        "Sans projet — tu regardes la carte librement.",
        "Choisis un projet pour voir traces, box et ravito liés.",
      ],
    };
  }
  const boxes = Number(
    plan.selected_box_count ??
      (Array.isArray(plan.boxes) ? plan.boxes.length : 0) ??
      0
  );
  const notes = Array.isArray(plan.trail_notes) ? plan.trail_notes.length : 0;
  const trail = cleanTrailLabel(plan.trail_name);
  const activity = plan.activity
    ? String(plan.activity).replace(/_/g, " ")
    : null;
  const lines = [
    trail ? `Trace · ${trail}` : null,
    boxes === 0 ? "0 box liée" : `${boxes} box sur le parcours`,
    notes > 0 ? `${notes} ravito / point GPS` : null,
    activity ? `Activité · ${activity}` : null,
  ].filter(Boolean);
  return {
    title: plan.name || `Projet #${plan.id}`,
    lines: lines.length ? lines : ["Projet sans détail"],
  };
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

const HOST_CRITERIA_OPTIONS = BOX_OFFER_TAGS;

/** Tags affichés sur les traces (import + édition). */
const TRAIL_CRITERIA_OPTIONS = [
  "Boucle",
  "Aller simple ou A/R",
  "Vue panoramique",
  "Lac ou rivière",
  "Forêt",
  "Refuge ou abri proche",
  "Peu de dénivelé",
  "Gros dénivelé",
  "Passages techniques",
  "Exposition (vide, falaise…)",
  "Boue possible",
  "Peu fréquenté",
  "Adapté famille / débutant",
  "Signalétique claire",
];

const TRAIL_ACTIVITY_IDS = [
  "hike",
  "trail_run",
  "road_bike",
  "mtb",
  "gravel",
  "ski_nordic",
  "ski_alp",
  "other",
];

const TRAIL_ACTIVITY_LABELS = {
  hike: "Randonnée",
  trail_run: "Trail / course nature",
  road_bike: "Route (vélo)",
  mtb: "VTT / enduro",
  gravel: "Gravel",
  ski_nordic: "Ski de fond",
  ski_alp: "Ski alpin / rando ski",
  other: "Autre",
};

function parseTrailCriteriaFromRow(trail) {
  const raw = trail?.criteria_json;
  if (!raw) return [];
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [];
  } catch (_e) {
    return [];
  }
}

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

function hasTimeOverlapWithSlots(startTime, endTime, slots) {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (
    !Number.isFinite(startMin) ||
    !Number.isFinite(endMin) ||
    endMin <= startMin
  )
    return false;
  const list = Array.isArray(slots) ? slots : [];
  for (const slot of list) {
    const slotStart = timeToMinutes(slot?.startTime);
    const slotEnd = timeToMinutes(slot?.endTime);
    if (
      !Number.isFinite(slotStart) ||
      !Number.isFinite(slotEnd) ||
      slotEnd <= slotStart
    )
      continue;
    if (startMin < slotEnd && slotStart < endMin) return true;
  }
  return false;
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function explorerSlotWellFormed(bookingDate, startTime, endTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate || "").trim()))
    return false;
  const sm = timeToMinutes(startTime);
  const em = timeToMinutes(endTime);
  if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) return false;
  return true;
}

function availabilityScheduleBlockingLine(
  scheduleJson,
  bookingDate,
  startTime,
  endTime
) {
  const r = evaluateBookingAgainstSchedule(scheduleJson, {
    bookingDate,
    startTime,
    endTime,
  });
  if (r.ok) return null;
  switch (r.reason) {
    case "closed_weekday":
      return "L'hôte a indiqué que ce box est fermé ce jour-là.";
    case "blocked_range":
      return "Cette date tombe dans une période bloquée par l'hôte.";
    case "quiet_hours":
      return "Le créneau chevauche les plages horaires non disponibles définies par l'hôte.";
    default:
      return "Ce créneau ne correspond pas aux disponibilités définies par l'hôte.";
  }
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
  const scheduleBlock = availabilityScheduleBlockingLine(
    box?.availability_schedule_json,
    bookingDate,
    startTime,
    endTime
  );
  if (scheduleBlock) {
    blocking.push(scheduleBlock);
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

/**
 * Rempli par RavitoApp : refresh synchrone (ref) pour les retries 401 après rotation du refresh token.
 */
const apiAuthBridge = {
  getRefreshToken: () => null,
  applySessionTokens: (_access, _refresh) => {},
};

let authRefreshPromise = null;

function throwIfHtmlResponse(trimmed, response, method, path, root) {
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.toLowerCase().startsWith("<html")
  ) {
    throw new Error(
      `Réponse HTML (${response.status}) : ${method} ${path} sur « ${root} » (pas de JSON). Causes fréquentes : (1) EXPO_PUBLIC_API_URL pointe vers un site statique au lieu du Web Service Node ; (2) le backend Render n’a pas été redéployé depuis main (routes mise à jour trace : PATCH/PUT /api/trails/:id, POST /api/update-trail). Référence API : ${PROD_API_BASE_URL}`
    );
  }
}

async function refreshAccessTokenOnce({ baseUrl, signal }) {
  const rt = apiAuthBridge.getRefreshToken?.();
  if (!rt) return null;
  const root =
    typeof baseUrl === "string" && baseUrl.trim()
      ? baseUrl.trim()
      : API_BASE_URL;
  const response = await fetch(`${root}/auth/refresh`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    const trimmed = text.trim();
    throwIfHtmlResponse(trimmed, response, "POST", "/auth/refresh", root);
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!response.ok) return null;
  if (data.token && data.refreshToken) {
    apiAuthBridge.applySessionTokens(data.token, data.refreshToken);
    return data.token;
  }
  return null;
}

function waitForAuthRefresh({ baseUrl, signal }) {
  if (!authRefreshPromise) {
    authRefreshPromise = refreshAccessTokenOnce({ baseUrl, signal }).finally(
      () => {
        authRefreshPromise = null;
      }
    );
  }
  return authRefreshPromise;
}

function errorMessageFromApiData(data, response, method, path) {
  const err = data.error;
  const fieldMsgs = parseFieldErrorsFromApiError(err);
  return typeof err === "string"
    ? err
    : fieldMsgs.length > 0
    ? fieldMsgs.join(" · ")
    : err && typeof err === "object"
    ? JSON.stringify(err)
    : response.status === 404
    ? `Endpoint API introuvable: ${method} ${path}`
    : "Erreur réseau ou serveur";
}

async function apiFetch(
  path,
  {
    method = "GET",
    body,
    token,
    signal,
    baseUrl,
    _retryAfterRefresh = false,
  } = {}
) {
  const root =
    typeof baseUrl === "string" && baseUrl.trim()
      ? baseUrl.trim()
      : API_BASE_URL;
  const response = await fetch(`${root}${path}`, {
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
    const trimmed = text.trim();
    throwIfHtmlResponse(trimmed, response, method, path, root);
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text.slice(0, 180) || "Réponse invalide du serveur");
    }
  }
  if (!response.ok) {
    const errStr =
      typeof data.error === "string" ? data.error.trim().toLowerCase() : "";
    const isExpiredAccess =
      errStr === "invalid or expired token" || errStr.includes("jwt expired");
    if (
      !_retryAfterRefresh &&
      token &&
      response.status === 401 &&
      isExpiredAccess &&
      path !== "/auth/refresh" &&
      path !== "/auth/login" &&
      path !== "/auth/logout"
    ) {
      const fresh = await waitForAuthRefresh({ baseUrl, signal });
      if (fresh) {
        return apiFetch(path, {
          method,
          body,
          token: fresh,
          signal,
          baseUrl,
          _retryAfterRefresh: true,
        });
      }
    }
    const msg = errorMessageFromApiData(data, response, method, path);
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

function confirmComposerClearAfterSave() {
  const title = "Nouvelle composition ?";
  const message =
    "Les brouillons inclus dans ce plan sont encore dans l’onglet Composer. Les effacer pour repartir sur une trace vierge ?";
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Garder les brouillons", onPress: () => resolve(false) },
      { text: "Effacer les brouillons", onPress: () => resolve(true) },
    ]);
  });
}

function confirmExitTrailSelection() {
  const title = "Quitter la trace";
  const message =
    "Êtes-vous sûr de vouloir quitter la trace sélectionnée ?";
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Quitter", onPress: () => resolve(true) },
    ]);
  });
}

function Section({ title, subtitle, icon, children, onLayout, flat }) {
  return (
    <View
      style={[styles.section, flat && styles.sectionFlat]}
      onLayout={onLayout}
    >
      <View style={[styles.sectionHeader, flat && styles.sectionHeaderFlat]}>
        {icon && !flat ? (
          <View style={styles.sectionIconWrap}>
            <Ionicons name={icon} size={20} color={theme.primary} />
          </View>
        ) : null}
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, flat && styles.sectionTitleFlat]}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.sectionSubtitle,
                flat && styles.sectionSubtitleFlat,
              ]}
            >
              {subtitle}
            </Text>
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
function OutlineButton({
  label,
  onPress,
  icon,
  danger,
  compact,
  stretch,
  disabled,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.outlineButton,
        compact && styles.outlineButtonCompact,
        danger && styles.outlineButtonDanger,
        stretch && styles.outlineButtonStretch,
        disabled && styles.buttonDisabled,
        Platform.OS === "web" && { cursor: disabled ? "default" : "pointer" },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={compact ? 16 : 17}
          color={danger ? theme.danger || "#B91C1C" : theme.primary}
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
/** Libellés courts (lundi en premier, aligné avec calendarCellsForMonth). */
const CAL_WEEKDAY_LABELS_MODERN = [
  "lun.",
  "mar.",
  "mer.",
  "jeu.",
  "ven.",
  "sam.",
  "dim.",
];
const TIME_WHEEL_ITEM_H = 40;
const TIME_WHEEL_VIEW_H = 200;
const TIME_WHEEL_PAD = (TIME_WHEEL_VIEW_H - TIME_WHEEL_ITEM_H) / 2;

function maxBookableIso() {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + 365);
  return isoFromYmd(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Sélecteur type apps de réservation : deux colonnes avec ligne centrale et snap. */
function TimeWheelPicker({ label, value, onChange }) {
  const { h: hSel, m: mSel } = parseTimeToParts(value);
  const hourRef = useRef(null);
  const minRef = useRef(null);

  const snapHour = useCallback(
    (y) => {
      const idx = Math.round(y / TIME_WHEEL_ITEM_H);
      const hh = Math.min(23, Math.max(0, idx));
      if (hh !== hSel) onChange(partsToTime(hh, mSel));
    },
    [hSel, mSel, onChange]
  );

  const snapMin = useCallback(
    (y) => {
      const idx = Math.round(y / TIME_WHEEL_ITEM_H);
      const mm = Math.min(59, Math.max(0, idx));
      if (mm !== mSel) onChange(partsToTime(hSel, mm));
    },
    [hSel, mSel, onChange]
  );

  useEffect(() => {
    const yh = hSel * TIME_WHEEL_ITEM_H;
    const ym = mSel * TIME_WHEEL_ITEM_H;
    requestAnimationFrame(() => {
      hourRef.current?.scrollTo({ y: yh, animated: false });
      minRef.current?.scrollTo({ y: ym, animated: false });
    });
  }, [value, label]);

  return (
    <View style={styles.timeWheelSection}>
      <Text style={styles.dateTimeWheelLabel}>{label}</Text>
      <View style={styles.timeWheelShell}>
        <View style={styles.timeWheelHighlightBand} pointerEvents="none" />
        <View style={styles.timeWheelInnerRow}>
          <ScrollView
            ref={hourRef}
            style={styles.timeWheelScrollCol}
            contentContainerStyle={{
              paddingVertical: TIME_WHEEL_PAD,
              paddingHorizontal: 4,
            }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            snapToInterval={TIME_WHEEL_ITEM_H}
            snapToAlignment="start"
            decelerationRate="fast"
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) =>
              snapHour(e.nativeEvent.contentOffset.y)
            }
          >
            {HOUR_OPTIONS.map((hh) => {
              const active = hh === hSel;
              return (
                <TouchableOpacity
                  key={`${label}-h-${hh}`}
                  style={styles.timeWheelItem}
                  onPress={() => {
                    onChange(partsToTime(hh, mSel));
                    hourRef.current?.scrollTo({
                      y: hh * TIME_WHEEL_ITEM_H,
                      animated: true,
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={
                      active
                        ? styles.timeWheelItemTextActive
                        : styles.timeWheelItemText
                    }
                  >
                    {String(hh).padStart(2, "0")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.timeWheelColon}>:</Text>
          <ScrollView
            ref={minRef}
            style={styles.timeWheelScrollCol}
            contentContainerStyle={{
              paddingVertical: TIME_WHEEL_PAD,
              paddingHorizontal: 4,
            }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            snapToInterval={TIME_WHEEL_ITEM_H}
            snapToAlignment="start"
            decelerationRate="fast"
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) =>
              snapMin(e.nativeEvent.contentOffset.y)
            }
          >
            {MINUTE_OPTIONS.map((mm) => {
              const active = mm === mSel;
              return (
                <TouchableOpacity
                  key={`${label}-m-${mm}`}
                  style={styles.timeWheelItem}
                  onPress={() => {
                    onChange(partsToTime(hSel, mm));
                    minRef.current?.scrollTo({
                      y: mm * TIME_WHEEL_ITEM_H,
                      animated: true,
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={
                      active
                        ? styles.timeWheelItemTextActive
                        : styles.timeWheelItemText
                    }
                  >
                    {String(mm).padStart(2, "0")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function addMinutesToTimeString(timeStr, addMin) {
  const base = timeToMinutes(timeStr);
  if (!Number.isFinite(base)) return timeStr;
  let m = base + addMin;
  const max = 24 * 60 - 1;
  if (m > max) m = max;
  return partsToTime(Math.floor(m / 60), m % 60);
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
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.dateTimeModalBackdrop}>
          <TouchableOpacity
            style={styles.dateTimeModalDismiss}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={styles.dateTimeSheet}>
            <View style={styles.dateTimeGrabber} />
            <View style={styles.dateTimeSheetHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalSheetTitle}>Créneau</Text>
                <Text style={styles.dateTimeSheetSubtitle}>
                  Choisis le jour, puis l’heure de début et de fin.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={12}
                style={styles.dateTimeCloseBtn}
                accessibilityLabel="Fermer"
              >
                <Ionicons name="close" size={22} color={theme.inkMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.dateTimeSheetBody}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <View style={styles.dateTimeCalendarCard}>
                <View style={styles.calendarNav}>
                  <TouchableOpacity
                    onPress={() => shiftMonth(-1)}
                    style={styles.calendarNavBtnModern}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={theme.primary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthTitleModern}>
                    {monthTitle}
                  </Text>
                  <TouchableOpacity
                    onPress={() => shiftMonth(1)}
                    style={styles.calendarNavBtnModern}
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
                  {CAL_WEEKDAY_LABELS_MODERN.map((w, i) => (
                    <Text key={`wd-${i}`} style={styles.calendarWeekCellModern}>
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
                    const isToday = iso === today;
                    return (
                      <TouchableOpacity
                        key={iso}
                        style={[
                          styles.calendarDayCell,
                          sel && styles.calendarDayCellSelectedModern,
                          dis && styles.calendarDayCellDisabled,
                          !sel &&
                            !dis &&
                            isToday &&
                            styles.calendarDayCellTodayRing,
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
              </View>

              <TimeWheelPicker
                label="Début"
                value={draftStart}
                onChange={setDraftStartSafe}
              />
              <TimeWheelPicker
                label="Fin"
                value={draftEnd}
                onChange={setDraftEnd}
              />
              <Text style={styles.dateTimeQuickDurLabel}>Durée rapide (fin)</Text>
              <View style={styles.dateTimeQuickDurRow}>
                {[
                  { min: 30, label: "30 min" },
                  { min: 60, label: "1 h" },
                  { min: 120, label: "2 h" },
                  { min: 180, label: "3 h" },
                ].map((opt) => (
                  <TouchableOpacity
                    key={`dur-${opt.min}`}
                    style={styles.dateTimeQuickChip}
                    onPress={() =>
                      setDraftEnd(addMinutesToTimeString(draftStart, opt.min))
                    }
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dateTimeQuickChipText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.dateTimeSheetFooter}>
              <OutlineButton
                compact
                label="Annuler"
                icon="close-circle-outline"
                onPress={() => setOpen(false)}
              />
              <PrimaryButton
                compact
                label="Confirmer"
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

function UserReviewsModal({
  visible,
  userId,
  title,
  onClose,
  authToken,
  onFollowChange,
}) {
  const [loading, setLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    if (!visible || !userId) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/users/${userId}/reviews`, { token: authToken || undefined })
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
  }, [visible, userId, authToken]);

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
            {payload?.canFollow && authToken ? (
              <PrimaryButton
                compact
                icon={payload.following ? "person-remove-outline" : "person-add-outline"}
                label={payload.following ? "Ne plus suivre" : "Suivre"}
                loading={followBusy}
                onPress={async () => {
                  if (!userId || followBusy) return;
                  setFollowBusy(true);
                  try {
                    const next = !payload.following;
                    await onFollowChange?.(userId, next);
                    setPayload((prev) =>
                      prev && !prev.error ? { ...prev, following: next } : prev
                    );
                  } catch (err) {
                    userAlert("Suivi", err?.message || "Action impossible.");
                  } finally {
                    setFollowBusy(false);
                  }
                }}
              />
            ) : null}
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
  unavailableSlots = [],
  submitting,
  onClose,
  onConfirm,
  routePlanId = null,
}) {
  if (!box) return null;
  const { warnings, blocking } = buildBookingVigilances(
    box,
    bookingDate,
    startTime,
    endTime,
    specialRequest
  );
  const overlapConflict = hasTimeOverlapWithSlots(
    startTime,
    endTime,
    unavailableSlots
  );
  const offerLines = formatBoxOfferLines(box);
  const price = (Number(box.price_cents || 0) / 100).toFixed(2);
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
            <Text style={styles.modalSheetTitle}>Demande de box</Text>
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
            <FunnelSteps activeId="ask" />
            <Text style={styles.helperText}>
              Tu n’es pas encore débité. L’hôte valide d’abord, puis tu pourras
              payer. Modifiable tant que non payé.
            </Text>

            <Text style={styles.bookingRecapTitle}>Box étape</Text>
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>{box.title}</Text>
              <Text style={styles.cardMeta}>
                {[box.city, `${price} €`].filter(Boolean).join(" · ")}
              </Text>
              <Text style={styles.cardAvailability}>
                {formatHostRatingLine(box)}
              </Text>
              {routePlanId ? (
                <Text style={styles.cardAvailability}>
                  Liée au projet #{routePlanId}
                </Text>
              ) : (
                <Text style={styles.cardAvailability}>
                  Sans projet : tu pourras la rattacher dans Projets.
                </Text>
              )}
            </View>

            <Text style={styles.bookingRecapTitle}>Offre (allègement sac)</Text>
            {offerLines.length > 0 ? (
              offerLines.map((line, i) => (
                <Text key={`offer-${i}`} style={styles.cardDetailLine}>
                  • {line}
                </Text>
              ))
            ) : (
              <Text style={styles.cardAvailability}>
                L’hôte n’a pas encore détaillé eau / nourriture.
              </Text>
            )}

            <Text style={styles.bookingRecapTitle}>Ton créneau</Text>
            <Text style={styles.cardDetailLine}>
              {formatDateLongFr(bookingDate)} · {startTime} → {endTime}
            </Text>
            {unavailableSlots.length > 0 ? (
              <View style={[styles.infoBanner, { marginTop: 8 }]}>
                <Text style={styles.infoBannerTitle}>
                  Créneaux déjà pris
                </Text>
                <Text style={styles.infoBannerText}>
                  {unavailableSlots
                    .map((s) => `${s.startTime}-${s.endTime}`)
                    .join(" · ")}
                </Text>
              </View>
            ) : null}
            {overlapConflict ? (
              <View style={[styles.infoBanner, { borderColor: "#FECACA" }]}>
                <Text style={styles.infoBannerTitle}>Conflit</Text>
                <Text style={styles.infoBannerText}>
                  Ce créneau chevauche une réservation existante.
                </Text>
              </View>
            ) : null}

            <Text style={styles.bookingRecapTitle}>Tes besoins</Text>
            <Text style={styles.cardDetailLine}>
              {specialRequest?.trim()
                ? specialRequest.trim()
                : "Aucun besoin précisé — ajoute eau / snacks si besoin."}
            </Text>

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
                <Text style={styles.infoBannerTitle}>Vigilance</Text>
                {warnings.map((t, i) => (
                  <Text key={`warn-${i}`} style={styles.infoBannerText}>
                    • {t}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.modalSheetFooter}>
            <OutlineButton
              compact
              label="Retour"
              icon="arrow-back-outline"
              onPress={onClose}
              disabled={submitting}
            />
            <PrimaryButton
              compact
              label={submitting ? "Envoi…" : "Envoyer la demande"}
              icon="send-outline"
              onPress={onConfirm}
              disabled={submitting || blocking.length > 0 || overlapConflict}
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
  if (!onDelete && !onEdit) {
    return children;
  }
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
      {onDelete ? (
        <TouchableOpacity
          style={[styles.swipeActionBtn, styles.swipeDeleteAction]}
          onPress={() => {
            closeRow();
            onDelete();
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={16} color="#fff" />
          <Text style={styles.swipeActionText}>{deleteLabel}</Text>
        </TouchableOpacity>
      ) : null}
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
    spotlightBoxId,
    followingUserIdSet,
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
    mapNearSingleTrailId,
    setMapNearSingleTrailId,
    mapNearShowAllOnMap,
    setMapNearShowAllOnMap,
    mapBoxesSlotCompatibleOnly,
    setMapBoxesSlotCompatibleOnly,
    nearTrailReferenceTrails,
    nearTrailCompatibleBoxIds,
    nearTrailDistanceByBoxId,
    routePlans,
    selectedRoutePlanId,
    setSelectedRoutePlanId,
    selectedRoutePlanDetail,
    setSelectedRoutePlanDetail,
    routePlanBusy,
    updateRoutePlan,
    deleteRoutePlan,
    updateRoutePlanBoxComment,
    addRoutePlanTrailNote,
    updateRoutePlanTrailNote,
    deleteRoutePlanTrailNote,
    mapListSource,
    setMapListSource,
    mapBoxesNearTrailsOnly,
    setMapBoxesNearTrailsOnly,
    mapTrailProximityKm,
    setMapTrailProximityKm,
    setMapViewportBounds,
    mapExplorerRecenterNonce,
    setMapExplorerRecenterNonce,
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
    openRavitoRequestAtPoint,
    athleteBookings,
    hostBookings,
    simpleUi,
    actionsRef,
  } = useAppMain();

  const [explorerHoveredTrailId, setExplorerHoveredTrailId] = useState(null);
  const [discoverProjectPickerOpen, setDiscoverProjectPickerOpen] =
    useState(false);
  const [discoverPanelOpen, setDiscoverPanelOpen] = useState(true);
  const [discoverToolsOpen, setDiscoverToolsOpen] = useState(false);
  /**
   * Type d’aide : null = pas encore choisi, "box" | "ravito".
   * Funnel box : 1 box → 2 créneau → 3 besoins → 4 récap.
   * Sans projet = curiosité (carte libre) ; la réservation gagne avec un projet.
   */
  const [discoverReserveMode, setDiscoverReserveMode] = useState(null);
  const [discoverBookStep, setDiscoverBookStep] = useState(1);
  const [explorerTrailProbe, setExplorerTrailProbe] = useState(null);
  const [lastMapTapCoords, setLastMapTapCoords] = useState(null);
  const [chartProbeHover, setChartProbeHover] = useState(false);
  const [explorerProbeLocked, setExplorerProbeLocked] = useState(false);
  const explorerProbeLockedRef = useRef(false);
  useEffect(() => {
    explorerProbeLockedRef.current = explorerProbeLocked;
  }, [explorerProbeLocked]);
  const setExplorerProbeLock = useCallback((locked) => {
    explorerProbeLockedRef.current = locked;
    setExplorerProbeLocked(locked);
  }, []);
  const handleChartProbeHoverStart = useCallback(() => {
    setChartProbeHover(true);
  }, []);
  const handleChartProbeHoverEnd = useCallback(() => {
    setChartProbeHover(false);
    queueMicrotask(() => {
      if (!explorerProbeLockedRef.current) setExplorerTrailProbe(null);
    });
  }, []);

  const [explorerSavedProbes, setExplorerSavedProbes] = useState(() =>
    loadExplorerSavedProbes()
  );
  useEffect(() => {
    persistExplorerSavedProbes(explorerSavedProbes);
  }, [explorerSavedProbes]);

  const saveExplorerProbe = useCallback(() => {
    if (!explorerTrailProbe || selectedTrailId == null) return;
    const tid = Number(selectedTrailId);
    if (Number(explorerTrailProbe.trailId) !== tid) return;
    const n =
      explorerSavedProbes.filter((e) => Number(e.trailId) === tid).length + 1;
    setExplorerSavedProbes((prev) => [
      ...prev,
      {
        id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        trailId: tid,
        label: `Point ${n}`,
        notes: "",
        savedAt: Date.now(),
        updatedAt: Date.now(),
        probe: { ...explorerTrailProbe },
      },
    ]);
    setExplorerProbeLock(false);
  }, [
    explorerTrailProbe,
    selectedTrailId,
    explorerSavedProbes,
    setExplorerProbeLock,
  ]);

  const removeExplorerSavedProbe = useCallback(
    async (id, trailTipsList = []) => {
      const entry = explorerSavedProbes.find((e) => e.id === id);
      if (
        entry &&
        isEntryPublishedOnTrail(entry, trailTipsList)
      ) {
        const ok = await new Promise((resolve) => {
          if (Platform.OS === "web") {
            return resolve(
              window.confirm(
                "Retirer ce brouillon local ?\n\nLe conseil public sur la trace (point violet) reste visible pour les autres. Pour le retirer du public, utilise « Retirer du public » sur le point."
              )
            );
          }
          Alert.alert(
            "Retirer le brouillon",
            "Le conseil public sur la trace reste visible. Pour le retirer du public, utilise « Retirer du public ».",
            [
              { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
              { text: "Retirer brouillon", onPress: () => resolve(true) },
            ]
          );
        });
        if (!ok) return;
      }
      setExplorerSavedProbes((prev) => prev.filter((e) => e.id !== id));
    },
    [explorerSavedProbes]
  );
  const setExplorerSavedProbeIncludeInPlan = useCallback((id, include) => {
    setExplorerSavedProbes((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, includeInPlan: !!include, updatedAt: Date.now() }
          : e
      )
    );
  }, []);
  const setExplorerSavedProbePublishedTipId = useCallback((id, tipId) => {
    const tid =
      tipId == null || tipId === ""
        ? undefined
        : Number(tipId);
    setExplorerSavedProbes((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              publishedTipId: Number.isFinite(tid) ? tid : undefined,
              updatedAt: Date.now(),
            }
          : e
      )
    );
  }, []);
  const focusExplorerSavedProbe = useCallback((entry) => {
    if (!entry?.probe) return;
    setExplorerTrailProbe({ ...entry.probe });
    setExplorerProbeLock(false);
  }, [setExplorerProbeLock]);
  const clearExplorerSavedProbesForTrail = useCallback((trailId) => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid)) return;
    setExplorerSavedProbes((prev) =>
      prev.filter((e) => Number(e.trailId) !== tid)
    );
    setExplorerTrailProbe(null);
    setExplorerProbeLock(false);
  }, [setExplorerProbeLock]);

  const [highlightedMapPointId, setHighlightedMapPointId] = useState(null);
  const [highlightedPlanBoxId, setHighlightedPlanBoxId] = useState(null);
  const [explorerWorkspaceTab, setExplorerWorkspaceTab] = useState("composer");

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

  const focusExplorerPlanTrailNote = useCallback(
    (note, source = "plan", noteIndex = 0) => {
      const lat = Number(note?.point_lat);
      const lon = Number(note?.point_lon);
      const tid = Number(selectedTrailId);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(tid)) {
        return;
      }
      setHighlightedMapPointId(
        trailMapPointId(source, note?.id, noteIndex)
      );
      setHighlightedPlanBoxId(null);
      setMapLat(lat.toFixed(6));
      setMapLon(lon.toFixed(6));
      setMapExplorerCameraFollowSearch(true);
      setMapExplorerRecenterNonce((n) => n + 1);
      const trail = trails.find((t) => Number(t.id) === tid);
      if (!trail) return;
      const p = probeTrailAt(trail, lat, lon);
      if (p) {
        setExplorerTrailProbe({ ...p, trailId: tid, source: "map" });
        setExplorerProbeLock(true);
      }
    },
    [
      selectedTrailId,
      trails,
      setExplorerProbeLock,
      setMapLat,
      setMapLon,
      setMapExplorerCameraFollowSearch,
      setMapExplorerRecenterNonce,
    ]
  );

  const handleTrailMapPointClick = useCallback(
    (pt) => {
      if (!pt) return;
      setHighlightedMapPointId(pt.id);
      if (pt.source === "tip") {
        const tid = Number(selectedTrailId);
        const trail = trails.find((t) => Number(t.id) === tid);
        if (trail) {
          const p = probeTrailAt(trail, pt.lat, pt.lon);
          if (p) {
            setExplorerTrailProbe({ ...p, trailId: tid, source: "map" });
            setExplorerProbeLock(true);
          }
        }
        return;
      }
      focusExplorerPlanTrailNote(
        { id: pt.noteId, point_lat: pt.lat, point_lon: pt.lon, note: pt.note },
        pt.source === "shared_preview" ? "shared_preview" : "plan"
      );
    },
    [selectedTrailId, trails, focusExplorerPlanTrailNote, setExplorerProbeLock]
  );
  const updateExplorerSavedProbeNotes = useCallback((id, notes) => {
    const text = String(notes ?? "");
    setExplorerSavedProbes((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, notes: text, updatedAt: Date.now() }
          : e
      )
    );
  }, []);
  const updateExplorerSavedProbeLinkedBox = useCallback((id, linkedBoxId) => {
    const bid =
      linkedBoxId == null || linkedBoxId === ""
        ? undefined
        : Number(linkedBoxId);
    setExplorerSavedProbes((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              linkedBoxId: Number.isFinite(bid) ? bid : undefined,
              updatedAt: Date.now(),
            }
          : e
      )
    );
  }, []);

  const trailsOnMap = Array.isArray(trailsForMap) ? trailsForMap : [];
  const boxesOnMap = Array.isArray(boxesForMap) ? boxesForMap : [];

  const trailsOnMapDisplay = useMemo(() => {
    const base = trailsOnMap;
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) return base;
    if (base.some((t) => Number(t.id) === tid)) return base;
    const st = trails.find((tr) => Number(tr.id) === tid);
    return st ? [...base, st] : base;
  }, [trailsOnMap, trails, selectedTrailId]);

  const savedProbesForSelectedTrail = useMemo(() => {
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) return [];
    return explorerSavedProbes.filter((e) => Number(e.trailId) === tid);
  }, [explorerSavedProbes, selectedTrailId]);

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
  const plansForSelectedTrail = useMemo(() => {
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) return [];
    return (Array.isArray(routePlans) ? routePlans : []).filter(
      (p) => Number(p.trail_id) === tid
    );
  }, [routePlans, selectedTrailId]);
  const activePlanForSelectedTrail = useMemo(() => {
    const detail = selectedRoutePlanDetail;
    const tid = Number(selectedTrailId);
    if (
      detail &&
      Number(detail.trail_id) === tid &&
      Number(detail.id) === Number(selectedRoutePlanId)
    ) {
      return detail;
    }
    return null;
  }, [selectedRoutePlanDetail, selectedTrailId, selectedRoutePlanId]);

  useEffect(() => {
    actionsRef.current.getRavitoPlanSyncContext = () => {
      const tid = Number(selectedTrailId);
      if (!Number.isFinite(tid)) {
        return { trailId: null, routePlanId: null, boxIds: [] };
      }
      let routePlanId = null;
      if (
        activePlanForSelectedTrail &&
        Number(activePlanForSelectedTrail.trail_id) === tid
      ) {
        routePlanId = Number(activePlanForSelectedTrail.id);
      } else if (
        Number(selectedRoutePlanId) > 0 &&
        Number(selectedRoutePlanDetail?.trail_id) === tid
      ) {
        routePlanId = Number(selectedRoutePlanId);
      }
      return {
        trailId: tid,
        routePlanId,
        boxIds: safePickedBoxIds,
      };
    };
    actionsRef.current.onRavitoRequestCreated = async (created, point) => {
      const tid = Number(created?.trailId ?? point?.trailId);
      if (!Number.isFinite(tid)) return;
      if (
        point?.source === "probe" &&
        explorerTrailProbe &&
        Number(explorerTrailProbe.trailId) === tid &&
        Number.isFinite(explorerTrailProbe.lat)
      ) {
        const latKey = Number(explorerTrailProbe.lat).toFixed(5);
        const lonKey = Number(explorerTrailProbe.lng).toFixed(5);
        const already = explorerSavedProbes.some(
          (e) =>
            Number(e.trailId) === tid &&
            Number(e.probe?.lat).toFixed(5) === latKey &&
            Number(e.probe?.lng).toFixed(5) === lonKey
        );
        if (!already) {
          const n =
            explorerSavedProbes.filter((e) => Number(e.trailId) === tid)
              .length + 1;
          setExplorerSavedProbes((prev) => [
            ...prev,
            {
              id: `sp-ravito-${Date.now()}`,
              trailId: tid,
              label: `Ravito ${n}`,
              notes: created?.note || "",
              includeInPlan: true,
              savedAt: Date.now(),
              updatedAt: Date.now(),
              probe: { ...explorerTrailProbe },
            },
          ]);
        }
      }
    };
    return () => {
      delete actionsRef.current.getRavitoPlanSyncContext;
      delete actionsRef.current.onRavitoRequestCreated;
    };
  }, [
    actionsRef,
    selectedTrailId,
    activePlanForSelectedTrail,
    selectedRoutePlanId,
    selectedRoutePlanDetail,
    safePickedBoxIds,
    explorerTrailProbe,
    explorerSavedProbes,
  ]);

  const activePlanOnMap = useMemo(() => {
    const detail = selectedRoutePlanDetail;
    if (!detail) return null;
    const pid = Number(detail.id);
    if (!Number.isFinite(pid) || Number(selectedRoutePlanId) !== pid)
      return null;
    return detail;
  }, [selectedRoutePlanDetail, selectedRoutePlanId]);
  const activePlanBoxIds = useMemo(() => {
    const boxes = Array.isArray(activePlanOnMap?.boxes)
      ? activePlanOnMap.boxes
      : [];
    return boxes.map((b) => Number(b.id)).filter((id) => Number.isFinite(id));
  }, [activePlanOnMap]);
  const activePlanBoxIdSet = useMemo(
    () => new Set(activePlanBoxIds),
    [activePlanBoxIds]
  );

  const projectDiscoverRecap = useMemo(() => {
    const pid = Number(selectedRoutePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const listItem =
      (Array.isArray(routePlans) ? routePlans : []).find(
        (p) => Number(p.id) === pid
      ) || null;
    const detail =
      selectedRoutePlanDetail && Number(selectedRoutePlanDetail.id) === pid
        ? selectedRoutePlanDetail
        : null;
    const planBoxes = Array.isArray(detail?.boxes) ? detail.boxes : [];
    const trailNotes = Array.isArray(detail?.trail_notes)
      ? detail.trail_notes
      : [];
    const planBookings = (Array.isArray(athleteBookings) ? athleteBookings : [])
      .filter((b) => Number(b.route_plan_id) === pid)
      .slice(0, 6);
    return {
      id: pid,
      name: detail?.name || listItem?.name || `Projet #${pid}`,
      trailName:
        cleanTrailLabel(detail?.trail_name || listItem?.trail_name) ||
        (detail?.trail_id || listItem?.trail_id
          ? `Trace #${detail?.trail_id || listItem?.trail_id}`
          : null),
      activity: detail?.activity || listItem?.activity || null,
      boxes: planBoxes,
      boxCount: planBoxes.length || Number(listItem?.selected_box_count || 0),
      trailNotes,
      bookings: planBookings,
    };
  }, [
    selectedRoutePlanId,
    selectedRoutePlanDetail,
    routePlans,
    athleteBookings,
  ]);

  /** N’avance le funnel que si l’utilisateur a déjà choisi « Box fixe ». */
  useEffect(() => {
    if (
      discoverReserveMode === "box" &&
      discoverBookStep === 1 &&
      selectedBox
    ) {
      setDiscoverBookStep(2);
    }
  }, [discoverReserveMode, discoverBookStep, selectedBox]);

  useEffect(() => {
    if (!selectedRoutePlanId) {
      setDiscoverBookStep(1);
    }
  }, [selectedRoutePlanId]);

  /** Un clic = sélection immédiate (pas de bouton Activer). */
  const selectDiscoverProject = (planId) => {
    if (planId == null) {
      setSelectedRoutePlanId(null);
      setSelectedRoutePlanDetail(null);
      setDiscoverBookStep(1);
      setDiscoverReserveMode(null);
    } else {
      const pid = Number(planId);
      if (!Number.isFinite(pid)) return;
      setSelectedRoutePlanId(pid);
      Promise.resolve(actionsRef.current.loadRoutePlanDetail?.(pid)).then(
        (detail) => {
          if (detail) {
            actionsRef.current.showRoutePlanOnMap?.(detail, { silent: true });
          }
        }
      );
    }
    setDiscoverProjectPickerOpen(false);
  };

  const pickedBoxesForExplorer = useMemo(() => {
    const planSet = activePlanBoxIdSet;
    const findBox = (id) =>
      boxes.find((b) => Number(b.id) === id) ||
      boxesOnMap.find((b) => Number(b.id) === id);
    return safePickedBoxIds.map((id) => {
      const b = findBox(id);
      return {
        id,
        title: b?.title || `Box #${id}`,
        city: b?.city || "",
        inPlan: planSet.has(id),
      };
    });
  }, [safePickedBoxIds, boxes, boxesOnMap, activePlanBoxIdSet]);
  const linkableBoxesForExplorer = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const b of pickedBoxesForExplorer) {
      if (!seen.has(b.id)) {
        seen.add(b.id);
        out.push(b);
      }
    }
    if (activePlanForSelectedTrail) {
      for (const b of activePlanForSelectedTrail.boxes || []) {
        const id = Number(b.id);
        if (!Number.isFinite(id) || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          title: b.title || `Box #${id}`,
          city: b.city || "",
          inPlan: true,
        });
      }
    }
    return out;
  }, [pickedBoxesForExplorer, activePlanForSelectedTrail]);
  const selectedBoxInActivePlan = useMemo(() => {
    const bid = Number(selectedBoxId);
    return Number.isFinite(bid) && activePlanBoxIdSet.has(bid);
  }, [selectedBoxId, activePlanBoxIdSet]);
  const plansForSelectedTrailSorted = useMemo(() => {
    const list = Array.isArray(plansForSelectedTrail)
      ? [...plansForSelectedTrail]
      : [];
    list.sort((a, b) => {
      const aTs = new Date(a?.updated_at || a?.created_at || 0).getTime() || 0;
      const bTs = new Date(b?.updated_at || b?.created_at || 0).getTime() || 0;
      return bTs - aTs;
    });
    return list;
  }, [plansForSelectedTrail]);
  const prioritizedExplorerBoxes = useMemo(() => {
    const list = Array.isArray(boxesForExplorerList)
      ? [...boxesForExplorerList]
      : [];
    const sid =
      selectedBoxId != null && Number.isFinite(Number(selectedBoxId))
        ? Number(selectedBoxId)
        : null;
    const picked = new Set(
      (safePickedBoxIds || []).map((id) => Number(id)).filter(Number.isFinite)
    );
    list.sort((a, b) => {
      const rank = (id) => {
        if (sid != null && id === sid) return 3;
        if (picked.has(id)) return 2;
        return 0;
      };
      return rank(Number(b.id)) - rank(Number(a.id));
    });
    return list;
  }, [boxesForExplorerList, selectedBoxId, safePickedBoxIds]);
  const prioritizedExplorerTrails = useMemo(() => {
    const list = Array.isArray(trailsForExplorerList)
      ? [...trailsForExplorerList]
      : [];
    const sid =
      selectedTrailId != null && Number.isFinite(Number(selectedTrailId))
        ? Number(selectedTrailId)
        : null;
    const picked = new Set(
      (mapTrailPickIds || []).map((id) => Number(id)).filter(Number.isFinite)
    );
    list.sort((a, b) => {
      const rank = (id) => {
        if (sid != null && id === sid) return 3;
        if (picked.has(id)) return 2;
        return 0;
      };
      return rank(Number(b.id)) - rank(Number(a.id));
    });
    return list;
  }, [trailsForExplorerList, selectedTrailId, mapTrailPickIds]);
  const toggleExplorerPickedBox = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      const alreadyPicked = safePickedBoxIds.includes(bid);
      if (alreadyPicked) {
        setMapPickedBoxIds((prev) => {
          const base = Array.isArray(prev) ? prev : [];
          return base.filter((id) => id !== bid);
        });
        if (Number(selectedBoxId) === bid) setSelectedBoxId(null);
        return;
      }
      setSelectedBoxId(bid);
      setMapPickedBoxIds((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        return base.includes(bid) ? base : [...base, bid];
      });
    },
    [safePickedBoxIds, selectedBoxId, setMapPickedBoxIds, setSelectedBoxId]
  );
  const toggleExplorerPickedTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      const alreadyPicked = mapTrailPickIds.includes(tid);
      if (alreadyPicked) {
        setMapTrailPickIds((prev) => prev.filter((id) => id !== tid));
        if (Number(selectedTrailId) === tid) setSelectedTrailId(null);
        return;
      }
      setSelectedTrailId(tid);
      setMapTrailPickIds((prev) =>
        prev.includes(tid) ? prev : [...prev, tid]
      );
    },
    [mapTrailPickIds, selectedTrailId, setMapTrailPickIds, setSelectedTrailId]
  );
  const focusExplorerBox = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      // Focus seul — ne touche pas au panier « plan ».
      setSelectedBoxId(bid);
      const box =
        boxes.find((b) => Number(b.id) === bid) ||
        boxesOnMap.find((b) => Number(b.id) === bid);
      const coords = parseMapCoords(box?.latitude, box?.longitude);
      // Si une trace est déjà en focus, on évite de "sauter" la caméra vers
      // la box : ça perturbe le contexte carte + rail trace.
      if (selectedTrailId == null && coords) {
        setMapLat(coords.lat.toFixed(6));
        setMapLon(coords.lon.toFixed(6));
        setMapExplorerRecenterNonce((n) => n + 1);
      }
    },
    [
      boxes,
      boxesOnMap,
      setSelectedBoxId,
      setMapLat,
      setMapLon,
      setMapExplorerRecenterNonce,
      selectedTrailId,
    ]
  );
  const highlightExplorerBoxOnMap = useCallback((boxId) => {
    const bid = Number(boxId);
    if (!Number.isFinite(bid)) return;
    setHighlightedMapPointId(null);
    setHighlightedPlanBoxId(bid);
    setSelectedBoxId(bid);
    const box = boxes.find((b) => Number(b.id) === bid);
    const coords = parseMapCoords(box?.latitude, box?.longitude);
    if (coords) {
      setMapLat(coords.lat.toFixed(6));
      setMapLon(coords.lon.toFixed(6));
      setMapExplorerRecenterNonce((n) => n + 1);
    }
  }, [
    boxes,
    setSelectedBoxId,
    setMapLat,
    setMapLon,
    setMapExplorerRecenterNonce,
    setHighlightedMapPointId,
    setHighlightedPlanBoxId,
  ]);
  const focusExplorerTrail = useCallback(
    (trailId) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      // Short tap = focus seul (pas d’ajout au plan).
      setSelectedTrailId(tid);
      setExplorerTrailProbe(null);
      setExplorerProbeLock(false);
      setChartProbeHover(false);
    },
    [setSelectedTrailId]
  );
  const handleRequestExitExplorerTrail = useCallback(async () => {
    if (selectedTrailId == null) return;
    const ok = await confirmExitTrailSelection();
    if (!ok) return;
    setSelectedTrailId(null);
    setExplorerTrailProbe(null);
    setExplorerProbeLock(false);
    setChartProbeHover(false);
    // Revenir à l’exploration large : ne pas garder les filtres plan/trace (picked, proximité, etc.)
    setMapShowTrails(true);
    setMapShowBoxes(true);
    setMapTrailsScope("all");
    setMapBoxSelectionMode("all");
    setMapBoxesNearTrailsOnly(false);
    setMapNearShowAllOnMap(true);
    setMapBoxesSlotCompatibleOnly(false);
  }, [
    selectedTrailId,
    setMapShowTrails,
    setMapShowBoxes,
    setMapTrailsScope,
    setMapBoxSelectionMode,
    setMapBoxesNearTrailsOnly,
    setMapNearShowAllOnMap,
    setMapBoxesSlotCompatibleOnly,
  ]);
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
        toggleExplorerPickedBox(bid);
        return;
      }
      if (trailHit) {
        const tid = Number(nearestTrail.id);
        toggleExplorerPickedTrail(tid);
      }
    },
    [
      boxesOnMap,
      trailsOnMap,
      safePickedBoxIds,
      mapTrailPickIds,
      toggleExplorerPickedBox,
      toggleExplorerPickedTrail,
    ]
  );
  const handleExplorerMapTap = useCallback((lat, lng) => {
    const plat = Number(lat);
    const plng = Number(lng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) return;
    setLastMapTapCoords({
      lat: plat,
      lng: plng,
      at: Date.now(),
    });
  }, []);
  const requestRavitoAtProbe = useCallback(() => {
    if (
      !explorerTrailProbe ||
      !Number.isFinite(explorerTrailProbe.lat) ||
      !Number.isFinite(explorerTrailProbe.lng)
    ) {
      return;
    }
    openRavitoRequestAtPoint({
      lat: explorerTrailProbe.lat,
      lon: explorerTrailProbe.lng,
      trailId: explorerTrailProbe.trailId,
      distKm: explorerTrailProbe.distKm,
      source: "probe",
    });
  }, [explorerTrailProbe, openRavitoRequestAtPoint]);
  const requestRavitoAtMapTap = useCallback(() => {
    if (!lastMapTapCoords) return;
    const tid = Number(selectedTrailId);
    openRavitoRequestAtPoint({
      lat: lastMapTapCoords.lat,
      lon: lastMapTapCoords.lng,
      trailId: Number.isFinite(tid) ? tid : undefined,
      source: "map",
    });
  }, [lastMapTapCoords, selectedTrailId, openRavitoRequestAtPoint]);
  const startBookingFromExplorer = useCallback(
    (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      const box = boxes.find((b) => Number(b.id) === bid);
      const bl = Number(box?.latitude);
      const bLng = Number(box?.longitude);
      if (Number.isFinite(bl) && Number.isFinite(bLng)) {
        setMapLat(bl.toFixed(6));
        setMapLon(bLng.toFixed(6));
      }
      setSelectedBoxId(bid);
      setMapExplorerCameraFollowSearch(true);
      setMapExplorerRecenterNonce((n) => n + 1);
      // Funnel unique : box → créneau (pas d’envoi immédiat).
      const scrollToBookingSection = () => {
        if (bookingSectionYRef.current > 0) {
          explorerScrollRef.current?.scrollTo?.({
            y: Math.max(0, bookingSectionYRef.current - 16),
            animated: true,
          });
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToBookingSection);
      });
    },
    [
      boxes,
      setSelectedBoxId,
      setMapLat,
      setMapLon,
      setMapExplorerCameraFollowSearch,
      setMapExplorerRecenterNonce,
    ]
  );
  const confirmBookingFromExplorer = useCallback(
    (boxId) => {
      const bid = Number(boxId ?? selectedBoxId);
      if (!Number.isFinite(bid)) {
        userAlert("Réservation", "Choisis d’abord une box sur la carte ou la liste.");
        return;
      }
      setSelectedBoxId(bid);
      actionsRef.current.bookBox?.(bid);
    },
    [selectedBoxId, setSelectedBoxId, actionsRef]
  );
  const { width: viewportWidth } = useWindowDimensions();
  const [showBoxFilters, setShowBoxFilters] = useState(false);
  const [showTrailFilters, setShowTrailFilters] = useState(false);
  const [planExportIncludePending, setPlanExportIncludePending] =
    useState(true);
  const [planExportIncludeRejected, setPlanExportIncludeRejected] =
    useState(false);
  const explorerScrollRef = useRef(null);
  const bookingSectionYRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const id = requestAnimationFrame(() => {
      try {
        explorerScrollRef.current?.scrollTo?.({
          y: 0,
          animated: true,
        });
      } catch (_e) {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedTrailId, selectedBoxId]);

  const prevSelectedTrailIdRef = useRef(selectedTrailId);
  useEffect(() => {
    if (prevSelectedTrailIdRef.current === selectedTrailId) return;
    prevSelectedTrailIdRef.current = selectedTrailId;
    setExplorerTrailProbe(null);
    setExplorerProbeLock(false);
    setChartProbeHover(false);
  }, [selectedTrailId, setExplorerProbeLock]);

  const [trailVoteEligibility, setTrailVoteEligibility] = useState(null);
  const [planSearchQuery, setPlanSearchQuery] = useState("");
  const [routePlanDraftNotes, setRoutePlanDraftNotes] = useState("");
  const [explorerPlanSaveName, setExplorerPlanSaveName] = useState("");
  const [sharedPlansForTrail, setSharedPlansForTrail] = useState([]);
  const [sharedPlansBusy, setSharedPlansBusy] = useState(false);
  const [trailTips, setTrailTips] = useState([]);
  const [sharedPlanPreview, setSharedPlanPreview] = useState(null);
  const [sharedPlanPreviewBusy, setSharedPlanPreviewBusy] = useState(false);

  const trailMapPoints = useMemo(() => {
    // Toujours montrer les points du projet actif (ravito / notes) sur Découvrir.
    const projectPlan =
      selectedRoutePlanDetail &&
      Number(selectedRoutePlanDetail.id) === Number(selectedRoutePlanId)
        ? selectedRoutePlanDetail
        : null;
    const plan =
      projectPlan ||
      (explorerWorkspaceTab === "plan" ? activePlanForSelectedTrail : null);
    const trailId =
      Number(plan?.trail_id) ||
      Number(selectedTrailId) ||
      null;
    if (!plan || !Number.isFinite(Number(trailId))) return [];
    return buildTrailMapPoints({
      trailId,
      plan,
      sharedPreview: null,
    });
  }, [
    explorerWorkspaceTab,
    selectedTrailId,
    activePlanForSelectedTrail,
    selectedRoutePlanId,
    selectedRoutePlanDetail,
  ]);
  const communityTipsForMap = useMemo(
    () => (explorerWorkspaceTab === "community" ? trailTips : []),
    [explorerWorkspaceTab, trailTips]
  );
  const savedProbesForMap = useMemo(
    () =>
      explorerWorkspaceTab === "composer"
        ? savedProbesForSelectedTrail
        : [],
    [explorerWorkspaceTab, savedProbesForSelectedTrail]
  );

  useEffect(() => {
    if (!sharedPlanPreview) return;
    const tid = Number(sharedPlanPreview.trail_id);
    if (!Number.isFinite(tid)) return;
    setSelectedTrailId(tid);
    setMapTrailPickIds((prev) =>
      Array.isArray(prev) && prev.includes(tid) ? prev : [...(prev || []), tid]
    );
  }, [sharedPlanPreview, setSelectedTrailId, setMapTrailPickIds]);

  const isTrailCreator = useMemo(() => {
    if (!user || !selectedTrail) return false;
    return (
      Number(selectedTrail.creator_user_id) === Number(user.id)
    );
  }, [user, selectedTrail]);

  const refreshTrailCommunityData = useCallback(async () => {
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) {
      setSharedPlansForTrail([]);
      setTrailTips([]);
      return;
    }
    setSharedPlansBusy(true);
    try {
      const [shared, tips] = await Promise.all([
        actionsRef.current.loadSharedPlansForTrail?.(tid),
        actionsRef.current.loadTrailTips?.(tid),
      ]);
      const tipsList = Array.isArray(tips) ? tips : [];
      setSharedPlansForTrail(Array.isArray(shared) ? shared : []);
      setTrailTips(tipsList);
      setExplorerSavedProbes((prev) =>
        syncPublishedTipIdsForTrail(prev, tipsList, tid)
      );
    } catch (_e) {
      setSharedPlansForTrail([]);
      setTrailTips([]);
    } finally {
      setSharedPlansBusy(false);
    }
  }, [selectedTrailId]);

  useEffect(() => {
    refreshTrailCommunityData();
    setSharedPlanPreview(null);
  }, [selectedTrailId, refreshTrailCommunityData]);

  useEffect(() => {
    const tid = Number(selectedTrailId);
    if (!user || !Number.isFinite(tid)) {
      setTrailVoteEligibility(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const elig =
        await actionsRef.current.checkResourceRelevanceEligibility?.({
          resourceType: "trail",
          resourceId: tid,
        });
      if (!cancelled) setTrailVoteEligibility(elig || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTrailId, user, actionsRef]);

  const openSharedPlanPreview = useCallback(
    async (planId) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid)) return;
      setSharedPlanPreviewBusy(true);
      const detail = await actionsRef.current.loadSharedRoutePlan?.(pid);
      setSharedPlanPreview(detail || null);
      setSharedPlanPreviewBusy(false);
    },
    [actionsRef]
  );

  const showSharedPlanPreviewOnMap = useCallback(
    (detail) => {
      const d = detail || sharedPlanPreview;
      if (!d) return;
      const trailId = Number(d.trail_id);
      if (Number.isFinite(trailId)) {
        setSelectedTrailId(trailId);
        setMapTrailPickIds((prev) =>
          Array.isArray(prev) && prev.includes(trailId)
            ? prev
            : [...(prev || []), trailId]
        );
      }
      const boxIds = (Array.isArray(d.boxes) ? d.boxes : [])
        .map((b) => Number(b.id))
        .filter((id) => Number.isFinite(id));
      if (boxIds.length > 0) {
        setMapShowBoxes(true);
        setMapPickedBoxIds(boxIds);
        setSelectedBoxId(boxIds[0]);
        setMapBoxSelectionMode("picked");
      }
      userAlert(
        "Plan sur la carte",
        "Trace, box et tous les points GPS du plan sont affichés (survol = surbrillance)."
      );
    },
    [
      sharedPlanPreview,
      trails,
      setSelectedTrailId,
      setMapTrailPickIds,
      setMapPickedBoxIds,
      setExplorerProbeLock,
    ]
  );

  const clearComposerDraftsForTrail = useCallback(
    (trailId, { onlyIncludedInLastSave = false, savedEntryIds = [] } = {}) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      const idSet = new Set(
        (savedEntryIds || []).map((x) => String(x)).filter(Boolean)
      );
      setExplorerSavedProbes((prev) =>
        prev.filter((e) => {
          if (Number(e.trailId) !== tid) return true;
          if (onlyIncludedInLastSave && idSet.size > 0) {
            return !idSet.has(String(e.id));
          }
          if (onlyIncludedInLastSave) {
            return e.includeInPlan === false;
          }
          return false;
        })
      );
      setExplorerTrailProbe(null);
      setExplorerProbeLock(false);
    },
    [setExplorerProbeLock]
  );

  const setActivePlanVisibility = useCallback(
    async (visibility) => {
      const plan = activePlanForSelectedTrail;
      if (!plan) return;
      const pid = Number(plan.id);
      if (!Number.isFinite(pid)) return;
      await updateRoutePlan?.(pid, { visibility });
      await actionsRef.current.loadRoutePlanDetail?.(pid);
      await refreshTrailCommunityData();
      userAlert(
        visibility === "shared" ? "Plan partagé" : "Plan privé",
        visibility === "shared"
          ? "D’autres athlètes peuvent s’en inspirer (onglet Communauté)."
          : "Ce plan n’est plus visible dans la communauté."
      );
    },
    [
      activePlanForSelectedTrail,
      updateRoutePlan,
      refreshTrailCommunityData,
    ]
  );

  const buildTrailTipNote = useCallback((entry, probe) => {
    const p = probe || entry?.probe;
    if (!p) return "";
    const parts = [
      entry?.label || "Conseil",
      `${Number(p.distKm || 0).toFixed(1)} km`,
    ];
    if (p.eleM != null) parts.push(`${p.eleM} m`);
    const notes = String(entry?.notes || "").trim();
    if (notes) parts.push(notes);
    return parts.join(" · ").slice(0, 2000);
  }, []);

  const publishTrailTipFromEntry = useCallback(
    async (entry) => {
      if (!isTrailCreator || !selectedTrail) {
        userAlert(
          "Conseil public",
          "Seul le créateur de la trace peut publier des conseils visibles par tous."
        );
        return;
      }
      const probe = entry?.probe || explorerTrailProbe;
      if (!probe) return;
      const tid = Number(selectedTrail.id);
      const noteText = buildTrailTipNote(entry, probe);
      if (!noteText) return;
      const created = await actionsRef.current.createTrailTip?.(tid, {
        label: entry?.label || "Conseil",
        note: noteText,
        pointLat: probe.lat,
        pointLon: probe.lng,
        distKm: probe.distKm,
      });
      if (created?.id && entry?.id) {
        setExplorerSavedProbePublishedTipId(entry.id, created.id);
      }
      await refreshTrailCommunityData();
      userAlert(
        "Conseil public publié",
        "Point violet sur la carte — visible par tous. Ton brouillon local reste séparé."
      );
    },
    [
      isTrailCreator,
      selectedTrail,
      explorerTrailProbe,
      buildTrailTipNote,
      refreshTrailCommunityData,
      setExplorerSavedProbePublishedTipId,
    ]
  );

  const publishTrailTipFromProbe = useCallback(async () => {
    if (!explorerTrailProbe) {
      userAlert("Conseil public", "Figez un point sur le tracé avant de publier.");
      return;
    }
    await publishTrailTipFromEntry({
      probe: explorerTrailProbe,
      label: "Conseil créateur",
      notes: "",
    });
  }, [explorerTrailProbe, publishTrailTipFromEntry]);

  const unpublishTrailTipForEntry = useCallback(
    async (entry) => {
      if (!isTrailCreator || !selectedTrail) return;
      const tid = Number(selectedTrail.id);
      let tipId = Number(entry?.publishedTipId);
      if (!Number.isFinite(tipId) || tipId <= 0) {
        const lat = Number(entry?.probe?.lat);
        const lon = Number(entry?.probe?.lng);
        const match = trailTips.find(
          (t) =>
            Number(t.point_lat).toFixed(5) === lat.toFixed(5) &&
            Number(t.point_lon).toFixed(5) === lon.toFixed(5)
        );
        tipId = Number(match?.id);
      }
      if (!Number.isFinite(tipId) || tipId <= 0) return;
      const ok = await actionsRef.current.deleteTrailTip?.(tid, tipId);
      if (!ok) return;
      if (entry?.id) setExplorerSavedProbePublishedTipId(entry.id, null);
      await refreshTrailCommunityData();
      userAlert(
        "Conseil retiré du public",
        "Le point violet disparaît pour tout le monde. Ton brouillon local n’est pas supprimé."
      );
    },
    [
      isTrailCreator,
      selectedTrail,
      trailTips,
      refreshTrailCommunityData,
      setExplorerSavedProbePublishedTipId,
    ]
  );

  const deleteTrailTipById = useCallback(
    async (tipId) => {
      const tid = Number(selectedTrailId);
      if (!Number.isFinite(tid)) return;
      const ok = await actionsRef.current.deleteTrailTip?.(tid, tipId);
      if (ok) {
        setExplorerSavedProbes((prev) =>
          prev.map((e) =>
            Number(e.publishedTipId) === Number(tipId)
              ? { ...e, publishedTipId: undefined, updatedAt: Date.now() }
              : e
          )
        );
        await refreshTrailCommunityData();
      }
    },
    [selectedTrailId, refreshTrailCommunityData]
  );

  const setSelectedTrailPublic = useCallback(
    async (isPublic) => {
      if (!selectedTrail || !isTrailCreator) return;
      const tid = Number(selectedTrail.id);
      const ok = await actionsRef.current.updateTrail?.(tid, {
        isPublic: !!isPublic,
      });
      if (ok) {
        await actionsRef.current.loadTrails?.();
        userAlert(
          isPublic ? "Trace publique" : "Trace masquée",
          isPublic
            ? "Ta trace apparaît dans le catalogue pour tous."
            : "Ta trace reste utilisable par toi mais n’apparaît plus dans le catalogue public."
        );
      }
    },
    [selectedTrail, isTrailCreator, actionsRef]
  );

  const selectedTrailIsPublic = useMemo(() => {
    if (!selectedTrail) return true;
    const v = selectedTrail.is_public;
    if (v === 0 || v === false || v === "0") return false;
    return true;
  }, [selectedTrail]);

  const appendComposerProbesToPlan = useCallback(
    async (planId, probes = [], existingNotes = []) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid) || pid <= 0) return 0;
      const list = Array.isArray(probes) ? probes : [];
      if (list.length === 0) return 0;

      const noteKey = (lat, lon, noteText) =>
        `${Number(lat).toFixed(6)}|${Number(lon).toFixed(6)}|${String(
          noteText || ""
        )
          .trim()
          .toLowerCase()}`;

      const existingKeySet = new Set(
        (Array.isArray(existingNotes) ? existingNotes : [])
          .map((n) => {
            const lat = Number(n?.point_lat);
            const lon = Number(n?.point_lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return noteKey(lat, lon, n?.note || "");
          })
          .filter(Boolean)
      );

      let addedNotes = 0;
      for (let i = 0; i < list.length; i += 1) {
        const entry = list[i];
        const linkedId = Number(entry.linkedBoxId);
        let linkedBoxTitle = "";
        if (Number.isFinite(linkedId)) {
          const lb =
            boxes.find((b) => Number(b.id) === linkedId) ||
            boxesOnMap.find((b) => Number(b.id) === linkedId);
          linkedBoxTitle = lb?.title || `Box #${linkedId}`;
        }
        const noteText = formatExplorerProbePlanNote(entry, { linkedBoxTitle });
        if (!noteText) continue;
        const lat = Number(entry.probe?.lat);
        const lon = Number(entry.probe?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const key = noteKey(lat, lon, noteText);
        if (existingKeySet.has(key)) continue;

        const ok = await actionsRef.current.addRoutePlanTrailNote?.(pid, {
          note: noteText,
          pointLat: lat,
          pointLon: lon,
          sortIndex: i,
          mapVisible: entry.includeInPlan !== false,
        });
        if (ok) {
          addedNotes += 1;
          existingKeySet.add(key);
        }
      }
      return addedNotes;
    },
    [actionsRef, boxes, boxesOnMap]
  );

  const saveExplorerRoutePlan = useCallback(async () => {
    if (!user) {
      userAlert(
        "Connexion",
        "Connecte-toi pour enregistrer un plan sur ton compte."
      );
      return;
    }
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) {
      userAlert("Plan", "Sélectionne une trace.");
      return;
    }
    const boxIds = safePickedBoxIds;
    const probes = savedProbesForSelectedTrail.filter(
      (e) => e.includeInPlan !== false
    );
    if (boxIds.length === 0 && probes.length === 0) {
      userAlert(
        "Plan",
        "Coche au moins une box et/ou ajoute un point inclus dans ton plan (onglet Planifier / Mon plan). Tu peux enregistrer un plan box seul sans trace."
      );
      return;
    }

    let planId = Number(activePlanForSelectedTrail?.id);
    if (!Number.isFinite(planId) || planId <= 0) planId = null;

    if (!planId) {
      const created = await actionsRef.current.createRoutePlanFromSelection?.({
        trailId: tid,
        boxIds,
        name: explorerPlanSaveName.trim() || undefined,
        notes: routePlanDraftNotes,
      });
      if (!created) return;
      planId = Number(created.id);
      setSelectedRoutePlanId(planId);
    } else if (boxIds.length > 0) {
      await actionsRef.current.upsertRoutePlanBoxes?.(planId, {
        boxIds,
        mergeWithExisting: true,
      });
    }

    const detail = await actionsRef.current.loadRoutePlanDetail?.(planId);
    const existing = Array.isArray(detail?.trail_notes) ? detail.trail_notes : [];
    const addedNotes = await appendComposerProbesToPlan(planId, probes, existing);

    await actionsRef.current.loadRoutePlans?.();
    const parts = ["Trace enregistrée"];
    if (boxIds.length) parts.push(`${boxIds.length} box`);
    if (addedNotes) parts.push(`${addedNotes} point(s) mémorisé(s)`);
    userAlert(
      "Plan enregistré",
      `${parts.join(" · ")}. Consulte l’onglet Mon plan pour les notes GPS enregistrées.`
    );
    if (probes.length > 0) {
      const clear = await confirmComposerClearAfterSave();
      if (clear) {
        const savedEntryIds = probes.map((e) => e.id).filter(Boolean);
        clearComposerDraftsForTrail(tid, {
          onlyIncludedInLastSave: true,
          savedEntryIds,
        });
      }
    }
  }, [
    user,
    selectedTrailId,
    safePickedBoxIds,
    savedProbesForSelectedTrail,
    activePlanForSelectedTrail,
    explorerPlanSaveName,
    routePlanDraftNotes,
    actionsRef,
    setSelectedRoutePlanId,
    appendComposerProbesToPlan,
    clearComposerDraftsForTrail,
  ]);

  const selectExplorerRoutePlan = useCallback(
    async (planId) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid) || pid <= 0) return;
      setSelectedRoutePlanId(pid);
      const detail = await actionsRef.current.loadRoutePlanDetail?.(pid);
      if (!detail) return;
      const trailId = Number(detail.trail_id);
      if (Number.isFinite(trailId)) {
        setSelectedTrailId(trailId);
        setMapTrailPickIds((prev) =>
          Array.isArray(prev) && prev.includes(trailId)
            ? prev
            : [...(prev || []), trailId]
        );
      }
      const boxIds = (Array.isArray(detail.boxes) ? detail.boxes : [])
        .map((b) => Number(b.id))
        .filter((id) => Number.isFinite(id));
      if (boxIds.length > 0) {
        setMapShowBoxes(true);
        setMapPickedBoxIds(boxIds);
        setSelectedBoxId(boxIds[0]);
        setMapBoxSelectionMode("picked");
      }
    },
    [actionsRef, setSelectedTrailId, setMapTrailPickIds, setMapPickedBoxIds]
  );

  const forkExplorerRoutePlan = useCallback(
    async (planId, planName) => {
      if (!user) {
        userAlert("Connexion", "Connecte-toi pour repartir d’un plan partagé.");
        return;
      }
      const detail = await actionsRef.current.forkRoutePlan?.(planId, {
        name: planName,
      });
      if (!detail) return;
      const pid = Number(detail.id);
      if (Number.isFinite(pid)) {
        await selectExplorerRoutePlan(pid);
      }
      await refreshTrailCommunityData();
      userAlert(
        "Plan copié",
        "Un plan personnel a été créé à partir de ce modèle. Tu peux le modifier dans l’onglet Mon plan."
      );
    },
    [user, selectExplorerRoutePlan, refreshTrailCommunityData]
  );

  const isExplorerFocused = useIsFocused();
  useEffect(() => {
    if (!isExplorerFocused) return;
    const planReq = actionsRef.current.takeQueuedOpenPlanOnMap?.();
    const bookReq = actionsRef.current.takeQueuedBookBoxOnCarte?.();
    if (!planReq?.planId && !bookReq?.boxId) return;
    const pid = planReq?.planId != null ? Number(planReq.planId) : null;
    let cancelled = false;
    (async () => {
      if (planReq?.planId && Number.isFinite(pid)) {
        if (planReq.kind === "shared") {
          await openSharedPlanPreview(pid);
          if (!cancelled) showSharedPlanPreviewOnMap();
        } else {
          const detail = await actionsRef.current.loadRoutePlanDetail?.(pid);
          if (!cancelled && detail) {
            await selectExplorerRoutePlan(pid);
            if (!cancelled) {
              actionsRef.current.showRoutePlanOnMap?.(detail);
            }
          }
        }
      }
      if (cancelled || !bookReq?.boxId) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) startBookingFromExplorer(bookReq.boxId);
        });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isExplorerFocused,
    actionsRef,
    openSharedPlanPreview,
    showSharedPlanPreviewOnMap,
    selectExplorerRoutePlan,
    startBookingFromExplorer,
  ]);

  const upsertPickedBoxesToActivePlan = useCallback(async () => {
    if (!user) {
      userAlert(
        "Connexion",
        "Connecte-toi pour enregistrer les box dans un plan."
      );
      return;
    }
    const tid = Number(selectedTrailId);
    if (!Number.isFinite(tid)) {
      userAlert("Plan", "Sélectionne une trace.");
      return;
    }
    if (safePickedBoxIds.length === 0) {
      userAlert(
        "Plan",
        "Coche au moins une box sur la carte (clic ou appui long)."
      );
      return;
    }
    let planId = Number(activePlanForSelectedTrail?.id);
    if (!Number.isFinite(planId) || planId <= 0) {
      const created = await actionsRef.current.createRoutePlanFromSelection?.({
        trailId: tid,
        boxIds: safePickedBoxIds,
        name: explorerPlanSaveName.trim() || undefined,
        notes: routePlanDraftNotes,
      });
      if (!created) return;
      planId = Number(created.id);
      setSelectedRoutePlanId(planId);
      await actionsRef.current.loadRoutePlanDetail?.(planId);
      userAlert("Plan", "Plan créé avec les box cochées.");
      return;
    }
    await actionsRef.current.upsertRoutePlanBoxes?.(planId, {
      boxIds: safePickedBoxIds,
      mergeWithExisting: true,
    });
    await actionsRef.current.loadRoutePlanDetail?.(planId);
    userAlert("Plan", "Box cochées ajoutées au plan actif.");
  }, [
    user,
    selectedTrailId,
    safePickedBoxIds,
    activePlanForSelectedTrail,
    explorerPlanSaveName,
    routePlanDraftNotes,
    actionsRef,
    setSelectedRoutePlanId,
  ]);

  const [planNameDraft, setPlanNameDraft] = useState("");
  const [planNotesDraft, setPlanNotesDraft] = useState("");
  const [boxCommentDraftById, setBoxCommentDraftById] = useState({});
  const [trailNoteDraftById, setTrailNoteDraftById] = useState({});
  const [newTrailNoteText, setNewTrailNoteText] = useState("");
  const [newTrailNoteLat, setNewTrailNoteLat] = useState("");
  const [newTrailNoteLon, setNewTrailNoteLon] = useState("");
  const filteredRoutePlans = useMemo(() => {
    const base = Array.isArray(routePlans) ? routePlans : [];
    const q = String(planSearchQuery || "")
      .trim()
      .toLowerCase();
    if (!q) return base.slice(0, 30);
    return base
      .filter((plan) => {
        const name = String(plan.name || "").toLowerCase();
        const trailName = String(plan.trail_name || "").toLowerCase();
        const territory = String(plan.territory || "").toLowerCase();
        return (
          name.includes(q) || trailName.includes(q) || territory.includes(q)
        );
      })
      .slice(0, 30);
  }, [routePlans, planSearchQuery]);

  useEffect(() => {
    const plan = activePlanForSelectedTrail;
    if (!plan) return;
    setPlanNameDraft(String(plan.name || ""));
    setPlanNotesDraft(String(plan.notes || ""));
    const byId = {};
    (plan.boxes || []).forEach((b) => {
      const bid = Number(b.id);
      if (Number.isFinite(bid)) byId[bid] = String(b.plan_box_comment || "");
    });
    setBoxCommentDraftById(byId);
    const trailById = {};
    (plan.trail_notes || []).forEach((n) => {
      const nid = Number(n.id);
      if (Number.isFinite(nid)) trailById[nid] = String(n.note || "");
    });
    setTrailNoteDraftById(trailById);
  }, [activePlanForSelectedTrail]);

  const saveActiveRoutePlanDrafts = useCallback(async () => {
    const plan = activePlanForSelectedTrail;
    if (!plan) return;
    const planId = Number(plan.id);
    if (!Number.isFinite(planId) || planId <= 0) return;
    let changed = false;
    const currentName = String(plan.name || "");
    const currentNotes = String(plan.notes || "");
    if (planNameDraft !== currentName || planNotesDraft !== currentNotes) {
      await updateRoutePlan?.(planId, {
        name: planNameDraft,
        notes: planNotesDraft,
      });
      changed = true;
    }
    for (const b of plan.boxes || []) {
      const bid = Number(b.id);
      if (!Number.isFinite(bid)) continue;
      const nextComment = String(boxCommentDraftById[bid] || "");
      const prevComment = String(b.plan_box_comment || "");
      if (nextComment !== prevComment) {
        await updateRoutePlanBoxComment?.(planId, bid, nextComment);
        changed = true;
      }
    }
    for (const n of plan.trail_notes || []) {
      const nid = Number(n.id);
      if (!Number.isFinite(nid)) continue;
      const nextNote = String(trailNoteDraftById[nid] ?? n.note ?? "");
      const prevNote = String(n.note || "");
      if (nextNote !== prevNote) {
        await updateRoutePlanTrailNote?.(planId, nid, { note: nextNote });
        changed = true;
      }
    }
    const probesToSync = savedProbesForSelectedTrail.filter(
      (e) => e.includeInPlan !== false
    );
    const addedNotes = await appendComposerProbesToPlan(
      planId,
      probesToSync,
      plan.trail_notes || []
    );
    if (addedNotes > 0) changed = true;
    await actionsRef.current.loadRoutePlanDetail?.(planId);
    if (changed) {
      userAlert("Plan", "Toutes les modifications du plan sont enregistrées.");
    } else {
      userAlert(
        "Plan",
        "Le plan est déjà synchronisé (pas de nouvelle modification détectée)."
      );
    }
  }, [
    activePlanForSelectedTrail,
    planNameDraft,
    planNotesDraft,
    boxCommentDraftById,
    trailNoteDraftById,
    updateRoutePlan,
    updateRoutePlanBoxComment,
    updateRoutePlanTrailNote,
    actionsRef,
    savedProbesForSelectedTrail,
    appendComposerProbesToPlan,
  ]);
  const refreshRoutePlanBookingLinks = useCallback(async () => {
    await actionsRef.current.refreshRoutePlanBookingLinks?.();
  }, [actionsRef]);

  const togglePlanTrailNoteOnMap = useCallback(
    async (noteId, visible) => {
      const plan = activePlanForSelectedTrail;
      if (!plan?.id) return;
      await updateRoutePlanTrailNote?.(Number(plan.id), Number(noteId), {
        mapVisible: !!visible,
      });
    },
    [activePlanForSelectedTrail, updateRoutePlanTrailNote]
  );

  const removePlanTrailNote = useCallback(
    async (noteId) => {
      const plan = activePlanForSelectedTrail;
      if (!plan?.id) return;
      const ok = await deleteRoutePlanTrailNote?.(
        Number(plan.id),
        Number(noteId)
      );
      if (ok) {
        await actionsRef.current.loadRoutePlanDetail?.(Number(plan.id));
      }
    },
    [activePlanForSelectedTrail, deleteRoutePlanTrailNote, actionsRef]
  );

  const [editingPlanBookingId, setEditingPlanBookingId] = useState(null);
  const [planBookingDraft, setPlanBookingDraft] = useState({
    bookingDate: "",
    startTime: "",
    endTime: "",
    specialRequest: "",
  });

  const openPlanBoxBookingEditor = useCallback(
    (box) => {
      const bookingId = Number(box?.latest_booking_id);
      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        startBookingFromExplorer(Number(box?.id));
        return;
      }
      const full = (athleteBookings || []).find(
        (b) => Number(b.id) === bookingId
      );
      setEditingPlanBookingId(bookingId);
      setPlanBookingDraft({
        bookingDate:
          full?.booking_date || box?.latest_booking_date || "",
        startTime:
          full?.start_time || box?.latest_booking_start_time || "",
        endTime: full?.end_time || box?.latest_booking_end_time || "",
        specialRequest:
          full?.special_request ||
          box?.latest_booking_special_request ||
          "",
      });
    },
    [athleteBookings, startBookingFromExplorer]
  );

  const savePlanBoxBooking = useCallback(async () => {
    const bid = Number(editingPlanBookingId);
    if (!Number.isFinite(bid) || bid <= 0) return;
    await actionsRef.current.updateAthleteBooking?.(bid, planBookingDraft);
    setEditingPlanBookingId(null);
    await refreshRoutePlanBookingLinks();
  }, [
    editingPlanBookingId,
    planBookingDraft,
    actionsRef,
    refreshRoutePlanBookingLinks,
  ]);

  const saveSinglePlanBoxComment = useCallback(
    async (boxId) => {
      const plan = activePlanForSelectedTrail;
      const planId = Number(plan?.id);
      const bid = Number(boxId);
      if (!Number.isFinite(planId) || !Number.isFinite(bid)) return;
      await updateRoutePlanBoxComment?.(
        planId,
        bid,
        String(boxCommentDraftById[bid] || "")
      );
      await refreshRoutePlanBookingLinks();
      userAlert("Plan", "Note box enregistrée.");
    },
    [
      activePlanForSelectedTrail,
      boxCommentDraftById,
      updateRoutePlanBoxComment,
      refreshRoutePlanBookingLinks,
    ]
  );

  const openReservationsTab = useCallback(() => {
    actionsRef.current.navigateToReservations?.();
  }, [actionsRef]);

  const hostPendingBookingForPlanBox = useCallback(
    (boxId) => {
      if (!canHost) return null;
      const bid = Number(boxId);
      return (
        (hostBookings || []).find((b) => {
          if (Number(b.box_id) !== bid) return false;
          const approval = String(b.approval_status || "pending");
          return (
            approval === "pending" ||
            approval === "pending_host_confirmation"
          );
        }) || null
      );
    },
    [canHost, hostBookings]
  );

  const decideHostBookingFromPlan = useCallback(
    async (bookingId, decision) => {
      await actionsRef.current.decideHostBooking?.(bookingId, decision);
      await refreshRoutePlanBookingLinks();
    },
    [actionsRef, refreshRoutePlanBookingLinks]
  );

  useEffect(() => {
    actionsRef.current.loadTrails();
    actionsRef.current.loadRoutePlans?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webSplit = Platform.OS === "web";
  const webDesktopSplit = webSplit && viewportWidth >= 960;
  /** Portable / tablette étroite : carte plein écran + bottom sheets. */
  const mobileMapFirst = !webDesktopSplit;

  const EXPLORER_COMPACT_FILTERS_W = 720;
  const explorerCompactFilters = viewportWidth < EXPLORER_COMPACT_FILTERS_W;

  const MAP_BOX_SORT_LABELS = {
    default: "Défaut",
    rating_desc: "Notes ↓",
    rating_asc: "Notes ↑",
    price_asc: "Prix ↑",
    price_desc: "Prix ↓",
    slot_match: "Créneau",
  };

  const MAP_TRAIL_SORT_LABELS = {
    default: "Défaut",
    relevance_desc: "Pertinence ↓",
    distance_desc: "Distance ↓",
    distance_asc: "Distance ↑",
    elevation_desc: "D+ ↓",
    elevation_asc: "D+ ↑",
    difficulty_easy: "Facile d'abord",
    difficulty_hard: "Difficile d'abord",
  };

  const explorerBoxFilterBadgeCount = useMemo(() => {
    let n = 0;
    if (!mapShowBoxes) n += 1;
    if ((mapBoxCriteriaTags || []).length > 0) n += 1;
    if (mapBoxSelectionMode === "picked") n += 1;
    if (mapBoxesNearTrailsOnly) n += 1;
    if (mapBoxesSlotCompatibleOnly) n += 1;
    return n;
  }, [
    mapShowBoxes,
    mapBoxCriteriaTags,
    mapBoxSelectionMode,
    mapBoxesNearTrailsOnly,
    mapBoxesSlotCompatibleOnly,
  ]);

  const explorerTrailFilterBadgeCount = useMemo(() => {
    let n = 0;
    if (!mapShowTrails) n += 1;
    if (mapTrailsScope !== "all") n += 1;
    if (mapTrailDifficultyFilter !== "all") n += 1;
    return n;
  }, [mapShowTrails, mapTrailsScope, mapTrailDifficultyFilter]);

  const explorerBoxFiltersChildren = (
          <>
            <Text style={styles.fieldLabel}>Zone de recherche</Text>
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
                  Par GPS
                </Text>
              </TouchableOpacity>
            </View>
            {mapListSource === "city" ? (
              <TextInput
                style={styles.input}
                placeholder="Ville (ex. Annecy)"
                placeholderTextColor={theme.inkMuted}
                value={city}
                onChangeText={(v) => {
                  setCity(v);
                  setMapExplorerCameraFollowSearch(true);
                  setMapListSource("city");
                }}
              />
            ) : null}
            {mapListSource === "nearby" ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Latitude"
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
                  placeholder="Longitude"
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
            ) : null}
            <Text style={styles.fieldLabel}>Affichage des box</Text>
            <Text style={styles.helperText}>
              La liste suit la zone choisie (carte, ville ou GPS).
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
                    const active = (mapBoxCriteriaTags || []).includes(label);
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
                    <Text style={styles.helperText}>
                      Mode recommandé: choisis tes traces, règle un rayon, puis
                      réserve directement les box les plus proches.
                    </Text>
                    <Text style={styles.fieldLabel}>Tracés de référence</Text>
                    <View style={styles.roleRow}>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          mapNearTrailsMode === "mine" && styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearTrailsMode("mine")}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            mapNearTrailsMode === "mine" &&
                              styles.roleChipTextActive,
                          ]}
                        >
                          Toutes mes traces
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
                          Traces sélectionnées
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          mapNearTrailsMode === "one" && styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearTrailsMode("one")}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            mapNearTrailsMode === "one" &&
                              styles.roleChipTextActive,
                          ]}
                        >
                          Une trace précise
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {mapNearTrailsMode === "one" ? (
                      <ScrollView
                        style={styles.trailPickScroll}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {trailsForPickList.map((trail) => {
                          const tid = Number(trail.id);
                          const sel = Number(mapNearSingleTrailId) === tid;
                          return (
                            <TouchableOpacity
                              key={`near-pick-tr-${trail.id}`}
                              style={[
                                styles.trailPickRow,
                                sel && styles.trailPickRowActive,
                              ]}
                              onPress={() => {
                                setMapNearSingleTrailId(tid);
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
                    <Text style={styles.fieldLabel}>
                      Rayon autour des traces
                    </Text>
                    <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                      {["0.5", "1", "2", "3", "5"].map((km) => (
                        <TouchableOpacity
                          key={`near-km-${km}`}
                          style={[
                            styles.roleChip,
                            String(mapTrailProximityKm) === km &&
                              styles.roleChipActive,
                          ]}
                          onPress={() => setMapTrailProximityKm(km)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.roleChipText,
                              String(mapTrailProximityKm) === km &&
                                styles.roleChipTextActive,
                            ]}
                          >
                            {km} km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>Affichage carte</Text>
                    <View style={styles.roleRow}>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          !mapNearShowAllOnMap && styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearShowAllOnMap(false)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            !mapNearShowAllOnMap && styles.roleChipTextActive,
                          ]}
                        >
                          Compatibles uniquement
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.roleChip,
                          mapNearShowAllOnMap && styles.roleChipActive,
                        ]}
                        onPress={() => setMapNearShowAllOnMap(true)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            mapNearShowAllOnMap && styles.roleChipTextActive,
                          ]}
                        >
                          Toutes (fond grisé)
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.infoBanner}>
                      <Ionicons
                        name="sparkles-outline"
                        size={20}
                        color={theme.primary}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.infoBannerTitle}>
                          {nearTrailCompatibleBoxIds.length} box réservable
                          {nearTrailCompatibleBoxIds.length > 1
                            ? "s"
                            : ""} dans {mapTrailProximityKm} km
                        </Text>
                        <Text style={styles.cardMeta}>
                          Référence: {nearTrailReferenceTrails.length} trace
                          {nearTrailReferenceTrails.length > 1 ? "s" : ""} · tri
                          distance puis disponibilité
                        </Text>
                      </View>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </>
        );

  const explorerBoxSortChildren = (
          <>
        <Text style={styles.fieldLabel}>Trier la liste</Text>
        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
          {[
            { id: "default", label: "Défaut" },
            { id: "rating_desc", label: "Notes ↓" },
            { id: "rating_asc", label: "Notes ↑" },
            { id: "price_asc", label: "Prix ↑" },
            { id: "price_desc", label: "Prix ↓" },
            { id: "slot_match", label: "Créneau" },
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
          </>
        );


  const explorerTrailFiltersChildren = (
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
                      {
                        id: "following",
                        label: `Abonnements${
                          followingUserIdSet.size > 0
                            ? ` (${followingUserIdSet.size})`
                            : ""
                        }`,
                      },
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
            {mapTrailsScope === "following" ? (
              <Text style={styles.helperText}>
                {followingUserIdSet.size === 0
                  ? "Suis des hôtes ou créateurs via « Suivre » sur leur profil pour afficher leurs traces et box ici."
                  : "Carte et listes limitées aux comptes suivis (traces publiques et box actives)."}
              </Text>
            ) : null}
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
                            {" · "}
                            {TRAIL_ACTIVITY_LABELS[trail.activity || "hike"]}
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
        );

  const explorerTrailSortChildren = (
          <>
        <Text style={styles.fieldLabel}>Trier la liste</Text>
        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
          {[
            { id: "default", label: "Défaut" },
            { id: "relevance_desc", label: "Pertinence ↓" },
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
          </>
        );

  const explorerScrollContent = (
    <>
      <View style={styles.discoverCoach}>
        <View style={styles.discoverCoachTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.discoverCoachKicker}>RavitoBox · carte</Text>
            <Text style={styles.discoverCoachTitle}>Découvrir</Text>
            <Text style={styles.discoverCoachLabel}>
              1. Projet ou curiosité · 2. Box ou ravito · 3. Créneau. Gérer /
              créer un projet en détail → onglet Projets. Suivi → Réservations.
            </Text>
          </View>
          {webDesktopSplit ? (
            <TouchableOpacity
              style={styles.discoverPanelToggle}
              onPress={() => setDiscoverPanelOpen(false)}
              accessibilityLabel="Masquer le panneau"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
        {canBook ? (
          <View style={styles.discoverProjectBlock}>
            <Text style={styles.discoverCoachLabel}>Projet</Text>
            <TouchableOpacity
              style={styles.discoverProjectSelect}
              onPress={() => setDiscoverProjectPickerOpen((v) => !v)}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Choisir un projet"
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.discoverProjectSelectValue} numberOfLines={1}>
                  {selectedRoutePlanId
                    ? (Array.isArray(routePlans) ? routePlans : []).find(
                        (p) => Number(p.id) === Number(selectedRoutePlanId)
                      )?.name || `Projet #${selectedRoutePlanId}`
                    : "Curiosité (sans projet)"}
                </Text>
                <Text
                  style={styles.discoverProjectSelectMeta}
                  numberOfLines={1}
                >
                  {selectedRoutePlanId
                    ? (() => {
                        const plans = Array.isArray(routePlans)
                          ? routePlans
                          : [];
                        const cur = plans.find(
                          (p) => Number(p.id) === Number(selectedRoutePlanId)
                        );
                        const recap = planPreviewRecap(
                          selectedRoutePlanDetail &&
                            Number(selectedRoutePlanDetail.id) ===
                              Number(selectedRoutePlanId)
                            ? selectedRoutePlanDetail
                            : cur
                        );
                        return recap.lines.slice(0, 2).join(" · ") || null;
                      })()
                    : "Regarder la carte librement"}
                </Text>
              </View>
              <Ionicons
                name={discoverProjectPickerOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color="rgba(250,250,250,0.75)"
              />
            </TouchableOpacity>
            {discoverProjectPickerOpen ? (
              <View style={styles.discoverProjectMenu}>
                <ScrollView
                  style={styles.discoverProjectMenuScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  <TouchableOpacity
                    style={[
                      styles.discoverProjectMenuRow,
                      selectedRoutePlanId == null &&
                        styles.discoverProjectMenuRowOn,
                    ]}
                    onPress={() => selectDiscoverProject(null)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.discoverProjectMenuTitle,
                          selectedRoutePlanId == null &&
                            styles.discoverProjectMenuTitleOn,
                        ]}
                        numberOfLines={1}
                      >
                        Curiosité
                        {selectedRoutePlanId == null ? " · actif" : ""}
                      </Text>
                      <Text
                        style={styles.discoverProjectMenuMeta}
                        numberOfLines={1}
                      >
                        Sans projet — regarder la carte
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {(Array.isArray(routePlans) ? routePlans : []).map((plan) => {
                    const pid = Number(plan.id);
                    const active = Number(selectedRoutePlanId) === pid;
                    const recap = planPreviewRecap(plan);
                    return (
                      <TouchableOpacity
                        key={`xp-${pid}`}
                        style={[
                          styles.discoverProjectMenuRow,
                          active && styles.discoverProjectMenuRowOn,
                        ]}
                        onPress={() => selectDiscoverProject(pid)}
                        activeOpacity={0.85}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              styles.discoverProjectMenuTitle,
                              active && styles.discoverProjectMenuTitleOn,
                            ]}
                            numberOfLines={1}
                          >
                            {recap.title}
                            {active ? " · actif" : ""}
                          </Text>
                          <Text
                            style={styles.discoverProjectMenuMeta}
                            numberOfLines={1}
                          >
                            {recap.lines.slice(0, 2).join(" · ")}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={{ paddingVertical: 10, paddingHorizontal: 4 }}
                  onPress={() => {
                    setDiscoverProjectPickerOpen(false);
                    mainTabNavigationRef.current?.navigate?.("Plans");
                  }}
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontWeight: "700",
                      color: theme.primary,
                    }}
                  >
                    + Créer un projet
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {projectDiscoverRecap ? (
              <View style={styles.discoverProjectRecap}>
                <Text style={styles.discoverProjectRecapTitle}>
                  Récap projet
                </Text>
                {projectDiscoverRecap.trailName ? (
                  <Text style={styles.discoverProjectRecapLine}>
                    Trace · {projectDiscoverRecap.trailName}
                  </Text>
                ) : null}
                <Text style={styles.discoverProjectRecapLine}>
                  {projectDiscoverRecap.boxCount} box
                  {projectDiscoverRecap.boxes.length
                    ? ` · ${projectDiscoverRecap.boxes
                        .slice(0, 3)
                        .map((b) => b.title || b.box_title || `#${b.id}`)
                        .join(", ")}`
                    : ""}
                  {projectDiscoverRecap.boxCount > 3 ? "…" : ""}
                </Text>
                <Text style={styles.discoverProjectRecapLine}>
                  Ravito GPS · {projectDiscoverRecap.trailNotes.length} point
                  {projectDiscoverRecap.trailNotes.length > 1 ? "s" : ""}
                </Text>
                {projectDiscoverRecap.bookings.length > 0 ? (
                  <Text style={styles.discoverProjectRecapLine}>
                    Horaires ·{" "}
                    {projectDiscoverRecap.bookings
                      .slice(0, 2)
                      .map((b) => {
                        const d = b.booking_date || b.date || "";
                        const st = b.start_time || "";
                        const en = b.end_time || "";
                        return [d, st && en ? `${st}–${en}` : st]
                          .filter(Boolean)
                          .join(" ");
                      })
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ) : (
                  <Text style={styles.discoverProjectRecapLine}>
                    Horaires · aucune réservation encore
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.discoverProjectRecapLink}
                  onPress={() =>
                    mainTabNavigationRef.current?.navigate?.("Plans")
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.discoverProjectRecapLinkText}>
                    Ouvrir dans Projets
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {canBook ? (
        <Section
          flat
          title="Réserver"
          subtitle={
            selectedRoutePlanId
              ? "Choisis box fixe ou ravito humain (icônes différentes sur la carte)."
              : "Curiosité : regarde librement. Active un projet pour réserver."
          }
        >
          <View style={styles.discoverMapLegendRow}>
            <View style={styles.discoverMapLegendItem}>
              <Ionicons name="home" size={14} color={theme.primary} />
              <Text style={styles.discoverMapLegendText}>Box fixe</Text>
            </View>
            <View style={styles.discoverMapLegendItem}>
              <Ionicons name="walk" size={14} color="#C2410C" />
              <Text style={styles.discoverMapLegendText}>Ravito humain</Text>
            </View>
          </View>
          <View style={styles.discoverReserveModeRow}>
            <TouchableOpacity
              style={[
                styles.discoverReserveModeBtn,
                discoverReserveMode === "box" && styles.discoverReserveModeBtnOn,
              ]}
              onPress={() => {
                setDiscoverReserveMode("box");
                setDiscoverBookStep(selectedBox ? 2 : 1);
              }}
              activeOpacity={0.88}
            >
              <Ionicons
                name="home-outline"
                size={18}
                color={discoverReserveMode === "box" ? "#fff" : theme.ink}
              />
              <Text
                style={[
                  styles.discoverReserveModeText,
                  discoverReserveMode === "box" &&
                    styles.discoverReserveModeTextOn,
                ]}
              >
                Box fixe
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.discoverReserveModeBtn,
                discoverReserveMode === "ravito" &&
                  styles.discoverReserveModeBtnOn,
              ]}
              onPress={() => {
                setDiscoverReserveMode("ravito");
                setSelectedBoxId(null);
              }}
              activeOpacity={0.88}
            >
              <Ionicons
                name="walk-outline"
                size={18}
                color={discoverReserveMode === "ravito" ? "#fff" : theme.ink}
              />
              <Text
                style={[
                  styles.discoverReserveModeText,
                  discoverReserveMode === "ravito" &&
                    styles.discoverReserveModeTextOn,
                ]}
              >
                Ravito humain
              </Text>
            </TouchableOpacity>
          </View>
          {!discoverReserveMode ? (
            <Text style={styles.helperText}>
              Maison = box fixe. Marcheur = ravito humain au GPS.
            </Text>
          ) : !selectedRoutePlanId ? (
            <Text style={styles.helperText}>
              Mode curiosité : tu peux explorer. Active un projet pour finaliser
              une réservation.
            </Text>
          ) : null}
        </Section>
      ) : null}

      <TouchableOpacity
        style={styles.discoverToolsToggle}
        onPress={() => setDiscoverToolsOpen((v) => !v)}
        activeOpacity={0.85}
      >
        <Text style={styles.discoverToolsToggleText}>
          {discoverToolsOpen ? "Masquer outils" : "Outils & listes"}
        </Text>
        <Ionicons
          name={discoverToolsOpen ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.inkMuted}
        />
      </TouchableOpacity>
      {discoverToolsOpen && !simpleUi ? (
        <OutlineButton
          compact
          stretch
          label="Catalogue traces GPX"
          icon="navigate-outline"
          onPress={() => actionsRef.current.navigateToTrails?.()}
        />
      ) : null}
      <Section
        flat
        title="Sur la carte"
        subtitle={
          discoverReserveMode === "ravito"
            ? "Pose un point GPS pour le ravito."
            : "Touche une box pour l’étape 1."
        }
      >
        <View style={styles.explorerMapSearchRow}>
          <TouchableOpacity
            style={styles.explorerFilterCTA}
            onPress={() => setShowBoxFilters(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="options-outline" size={18} color={theme.ink} />
            <Text style={styles.explorerFilterCTAText}>
              {mapListSource === "city"
                ? "Zone : ville"
                : mapListSource === "nearby"
                ? "Zone : GPS"
                : "Zone visible"}
            </Text>
          </TouchableOpacity>
          {mapListSource === "city" ? (
            <TextInput
              style={[styles.input, { flex: 1, marginTop: 0, marginBottom: 0 }]}
              placeholder="Ville (ex. Annecy)"
              placeholderTextColor={theme.inkMuted}
              value={city}
              onChangeText={(v) => {
                setCity(v);
                setMapExplorerCameraFollowSearch(true);
                setMapListSource("city");
              }}
            />
          ) : null}
        </View>
        <View style={styles.statBanner}>
          <Ionicons
            name="cube-outline"
            size={18}
            color={theme.inkMuted}
            style={styles.statBannerIcon}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statBannerTitle}>
              {boxes.length === 0
                ? "Aucune box dans cette zone"
                : `${boxes.length} box dans la zone`}
            </Text>
            {boxes.length === 0 ? (
              <Text style={styles.statBannerText}>
                Déplace la carte ou change la zone.
              </Text>
            ) : null}
          </View>
        </View>
        {!simpleUi ||
        safePickedBoxIds.length > 0 ||
        mapTrailPickIds.length > 0 ? (
          <View style={styles.explorerSelectionSummary}>
            <Text style={styles.explorerSelectionSummaryText}>
              Plan en cours : {safePickedBoxIds.length} box ·{" "}
              {mapTrailPickIds.length} trace
              {mapTrailPickIds.length > 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
        {activePlanOnMap ? (
          <View style={styles.discoverPlanFilter}>
            <Text style={styles.discoverPlanFilterTitle} numberOfLines={1}>
              {activePlanOnMap.name || "Plan"} · {activePlanBoxIds.length} box
            </Text>
            <View style={styles.discoverPlanFilterSeg}>
              <TouchableOpacity
                style={[
                  styles.discoverPlanFilterBtn,
                  mapBoxSelectionMode === "picked" &&
                    styles.discoverPlanFilterBtnOn,
                ]}
                onPress={() => {
                  setMapPickedBoxIds(activePlanBoxIds);
                  setMapBoxSelectionMode("picked");
                  if (!activePlanBoxIdSet.has(Number(selectedBoxId))) {
                    setSelectedBoxId(activePlanBoxIds[0] || null);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.discoverPlanFilterBtnText,
                    mapBoxSelectionMode === "picked" &&
                      styles.discoverPlanFilterBtnTextOn,
                  ]}
                >
                  Plan
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.discoverPlanFilterBtn,
                  mapBoxSelectionMode === "all" &&
                    styles.discoverPlanFilterBtnOn,
                ]}
                onPress={() => setMapBoxSelectionMode("all")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.discoverPlanFilterBtnText,
                    mapBoxSelectionMode === "all" &&
                      styles.discoverPlanFilterBtnTextOn,
                  ]}
                >
                  Zone
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {!webSplit && !mobileMapFirst ? (
          <NativeExplorerMap
            center={webMapCenter}
            boxes={boxesOnMap}
            trails={trailsOnMap}
            selectedTrailIds={mapTrailPickIds}
            selectedTrailId={selectedTrailId}
            selectedBoxId={selectedBoxId}
            spotlightBoxId={spotlightBoxId}
            selectedBoxIds={mapPickedBoxIds}
            planBoxIds={activePlanBoxIds}
            compatibleBoxIds={nearTrailCompatibleBoxIds}
            proximityTrailIds={nearTrailReferenceTrails.map((t) =>
              Number(t.id)
            )}
            trailCorridorKm={Number(mapTrailProximityKm) || 2}
            dimIncompatibleBoxes={mapBoxesNearTrailsOnly && mapNearShowAllOnMap}
            trailMapPoints={trailMapPoints}
            onSelectBox={focusExplorerBox}
            onSelectTrail={focusExplorerTrail}
            onTrailProbe={setExplorerTrailProbe}
            onMapLongPress={handleExplorerMapLongPress}
            onPickLocation={handleExplorerMapTap}
            onVisibleBoundsChange={setMapViewportBounds}
            onPanDrag={() => actionsRef.current.markExplorerMapUserGesture?.()}
            followExternalCenter={
              mapExplorerCameraFollowSearch &&
              !(mapListSource === "viewport" && selectedBoxId == null)
            }
            recenterNonce={mapExplorerRecenterNonce}
            pickedMapPoint={lastMapTapCoords || undefined}
          />
        ) : null}
        {selectedBox || selectedTrail ? (
          <View style={styles.explorerActiveSelectionBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.explorerActiveSelectionKicker}>
                {selectedBox ? "Box en focus" : "Trace en focus"}
              </Text>
              <Text style={styles.explorerActiveSelectionTitle} numberOfLines={1}>
                {selectedBox
                  ? `${selectedBox.title || "Box"} · ${
                      selectedBox.city || "Ville inconnue"
                    }`
                  : `${selectedTrail?.name || "Trace"} · ${
                      selectedTrail?.territory || "Territoire inconnu"
                    }`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.explorerActiveSelectionCloseBtn}
              onPress={() => {
                if (selectedBox) setSelectedBoxId(null);
                if (selectedTrail) handleRequestExitExplorerTrail();
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={16} color={theme.primary} />
              <Text style={styles.explorerActiveSelectionCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {lastMapTapCoords ? (
          <View style={styles.mapCoordCard}>
            <Text style={styles.mapCoordTitle}>Coordonnées sélectionnées</Text>
            <Text style={styles.mapCoordValue}>
              Lat {Number(lastMapTapCoords.lat).toFixed(6)} · Lon{" "}
              {Number(lastMapTapCoords.lng).toFixed(6)}
            </Text>
            <Text style={styles.helperText}>
              Astuce: copie ces coordonnées dans une note de parcours pour
              positionner un repère précis.
            </Text>
            {canBook && user ? (
              <OutlineButton
                compact
                stretch
                label="Demander un ravito ici"
                icon="megaphone-outline"
                onPress={requestRavitoAtMapTap}
              />
            ) : null}
          </View>
        ) : null}
        {selectedBox ? (
          <View style={styles.selectedHostCard}>
            <Text style={styles.selectedLabel}>Box sélectionnée</Text>
            <Text style={styles.cardTitle}>{selectedBox.title}</Text>
            {activePlanOnMap ? (
              <View
                style={[
                  styles.selectionPill,
                  selectedBoxInActivePlan
                    ? styles.selectionPillActive
                    : styles.selectionPillIdle,
                ]}
              >
                <Text
                  style={[
                    styles.selectionPillText,
                    selectedBoxInActivePlan
                      ? styles.selectionPillTextActive
                      : styles.selectionPillTextIdle,
                  ]}
                >
                  {selectedBoxInActivePlan
                    ? "Déjà dans le plan"
                    : "Hors plan (ajout possible)"}
                </Text>
              </View>
            ) : null}
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
                  Créneau dans « Créneau & demande » (panneau gauche). Un
                  récapitulatif s’affiche avant l’envoi.
                </Text>
                <PrimaryButton
                  compact
                  label="Choisir le créneau"
                  icon="time-outline"
                  onPress={() => startBookingFromExplorer(selectedBox.id)}
                />
                <OutlineButton
                  compact
                  stretch
                  label="Ajuster le créneau (date & heures)"
                  icon="time-outline"
                  onPress={() => {
                    const bid = Number(selectedBox.id);
                    setSelectedBoxId(bid);
                    requestAnimationFrame(() => {
                      explorerScrollRef.current?.scrollTo?.({
                        y: Math.max(0, bookingSectionYRef.current - 16),
                        animated: true,
                      });
                    });
                  }}
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
          <View
            style={
              webDesktopSplit
                ? styles.selectedTrailCompact
                : styles.selectedHostCard
            }
          >
            {webDesktopSplit ? (
              <>
                <Text style={styles.selectedLabel}>Trace active</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {selectedTrail.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {selectedTrail.distance_km} km ·{" "}
                  {DIFFICULTY_LABELS[selectedTrail.difficulty] ||
                    selectedTrail.difficulty}
                </Text>
                <TrailAltitudeBadge trail={selectedTrail} compact />
                <Text style={styles.helperText}>
                  Profil, plan (trace + box + points mémorisés) et courbe dans
                  la colonne du milieu. Coche les box ici à gauche sur la carte.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.selectedLabel}>Trace sélectionnée</Text>
                <Text style={styles.cardTitle}>{selectedTrail.name}</Text>
                <Text style={styles.cardMeta}>
                  {selectedTrail.territory} · {selectedTrail.distance_km} km ·{" "}
                  {formatTrailElevationSummary(selectedTrail)} ·{" "}
                  {DIFFICULTY_LABELS[selectedTrail.difficulty] ||
                    selectedTrail.difficulty}
                </Text>
                <TrailAltitudeBadge trail={selectedTrail} />
                {selectedTrail.notes ? (
                  <Text style={styles.cardAvailability} numberOfLines={3}>
                    {selectedTrail.notes}
                  </Text>
                ) : null}
                <TrailElevationProfile
                  trail={selectedTrail}
                  probe={
                    explorerTrailProbe &&
                    Number(explorerTrailProbe.trailId) ===
                      Number(selectedTrail.id)
                      ? explorerTrailProbe
                      : null
                  }
                />
                {canBook &&
                user &&
                explorerTrailProbe &&
                Number(explorerTrailProbe.trailId) ===
                  Number(selectedTrail.id) &&
                Number.isFinite(explorerTrailProbe.lat) ? (
                  <OutlineButton
                    compact
                    stretch
                    label="Demander un ravito sur ce point"
                    icon="megaphone-outline"
                    onPress={requestRavitoAtProbe}
                  />
                ) : null}
              </>
            )}
            <OutlineButton
              compact
              stretch
              label="Voir uniquement cette trace"
              icon="filter-outline"
              onPress={() =>
                actionsRef.current.isolateTrailOnMap(selectedTrail.id)
              }
            />
            {user?.id != null &&
            Number(selectedTrail.creator_user_id) === Number(user.id) ? (
              <OutlineButton
                compact
                stretch
                label="Remplacer le GPX de cette trace"
                icon="swap-horizontal-outline"
                onPress={() =>
                  actionsRef.current.replaceTrailGpx?.(selectedTrail.id)
                }
              />
            ) : null}
            {webDesktopSplit ? (
              <View style={[styles.infoBanner, { marginTop: 8 }]}>
                <Text style={styles.infoBannerText}>
                  Composition du parcours (trace, box, points, partage) : colonne
                  centrale — Brouillon · Mon plan · Communauté.
                </Text>
              </View>
            ) : null}
            {!webDesktopSplit ? (
            <>
            <OutlineButton
              compact
              stretch
              label={
                routePlanBusy
                  ? "Mise à jour du plan..."
                  : activePlanForSelectedTrail
                  ? "Ajouter les box sélectionnées au plan actif"
                  : "Créer plan (trace + box sélectionnées)"
              }
              icon="save-outline"
              onPress={() =>
                (async () => {
                  if (activePlanForSelectedTrail) {
                    await actionsRef.current.upsertRoutePlanBoxes?.(
                      activePlanForSelectedTrail.id,
                      {
                        boxIds: safePickedBoxIds,
                        mergeWithExisting: true,
                      }
                    );
                    return;
                  }
                  const created =
                    await actionsRef.current.createRoutePlanFromSelection?.({
                      trailId: selectedTrail.id,
                      boxIds: safePickedBoxIds,
                      notes: routePlanDraftNotes,
                    });
                  if (created) setRoutePlanDraftNotes("");
                })()
              }
            />
            <TextInput
              style={[styles.input, styles.textArea, { marginTop: 8 }]}
              placeholder="Notes plan (ravito, stratégie, checkpoints...)"
              placeholderTextColor={theme.inkMuted}
              value={routePlanDraftNotes}
              onChangeText={setRoutePlanDraftNotes}
              multiline
            />
            {plansForSelectedTrail.length > 0 ? (
              <View style={styles.planListCard}>
                <Text style={styles.fieldLabel}>Plans de cette trace</Text>
                <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                  {plansForSelectedTrailSorted.slice(0, 6).map((plan) => {
                    const active =
                      Number(selectedRoutePlanId) === Number(plan.id);
                    return (
                      <TouchableOpacity
                        key={`route-plan-chip-${plan.id}`}
                        style={[
                          styles.roleChip,
                          active && styles.roleChipActive,
                        ]}
                        onPress={() => {
                          setSelectedRoutePlanId(Number(plan.id));
                          actionsRef.current.loadRoutePlanDetail?.(plan.id);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            active && styles.roleChipTextActive,
                          ]}
                        >
                          {plan.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {activePlanForSelectedTrail ? (
              <View style={[styles.infoBanner, styles.planSummaryCard]}>
                <Ionicons
                  name="flag-outline"
                  size={20}
                  color={theme.primary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBannerTitle}>
                    Plan actif: {activePlanForSelectedTrail.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {activePlanForSelectedTrail.validated_box_count || 0}{" "}
                    validée
                    {(activePlanForSelectedTrail.validated_box_count || 0) > 1
                      ? "s"
                      : ""}{" "}
                    · {activePlanForSelectedTrail.pending_box_count || 0} en
                    attente ·{" "}
                    {activePlanForSelectedTrail.rejected_box_count || 0} refusée
                    {(activePlanForSelectedTrail.rejected_box_count || 0) > 1
                      ? "s"
                      : ""}
                  </Text>
                  {activePlanForSelectedTrail.notes ? (
                    <Text style={styles.cardAvailability} numberOfLines={4}>
                      {activePlanForSelectedTrail.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {activePlanForSelectedTrail ? (
              <View style={[styles.planEditCard, { marginTop: 8 }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Nom du plan"
                  placeholderTextColor={theme.inkMuted}
                  value={planNameDraft}
                  onChangeText={setPlanNameDraft}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Notes générales du plan"
                  placeholderTextColor={theme.inkMuted}
                  value={planNotesDraft}
                  onChangeText={setPlanNotesDraft}
                  multiline
                />
                <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                  <OutlineButton
                    compact
                    label="Enregistrer toutes les modifications du plan"
                    icon="save-outline"
                    onPress={saveActiveRoutePlanDrafts}
                  />
                </View>
                <Text style={styles.helperText}>
                  Les changements (nom, notes, commentaires box, notes de
                  parcours éditées) sont enregistrés avec ce bouton unique.
                </Text>
              </View>
            ) : null}
            {activePlanForSelectedTrail ? (
              <>
                <View
                  style={[styles.roleRow, { marginTop: 8, flexWrap: "wrap" }]}
                >
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      planExportIncludePending && styles.roleChipActive,
                    ]}
                    onPress={() => setPlanExportIncludePending((prev) => !prev)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        planExportIncludePending && styles.roleChipTextActive,
                      ]}
                    >
                      Inclure en attente
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.roleChip,
                      planExportIncludeRejected && styles.roleChipActive,
                    ]}
                    onPress={() =>
                      setPlanExportIncludeRejected((prev) => !prev)
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        planExportIncludeRejected && styles.roleChipTextActive,
                      ]}
                    >
                      Inclure refusées
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.roleChip} activeOpacity={1}>
                    <Text style={styles.roleChipText}>
                      Connecteurs: désactivés
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.helperText}>
                  Le GPX exporté reste propre (trace + waypoints box). Une fois
                  tes box validées, refais le tracé final si besoin dans un
                  outil dédié de routing.
                </Text>
                <View
                  style={[styles.roleRow, { marginTop: 8, flexWrap: "wrap" }]}
                >
                  <OutlineButton
                    compact
                    label="Voir box du plan sur carte"
                    icon="map-outline"
                    onPress={() =>
                      actionsRef.current.showRoutePlanOnMap?.(
                        activePlanForSelectedTrail
                      )
                    }
                  />
                  <OutlineButton
                    compact
                    label="GPX enrichi"
                    icon="download-outline"
                    onPress={() =>
                      actionsRef.current.downloadRoutePlanGpx?.(
                        activePlanForSelectedTrail.id,
                        {
                          includePending: planExportIncludePending,
                          includeRejected: planExportIncludeRejected,
                        }
                      )
                    }
                  />
                </View>
                {Array.isArray(activePlanForSelectedTrail.boxes) &&
                activePlanForSelectedTrail.boxes.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>Box du plan</Text>
                    <ScrollView
                      style={styles.trailPickScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {activePlanForSelectedTrail.boxes.map((b) => {
                        const status = String(b.validation_status || "pending");
                        const isValidated = status === "validated";
                        const isRejected = status === "rejected";
                        const hasActiveBooking = planBoxHasActiveBooking(b);
                        const bookingSlotLabel = formatPlanBoxSlot(b);
                        const priceLabel = formatPlanBoxPrice(b);
                        const bookingId = Number(b.latest_booking_id);
                        const isEditingBooking =
                          Number.isFinite(bookingId) &&
                          bookingId > 0 &&
                          Number(editingPlanBookingId) === bookingId;
                        return (
                          <View
                            key={`plan-box-${b.id}`}
                            style={[
                              styles.trailPickRow,
                              isValidated
                                ? {
                                    borderColor: "#34D399",
                                    backgroundColor: "#ECFDF5",
                                  }
                                : isRejected
                                ? {
                                    borderColor: "#FCA5A5",
                                    backgroundColor: "#FEF2F2",
                                  }
                                : null,
                            ]}
                          >
                            <Ionicons
                              name={
                                isValidated
                                  ? "checkmark-circle"
                                  : isRejected
                                  ? "close-circle"
                                  : "time-outline"
                              }
                              size={20}
                              color={
                                isValidated
                                  ? "#059669"
                                  : isRejected
                                  ? "#DC2626"
                                  : theme.primary
                              }
                            />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                              <Text style={styles.cardTitle}>
                                {b.title || "Box"}
                              </Text>
                              <Text style={styles.cardMeta}>
                                {b.city || "Ville inconnue"}
                              </Text>
                              <Text style={styles.cardDetailLine}>
                                {planBoxValidationLabel(status)}
                                {hasActiveBooking
                                  ? ` · ${planBoxApprovalLabel(
                                      b.latest_approval_status
                                    )}`
                                  : ""}
                              </Text>
                              <View
                                style={[
                                  styles.selectionPill,
                                  bookingSlotLabel
                                    ? styles.selectionPillActive
                                    : styles.selectionPillIdle,
                                  { marginTop: 6, marginBottom: 4 },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.selectionPillText,
                                    bookingSlotLabel
                                      ? styles.selectionPillTextActive
                                      : styles.selectionPillTextIdle,
                                  ]}
                                >
                                  {bookingSlotLabel
                                    ? `Créneau : ${bookingSlotLabel}${
                                        priceLabel ? ` · ${priceLabel}` : ""
                                      }`
                                    : "Aucun créneau actif réservé pour ce plan"}
                                </Text>
                              </View>
                              {b.latest_booking_special_request ? (
                                <Text style={styles.cardAvailability}>
                                  Demande : {b.latest_booking_special_request}
                                </Text>
                              ) : null}
                              <TextInput
                                style={[styles.input, { marginTop: 6 }]}
                                placeholder="Commentaire box (stratégie, matos, ravito...)"
                                placeholderTextColor={theme.inkMuted}
                                value={String(
                                  boxCommentDraftById[Number(b.id)] || ""
                                )}
                                onChangeText={(v) =>
                                  setBoxCommentDraftById((prev) => ({
                                    ...prev,
                                    [Number(b.id)]: v,
                                  }))
                                }
                              />
                              <OutlineButton
                                compact
                                label="Sauver note box"
                                icon="save-outline"
                                onPress={() => saveSinglePlanBoxComment(Number(b.id))}
                              />
                              {hasActiveBooking ? (
                                <OutlineButton
                                  compact
                                  label={
                                    isEditingBooking
                                      ? "Modification en cours (rail / ci-dessous)"
                                      : "Modifier le créneau"
                                  }
                                  icon="create-outline"
                                  onPress={() => openPlanBoxBookingEditor(b)}
                                />
                              ) : (
                                <OutlineButton
                                  compact
                                  label="Réserver cette box"
                                  icon="calendar-outline"
                                  onPress={() =>
                                    startBookingFromExplorer(Number(b.id))
                                  }
                                />
                              )}
                              <OutlineButton
                                compact
                                label="Onglet Réserver (détail complet)"
                                icon="open-outline"
                                onPress={openReservationsTab}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.fieldLabel}>Notes de parcours</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Note parcours (point ravito, vigilance, pente...)"
                    placeholderTextColor={theme.inkMuted}
                    value={newTrailNoteText}
                    onChangeText={setNewTrailNoteText}
                    multiline
                  />
                  <View style={styles.roleRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8 }]}
                      placeholder="Lat (optionnel)"
                      placeholderTextColor={theme.inkMuted}
                      value={newTrailNoteLat}
                      onChangeText={setNewTrailNoteLat}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Lon (optionnel)"
                      placeholderTextColor={theme.inkMuted}
                      value={newTrailNoteLon}
                      onChangeText={setNewTrailNoteLon}
                    />
                  </View>
                  <OutlineButton
                    compact
                    label="Ajouter note parcours"
                    icon="add-circle-outline"
                    onPress={async () => {
                      const payload = {
                        note: newTrailNoteText,
                      };
                      const lat = Number.parseFloat(newTrailNoteLat);
                      const lon = Number.parseFloat(newTrailNoteLon);
                      if (Number.isFinite(lat)) payload.pointLat = lat;
                      if (Number.isFinite(lon)) payload.pointLon = lon;
                      const ok = await addRoutePlanTrailNote?.(
                        activePlanForSelectedTrail.id,
                        payload
                      );
                      if (ok) {
                        setNewTrailNoteText("");
                        setNewTrailNoteLat("");
                        setNewTrailNoteLon("");
                      }
                    }}
                  />
                  {(activePlanForSelectedTrail.trail_notes || []).map((n) => (
                    <View
                      key={`trail-note-${n.id}`}
                      style={styles.trailPickRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardMeta}>
                          {(n.point_lat != null && n.point_lon != null
                            ? `${Number(n.point_lat).toFixed(5)}, ${Number(
                                n.point_lon
                              ).toFixed(5)} · `
                            : "") + "Note parcours"}
                        </Text>
                        <TextInput
                          style={[styles.input, { marginTop: 6 }]}
                          placeholder="Modifier la note parcours"
                          placeholderTextColor={theme.inkMuted}
                          value={String(
                            trailNoteDraftById[Number(n.id)] ?? n.note ?? ""
                          )}
                          onChangeText={(v) =>
                            setTrailNoteDraftById((prev) => ({
                              ...prev,
                              [Number(n.id)]: v,
                            }))
                          }
                          multiline
                        />
                        <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                          <OutlineButton
                            compact
                            label="Note éditée (sera enregistrée avec le bouton unique)"
                            icon="checkmark-done-outline"
                            disabled
                          />
                          <OutlineButton
                            compact
                            label="Supprimer note"
                            icon="trash-outline"
                            onPress={() =>
                              deleteRoutePlanTrailNote?.(
                                activePlanForSelectedTrail.id,
                                n.id
                              )
                            }
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            </>
            ) : null}
          </View>
        ) : null}
        {!simpleUi ? (
          <View style={[styles.selectedHostCard, { marginTop: 8 }]}>
            <Text style={styles.selectedLabel}>Mes plans enregistrés</Text>
            <Text style={styles.helperText}>
              Retrouve un plan même si tu n'es plus sur la même trace.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Rechercher un plan (nom, trace, territoire)"
              placeholderTextColor={theme.inkMuted}
              value={planSearchQuery}
              onChangeText={setPlanSearchQuery}
            />
            {filteredRoutePlans.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun plan trouvé avec ce filtre.
              </Text>
            ) : (
              <ScrollView
                style={styles.trailPickScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {filteredRoutePlans.map((plan) => {
                  const active =
                    Number(selectedRoutePlanId) === Number(plan.id);
                  return (
                    <View
                      key={`saved-plan-${plan.id}`}
                      style={[
                        styles.trailPickRow,
                        active ? styles.trailPickRowActive : null,
                      ]}
                    >
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                        onPress={() => {
                          setSelectedRoutePlanId(Number(plan.id));
                          actionsRef.current.loadRoutePlanDetail?.(plan.id);
                          if (Number.isFinite(Number(plan.trail_id))) {
                            setSelectedTrailId(Number(plan.trail_id));
                          }
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={active ? "bookmark" : "bookmark-outline"}
                          size={20}
                          color={theme.primary}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.cardTitle}>{plan.name}</Text>
                          <Text style={styles.cardMeta}>
                            {plan.trail_name || "Trace"} ·{" "}
                            {plan.selected_box_count || 0} box
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          const ok = await confirmDestructive(
                            "Supprimer ce plan ?",
                            `Le plan « ${
                              plan.name || "sans nom"
                            } » sera supprimé.`
                          );
                          if (!ok) return;
                          await deleteRoutePlan?.(plan.id);
                        }}
                        style={{ marginLeft: 8, padding: 6 }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#DC2626"
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : null}
      </Section>

      {canBook && discoverReserveMode === "ravito" ? (
        <Section
          flat
          title="Ravito humain"
          subtitle="Quelqu’un te rejoint au point GPS."
        >
          <Text style={styles.helperText}>
            Place un point sur la carte (ou sur une trace), puis envoie la
            demande.
          </Text>
          <PrimaryButton
            compact
            stretch
            label="Demander un ravito GPS"
            icon="navigate-outline"
            onPress={() => {
              if (lastMapTapCoords) {
                openRavitoRequestAtPoint?.({
                  lat: lastMapTapCoords.lat,
                  lon: lastMapTapCoords.lng,
                  source: "map",
                });
              } else {
                openRavitoRequestAtPoint?.({ source: "map" });
              }
            }}
          />
          <OutlineButton
            compact
            stretch
            label="Plutôt réserver une box"
            onPress={() => {
              setDiscoverReserveMode("box");
              setDiscoverBookStep(selectedBox ? 2 : 1);
            }}
          />
        </Section>
      ) : null}

      {canBook && discoverReserveMode === "box" ? (
        <Section
          flat
          title={
            discoverBookStep === 1
              ? "1 · Sélectionner une box"
              : discoverBookStep === 2
              ? "2 · Créneau"
              : discoverBookStep === 3
              ? "3 · Besoins"
              : "4 · Récap & envoi"
          }
          subtitle={
            discoverBookStep === 1
              ? "Touche une box sur la carte."
              : discoverBookStep === 2
              ? "Quand comptes-tu arriver ?"
              : discoverBookStep === 3
              ? "Allège ton sac — l’hôte le voit."
              : "Vérifie puis envoie la demande."
          }
          onLayout={(event) => {
            bookingSectionYRef.current = event?.nativeEvent?.layout?.y || 0;
          }}
        >
          <View style={styles.discoverPrepSteps}>
            {[1, 2, 3, 4].map((n) => (
              <View
                key={`book-${n}`}
                style={[
                  styles.discoverPrepDotLight,
                  discoverBookStep === n && styles.discoverPrepDotOn,
                  discoverBookStep > n && styles.discoverPrepDotDoneLight,
                ]}
              >
                <Text
                  style={[
                    styles.discoverPrepDotTextLight,
                    discoverBookStep >= n && styles.discoverPrepDotTextOn,
                  ]}
                >
                  {n}
                </Text>
              </View>
            ))}
          </View>

          {discoverBookStep === 1 ? (
            <>
              <View style={styles.discoverEmptyPick}>
                <Ionicons
                  name="hand-left-outline"
                  size={22}
                  color={theme.primary}
                />
                <Text style={styles.helperText}>
                  {boxes.length === 0
                    ? "Aucune box dans la zone — déplace la carte."
                    : `${boxes.length} box visibles. Touche-en une.`}
                </Text>
              </View>
              {selectedBox ? (
                <PrimaryButton
                  compact
                  stretch
                  label={`Continuer avec « ${selectedBox.title} »`}
                  icon="arrow-forward-outline"
                  onPress={() => setDiscoverBookStep(2)}
                />
              ) : null}
            </>
          ) : null}

          {discoverBookStep === 2 && selectedBox ? (
            <>
              <Text style={styles.bookingConfirmMeta}>
                {selectedBox.title}
                {selectedBox.city ? ` · ${selectedBox.city}` : ""}
              </Text>
              <DateTimeSelector
                dateValue={bookingDate}
                onDateChange={setBookingDate}
                startValue={startTime}
                onStartChange={setStartTime}
                endValue={endTime}
                onEndChange={setEndTime}
              />
              <View style={styles.row}>
                <OutlineButton
                  compact
                  label="Retour"
                  onPress={() => setDiscoverBookStep(1)}
                />
                <PrimaryButton
                  compact
                  stretch
                  label="Continuer"
                  icon="arrow-forward-outline"
                  disabled={
                    !explorerSlotWellFormed(bookingDate, startTime, endTime)
                  }
                  onPress={() => setDiscoverBookStep(3)}
                />
              </View>
            </>
          ) : null}

          {discoverBookStep === 3 && selectedBox ? (
            <>
              <View
                style={[styles.roleRow, { flexWrap: "wrap", marginBottom: 8 }]}
              >
                {BOOKING_NEED_CHIPS.map((chip) => {
                  const active = textHasTag(specialRequest, chip);
                  return (
                    <TouchableOpacity
                      key={`need-${chip}`}
                      style={[styles.roleChip, active && styles.roleChipActive]}
                      onPress={() => {
                        setSpecialRequest((prev) =>
                          toggleTagInText(prev, chip)
                        );
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          active && styles.roleChipTextActive,
                        ]}
                      >
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Précisions (optionnel)"
                placeholderTextColor={theme.inkMuted}
                value={specialRequest}
                onChangeText={setSpecialRequest}
                multiline
              />
              <View style={styles.row}>
                <OutlineButton
                  compact
                  label="Retour"
                  onPress={() => setDiscoverBookStep(2)}
                />
                <PrimaryButton
                  compact
                  stretch
                  label="Voir le récap"
                  icon="arrow-forward-outline"
                  onPress={() => setDiscoverBookStep(4)}
                />
              </View>
            </>
          ) : null}

          {discoverBookStep === 4 && selectedBox ? (
            <View style={styles.bookingConfirmCard}>
              <FunnelSteps activeId="ask" compact />
              <Text style={styles.bookingConfirmTitle}>Récap</Text>
              <Text style={styles.bookingConfirmMeta}>
                {selectedBox.title}
                {selectedBox.city ? ` · ${selectedBox.city}` : ""}
                {" · "}
                {(Number(selectedBox.price_cents || 0) / 100).toFixed(2)} €
              </Text>
              {formatBoxOfferLines(selectedBox)
                .slice(0, 3)
                .map((line, i) => (
                  <Text key={`recap-off-${i}`} style={styles.helperText}>
                    • {line}
                  </Text>
                ))}
              <Text style={styles.helperText}>
                Créneau · {bookingDate} · {startTime}–{endTime}
              </Text>
              <Text style={styles.helperText}>
                Besoins · {bookingSpecialRequestLabel(specialRequest)}
              </Text>
              {projectDiscoverRecap ? (
                <Text style={styles.helperText}>
                  Projet · {projectDiscoverRecap.name}
                </Text>
              ) : null}
              <PrimaryButton
                label="Envoyer la demande"
                icon="send-outline"
                onPress={() => confirmBookingFromExplorer(selectedBox.id)}
              />
              <OutlineButton
                compact
                stretch
                label="Modifier"
                onPress={() => setDiscoverBookStep(2)}
              />
            </View>
          ) : null}

          {discoverBookStep > 1 && !selectedBox ? (
            <View style={styles.discoverEmptyPick}>
              <Text style={styles.helperText}>
                La box a été désélectionnée. Repars à l’étape 1.
              </Text>
              <OutlineButton
                compact
                stretch
                label="Étape 1 — choisir une box"
                onPress={() => setDiscoverBookStep(1)}
              />
            </View>
          ) : null}
        </Section>
      ) : null}

      {discoverToolsOpen ? (
      <Section flat title="Box à proximité">
        {explorerCompactFilters ? (
          <View style={styles.explorerFilterSummary}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.explorerFilterSummaryKicker}>Liste</Text>
              <Text style={styles.explorerFilterSummaryTitle} numberOfLines={2}>
                Tri : {MAP_BOX_SORT_LABELS[mapBoxSort] ?? mapBoxSort}
              </Text>
              <Text style={styles.explorerFilterSummaryMeta}>
                {explorerBoxFilterBadgeCount > 0
                  ? `${explorerBoxFilterBadgeCount} filtre(s) actif(s)`
                  : "Touche Filtrer pour affiner"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.explorerFilterCTA}
              onPress={() => setShowBoxFilters(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="options-outline" size={18} color={theme.ink} />
              <Text style={styles.explorerFilterCTAText}>Filtrer</Text>
              {explorerBoxFilterBadgeCount > 0 ? (
                <View style={styles.explorerFilterBadge}>
                  <Text style={styles.explorerFilterBadgeText}>
                    {explorerBoxFilterBadgeCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <OutlineButton
              compact
              label={
                showBoxFilters ? "Masquer filtres box" : "Afficher filtres box"
              }
              icon={showBoxFilters ? "chevron-up-outline" : "options-outline"}
              onPress={() => setShowBoxFilters((v) => !v)}
            />
            {showBoxFilters ? explorerBoxFiltersChildren : null}
          </>
        )}
        {!explorerCompactFilters ? explorerBoxSortChildren : null}
        <FlatList
          data={prioritizedExplorerBoxes}
          scrollEnabled={false}
          keyExtractor={(item) => `${item.id}`}
          ListHeaderComponent={
            selectedBox ? (
              <View style={[styles.infoBanner, { marginBottom: 10 }]}>
                <Ionicons
                  name="locate-outline"
                  size={20}
                  color={theme.primary}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBannerTitle}>
                    Box ciblée sur la carte
                  </Text>
                  <Text style={styles.cardMeta}>
                    {selectedBox.title || "Box"} ·{" "}
                    {selectedBox.city || "Ville inconnue"}
                  </Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => focusExplorerBox(item.id)}
              accessibilityRole="button"
              style={[
                styles.card,
                Number(selectedBoxId) === Number(item.id)
                  ? styles.cardFocusState
                  : safePickedBoxIds.includes(Number(item.id))
                  ? styles.cardPickedState
                  : null,
              ]}
            >
              <View
                style={[
                  styles.cardAccent,
                  Number(selectedBoxId) === Number(item.id)
                    ? styles.cardAccentFocus
                    : safePickedBoxIds.includes(Number(item.id))
                    ? styles.cardAccentPicked
                    : null,
                ]}
              />
              <Text style={styles.cardTitle}>{item.title}</Text>
              {Number(selectedBoxId) === Number(item.id) ? (
                <Text
                  style={[styles.cardAvailability, { color: theme.primary }]}
                >
                  Cible carte active
                </Text>
              ) : null}
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
                          ? "0 6px 12px rgba(13, 115, 119, 0.22)"
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
                    ? "Dans le plan"
                    : "Hors plan"}
                </Text>
              </View>
              {activePlanOnMap ? (
                <View
                  style={[
                    styles.selectionPill,
                    activePlanBoxIdSet.has(Number(item.id))
                      ? styles.selectionPillActive
                      : styles.selectionPillIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectionPillText,
                      activePlanBoxIdSet.has(Number(item.id))
                        ? styles.selectionPillTextActive
                        : styles.selectionPillTextIdle,
                    ]}
                  >
                    {activePlanBoxIdSet.has(Number(item.id))
                      ? "Dans le plan"
                      : safePickedBoxIds.includes(Number(item.id))
                      ? "Sélection hors plan (ajout possible)"
                      : "Hors plan"}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.cardMeta}>
                {item.city} · {(item.price_cents / 100).toFixed(2)} €
                {item.distance_km != null &&
                  ` · ≈ ${Number(item.distance_km).toFixed(1)} km`}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <RelevanceBadge
                  avg={item.host_avg_score}
                  count={item.host_review_count}
                  compact
                />
                {formatHostRatingShort(item) ? (
                  <Text style={styles.cardAvailability}>
                    {formatHostRatingShort(item)}
                  </Text>
                ) : (
                  <Text style={styles.cardAvailability}>
                    Hôte sans avis réservation
                  </Text>
                )}
              </View>
              {mapBoxesNearTrailsOnly ? (
                <View
                  style={[
                    styles.selectionPill,
                    styles.selectionPillActive,
                    { marginBottom: 8 },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectionPillText,
                      styles.selectionPillTextActive,
                    ]}
                  >
                    {(
                      Number(nearTrailDistanceByBoxId[Number(item.id)]) || 0
                    ).toFixed(1)}{" "}
                    km de ta trace ·{" "}
                    {canBook ? "Réservable" : "Voir en compte athlète"}
                  </Text>
                </View>
              ) : null}
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
                onPress={() => focusExplorerBox(item.id)}
              />
              <OutlineButton
                compact
                stretch
                label={
                  safePickedBoxIds.includes(Number(item.id))
                    ? "Retirer du plan"
                    : "Ajouter au plan"
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
                <PrimaryButton
                  compact
                  label="Choisir le créneau"
                  icon="time-outline"
                  onPress={() => startBookingFromExplorer(item.id)}
                />
              ) : null}
            </TouchableOpacity>
          )}
        />
        <Modal
          visible={showBoxFilters}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBoxFilters(false)}
        >
            <View style={styles.explorerFilterModalBackdrop}>
              <TouchableOpacity
                style={styles.explorerFilterModalDismiss}
                activeOpacity={1}
                onPress={() => setShowBoxFilters(false)}
              />
              <View style={styles.explorerFilterModalSheet}>
                <View style={styles.dateTimeGrabber} />
                <View style={styles.dateTimeSheetHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.modalSheetTitle}>Zone & filtres box</Text>
                    <Text style={styles.dateTimeSheetSubtitle}>
                      Zone, critères, proximité et tri.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowBoxFilters(false)}
                    hitSlop={12}
                    style={styles.dateTimeCloseBtn}
                    accessibilityLabel="Fermer"
                  >
                    <Ionicons name="close" size={22} color={theme.inkMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.explorerFilterModalScroll}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {explorerBoxFiltersChildren}
                  {explorerBoxSortChildren}
                </ScrollView>
                <View style={styles.dateTimeSheetFooter}>
                  <PrimaryButton
                    compact
                    stretch
                    label="Terminé"
                    icon="checkmark-outline"
                    onPress={() => setShowBoxFilters(false)}
                  />
                </View>
              </View>
            </View>
        </Modal>
      </Section>
      ) : null}

      {!simpleUi && discoverToolsOpen ? (
      <Section
        flat
        title="Traces"
        subtitle="Même ensemble que sur la carte."
      >
        {explorerCompactFilters ? (
          <View style={styles.explorerFilterSummary}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.explorerFilterSummaryKicker}>Liste</Text>
              <Text style={styles.explorerFilterSummaryTitle} numberOfLines={2}>
                Tri : {MAP_TRAIL_SORT_LABELS[mapTrailListSort] ?? mapTrailListSort}
              </Text>
              <Text style={styles.explorerFilterSummaryMeta}>
                {explorerTrailFilterBadgeCount > 0
                  ? `${explorerTrailFilterBadgeCount} filtre(s) actif(s)`
                  : "Touche Filtrer pour affiner"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.explorerFilterCTA}
              onPress={() => setShowTrailFilters(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="options-outline" size={18} color={theme.ink} />
              <Text style={styles.explorerFilterCTAText}>Filtrer</Text>
              {explorerTrailFilterBadgeCount > 0 ? (
                <View style={styles.explorerFilterBadge}>
                  <Text style={styles.explorerFilterBadgeText}>
                    {explorerTrailFilterBadgeCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
            {showTrailFilters ? explorerTrailFiltersChildren : null}
          </>
        )}
        {!explorerCompactFilters ? explorerTrailSortChildren : null}

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
            ListHeaderComponent={
              selectedTrail ? (
                <View style={[styles.infoBanner, { marginBottom: 10 }]}>
                  <Ionicons
                    name="navigate-outline"
                    size={20}
                    color={theme.primary}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoBannerTitle}>
                      Trace ciblée sur la carte
                    </Text>
                    <Text style={styles.cardMeta}>
                      {selectedTrail.name || "Trace"} ·{" "}
                      {selectedTrail.territory || "Territoire inconnu"}
                    </Text>
                    <Text style={styles.cardAvailability}>
                      {formatTrailSignals(selectedTrail)}
                    </Text>
                    {user ? (
                      <RelevanceVoteRow
                        label="Pertinence de cette trace"
                        myScore={selectedTrail.my_relevance_score}
                        disabled={!trailVoteEligibility?.eligible}
                        disabledReason={
                          trailVoteEligibility?.eligible
                            ? null
                            : trailVoteEligibility?.message
                        }
                        onVote={async (score) => {
                          await actionsRef.current.setResourceRelevance?.({
                            resourceType: "trail",
                            resourceId: Number(selectedTrail.id),
                            score,
                          });
                          const elig =
                            await actionsRef.current.checkResourceRelevanceEligibility?.(
                              {
                                resourceType: "trail",
                                resourceId: Number(selectedTrail.id),
                              }
                            );
                          setTrailVoteEligibility(elig || null);
                          await actionsRef.current.loadTrails?.();
                        }}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item: trail }) => {
              const mine =
                user && Number(trail.creator_user_id) === Number(user.id);
              const tid = Number(trail.id);
              const isPicked = mapTrailPickIds.includes(tid);
              const isFocused = Number(selectedTrailId) === tid;
              return (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => {
                    focusExplorerTrail(tid);
                    actionsRef.current.centerMapOnTrail(tid);
                  }}
                  accessibilityRole="button"
                  style={[
                    styles.card,
                    isFocused
                      ? styles.cardFocusState
                      : isPicked
                      ? styles.cardPickedState
                      : null,
                  ]}
                  {...(Platform.OS === "web"
                    ? {
                        onMouseEnter: () => setExplorerHoveredTrailId(tid),
                        onMouseLeave: () => setExplorerHoveredTrailId(null),
                      }
                    : {})}
                >
                  <View
                    style={[
                      styles.cardAccent,
                      isFocused
                        ? styles.cardAccentFocus
                        : isPicked
                        ? styles.cardAccentPicked
                        : null,
                    ]}
                  />
                  <Text style={styles.cardTitle}>{trail.name}</Text>
                  {isFocused ? (
                    <Text
                      style={[
                        styles.cardAvailability,
                        { color: theme.primary },
                      ]}
                    >
                      Cible carte active
                    </Text>
                  ) : null}
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
                              ? "0 6px 12px rgba(13, 115, 119, 0.22)"
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
                      {isPicked ? "Dans le plan" : "Hors plan"}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {trail.territory} · {trail.distance_km} km ·{" "}
                    {formatTrailElevationSummary(trail)} ·{" "}
                    {DIFFICULTY_LABELS[trail.difficulty] || trail.difficulty}
                    {" · "}
                    {TRAIL_ACTIVITY_LABELS[trail.activity || "hike"]}
                    {mine ? " · Mienne" : ""}
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
                      avg={trail.relevance_avg_score}
                      count={trail.relevance_count}
                    />
                    <Text style={styles.cardAvailability}>
                      {formatTrailSignals(trail)}
                    </Text>
                  </View>
                  <TrailAltitudeBadge trail={trail} compact />
                  {trail.notes ? (
                    <Text style={styles.cardAvailability} numberOfLines={2}>
                      {trail.notes}
                    </Text>
                  ) : null}
                  <OutlineButton
                    label="Voir sur la carte"
                    icon="location-outline"
                    stretch
                    onPress={() => actionsRef.current.centerMapOnTrail(tid)}
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
                        ? "Retirer du plan"
                        : "Ajouter au plan"
                    }
                    icon={
                      isPicked ? "remove-circle-outline" : "add-circle-outline"
                    }
                    onPress={() => toggleExplorerPickedTrail(tid)}
                  />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Aucune trace avec les filtres actuels.
              </Text>
            }
          />
        )}
        {explorerCompactFilters ? (
          <Modal
            visible={showTrailFilters}
            transparent
            animationType="slide"
            onRequestClose={() => setShowTrailFilters(false)}
          >
            <View style={styles.explorerFilterModalBackdrop}>
              <TouchableOpacity
                style={styles.explorerFilterModalDismiss}
                activeOpacity={1}
                onPress={() => setShowTrailFilters(false)}
              />
              <View style={styles.explorerFilterModalSheet}>
                <View style={styles.dateTimeGrabber} />
                <View style={styles.dateTimeSheetHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.modalSheetTitle}>Filtres des traces</Text>
                    <Text style={styles.dateTimeSheetSubtitle}>
                      Affichage, portée, difficulté et tri.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowTrailFilters(false)}
                    hitSlop={12}
                    style={styles.dateTimeCloseBtn}
                    accessibilityLabel="Fermer"
                  >
                    <Ionicons name="close" size={22} color={theme.inkMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.explorerFilterModalScroll}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {explorerTrailFiltersChildren}
                  {explorerTrailSortChildren}
                </ScrollView>
                <View style={styles.dateTimeSheetFooter}>
                  <PrimaryButton
                    compact
                    stretch
                    label="Terminé"
                    icon="checkmark-outline"
                    onPress={() => setShowTrailFilters(false)}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </Section>
      ) : null}
    </>
  );

  const activeProjectLabel = selectedRoutePlanId
    ? (Array.isArray(routePlans) ? routePlans : []).find(
        (p) => Number(p.id) === Number(selectedRoutePlanId)
      )?.name || `Projet #${selectedRoutePlanId}`
    : "Curiosité";

  const openMobileProjectPicker = () => {
    setDiscoverProjectPickerOpen(true);
  };

  const mobileProjectPickerModal = canBook ? (
    <Modal
      visible={discoverProjectPickerOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setDiscoverProjectPickerOpen(false)}
    >
      <View style={styles.discoverMobilePickerBackdrop}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setDiscoverProjectPickerOpen(false)}
        />
        <View style={styles.discoverMobilePickerSheet}>
          <View style={styles.discoverMobilePickerGrabber} />
          <Text style={styles.discoverMobilePickerTitle}>
            Choisir un projet
          </Text>
          <Text style={styles.discoverMobilePickerRowMeta}>
            Un clic pour activer
          </Text>
          <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
            <TouchableOpacity
              style={[
                styles.discoverMobilePickerRow,
                selectedRoutePlanId == null && styles.discoverProjectMenuRowOn,
              ]}
              onPress={() => selectDiscoverProject(null)}
            >
              <Text style={styles.discoverMobilePickerRowTitle}>
                Curiosité
                {selectedRoutePlanId == null ? " · actif" : ""}
              </Text>
              <Text style={styles.discoverMobilePickerRowMeta}>
                Sans projet — regarder la carte librement
              </Text>
            </TouchableOpacity>
            {(Array.isArray(routePlans) ? routePlans : []).map((plan) => {
              const pid = Number(plan.id);
              const recap = planPreviewRecap(plan);
              const active = Number(selectedRoutePlanId) === pid;
              return (
                <TouchableOpacity
                  key={`mproj-${pid}`}
                  style={[
                    styles.discoverMobilePickerRow,
                    active && styles.discoverProjectMenuRowOn,
                  ]}
                  onPress={() => selectDiscoverProject(pid)}
                >
                  <Text style={styles.discoverMobilePickerRowTitle}>
                    {recap.title}
                    {active ? " · actif" : ""}
                  </Text>
                  <Text style={styles.discoverMobilePickerRowMeta}>
                    {recap.lines.slice(0, 2).join(" · ")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={{ marginTop: 10, paddingVertical: 10 }}
            onPress={() => {
              setDiscoverProjectPickerOpen(false);
              mainTabNavigationRef.current?.navigate?.("Plans");
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontWeight: "700",
                color: theme.primary,
              }}
            >
              + Créer un projet
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  ) : null;

  const mobileBookingSheet = canBook ? (
    <DiscoverMobileBookingSheet
      visible={Boolean(selectedBox) && discoverReserveMode !== "ravito"}
      box={selectedBox}
      projectLabel={activeProjectLabel}
      bookingDate={bookingDate}
      onDateChange={setBookingDate}
      startTime={startTime}
      onStartChange={setStartTime}
      endTime={endTime}
      onEndChange={setEndTime}
      specialRequest={specialRequest}
      onSpecialRequestChange={setSpecialRequest}
      needChips={BOOKING_NEED_CHIPS}
      DateTimeSelector={DateTimeSelector}
      formatOfferLines={formatBoxOfferLines}
      slotWellFormed={explorerSlotWellFormed}
      onClose={() => {
        setSelectedBoxId(null);
        setDiscoverBookStep(1);
      }}
      onSubmit={() => confirmBookingFromExplorer(selectedBox.id)}
      onRequestRavito={() => {
        const lat = Number(selectedBox?.latitude);
        const lon = Number(selectedBox?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          openRavitoRequestAtPoint?.({ lat, lon, source: "box" });
        } else {
          openRavitoRequestAtPoint?.({ source: "map" });
        }
      }}
    />
  ) : null;

  const mobileDiscoverHud = (
    <View style={styles.discoverMobileHud} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.discoverMobileHudBtn}
        onPress={openMobileProjectPicker}
        activeOpacity={0.88}
      >
        <Ionicons name="flag-outline" size={16} color="#fff" />
        <Text style={styles.discoverMobileHudBtnText} numberOfLines={1}>
          {activeProjectLabel || "Projet"}
        </Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.discoverMobileHudGhost}
        onPress={() => setShowBoxFilters(true)}
        activeOpacity={0.88}
      >
        <Ionicons name="options-outline" size={16} color={theme.ink} />
        <Text style={styles.discoverMobileHudGhostText}>Filtres</Text>
      </TouchableOpacity>
    </View>
  );

  const mobilePeekHint =
    !selectedBox && !selectedTrail && canBook ? (
      <View style={styles.discoverMobilePeek} pointerEvents="box-none">
        {!discoverReserveMode ? (
          <>
            <Text style={styles.discoverMobilePeekText}>
              {selectedRoutePlanId
                ? "Que veux-tu réserver ?"
                : "Curiosité — ou choisis box / ravito"}
            </Text>
            <View style={styles.discoverReserveModeRow}>
              <TouchableOpacity
                style={styles.discoverReserveModeBtnLight}
                onPress={() => {
                  setDiscoverReserveMode("box");
                  setDiscoverBookStep(1);
                }}
              >
                <Text style={styles.discoverReserveModeText}>Box fixe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.discoverReserveModeBtnLight}
                onPress={() => setDiscoverReserveMode("ravito")}
              >
                <Text style={styles.discoverReserveModeText}>Ravito humain</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : discoverReserveMode === "ravito" ? (
          <>
            <Text style={styles.discoverMobilePeekText}>
              Pose un point GPS puis demande un ravito
            </Text>
            <PrimaryButton
              compact
              stretch
              label="Demander un ravito GPS"
              icon="navigate-outline"
              onPress={() => openRavitoRequestAtPoint?.({ source: "map" })}
            />
          </>
        ) : (
          <Text style={styles.discoverMobilePeekText}>
            {selectedRoutePlanId ? "1/4 · " : ""}
            Touche une box sur la carte
            {boxes.length ? ` · ${boxes.length} visibles` : ""}
          </Text>
        )}
      </View>
    ) : !selectedBox && !selectedTrail ? (
      <View style={styles.discoverMobilePeek} pointerEvents="none">
        <Text style={styles.discoverMobilePeekText}>
          Touche une box sur la carte
        </Text>
      </View>
    ) : null;


  if (webSplit) {
    if (webDesktopSplit) {
      return (
        <SafeAreaView style={styles.screen} edges={["left", "right"]}>
          <View style={styles.explorerWebSplitRow}>
            {discoverPanelOpen ? (
            <View style={styles.explorerWebPanel}>
              <ScrollView
                ref={explorerScrollRef}
                style={styles.explorerWebPanelScroll}
                contentContainerStyle={styles.explorerWebPanelContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {explorerScrollContent}
              </ScrollView>
            </View>
            ) : null}
            {selectedTrail ? (
              <View style={styles.explorerWebProfileRail}>
                <TrailProfileRail
                  trail={selectedTrail}
                  probe={
                    explorerTrailProbe &&
                    Number(explorerTrailProbe.trailId) ===
                      Number(selectedTrail.id)
                      ? explorerTrailProbe
                      : null
                  }
                  probeLocked={explorerProbeLocked}
                  onProbeChange={setExplorerTrailProbe}
                  onChartHoverActive={handleChartProbeHoverStart}
                  onChartHoverEnd={handleChartProbeHoverEnd}
                  onProbeLock={setExplorerProbeLock}
                  savedProbes={savedProbesForSelectedTrail}
                  onSaveProbe={saveExplorerProbe}
                  onRemoveSavedProbe={(id) =>
                    removeExplorerSavedProbe(id, trailTips)
                  }
                  onPublishEntryTip={publishTrailTipFromEntry}
                  onUnpublishEntryTip={unpublishTrailTipForEntry}
                  onToggleIncludeInPlan={setExplorerSavedProbeIncludeInPlan}
                  trailIsPublic={selectedTrailIsPublic}
                  onToggleTrailPublic={setSelectedTrailPublic}
                  onFocusSavedProbe={focusExplorerSavedProbe}
                  onUpdateSavedProbeNotes={updateExplorerSavedProbeNotes}
                  onClearSavedProbes={() =>
                    clearExplorerSavedProbesForTrail(selectedTrailId)
                  }
                  onExitTrailSelection={handleRequestExitExplorerTrail}
                  onSaveRoutePlan={saveExplorerRoutePlan}
                  routePlanBusy={routePlanBusy}
                  routePlanSaveName={explorerPlanSaveName}
                  onRoutePlanSaveNameChange={setExplorerPlanSaveName}
                  routePlanDraftNotes={routePlanDraftNotes}
                  onRoutePlanDraftNotesChange={setRoutePlanDraftNotes}
                  pickedBoxCount={safePickedBoxIds.length}
                  pickedBoxes={pickedBoxesForExplorer}
                  linkableBoxes={linkableBoxesForExplorer}
                  plansForTrail={plansForSelectedTrailSorted}
                  selectedPlanId={selectedRoutePlanId}
                  onSelectPlan={selectExplorerRoutePlan}
                  activePlan={activePlanForSelectedTrail}
                  onUpsertPickedBoxesToPlan={upsertPickedBoxesToActivePlan}
                  onApplyPlanToMap={(plan) =>
                    actionsRef.current.showRoutePlanOnMap?.(plan)
                  }
                  onSaveActivePlanDrafts={saveActiveRoutePlanDrafts}
                  onBookBox={startBookingFromExplorer}
                  onRequestRavito={
                    canBook && user ? requestRavitoAtProbe : undefined
                  }
                  onFocusBox={highlightExplorerBoxOnMap}
                  focusedBoxId={selectedBoxId}
                  planNameDraft={planNameDraft}
                  onPlanNameDraftChange={setPlanNameDraft}
                  planNotesDraft={planNotesDraft}
                  onPlanNotesDraftChange={setPlanNotesDraft}
                  onUpdateSavedProbeLinkedBox={updateExplorerSavedProbeLinkedBox}
                  hasActivePlan={Boolean(activePlanForSelectedTrail)}
                  isAuthed={Boolean(user)}
                  trailGeneralNotes={selectedTrail.notes || ""}
                  isTrailCreator={isTrailCreator}
                  trailTips={trailTips}
                  sharedPlans={sharedPlansForTrail}
                  sharedPlansBusy={sharedPlansBusy}
                  onRefreshCommunity={refreshTrailCommunityData}
                  onForkSharedPlan={forkExplorerRoutePlan}
                  sharedPlanPreview={sharedPlanPreview}
                  sharedPlanPreviewBusy={sharedPlanPreviewBusy}
                  onSelectSharedPlan={openSharedPlanPreview}
                  onShowSharedPlanOnMap={showSharedPlanPreviewOnMap}
                  onFocusPlanTrailNote={focusExplorerPlanTrailNote}
                  onTogglePlanTrailNoteMapVisible={togglePlanTrailNoteOnMap}
                  onDeletePlanTrailNote={removePlanTrailNote}
                  highlightedMapPointId={highlightedMapPointId}
                  onHighlightMapPoint={handleMapPointHover}
                  highlightedPlanBoxId={highlightedPlanBoxId}
                  onHighlightPlanBox={handlePlanBoxHover}
                  boxCommentDraftById={boxCommentDraftById}
                  onBoxCommentDraftChange={(boxId, text) =>
                    setBoxCommentDraftById((prev) => ({
                      ...prev,
                      [Number(boxId)]: text,
                    }))
                  }
                  onSavePlanBoxComment={saveSinglePlanBoxComment}
                  editingPlanBookingId={editingPlanBookingId}
                  planBookingDraft={planBookingDraft}
                  onPlanBookingDraftChange={setPlanBookingDraft}
                  onStartEditPlanBoxBooking={openPlanBoxBookingEditor}
                  onCancelEditPlanBoxBooking={() =>
                    setEditingPlanBookingId(null)
                  }
                  onSavePlanBoxBooking={savePlanBoxBooking}
                  onOpenReservations={openReservationsTab}
                  hostPendingBookingByBoxId={hostPendingBookingForPlanBox}
                  onHostDecideBooking={decideHostBookingFromPlan}
                  onPublishTrailTip={publishTrailTipFromProbe}
                  onDeleteTrailTip={deleteTrailTipById}
                  trailTipsForEntry={trailTips}
                  activePlanVisibility={
                    activePlanForSelectedTrail?.visibility || "private"
                  }
                  onSetPlanVisibility={setActivePlanVisibility}
                  onWorkspaceTabChange={setExplorerWorkspaceTab}
                />
              </View>
            ) : null}
            <View style={styles.explorerWebMapPane}>
              <View
                style={[
                  styles.explorerWebMapHost,
                  styles.explorerWebMapHostDesktop,
                ]}
              >
                {!discoverPanelOpen ? (
                  <View style={styles.discoverMapHud} pointerEvents="box-none">
                    <TouchableOpacity
                      style={styles.discoverMapHudBtn}
                      onPress={() => setDiscoverPanelOpen(true)}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="options-outline" size={16} color="#fff" />
                      <Text style={styles.discoverMapHudBtnText}>Panneau</Text>
                    </TouchableOpacity>
                    {canBook && selectedRoutePlanId ? (
                      <View style={styles.discoverMapHudChip}>
                        <Text
                          style={styles.discoverMapHudChipText}
                          numberOfLines={1}
                        >
                          {routePlans.find(
                            (p) => Number(p.id) === Number(selectedRoutePlanId)
                          )?.name || "Projet"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {!selectedTrail ? (
                  <Text style={styles.webMapPaneCaption}>
                    Carte — molette : zoom · glisser : déplacer
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.explorerWebMapInner,
                    styles.explorerWebMapInnerDesktop,
                    selectedTrail && styles.explorerWebMapInnerRelative,
                  ]}
                >
                  <ExplorerWebMap
                    center={webMapCenter}
                    boxes={boxesOnMap}
                    trails={trailsOnMapDisplay}
                    selectedTrailIds={mapTrailPickIds}
                    selectedTrailId={selectedTrailId}
                    hoveredTrailId={explorerHoveredTrailId}
                    onHoverTrail={setExplorerHoveredTrailId}
                    selectedBoxId={selectedBoxId}
                    spotlightBoxId={spotlightBoxId}
                    selectedBoxIds={mapPickedBoxIds}
                    planBoxIds={activePlanBoxIds}
                    compatibleBoxIds={nearTrailCompatibleBoxIds}
                    proximityTrailIds={nearTrailReferenceTrails.map((t) =>
                      Number(t.id)
                    )}
                    trailCorridorKm={Number(mapTrailProximityKm) || 2}
                    dimIncompatibleBoxes={
                      mapBoxesNearTrailsOnly && mapNearShowAllOnMap
                    }
                    onSelectBox={focusExplorerBox}
                    onSelectTrail={focusExplorerTrail}
                    onTrailProbe={setExplorerTrailProbe}
                    trailProbe={
                      selectedTrail &&
                      explorerTrailProbe &&
                      Number(explorerTrailProbe.trailId) ===
                        Number(selectedTrail.id)
                        ? explorerTrailProbe
                        : null
                    }
                    savedTrailProbes={savedProbesForMap}
                    communityTrailTips={communityTipsForMap}
                    trailMapPoints={trailMapPoints}
                    mapPointHoverEnabled={false}
                    highlightedMapPointId={highlightedMapPointId}
                    onMapPointHover={handleMapPointHover}
                    onMapPointClick={handleTrailMapPointClick}
                    highlightedPlanBoxId={highlightedPlanBoxId}
                    onPlanBoxHover={handlePlanBoxHover}
                    lockTrailProbe={explorerProbeLocked || chartProbeHover}
                    onTrailProbeLock={setExplorerProbeLock}
                    onRequestExitTrailSelection={handleRequestExitExplorerTrail}
                    onMapLongPress={handleExplorerMapLongPress}
                    onPickLocation={handleExplorerMapTap}
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
                    pickedMapPoint={lastMapTapCoords || undefined}
                    staticOrigin={API_STATIC_ORIGIN}
                    inFixedPane
                  />
                  {selectedTrail && explorerProbeLocked ? (
                    <ExplorerMapChrome
                      probe={
                        explorerTrailProbe &&
                        Number(explorerTrailProbe.trailId) ===
                          Number(selectedTrail.id)
                          ? explorerTrailProbe
                          : null
                      }
                      probeLocked={explorerProbeLocked}
                      onToggleProbeLock={(locked) => {
                        if (locked) {
                          if (
                            !explorerTrailProbe ||
                            Number(explorerTrailProbe.trailId) !==
                              Number(selectedTrail.id)
                          ) {
                            userAlert(
                              "Point sur la trace",
                              "Survole la trace ou clique dessus pour figer un point, puis utilise « Figuer » si besoin."
                            );
                            return;
                          }
                          setExplorerProbeLock(true);
                          return;
                        }
                        setExplorerProbeLock(false);
                        setExplorerTrailProbe(null);
                      }}
                      onExitTrail={handleRequestExitExplorerTrail}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    // Web mobile / tablette : carte plein écran + sheets
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <View style={styles.discoverMobileRoot}>
          <View style={styles.discoverMobileMapFill}>
            <ExplorerWebMap
              center={webMapCenter}
              boxes={boxesOnMap}
              trails={trailsOnMapDisplay}
              selectedTrailIds={mapTrailPickIds}
              selectedTrailId={selectedTrailId}
              hoveredTrailId={explorerHoveredTrailId}
              onHoverTrail={setExplorerHoveredTrailId}
              selectedBoxId={selectedBoxId}
              spotlightBoxId={spotlightBoxId}
              selectedBoxIds={mapPickedBoxIds}
              planBoxIds={activePlanBoxIds}
              compatibleBoxIds={nearTrailCompatibleBoxIds}
              proximityTrailIds={nearTrailReferenceTrails.map((t) =>
                Number(t.id)
              )}
              trailCorridorKm={Number(mapTrailProximityKm) || 2}
              dimIncompatibleBoxes={
                mapBoxesNearTrailsOnly && mapNearShowAllOnMap
              }
              onSelectBox={focusExplorerBox}
              onSelectTrail={focusExplorerTrail}
              onTrailProbe={setExplorerTrailProbe}
              trailProbe={
                selectedTrail &&
                explorerTrailProbe &&
                Number(explorerTrailProbe.trailId) === Number(selectedTrail.id)
                  ? explorerTrailProbe
                  : null
              }
              savedTrailProbes={savedProbesForMap}
              communityTrailTips={communityTipsForMap}
              trailMapPoints={trailMapPoints}
              mapPointHoverEnabled={false}
              highlightedMapPointId={highlightedMapPointId}
              onMapPointHover={handleMapPointHover}
              onMapPointClick={handleTrailMapPointClick}
              highlightedPlanBoxId={highlightedPlanBoxId}
              onPlanBoxHover={handlePlanBoxHover}
              lockTrailProbe={explorerProbeLocked || chartProbeHover}
              onTrailProbeLock={setExplorerProbeLock}
              onRequestExitTrailSelection={handleRequestExitExplorerTrail}
              onMapLongPress={handleExplorerMapLongPress}
              onPickLocation={handleExplorerMapTap}
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
              pickedMapPoint={lastMapTapCoords || undefined}
              staticOrigin={API_STATIC_ORIGIN}
              inFixedPane
            />
          </View>
          {mobileDiscoverHud}
          {mobilePeekHint}
          {mobileProjectPickerModal}
          {mobileBookingSheet}
          <ExplorerFocusSheet
            visible={Boolean(selectedTrail) && !selectedBox}
            kind="trail"
            title={selectedTrail?.name || ""}
            subtitle={
              selectedTrail
                ? `${selectedTrail.territory || ""} · ${
                    selectedTrail.distance_km || "?"
                  } km`
                : ""
            }
            metaLines={
              selectedTrail
                ? [
                    `${DIFFICULTY_LABELS[selectedTrail.difficulty] || selectedTrail.difficulty}`,
                    formatTrailElevationSummary(selectedTrail),
                  ].filter(Boolean)
                : []
            }
            picked={
              selectedTrail
                ? mapTrailPickIds.includes(Number(selectedTrail.id))
                : false
            }
            canBook={false}
            onClose={() => handleRequestExitExplorerTrail()}
            onTogglePick={
              selectedTrail
                ? () => toggleExplorerPickedTrail(Number(selectedTrail.id))
                : undefined
            }
            onSavePlan={
              selectedTrail
                ? () => {
                    setExplorerWorkspaceTab("plan");
                    saveExplorerRoutePlan();
                  }
                : undefined
            }
            onCenterMap={
              selectedTrail
                ? () => actionsRef.current.centerMapOnTrail?.(selectedTrail.id)
                : undefined
            }
          />
          {showBoxFilters ? (
            <Modal
              visible
              transparent
              animationType="slide"
              onRequestClose={() => setShowBoxFilters(false)}
            >
              <View style={styles.explorerFilterModalBackdrop}>
                <TouchableOpacity
                  style={styles.explorerFilterModalDismiss}
                  activeOpacity={1}
                  onPress={() => setShowBoxFilters(false)}
                />
                <View style={styles.explorerFilterModalSheet}>
                  <View style={styles.dateTimeSheetHeader}>
                    <Text style={styles.dateTimeSheetTitle}>Filtres box</Text>
                    <TouchableOpacity
                      onPress={() => setShowBoxFilters(false)}
                      hitSlop={12}
                      style={styles.dateTimeCloseBtn}
                    >
                      <Ionicons name="close" size={22} color={theme.inkMuted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    style={styles.explorerFilterModalScroll}
                    keyboardShouldPersistTaps="handled"
                  >
                    {explorerBoxFiltersChildren}
                    {explorerBoxSortChildren}
                  </ScrollView>
                  <View style={styles.dateTimeSheetFooter}>
                    <PrimaryButton
                      compact
                      stretch
                      label="Terminé"
                      icon="checkmark-outline"
                      onPress={() => setShowBoxFilters(false)}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // Native : carte plein écran + sheets
  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <View
        style={[styles.discoverMobileRoot, { paddingBottom: TABBAR_SCROLL_PADDING }]}
      >
        <View style={styles.discoverMobileMapFill}>
          <NativeExplorerMap
            center={webMapCenter}
            boxes={boxesOnMap}
            trails={trailsOnMap}
            selectedTrailIds={mapTrailPickIds}
            selectedTrailId={selectedTrailId}
            selectedBoxId={selectedBoxId}
            spotlightBoxId={spotlightBoxId}
            selectedBoxIds={mapPickedBoxIds}
            planBoxIds={activePlanBoxIds}
            compatibleBoxIds={nearTrailCompatibleBoxIds}
            proximityTrailIds={nearTrailReferenceTrails.map((t) =>
              Number(t.id)
            )}
            trailCorridorKm={Number(mapTrailProximityKm) || 2}
            dimIncompatibleBoxes={
              mapBoxesNearTrailsOnly && mapNearShowAllOnMap
            }
            trailMapPoints={trailMapPoints}
            onSelectBox={focusExplorerBox}
            onSelectTrail={focusExplorerTrail}
            onTrailProbe={setExplorerTrailProbe}
            onMapLongPress={handleExplorerMapLongPress}
            onPickLocation={handleExplorerMapTap}
            onVisibleBoundsChange={setMapViewportBounds}
            onPanDrag={() => actionsRef.current.markExplorerMapUserGesture?.()}
            followExternalCenter={
              mapExplorerCameraFollowSearch &&
              !(mapListSource === "viewport" && selectedBoxId == null)
            }
            recenterNonce={mapExplorerRecenterNonce}
            pickedMapPoint={lastMapTapCoords || undefined}
          />
        </View>
        {mobileDiscoverHud}
        {mobilePeekHint}
        {mobileProjectPickerModal}
        {mobileBookingSheet}
        <ExplorerFocusSheet
          visible={Boolean(selectedTrail) && !selectedBox}
          kind="trail"
          title={selectedTrail?.name || ""}
          subtitle={
            selectedTrail
              ? `${selectedTrail.territory || ""} · ${
                  selectedTrail.distance_km || "?"
                } km`
              : ""
          }
          metaLines={
            selectedTrail
              ? [
                  `${DIFFICULTY_LABELS[selectedTrail.difficulty] || selectedTrail.difficulty}`,
                  formatTrailElevationSummary(selectedTrail),
                ].filter(Boolean)
              : []
          }
          picked={
            selectedTrail
              ? mapTrailPickIds.includes(Number(selectedTrail.id))
              : false
          }
          canBook={false}
          onClose={() => handleRequestExitExplorerTrail()}
          onTogglePick={
            selectedTrail
              ? () => toggleExplorerPickedTrail(Number(selectedTrail.id))
              : undefined
          }
          onSavePlan={
            selectedTrail
              ? () => {
                  setExplorerWorkspaceTab("plan");
                  saveExplorerRoutePlan();
                }
              : undefined
          }
          onCenterMap={
            selectedTrail
              ? () => actionsRef.current.centerMapOnTrail?.(selectedTrail.id)
              : undefined
          }
        />
        {showBoxFilters ? (
          <Modal
            visible
            transparent
            animationType="slide"
            onRequestClose={() => setShowBoxFilters(false)}
          >
            <View style={styles.explorerFilterModalBackdrop}>
              <TouchableOpacity
                style={styles.explorerFilterModalDismiss}
                activeOpacity={1}
                onPress={() => setShowBoxFilters(false)}
              />
              <View style={styles.explorerFilterModalSheet}>
                <View style={styles.dateTimeSheetHeader}>
                  <Text style={styles.dateTimeSheetTitle}>Filtres box</Text>
                  <TouchableOpacity
                    onPress={() => setShowBoxFilters(false)}
                    hitSlop={12}
                    style={styles.dateTimeCloseBtn}
                  >
                    <Ionicons name="close" size={22} color={theme.inkMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.explorerFilterModalScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {explorerBoxFiltersChildren}
                  {explorerBoxSortChildren}
                </ScrollView>
                <View style={styles.dateTimeSheetFooter}>
                  <PrimaryButton
                    compact
                    stretch
                    label="Terminé"
                    icon="checkmark-outline"
                    onPress={() => setShowBoxFilters(false)}
                  />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function TrailsScreen() {
  const {
    trails,
    mapLat,
    mapLon,
    setMapLat,
    setMapLon,
    webDropHover,
    setWebDropHover,
    user,
    city,
    mapShowTrails,
    setMapShowTrails,
    mapTrailDifficultyFilter,
    setMapTrailDifficultyFilter,
    selectedTrailId,
    setSelectedTrailId,
    trailDifficulty,
    setTrailDifficulty,
    trailImportTerritory,
    setTrailImportTerritory,
    trailImportActivity,
    setTrailImportActivity,
    trailImportCriteriaTags,
    setTrailImportCriteriaTags,
    trailImportNotes,
    setTrailImportNotes,
    actionsRef,
  } = useAppMain();

  const webGpxInputRef = useRef(null);
  const [trailEditTarget, setTrailEditTarget] = useState(null);
  const [trailEditDraft, setTrailEditDraft] = useState(null);
  const [trailEditSaving, setTrailEditSaving] = useState(false);
  const [trailSearchQuery, setTrailSearchQuery] = useState("");
  const [trailActivityFilter, setTrailActivityFilter] = useState("all");
  const [trailTagFilters, setTrailTagFilters] = useState([]);
  const [trailMinElevation, setTrailMinElevation] = useState("");
  const [trailMaxElevation, setTrailMaxElevation] = useState("");
  const [trailInspirations, setTrailInspirations] = useState([]);
  const [trailInspirationsLoading, setTrailInspirationsLoading] =
    useState(false);
  // Trails tab keeps its own scope/picks; it must not drive Explorer visibility.
  const [trailsTabScope, setTrailsTabScope] = useState("all");
  const [trailsTabPickIds, setTrailsTabPickIds] = useState([]);
  const [trailsMapRecenterNonce, setTrailsMapRecenterNonce] = useState(0);
  const didInitialTrailsMapFocusRef = useRef(false);
  const [hoveredTrailId, setHoveredTrailId] = useState(null);
  const [trailsTrailProbe, setTrailsTrailProbe] = useState(null);
  const mapTrailsScope = trailsTabScope;
  const setMapTrailsScope = setTrailsTabScope;
  const mapTrailPickIds = trailsTabPickIds;
  const setMapTrailPickIds = setTrailsTabPickIds;

  useEffect(() => {
    actionsRef.current.loadTrails();
  }, [actionsRef]);

  useEffect(() => {
    let cancelled = false;
    setTrailInspirationsLoading(true);
    const cityQ =
      city && String(city).trim().length >= 2
        ? `&city=${encodeURIComponent(String(city).trim())}`
        : "";
    apiFetch(`/community/trail-box-inspirations?limit=28${cityQ}`)
      .then((data) => {
        if (!cancelled) setTrailInspirations(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTrailInspirations([]);
      })
      .finally(() => {
        if (!cancelled) setTrailInspirationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city]);

  const myTrails = useMemo(() => {
    if (user?.id == null) return [];
    const uid = Number(user.id);
    return trails.filter((t) => Number(t.creator_user_id) === uid);
  }, [trails, user?.id]);

  const tracesFiltered = useMemo(() => {
    const uid = user?.id != null ? Number(user.id) : null;
    let list = trails;
    if (mapTrailsScope === "following" && followingUserIdSet.size > 0) {
      list = list.filter((t) =>
        followingUserIdSet.has(Number(t.creator_user_id))
      );
    } else if (mapTrailsScope === "mine" && uid != null) {
      list = list.filter((t) => Number(t.creator_user_id) === uid);
    } else if (mapTrailsScope === "others" && uid != null) {
      list = list.filter((t) => Number(t.creator_user_id) !== uid);
    } else if (mapTrailsScope === "picked") {
      const set = new Set(
        (mapTrailPickIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );
      if (set.size > 0) {
        list = list.filter((t) => set.has(Number(t.id)));
      }
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
    followingUserIdSet,
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
  const advancedTracesFiltered = useMemo(() => {
    const q = trailSearchQuery.trim().toLowerCase();
    const minElev = Number.parseInt(trailMinElevation, 10);
    const maxElev = Number.parseInt(trailMaxElevation, 10);
    return tracesFiltered.filter((t) => {
      if (trailActivityFilter !== "all") {
        if ((t.activity || "hike") !== trailActivityFilter) return false;
      }
      if (trailTagFilters.length > 0) {
        const tags = parseTrailCriteriaFromRow(t);
        if (!trailTagFilters.every((tag) => tags.includes(tag))) return false;
      }
      const elev = Number(t.elevation_m || 0);
      if (Number.isFinite(minElev) && elev < minElev) return false;
      if (Number.isFinite(maxElev) && elev > maxElev) return false;
      if (!q) return true;
      const hay = [
        t.name,
        t.territory,
        TRAIL_ACTIVITY_LABELS[t.activity || "hike"],
        ...parseTrailCriteriaFromRow(t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    tracesFiltered,
    trailSearchQuery,
    trailActivityFilter,
    trailTagFilters,
    trailMinElevation,
    trailMaxElevation,
  ]);

  const advancedFilterCount =
    (trailSearchQuery.trim() ? 1 : 0) +
    (trailActivityFilter !== "all" ? 1 : 0) +
    trailTagFilters.length +
    (trailMinElevation.trim() ? 1 : 0) +
    (trailMaxElevation.trim() ? 1 : 0);

  const prioritizedTracesFiltered = useMemo(() => {
    if (selectedTrailId == null) return advancedTracesFiltered;
    const sid = Number(selectedTrailId);
    const list = Array.isArray(advancedTracesFiltered)
      ? [...advancedTracesFiltered]
      : [];
    list.sort((a, b) => {
      const aSel = Number(a.id) === sid ? 1 : 0;
      const bSel = Number(b.id) === sid ? 1 : 0;
      return bSel - aSel;
    });
    return list;
  }, [advancedTracesFiltered, selectedTrailId]);

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

  const openTrailEditor = useCallback((trail) => {
    if (!trail) return;
    setTrailEditTarget(trail);
    setTrailEditDraft({
      name: String(trail.name || ""),
      territory: String(trail.territory || ""),
      difficulty: trail.difficulty || "medium",
      activity: trail.activity || "hike",
      criteriaTags: parseTrailCriteriaFromRow(trail),
      notes: trail.notes ? String(trail.notes) : "",
    });
  }, []);

  const trailsSelectionLock = mapTrailPickIds.length > 0;
  const centerCoordsForTrail = useCallback((trail) => {
    if (!trail) return null;
    let positions = [];
    try {
      if (trail.polyline_json) positions = JSON.parse(trail.polyline_json);
    } catch {
      positions = [];
    }
    if (!Array.isArray(positions) || positions.length === 0) return null;
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    for (const pt of positions) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lat = Number(pt[0]);
      const lng = Number(pt[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        sumLat += lat;
        sumLng += lng;
        n += 1;
      }
    }
    if (n === 0) return null;
    return { lat: sumLat / n, lng: sumLng / n };
  }, []);

  const focusTrailOnTrailsMap = useCallback(
    (trailId, { addToPicked = false } = {}) => {
      const tid = Number(trailId);
      if (!Number.isFinite(tid)) return;
      const trail = trails.find((t) => Number(t.id) === tid);
      if (!trail) return;
      setSelectedTrailId(tid);
      if (addToPicked) {
        setMapTrailPickIds((prev) =>
          prev.includes(tid) ? prev : [...prev, tid]
        );
      }
      const c = centerCoordsForTrail(trail);
      if (!c) {
        userAlert("Trace", "Cette trace n'a pas de géométrie GPS exploitable.");
        return;
      }
      setMapShowTrails(true);
      setMapLat(c.lat.toFixed(5));
      setMapLon(c.lng.toFixed(5));
      setTrailsMapRecenterNonce((n) => n + 1);
    },
    [trails, centerCoordsForTrail, setMapTrailPickIds, setMapShowTrails]
  );

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
      togglePickedTrail(tid);
    },
    [
      trailsMapList,
      mapTrailPickIds,
      trailsSelectionLock,
      setSelectedTrailId,
      togglePickedTrail,
    ]
  );

  useEffect(() => {
    if (didInitialTrailsMapFocusRef.current) return;
    if (
      !Array.isArray(prioritizedTracesFiltered) ||
      prioritizedTracesFiltered.length === 0
    )
      return;
    const first = prioritizedTracesFiltered[0];
    if (!first) return;
    didInitialTrailsMapFocusRef.current = true;
    focusTrailOnTrailsMap(first.id);
  }, [prioritizedTracesFiltered, focusTrailOnTrailsMap]);

  useEffect(() => {
    if (
      !Array.isArray(prioritizedTracesFiltered) ||
      prioritizedTracesFiltered.length === 0
    )
      return;
    const sid = Number(selectedTrailId);
    const exists = Number.isFinite(sid)
      ? prioritizedTracesFiltered.some((t) => Number(t.id) === sid)
      : false;
    if (!exists) {
      focusTrailOnTrailsMap(prioritizedTracesFiltered[0].id);
    }
  }, [prioritizedTracesFiltered, selectedTrailId, focusTrailOnTrailsMap]);

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
          title="Inspirations ravito × traces"
          subtitle="Recommandations d’hôtes : traces où un box fait sens (esprit ultra, étapes clés)."
          icon="sparkles-outline"
        >
          {trailInspirationsLoading ? (
            <ActivityIndicator
              color={theme.primary}
              style={{ marginVertical: 12 }}
            />
          ) : null}
          {!trailInspirationsLoading && trailInspirations.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune suggestion pour l’instant. Les hôtes épinglent des traces
              depuis « Mes box » en modifiant une box publiée.
            </Text>
          ) : null}
          {trailInspirations.map((row) => {
            const tr = row.trail || {};
            const bx = row.box || {};
            const pin = row.pin || {};
            const hl = Number(pin.is_highlight) === 1;
            return (
              <View
                key={`insp-${pin.id}-${tr.id}-${bx.id}`}
                style={styles.card}
              >
                <View style={styles.cardAccent} />
                {hl ? (
                  <Text
                    style={[
                      styles.cardMeta,
                      {
                        fontWeight: "700",
                        color: theme.primary,
                        marginBottom: 4,
                      },
                    ]}
                  >
                    ★ Coup de cœur hôte
                  </Text>
                ) : null}
                <Text style={styles.cardTitle}>{tr.name || "Trace"}</Text>
                <Text style={styles.cardMeta}>
                  {tr.territory || "—"} ·{" "}
                  {Number(tr.distance_km || 0).toFixed(1)} km ·{" "}
                  {formatTrailElevationSummary(tr)} ·{" "}
                  {DIFFICULTY_LABELS[tr.difficulty] || tr.difficulty} ·{" "}
                  {TRAIL_ACTIVITY_LABELS[tr.activity || "hike"] || ""}
                </Text>
                <TrailAltitudeBadge trail={tr} compact />
                <Text style={styles.cardDetailLine}>
                  Box « {bx.title || "?"} » · {bx.city || "—"} ·{" "}
                  {(Number(bx.price_cents || 0) / 100).toFixed(2)} € ·{" "}
                  {Number(bx.capacity_liters || 0)} L
                  {Number(bx.has_water) === 1 ? " · eau" : ""}
                </Text>
                {row.host_full_name ? (
                  <Text style={styles.cardMeta}>
                    Hôte : {row.host_full_name}
                  </Text>
                ) : null}
                {pin.host_note ? (
                  <Text style={styles.cardAvailability}>{pin.host_note}</Text>
                ) : null}
              </View>
            );
          })}
        </Section>
        <Section
          title="Prochain import GPX"
          subtitle="Ces réglages s’appliquent au prochain fichier envoyé (web ou appli). Tu peux les modifier à tout moment."
          icon="create-outline"
        >
          <Text style={styles.fieldLabel}>Territoire (libellé)</Text>
          <TextInput
            style={styles.input}
            value={trailImportTerritory}
            onChangeText={setTrailImportTerritory}
            placeholder="Ex. Annecy, Bauges, Chamonix..."
            placeholderTextColor={theme.inkMuted}
            maxLength={120}
          />
          <Text style={styles.helperText}>
            Tu peux saisir n’importe quelle ville/zone, indépendante de l’onglet
            Carte.
          </Text>
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            Difficulté ressentie
          </Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {["easy", "medium", "hard"].map((d) => (
              <TouchableOpacity
                key={`imp-trail-diff-${d}`}
                style={[
                  styles.roleChip,
                  trailDifficulty === d && styles.roleChipActive,
                ]}
                onPress={() => setTrailDifficulty(d)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailDifficulty === d && styles.roleChipTextActive,
                  ]}
                >
                  {DIFFICULTY_LABELS[d]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            Activité principale
          </Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {TRAIL_ACTIVITY_IDS.map((id) => (
              <TouchableOpacity
                key={`imp-trail-act-${id}`}
                style={[
                  styles.roleChip,
                  trailImportActivity === id && styles.roleChipActive,
                ]}
                onPress={() => setTrailImportActivity(id)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailImportActivity === id && styles.roleChipTextActive,
                  ]}
                >
                  {TRAIL_ACTIVITY_LABELS[id] || id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            Critères (optionnel, max 20)
          </Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {TRAIL_CRITERIA_OPTIONS.map((label) => {
              const active = (trailImportCriteriaTags || []).includes(label);
              return (
                <TouchableOpacity
                  key={`imp-trail-crit-${label}`}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                  onPress={() =>
                    setTrailImportCriteriaTags((prev) => {
                      const p = Array.isArray(prev) ? prev : [];
                      return p.includes(label)
                        ? p.filter((c) => c !== label)
                        : p.length >= 20
                        ? p
                        : [...p, label];
                    })
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
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            Description / infos (optionnel)
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            value={trailImportNotes}
            onChangeText={setTrailImportNotes}
            placeholder="Ex. : boue en hiver, passage raide au km 3, eau au refuge…"
            placeholderTextColor={theme.inkMuted}
            maxLength={4000}
          />
        </Section>

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
                    {
                      id: "following",
                      label: `Abonnements${
                        followingUserIdSet.size > 0
                          ? ` (${followingUserIdSet.size})`
                          : ""
                      }`,
                    },
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
                const isActive = Number(selectedTrailId) === tid;
                return (
                  <TouchableOpacity
                    key={`trace-pick-${trail.id}`}
                    style={[
                      styles.card,
                      isActive
                        ? { borderWidth: 2, borderColor: theme.primary }
                        : null,
                    ]}
                    onPress={() => {
                      setSelectedTrailId(tid);
                      togglePickedTrail(tid);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardAccent} />
                    <Text style={styles.cardTitle}>{trail.name}</Text>
                    <Text style={styles.cardMeta}>
                      {trail.territory} · {trail.distance_km} km ·{" "}
                      {formatTrailElevationSummary(trail)}
                    </Text>
                    <TrailAltitudeBadge trail={trail} compact />
                    <Text style={styles.cardAvailability}>
                      {formatTrailSignals(trail)}
                    </Text>
                    <Text style={styles.cardAvailability}>
                      {isPicked ? "Sélectionnée" : "Non sélectionnée"}
                      {isActive ? " · Active" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </Section>

        <Section
          title="Carte des traces"
          subtitle="Sélection claire sans casser le zoom/pan."
          icon="map-outline"
        >
          <Text style={styles.cardMeta}>
            Trace active :{" "}
            {selectedTrailId != null
              ? trails.find((t) => Number(t.id) === Number(selectedTrailId))
                  ?.name || `#${selectedTrailId}`
              : "Aucune"}{" "}
            · Traces sélectionnées : {mapTrailPickIds.length}
          </Text>
          <Text style={styles.helperText}>
            Astuce : depuis la liste, utilise « Voir et zoomer sur carte » pour
            sauter directement sur une trace.
          </Text>
          {selectedTrailId != null ? (
            <TrailElevationProfile
              trail={
                trails.find((t) => Number(t.id) === Number(selectedTrailId)) ||
                null
              }
              probe={
                trailsTrailProbe &&
                Number(trailsTrailProbe.trailId) === Number(selectedTrailId)
                  ? trailsTrailProbe
                  : null
              }
            />
          ) : null}
          {selectedTrailId != null && !trailsTrailProbe ? (
            <Text style={styles.helperText}>
              {Platform.OS === "web"
                ? "Survole le tracé sur la carte : le profil se met à jour au curseur."
                : "Tape près du tracé sur la carte pour positionner le curseur sur le profil."}
            </Text>
          ) : null}
          {Platform.OS === "web" ? (
            <ExplorerWebMap
              center={[
                parseFloat(mapLat) || 45.8992,
                parseFloat(mapLon) || 6.1294,
              ]}
              boxes={[]}
              trails={trailsMapList}
              selectedTrailIds={mapTrailPickIds}
              selectedTrailId={selectedTrailId}
              hoveredTrailId={hoveredTrailId}
              selectedBoxId={null}
              onSelectBox={() => {}}
              onSelectTrail={(id) => {
                const tid = Number(id);
                if (!Number.isFinite(tid)) return;
                setSelectedTrailId(tid);
                setTrailsTrailProbe(null);
              }}
              onTrailProbe={setTrailsTrailProbe}
              onHoverTrail={(id) => setHoveredTrailId(id)}
              onMapLongPress={handleTrailsMapLongPress}
              followExternalCenter={false}
              autoFitToData={false}
              recenterNonce={trailsMapRecenterNonce}
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
              selectedTrailId={selectedTrailId}
              selectedBoxId={null}
              onSelectBox={() => {}}
              onSelectTrail={(id) => {
                const tid = Number(id);
                if (!Number.isFinite(tid)) return;
                setSelectedTrailId(tid);
                setTrailsTrailProbe(null);
              }}
              onTrailProbe={setTrailsTrailProbe}
              onMapLongPress={handleTrailsMapLongPress}
              followExternalCenter={false}
              recenterNonce={trailsMapRecenterNonce}
            />
          )}
        </Section>

        <Section
          title="Recherche avancée"
          subtitle="Filtre par texte, activité, tags et dénivelé."
          icon="search-outline"
        >
          <Text style={styles.cardMeta}>
            {advancedTracesFiltered.length} résultat
            {advancedTracesFiltered.length > 1 ? "s" : ""} ·{" "}
            {advancedFilterCount} filtre
            {advancedFilterCount > 1 ? "s actifs" : " actif"}
          </Text>
          <TextInput
            style={styles.input}
            value={trailSearchQuery}
            onChangeText={setTrailSearchQuery}
            placeholder="Nom, territoire, activité, critère..."
            placeholderTextColor={theme.inkMuted}
          />
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Activité</Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {[
              { id: "all", label: "Toutes" },
              ...TRAIL_ACTIVITY_IDS.map((id) => ({
                id,
                label: TRAIL_ACTIVITY_LABELS[id] || id,
              })),
            ].map((opt) => (
              <TouchableOpacity
                key={`trail-adv-act-${opt.id}`}
                style={[
                  styles.roleChip,
                  trailActivityFilter === opt.id && styles.roleChipActive,
                ]}
                onPress={() => setTrailActivityFilter(opt.id)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailActivityFilter === opt.id && styles.roleChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
            Critères (multi-sélection)
          </Text>
          <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
            {TRAIL_CRITERIA_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={`trail-adv-tag-${opt}`}
                style={[
                  styles.roleChip,
                  trailTagFilters.includes(opt) && styles.roleChipActive,
                ]}
                onPress={() =>
                  setTrailTagFilters((prev) =>
                    prev.includes(opt)
                      ? prev.filter((x) => x !== opt)
                      : [...prev, opt]
                  )
                }
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailTagFilters.includes(opt) && styles.roleChipTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {trailTagFilters.length > 0 ? (
            <Text style={styles.helperText}>
              Critères sélectionnés: {trailTagFilters.join(" · ")}
            </Text>
          ) : null}
          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.fieldLabel}>D+ min</Text>
              <TextInput
                style={styles.input}
                value={trailMinElevation}
                onChangeText={setTrailMinElevation}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor={theme.inkMuted}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.fieldLabel}>D+ max</Text>
              <TextInput
                style={styles.input}
                value={trailMaxElevation}
                onChangeText={setTrailMaxElevation}
                placeholder="2000"
                keyboardType="numeric"
                placeholderTextColor={theme.inkMuted}
              />
            </View>
          </View>
          <OutlineButton
            compact
            stretch
            label="Réinitialiser les filtres avancés"
            icon="refresh-outline"
            onPress={() => {
              setTrailSearchQuery("");
              setTrailActivityFilter("all");
              setTrailTagFilters([]);
              setTrailMinElevation("");
              setTrailMaxElevation("");
            }}
          />
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
            const trailCrits = parseTrailCriteriaFromRow(trail);
            return (
              <SwipeActionRow
                key={`trail-list-${trail.id}`}
                onEdit={isMine ? () => openTrailEditor(trail) : undefined}
                editLabel="Modifier"
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
                      : Number(hoveredTrailId) === tid
                      ? { borderColor: "#334155", borderWidth: 1.5 }
                      : null,
                  ]}
                  onMouseEnter={
                    Platform.OS === "web"
                      ? () => setHoveredTrailId(tid)
                      : undefined
                  }
                  onMouseLeave={
                    Platform.OS === "web"
                      ? () =>
                          setHoveredTrailId((prev) =>
                            Number(prev) === tid ? null : prev
                          )
                      : undefined
                  }
                >
                  <View style={styles.cardAccent} />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={[styles.cardTitle, { flex: 1 }]}>
                      {trail.name}
                    </Text>
                    <TouchableOpacity
                      style={[styles.roleChip, styles.roleChipActive]}
                      onPress={() =>
                        focusTrailOnTrailsMap(tid, {
                          addToPicked: mapTrailsScope === "picked",
                        })
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[styles.roleChipText, styles.roleChipTextActive]}
                      >
                        Zoom direct
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                      {Number(hoveredTrailId) === tid ? " · Survol" : ""}
                    </Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {trail.territory} · {trail.distance_km} km ·{" "}
                    {formatTrailElevationSummary(trail)}
                    {isMine ? " · Mienne" : ""}
                  </Text>
                  <TrailAltitudeBadge trail={trail} compact />
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
                  <Text style={[styles.cardMeta, { marginTop: 6 }]}>
                    {TRAIL_ACTIVITY_LABELS[trail.activity || "hike"]}
                    {trailCrits.length ? ` · ${trailCrits.join(" · ")}` : ""}
                  </Text>
                  {trail.notes ? (
                    <Text
                      style={[styles.cardAvailability, { marginTop: 6 }]}
                      numberOfLines={4}
                    >
                      {String(trail.notes)}
                    </Text>
                  ) : null}
                  {isMine ? (
                    <>
                      <OutlineButton
                        stretch
                        label="Modifier nom, lieu, critères…"
                        icon="create-outline"
                        onPress={() => openTrailEditor(trail)}
                      />
                      <OutlineButton
                        stretch
                        label="Remplacer le GPX (garde le plan lié)"
                        icon="swap-horizontal-outline"
                        onPress={() =>
                          actionsRef.current.replaceTrailGpx?.(trail.id)
                        }
                      />
                    </>
                  ) : null}
                  <PrimaryButton
                    compact
                    stretch
                    label="Voir et zoomer sur carte"
                    icon="locate-outline"
                    onPress={() =>
                      focusTrailOnTrailsMap(tid, {
                        addToPicked: mapTrailsScope === "picked",
                      })
                    }
                  />
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
          {advancedTracesFiltered.length === 0 ? (
            <>
              <Text style={styles.emptyText}>
                Aucune trace avec les filtres actuels.
              </Text>
              <SecondaryButton
                label="Importer un GPX maintenant"
                icon="cloud-upload-outline"
                onPress={() =>
                  Platform.OS === "web"
                    ? webGpxInputRef.current?.click?.()
                    : actionsRef.current.uploadGpx()
                }
              />
            </>
          ) : null}
        </Section>
      </ScrollView>

      <Modal
        visible={trailEditTarget != null && trailEditDraft != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (trailEditSaving) return;
          setTrailEditTarget(null);
          setTrailEditDraft(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              Platform.OS === "web" ? { maxHeight: "92%" } : { maxHeight: 560 },
            ]}
          >
            <View style={styles.modalSheetHeader}>
              <Text style={styles.modalSheetTitle}>Modifier la trace</Text>
              <TouchableOpacity
                onPress={() => {
                  if (trailEditSaving) return;
                  setTrailEditTarget(null);
                  setTrailEditDraft(null);
                }}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color={theme.ink} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.modalSheetBody}
            >
              <Text style={styles.inputLabel}>Nom</Text>
              <TextInput
                style={styles.input}
                value={trailEditDraft?.name ?? ""}
                onChangeText={(t) =>
                  setTrailEditDraft((d) => (d ? { ...d, name: t } : d))
                }
                placeholder="Nom de la trace"
                placeholderTextColor={theme.inkMuted}
              />
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>
                Territoire (ville, massif…)
              </Text>
              <TextInput
                style={styles.input}
                value={trailEditDraft?.territory ?? ""}
                onChangeText={(t) =>
                  setTrailEditDraft((d) => (d ? { ...d, territory: t } : d))
                }
                placeholder="Ex. Annecy, Bauges…"
                placeholderTextColor={theme.inkMuted}
              />
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                Difficulté
              </Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                {["easy", "medium", "hard"].map((d) => (
                  <TouchableOpacity
                    key={`ed-trail-diff-${d}`}
                    style={[
                      styles.roleChip,
                      trailEditDraft?.difficulty === d && styles.roleChipActive,
                    ]}
                    onPress={() =>
                      setTrailEditDraft((prev) =>
                        prev ? { ...prev, difficulty: d } : prev
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        trailEditDraft?.difficulty === d &&
                          styles.roleChipTextActive,
                      ]}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                Activité
              </Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                {TRAIL_ACTIVITY_IDS.map((id) => (
                  <TouchableOpacity
                    key={`ed-trail-act-${id}`}
                    style={[
                      styles.roleChip,
                      trailEditDraft?.activity === id && styles.roleChipActive,
                    ]}
                    onPress={() =>
                      setTrailEditDraft((prev) =>
                        prev ? { ...prev, activity: id } : prev
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.roleChipText,
                        trailEditDraft?.activity === id &&
                          styles.roleChipTextActive,
                      ]}
                    >
                      {TRAIL_ACTIVITY_LABELS[id] || id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                Critères
              </Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                {TRAIL_CRITERIA_OPTIONS.map((label) => {
                  const active =
                    trailEditDraft?.criteriaTags?.includes(label) ?? false;
                  return (
                    <TouchableOpacity
                      key={`ed-trail-crit-${label}`}
                      style={[styles.roleChip, active && styles.roleChipActive]}
                      onPress={() =>
                        setTrailEditDraft((prev) => {
                          if (!prev) return prev;
                          const cur = prev.criteriaTags || [];
                          const next = cur.includes(label)
                            ? cur.filter((c) => c !== label)
                            : cur.length >= 20
                            ? cur
                            : [...cur, label];
                          return { ...prev, criteriaTags: next };
                        })
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
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                Description / infos
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                multiline
                value={trailEditDraft?.notes ?? ""}
                onChangeText={(t) =>
                  setTrailEditDraft((d) => (d ? { ...d, notes: t } : d))
                }
                placeholder="Détails utiles pour toi ou les autres…"
                placeholderTextColor={theme.inkMuted}
                maxLength={4000}
              />
            </ScrollView>
            <View style={styles.modalSheetFooter}>
              <OutlineButton
                compact
                label="Annuler"
                icon="close-circle-outline"
                disabled={trailEditSaving}
                onPress={() => {
                  if (trailEditSaving) return;
                  setTrailEditTarget(null);
                  setTrailEditDraft(null);
                }}
              />
              <PrimaryButton
                compact
                label="Enregistrer"
                icon="checkmark-outline"
                loading={trailEditSaving}
                disabled={trailEditSaving}
                onPress={async () => {
                  if (!trailEditTarget || !trailEditDraft || trailEditSaving)
                    return;
                  const nm = trailEditDraft.name.trim();
                  const terr = trailEditDraft.territory.trim();
                  if (nm.length < 2) {
                    userAlert("Nom", "Indique au moins 2 caractères.");
                    return;
                  }
                  if (terr.length < 2) {
                    userAlert("Territoire", "Indique au moins 2 caractères.");
                    return;
                  }
                  setTrailEditSaving(true);
                  const ok = await actionsRef.current.updateTrail(
                    trailEditTarget.id,
                    {
                      name: nm,
                      territory: terr,
                      difficulty: trailEditDraft.difficulty,
                      activity: trailEditDraft.activity,
                      criteriaTags: trailEditDraft.criteriaTags || [],
                      notes: trailEditDraft.notes.trim(),
                    }
                  );
                  setTrailEditSaving(false);
                  if (ok) {
                    setTrailEditTarget(null);
                    setTrailEditDraft(null);
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
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
    hostBoxTrailPins,
    hostRefunds,
    trails,
    authToken,
    ravitoRequestsRefreshNonce,
    canHost,
    canRavito,
    capabilities,
    simpleUi,
    actionsRef,
  } = useAppMain();
  const canHostLocal = canHost;
  const isFocused = useIsFocused();
  const scrollRef = useRef(null);
  const hostLat = Number(hostForm.latitude) || 45.8992;
  const hostLon = Number(hostForm.longitude) || 6.1294;
  const [hostMapSelectedBoxId, setHostMapSelectedBoxId] = useState(null);
  const [hostMapShowBoxes, setHostMapShowBoxes] = useState(true);
  const [hostMapSelectionMode, setHostMapSelectionMode] = useState("all");
  const [hostPickedBoxIds, setHostPickedBoxIds] = useState([]);
  const [hostLocationMode, setHostLocationMode] = useState("map");
  const [hostCityLookupLoading, setHostCityLookupLoading] = useState(false);
  const [hostPinModalOpen, setHostPinModalOpen] = useState(false);
  const [hostPinSearch, setHostPinSearch] = useState("");
  const [hostPinSelectedTrailId, setHostPinSelectedTrailId] = useState(null);
  const [hostPinNote, setHostPinNote] = useState("");
  const [hostPinHighlight, setHostPinHighlight] = useState(false);

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

  const pinnedTrailIds = useMemo(
    () =>
      new Set(
        (hostBoxTrailPins || [])
          .map((p) => Number(p.trail_id))
          .filter(Number.isFinite)
      ),
    [hostBoxTrailPins]
  );

  const hostPinTrailCandidates = useMemo(() => {
    const q = hostPinSearch.trim().toLowerCase();
    const list = Array.isArray(trails) ? [...trails] : [];
    list.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "fr")
    );
    return list.filter((t) => {
      if (pinnedTrailIds.has(Number(t.id))) return false;
      if (!q) return true;
      const hay = [
        t.name,
        t.territory,
        TRAIL_ACTIVITY_LABELS[t.activity || "hike"],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [trails, hostPinSearch, pinnedTrailIds]);

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
    actionsRef.current.loadTrails?.();
    return undefined;
  }, [canHostLocal, isFocused, actionsRef]);

  useEffect(() => {
    if (!hostPinModalOpen) {
      setHostPinSearch("");
      setHostPinSelectedTrailId(null);
      setHostPinNote("");
      setHostPinHighlight(false);
    }
  }, [hostPinModalOpen]);

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

  const applyHostCitySearch = useCallback(async () => {
    const q = String(hostForm.city || "").trim();
    if (q.length < 2) {
      userAlert("Ville", "Indique un nom de ville avant la recherche.");
      return;
    }
    setHostCityLookupLoading(true);
    try {
      const coords = await geocodeCityToLatLon(q);
      if (!coords) {
        userAlert("Ville", "Ville introuvable. Essaie un nom plus précis.");
        return;
      }
      actionsRef.current.setHostLocationFromMap(coords.lat, coords.lon);
      setHostReverseGeocode({ status: "idle", message: "" });
      userAlert(
        "Ville trouvée",
        `Position appliquée: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`
      );
    } finally {
      setHostCityLookupLoading(false);
    }
  }, [hostForm.city, actionsRef, setHostReverseGeocode]);

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
        <View style={styles.hostHeroBanner}>
          <Text style={styles.hostHeroTitle}>Espace hôte</Text>
          <Text style={styles.hostHeroText}>
            {simpleUi
              ? "Publie une box, suis les demandes, prépare le ravito."
              : "Gère tes box, disponibilités et accueils sportifs."}
          </Text>
        </View>
        <Section
          title={simpleUi ? "Ma box" : "Publier un box"}
          subtitle={
            simpleUi
              ? "Titre, lieu, eau / nourriture — puis publie."
              : "Accueille des sportifs et propose ton point ravito."
          }
          icon="storefront-outline"
        >
          {!canHostLocal ? (
            <View style={styles.infoBanner}>
              <Ionicons
                name="home-outline"
                size={22}
                color={theme.primary}
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoBannerTitle}>Active la casquette Hôte</Text>
                <Text style={styles.infoBannerText}>
                  Dans Compte → Mes activités, coche « Hôte » pour publier une
                  box. Tu peux aussi être ravitailleur sans box.
                </Text>
                <PrimaryButton
                  compact
                  label="Activer Hôte"
                  icon="checkmark-outline"
                  onPress={() =>
                    actionsRef.current.updateCapabilities?.({
                      ...capabilities,
                      host: true,
                    })
                  }
                />
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
              <Text style={styles.helperText}>
                Règles (optionnel) : heures calmes, jours fermés, dates
                bloquées. Le texte ci-dessus reste libre pour les sportifs.
              </Text>
              <View
                style={[styles.roleRow, { flexWrap: "wrap", marginTop: 6 }]}
              >
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    !hostForm.availabilitySchedule?.quietHoursEnabled &&
                      styles.roleChipActive,
                  ]}
                  onPress={() =>
                    setHostForm((s) => ({
                      ...s,
                      availabilitySchedule: {
                        ...(s.availabilitySchedule ||
                          cloneDefaultAvailabilitySchedule()),
                        quietHoursEnabled: false,
                      },
                    }))
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      !hostForm.availabilitySchedule?.quietHoursEnabled &&
                        styles.roleChipTextActive,
                    ]}
                  >
                    Pas d’heures calmes
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    hostForm.availabilitySchedule?.quietHoursEnabled &&
                      styles.roleChipActive,
                  ]}
                  onPress={() =>
                    setHostForm((s) => ({
                      ...s,
                      availabilitySchedule: {
                        ...(s.availabilitySchedule ||
                          cloneDefaultAvailabilitySchedule()),
                        quietHoursEnabled: true,
                      },
                    }))
                  }
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      hostForm.availabilitySchedule?.quietHoursEnabled &&
                        styles.roleChipTextActive,
                    ]}
                  >
                    Heures calmes
                  </Text>
                </TouchableOpacity>
              </View>
              {hostForm.availabilitySchedule?.quietHoursEnabled ? (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginBottom: 8,
                    marginTop: 4,
                  }}
                >
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Début (HH:MM)"
                    placeholderTextColor={theme.inkMuted}
                    value={hostForm.availabilitySchedule?.quietStart || "00:00"}
                    onChangeText={(v) =>
                      setHostForm((s) => ({
                        ...s,
                        availabilitySchedule: {
                          ...(s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule()),
                          quietStart: v,
                        },
                      }))
                    }
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Fin (HH:MM)"
                    placeholderTextColor={theme.inkMuted}
                    value={hostForm.availabilitySchedule?.quietEnd || "06:00"}
                    onChangeText={(v) =>
                      setHostForm((s) => ({
                        ...s,
                        availabilitySchedule: {
                          ...(s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule()),
                          quietEnd: v,
                        },
                      }))
                    }
                  />
                </View>
              ) : null}
              <Text style={styles.inputLabel}>Jours fermés (0 = dim.)</Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                {HOST_AVAIL_WEEKDAY_LABELS.map((label, wd) => {
                  const on = (
                    hostForm.availabilitySchedule?.closedWeekdays || []
                  ).includes(wd);
                  return (
                    <TouchableOpacity
                      key={`host-wd-${wd}`}
                      style={[styles.roleChip, on && styles.roleChipActive]}
                      onPress={() =>
                        setHostForm((s) => {
                          const base =
                            s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule();
                          const arr = [...base.closedWeekdays];
                          const i = arr.indexOf(wd);
                          if (i >= 0) arr.splice(i, 1);
                          else arr.push(wd);
                          arr.sort((a, b) => a - b);
                          return {
                            ...s,
                            availabilitySchedule: {
                              ...base,
                              closedWeekdays: arr,
                            },
                          };
                        })
                      }
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          on && styles.roleChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 6,
                }}
              >
                <Text style={styles.inputLabel}>
                  Fermetures par dates (max 6)
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setHostForm((s) => {
                      const base =
                        s.availabilitySchedule ||
                        cloneDefaultAvailabilitySchedule();
                      if (base.blockedRanges.length >= 6) return s;
                      return {
                        ...s,
                        availabilitySchedule: {
                          ...base,
                          blockedRanges: [
                            ...base.blockedRanges,
                            { start: "", end: "" },
                          ],
                        },
                      };
                    })
                  }
                  activeOpacity={0.85}
                >
                  <Text style={{ color: theme.primary, fontWeight: "600" }}>
                    + période
                  </Text>
                </TouchableOpacity>
              </View>
              {(hostForm.availabilitySchedule?.blockedRanges || []).map(
                (br, i) => (
                  <View
                    key={`host-block-${i}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Début AAAA-MM-JJ"
                      placeholderTextColor={theme.inkMuted}
                      value={br.start}
                      onChangeText={(v) =>
                        setHostForm((s) => {
                          const base =
                            s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule();
                          const next = base.blockedRanges.map((r, j) =>
                            j === i ? { ...r, start: v } : r
                          );
                          return {
                            ...s,
                            availabilitySchedule: {
                              ...base,
                              blockedRanges: next,
                            },
                          };
                        })
                      }
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Fin AAAA-MM-JJ"
                      placeholderTextColor={theme.inkMuted}
                      value={br.end}
                      onChangeText={(v) =>
                        setHostForm((s) => {
                          const base =
                            s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule();
                          const next = base.blockedRanges.map((r, j) =>
                            j === i ? { ...r, end: v } : r
                          );
                          return {
                            ...s,
                            availabilitySchedule: {
                              ...base,
                              blockedRanges: next,
                            },
                          };
                        })
                      }
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setHostForm((s) => {
                          const base =
                            s.availabilitySchedule ||
                            cloneDefaultAvailabilitySchedule();
                          return {
                            ...s,
                            availabilitySchedule: {
                              ...base,
                              blockedRanges: base.blockedRanges.filter(
                                (_r, j) => j !== i
                              ),
                            },
                          };
                        })
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={22}
                        color={theme.inkMuted}
                      />
                    </TouchableOpacity>
                  </View>
                )
              )}
              <Text style={styles.fieldLabel}>Localisation</Text>
              <Text style={styles.helperText}>
                Choisis ton mode: placer sur carte, saisir GPS, ou rechercher
                par ville.
              </Text>
              <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    hostLocationMode === "map" && styles.roleChipActive,
                  ]}
                  onPress={() => setHostLocationMode("map")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      hostLocationMode === "map" && styles.roleChipTextActive,
                    ]}
                  >
                    Sur la carte
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    hostLocationMode === "gps" && styles.roleChipActive,
                  ]}
                  onPress={() => setHostLocationMode("gps")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      hostLocationMode === "gps" && styles.roleChipTextActive,
                    ]}
                  >
                    Coordonnées GPS
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    hostLocationMode === "city" && styles.roleChipActive,
                  ]}
                  onPress={() => setHostLocationMode("city")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      hostLocationMode === "city" && styles.roleChipTextActive,
                    ]}
                  >
                    Nom de ville
                  </Text>
                </TouchableOpacity>
              </View>
              {hostLocationMode === "map" ? (
                <View style={{ marginTop: 8, marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>
                    Carte — clique / appui long pour poser ton box
                  </Text>
                  {Platform.OS === "web" ? (
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
                  ) : (
                    <NativeExplorerMap
                      center={[hostLat, hostLon]}
                      boxes={[]}
                      trails={[]}
                      onPickLocation={(lat, lng) =>
                        actionsRef.current.setHostLocationFromMap(lat, lng)
                      }
                      onMapLongPress={(lat, lng) =>
                        actionsRef.current.setHostLocationFromMap(lat, lng)
                      }
                      followExternalCenter
                    />
                  )}
                </View>
              ) : null}
              {hostLocationMode === "gps" ? (
                <>
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
                </>
              ) : null}
              {hostLocationMode === "city" ? (
                <>
                  <Text style={styles.inputLabel}>Ville</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Annecy"
                    placeholderTextColor={theme.inkMuted}
                    value={hostForm.city}
                    onChangeText={(v) => {
                      setHostReverseGeocode({ status: "idle", message: "" });
                      setHostForm((s) => ({ ...s, city: v }));
                    }}
                  />
                  <OutlineButton
                    label={
                      hostCityLookupLoading
                        ? "Recherche..."
                        : "Trouver la ville"
                    }
                    icon="search-outline"
                    stretch
                    onPress={() => {
                      if (!hostCityLookupLoading) void applyHostCitySearch();
                    }}
                  />
                </>
              ) : null}
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
              {hostLocationMode !== "city" ? (
                <Text style={styles.inputLabel}>Ville (base de données)</Text>
              ) : null}
              {hostLocationMode !== "city" &&
              hostReverseGeocode.status === "loading" ? (
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
              {hostLocationMode !== "city" && hostReverseGeocode.message ? (
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
              {hostLocationMode !== "city" ? (
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
              ) : null}
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
              <Text style={styles.fieldLabel}>
                Eau — capacité (litres pour remplir les gourdes)
              </Text>
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
              <Text style={styles.fieldLabel}>Eau potable sur place ?</Text>
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
              <Text style={styles.fieldLabel}>
                Ce que tu proposes (allègement du sac)
              </Text>
              <Text style={styles.helperText}>
                Eau, nourriture, abri, recharge… coche ce que tu peux vraiment
                offrir.
              </Text>
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
        {canHostLocal && hostEditingBoxId != null ? (
          <Section
            title="Traces & ravito"
            subtitle="Associe des traces adaptées à ton box (parcours longs, étapes type ultra). Visible dans l’onglet Traces pour toute la communauté."
            icon="flag-outline"
          >
            <Text style={styles.helperText}>
              Jusqu’à 12 traces par box. Une seule peut être marquée « coup de
              cœur » (mise en avant).
            </Text>
            <OutlineButton
              label="Ajouter une trace à ce box"
              icon="add-circle-outline"
              stretch
              onPress={() => setHostPinModalOpen(true)}
            />
            {hostBoxTrailPins.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune trace épinglée pour l’instant.
              </Text>
            ) : null}
            {hostBoxTrailPins.map((pin) => {
              const tr = pin.trail || {};
              const hl = Number(pin.is_highlight) === 1;
              return (
                <View key={`host-pin-${pin.id}`} style={styles.card}>
                  <View style={styles.cardAccent} />
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {tr.name || `Trace #${pin.trail_id}`}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        actionsRef.current.patchHostBoxTrailPin(
                          hostEditingBoxId,
                          pin.id,
                          { isHighlight: !hl }
                        )
                      }
                      accessibilityLabel="Coup de cœur"
                    >
                      <Ionicons
                        name={hl ? "star" : "star-outline"}
                        size={24}
                        color={hl ? "#CA8A04" : theme.inkMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardMeta}>
                    {tr.territory || "—"} ·{" "}
                    {Number(tr.distance_km || 0).toFixed(1)} km ·{" "}
                    {formatTrailElevationSummary(tr)} ·{" "}
                    {DIFFICULTY_LABELS[tr.difficulty] || tr.difficulty} ·{" "}
                    {TRAIL_ACTIVITY_LABELS[tr.activity || "hike"] ||
                      tr.activity ||
                      ""}
                  </Text>
                  <TrailAltitudeBadge trail={tr} compact />
                  {pin.host_note ? (
                    <Text style={styles.cardAvailability}>{pin.host_note}</Text>
                  ) : null}
                  <OutlineButton
                    compact
                    label="Retirer"
                    icon="trash-outline"
                    onPress={async () => {
                      const ok = await confirmDestructive(
                        "Retirer cette trace",
                        `Retirer « ${
                          tr.name || "cette trace"
                        } » des recommandations ?`
                      );
                      if (!ok) return;
                      await actionsRef.current.deleteHostBoxTrailPin(
                        hostEditingBoxId,
                        pin.id
                      );
                    }}
                  />
                </View>
              );
            })}
          </Section>
        ) : null}
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
            title="Aider un coureur (ravito)"
            subtitle="Propose une box OU un ravito mobile (tu te déplaces au point GPS, sans box)."
            icon="megaphone-outline"
          >
            <RavitoHostRequestsSection
              token={authToken}
              apiFetch={apiFetch}
              hostBoxes={hostBoxes}
              refreshNonce={ravitoRequestsRefreshNonce}
              volunteerLat={hostLat}
              volunteerLon={hostLon}
              allowMobileWithoutBox
            />
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

      <Modal
        visible={hostPinModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHostPinModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              Platform.OS === "web" ? { maxHeight: "92%" } : { maxHeight: 560 },
            ]}
          >
            <View style={styles.modalSheetHeader}>
              <Text style={styles.modalSheetTitle} numberOfLines={2}>
                Épingler une trace
              </Text>
              <TouchableOpacity
                onPress={() => setHostPinModalOpen(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color={theme.ink} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Rechercher par nom, territoire…"
              placeholderTextColor={theme.inkMuted}
              value={hostPinSearch}
              onChangeText={setHostPinSearch}
            />
            <FlatList
              data={hostPinTrailCandidates}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 220, marginTop: 8 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  Aucune trace disponible (ou déjà épinglée).
                </Text>
              }
              renderItem={({ item }) => {
                const sel = Number(hostPinSelectedTrailId) === Number(item.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.card,
                      { marginBottom: 8 },
                      sel && {
                        borderWidth: 2,
                        borderColor: theme.primary,
                      },
                    ]}
                    onPress={() => setHostPinSelectedTrailId(Number(item.id))}
                  >
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardMeta}>
                      {item.territory} ·{" "}
                      {Number(item.distance_km || 0).toFixed(1)} km ·{" "}
                      {TRAIL_ACTIVITY_LABELS[item.activity || "hike"]}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
              Message aux sportifs (optionnel)
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={hostPinNote}
              onChangeText={setHostPinNote}
              placeholder="Ex. ravito idéal après le col, replis météo…"
              placeholderTextColor={theme.inkMuted}
              maxLength={2000}
            />
            <TouchableOpacity
              style={[
                styles.roleChip,
                hostPinHighlight && styles.roleChipActive,
                { alignSelf: "flex-start", marginTop: 10 },
              ]}
              onPress={() => setHostPinHighlight((h) => !h)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.roleChipText,
                  hostPinHighlight && styles.roleChipTextActive,
                ]}
              >
                Coup de cœur (mise en avant)
              </Text>
            </TouchableOpacity>
            <View style={styles.modalSheetFooter}>
              <OutlineButton
                compact
                label="Annuler"
                icon="close-circle-outline"
                onPress={() => setHostPinModalOpen(false)}
              />
              <PrimaryButton
                compact
                label="Ajouter"
                icon="checkmark-outline"
                disabled={!hostPinSelectedTrailId || !hostEditingBoxId}
                onPress={async () => {
                  if (!hostPinSelectedTrailId || !hostEditingBoxId) return;
                  const ok = await actionsRef.current.addHostBoxTrailPin(
                    hostEditingBoxId,
                    {
                      trailId: hostPinSelectedTrailId,
                      hostNote: hostPinNote,
                      isHighlight: hostPinHighlight,
                    }
                  );
                  if (ok) setHostPinModalOpen(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileScreen() {
  const {
    user,
    myReviewsSummary,
    myReviews,
    athleteBookings,
    notifications,
    followingUsers,
    openUserReviews,
    unfollowUser,
    showFollowingOnMap,
    canHost,
    capabilities,
    capabilitiesBusy,
    simpleUi,
    setSimpleUi,
    actionsRef,
  } = useAppMain();
  const isFocused = useIsFocused();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false);
  const [recoveryRegenBusy, setRecoveryRegenBusy] = useState(false);
  const [recoveryRegenPassword, setRecoveryRegenPassword] = useState("");
  const [hasRecoveryCode, setHasRecoveryCode] = useState(null);
  const roleLabel = formatCapabilitiesLabel(capabilities);
  const today = todayIsoDate();
  const todayBookingsCount = useMemo(
    () =>
      (athleteBookings || []).filter((b) => b.booking_date === today).length,
    [athleteBookings, today]
  );
  const unreadNotificationsCount = useMemo(
    () =>
      (notifications || []).filter((n) => Number(n.is_read || 0) === 0).length,
    [notifications]
  );

  useEffect(() => {
    if (!isFocused) return;
    actionsRef.current.loadMyReviews?.();
  }, [isFocused, actionsRef]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await actionsRef.current.fetchRecoveryCodeStatus?.();
        if (!cancelled) setHasRecoveryCode(Boolean(status?.hasRecoveryCode));
      } catch {
        if (!cancelled) setHasRecoveryCode(null);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        <IntentGuideBanner
          guideId="compte"
          title="Compte"
          lines={[
            "Import GPX, rôle athlète/hôte, mot de passe.",
            "Suivi : onglet Réservations.",
          ]}
        />
        <Section
          title="Interface"
          subtitle={
            simpleUi
              ? "Mode simple : Découvrir → Projets → Réservations."
              : "Mode complet : tous les outils avancés visibles."
          }
          icon="options-outline"
        >
          <TouchableOpacity
            style={[
              styles.roleChip,
              simpleUi && styles.roleChipActive,
              { alignSelf: "flex-start", marginBottom: 8 },
            ]}
            onPress={() => setSimpleUi(true)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                simpleUi && styles.roleChipTextActive,
              ]}
            >
              Simple
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleChip,
              !simpleUi && styles.roleChipActive,
              { alignSelf: "flex-start", marginBottom: 8 },
            ]}
            onPress={() => setSimpleUi(false)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                !simpleUi && styles.roleChipTextActive,
              ]}
            >
              Complet
            </Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>
            Le mode simple masque les options avancées (agenda, GPX, ravito
            déplié, etc.) pour se concentrer sur la réservation.
          </Text>
        </Section>
        <Section
          title="Mon profil"
          subtitle="Un compte — plusieurs casquettes."
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
          title="Mes activités"
          subtitle="Active ce que tu fais. Tu peux tout cumuler."
          icon="sparkles-outline"
        >
          <CapabilityCards
            value={capabilities}
            busy={capabilitiesBusy}
            onChange={(next) =>
              actionsRef.current.updateCapabilities?.(next)
            }
          />
          {capabilities.host ? (
            <PrimaryButton
              label="Gérer mes box"
              icon="home-outline"
              onPress={() => {
                const nav = mainTabNavigationRef.current;
                if (nav?.navigate) nav.navigate("Host");
              }}
            />
          ) : null}
        </Section>
        <Section
          title="Mes abonnements"
          subtitle="Hôtes et créateurs que tu suis — filtre « Abonnements » sur la carte."
          icon="people-outline"
        >
          {followingUsers.length === 0 ? (
            <Text style={styles.emptyText}>
              Tu ne suis personne pour l’instant. Ouvre le profil d’un hôte ou
              créateur (avis) et appuie sur « Suivre ».
            </Text>
          ) : (
            followingUsers.map((fu) => (
              <View key={`follow-${fu.id}`} style={styles.card}>
                <View style={styles.cardAccent} />
                <Text style={styles.cardTitle}>{fu.full_name}</Text>
                <Text style={styles.cardMeta}>
                  {fu.city || "—"}
                  {fu.role ? ` · ${ROLE_LABELS[fu.role] || fu.role}` : ""}
                </Text>
                <View style={[styles.roleRow, { flexWrap: "wrap", marginTop: 8 }]}>
                  <OutlineButton
                    compact
                    label="Profil"
                    icon="star-outline"
                    onPress={() =>
                      openUserReviews(fu.id, `${fu.full_name} — avis`)
                    }
                  />
                  <OutlineButton
                    compact
                    label="Ne plus suivre"
                    icon="person-remove-outline"
                    onPress={() => unfollowUser?.(fu.id)}
                  />
                </View>
              </View>
            ))
          )}
          {followingUsers.length > 0 ? (
            <PrimaryButton
              label="Voir sur la carte (Abonnements)"
              icon="map-outline"
              onPress={() => showFollowingOnMap?.()}
            />
          ) : null}
        </Section>
        <Section
          title="Actions"
          subtitle="Accès directs."
          icon="flash-outline"
        >
          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <Text style={styles.cardMeta}>
              Réservations du jour: {todayBookingsCount}
            </Text>
            <Text style={styles.cardMeta}>
              Notifications non lues: {unreadNotificationsCount}
            </Text>
          </View>
          <PrimaryButton
            label="Importer une trace GPX"
            icon="cloud-upload-outline"
            onPress={() => actionsRef.current.uploadGpx?.()}
          />
          {!simpleUi ? (
            <>
              <SecondaryButton
                label="Rafraîchir les données"
                icon="refresh-outline"
                onPress={async () => {
                  await Promise.allSettled([
                    actionsRef.current.loadTrails?.(),
                    actionsRef.current.loadAthleteBookings?.(),
                    actionsRef.current.loadHostBookings?.(),
                    actionsRef.current.loadNotifications?.(),
                  ]);
                  userAlert("Synchronisation", "Données mises à jour.");
                }}
              />
              <SecondaryButton
                label="Catalogue traces GPX"
                icon="navigate-outline"
                onPress={() => actionsRef.current.navigateToTrails?.()}
              />
            </>
          ) : null}
        </Section>

        <Section
          title="Code de compte"
          subtitle="Reçu à l’inscription ; uniquement si tu oublies ton mot de passe."
          icon="shield-checkmark-outline"
        >
          <Text style={styles.helperText}>
            {hasRecoveryCode === false
              ? "Aucun code enregistré (compte ancien). Génère-en un avec ton mot de passe actuel."
              : hasRecoveryCode === true
              ? "Tu as un code de secours actif. Il n’est plus affiché : si tu l’as perdu, régénère-en un."
              : "…"}
          </Text>
          <Text style={styles.inputLabel}>Mot de passe actuel</Text>
          <TextInput
            style={styles.input}
            placeholder="Pour générer un nouveau code"
            placeholderTextColor={theme.inkMuted}
            value={recoveryRegenPassword}
            onChangeText={setRecoveryRegenPassword}
            secureTextEntry
            editable={!recoveryRegenBusy}
          />
          <PrimaryButton
            label={
              hasRecoveryCode
                ? "Régénérer mon code de compte"
                : "Créer mon code de compte"
            }
            icon="key-outline"
            loading={recoveryRegenBusy}
            onPress={async () => {
              if (!recoveryRegenPassword) {
                userAlert("Mot de passe", "Saisis ton mot de passe actuel.");
                return;
              }
              setRecoveryRegenBusy(true);
              try {
                const code =
                  await actionsRef.current.regenerateRecoveryCode?.({
                    currentPassword: recoveryRegenPassword,
                  });
                setRecoveryRegenPassword("");
                setHasRecoveryCode(true);
                if (code) {
                  actionsRef.current.showRecoveryCodeReveal?.(code);
                }
              } catch (error) {
                userAlert("Erreur", error.message);
              } finally {
                setRecoveryRegenBusy(false);
              }
            }}
          />
        </Section>

        <Section
          title="Mot de passe"
          subtitle="Change-le ici si tu es connecté et que tu connais l’ancien."
          icon="key-outline"
        >
          <Text style={styles.inputLabel}>Mot de passe actuel</Text>
          <TextInput
            style={styles.input}
            placeholder="Actuel"
            placeholderTextColor={theme.inkMuted}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            editable={!passwordChangeBusy}
          />
          <Text style={styles.inputLabel}>Nouveau mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="Au moins 6 caractères"
            placeholderTextColor={theme.inkMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            editable={!passwordChangeBusy}
          />
          <Text style={styles.inputLabel}>Confirmer</Text>
          <TextInput
            style={styles.input}
            placeholder="Répète le nouveau"
            placeholderTextColor={theme.inkMuted}
            value={newPasswordConfirm}
            onChangeText={setNewPasswordConfirm}
            secureTextEntry
            editable={!passwordChangeBusy}
          />
          <PrimaryButton
            label="Enregistrer le nouveau mot de passe"
            icon="checkmark-circle-outline"
            loading={passwordChangeBusy}
            onPress={async () => {
              if (newPassword.length < 6) {
                userAlert(
                  "Mot de passe",
                  "Le nouveau mot de passe doit faire au moins 6 caractères."
                );
                return;
              }
              if (newPassword !== newPasswordConfirm) {
                userAlert(
                  "Confirmation",
                  "Les deux nouveaux mots de passe ne correspondent pas."
                );
                return;
              }
              setPasswordChangeBusy(true);
              try {
                await actionsRef.current.changeMyPassword?.({
                  currentPassword,
                  newPassword,
                });
                setCurrentPassword("");
                setNewPassword("");
                setNewPasswordConfirm("");
              } catch (error) {
                userAlert("Erreur", error.message);
              } finally {
                setPasswordChangeBusy(false);
              }
            }}
          />
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
        {!simpleUi ? (
          <PrimaryButton
            label="Rafraîchir la session"
            icon="refresh-outline"
            onPress={() => actionsRef.current.refreshSession()}
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
    canRavito,
    hostBookings,
    athleteBookings,
    hostBoxes,
    mapLat,
    mapLon,
    notifications,
    openUserReviews,
    authToken,
    acceptRavitoProposal,
    ravitoRequestsRefreshNonce,
    simpleUi,
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
  const [liveShareBookingId, setLiveShareBookingId] = useState(null);
  const [liveShareBusy, setLiveShareBusy] = useState(false);
  const [liveByBookingId, setLiveByBookingId] = useState({});
  const hostViewActive = canHost && reservationTab !== "athlete";
  const agendaEntries = useMemo(
    () =>
      buildBookingAgendaEntries(
        hostViewActive ? hostBookings : athleteBookings,
        {
          hostView: hostViewActive,
        }
      ),
    [hostViewActive, hostBookings, athleteBookings]
  );
  const agendaPhaseCounts = useMemo(() => {
    const counts = { ongoing: 0, upcoming: 0, pending: 0, other: 0 };
    for (const item of agendaEntries) {
      if (item.phase.key === "ongoing") counts.ongoing += 1;
      else if (item.phase.key === "upcoming") counts.upcoming += 1;
      else if (item.phase.key === "pending") counts.pending += 1;
      else counts.other += 1;
    }
    return counts;
  }, [agendaEntries]);

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

  useEffect(() => {
    if (liveShareBookingId) return;
    const active = (athleteBookings || []).find(
      (b) =>
        Number(b.live_sharing) === 1 && String(b.status || "") !== "cancelled"
    );
    if (active) setLiveShareBookingId(Number(active.id));
  }, [athleteBookings, liveShareBookingId]);

  useEffect(() => {
    if (!isFocused || !liveShareBookingId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const live = await actionsRef.current.pushBookingLiveLocation?.(
          liveShareBookingId
        );
        if (!cancelled && live) {
          setLiveByBookingId((prev) => ({
            ...prev,
            [liveShareBookingId]: live,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setLiveShareBookingId(null);
          userAlert(
            "Suivi GPS interrompu",
            error?.message || "Impossible de partager la position."
          );
        }
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isFocused, liveShareBookingId, actionsRef]);

  useEffect(() => {
    if (!isFocused || !hostViewActive) return;
    const sharingIds = (hostBookings || [])
      .filter(
        (b) =>
          Number(b.live_sharing) === 1 ||
          (b.en_route_at && String(b.status || "") !== "cancelled")
      )
      .map((b) => Number(b.id))
      .filter((id) => Number.isFinite(id));
    if (!sharingIds.length) return;
    let cancelled = false;
    const poll = async () => {
      for (const bid of sharingIds) {
        try {
          const live = await actionsRef.current.fetchBookingLiveLocation?.(bid);
          if (!cancelled && live) {
            setLiveByBookingId((prev) => ({ ...prev, [bid]: live }));
          }
        } catch {
          /* ignore single poll errors */
        }
      }
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isFocused, hostViewActive, hostBookings, actionsRef]);

  const toggleLiveShare = async (bookingId) => {
    const bid = Number(bookingId);
    if (!Number.isFinite(bid) || liveShareBusy) return;
    setLiveShareBusy(true);
    try {
      if (liveShareBookingId === bid) {
        await actionsRef.current.stopBookingLiveLocation?.(bid);
        setLiveShareBookingId(null);
        setLiveByBookingId((prev) => {
          const next = { ...prev };
          if (next[bid]) next[bid] = { ...next[bid], sharing: false };
          return next;
        });
        userAlert("Suivi arrêté", "Ta position n’est plus partagée avec l’hôte.");
      } else {
        if (liveShareBookingId) {
          try {
            await actionsRef.current.stopBookingLiveLocation?.(
              liveShareBookingId
            );
          } catch {
            /* ignore */
          }
        }
        const live = await actionsRef.current.pushBookingLiveLocation?.(bid);
        setLiveShareBookingId(bid);
        if (live) {
          setLiveByBookingId((prev) => ({ ...prev, [bid]: live }));
        }
        userAlert(
          "Suivi live activé",
          live?.etaMinutes != null
            ? `L’hôte voit ta position (~${live.etaMinutes} min).`
            : "L’hôte voit ta position en direct."
        );
      }
    } catch (error) {
      userAlert("Erreur", error?.message || "GPS indisponible.");
    } finally {
      setLiveShareBusy(false);
    }
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
        <IntentGuideBanner
          guideId="reserver"
          title="Réserver — suivi"
          lines={[
            "Ici : box et ravito réservés, en attente, reçus ou envoyés.",
            "Découvrir = carte & demande. Projets = créer / affiner un plan.",
            canHost
              ? "Bascule « Reçues » pour valider les demandes sur tes box."
              : "Les demandes en attente apparaissent avec le statut pending.",
          ]}
        />
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
                Reçues
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
                Envoyées
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canBook && (!canHost || reservationTab === "athlete") ? (
          simpleUi ? (
            <MoreActions label="Demander un ravito sur le trajet">
              <RavitoAthleteRequestsSection
                token={authToken}
                apiFetch={apiFetch}
                onAcceptProposal={acceptRavitoProposal}
                refreshNonce={ravitoRequestsRefreshNonce}
              />
            </MoreActions>
          ) : (
            <Section
              title="Demandes de ravito (point GPS)"
              subtitle="Publie un besoin sur la carte, reçois des propositions (box ou ravito mobile), puis réserve."
              icon="megaphone-outline"
            >
              <RavitoAthleteRequestsSection
                token={authToken}
                apiFetch={apiFetch}
                onAcceptProposal={acceptRavitoProposal}
                refreshNonce={ravitoRequestsRefreshNonce}
              />
            </Section>
          )
        ) : null}

        {canRavito &&
        (!canHost || reservationTab === "athlete" || reservationTab === "host") ? (
          simpleUi ? (
            <Section
              title="Ravitailleur"
              subtitle="Aider au point GPS — avec ou sans box."
              icon="bicycle-outline"
            >
              <RavitoHostRequestsSection
                token={authToken}
                apiFetch={apiFetch}
                hostBoxes={hostBoxes || []}
                refreshNonce={ravitoRequestsRefreshNonce}
                volunteerLat={mapLat}
                volunteerLon={mapLon}
                allowMobileWithoutBox
              />
            </Section>
          ) : (
            <Section
              title="Ravito mobile — aider sans box"
              subtitle="Tu peux ravitailler un coureur au point GPS même sans box fixe."
              icon="bicycle-outline"
            >
              <RavitoHostRequestsSection
                token={authToken}
                apiFetch={apiFetch}
                hostBoxes={hostBoxes || []}
                refreshNonce={ravitoRequestsRefreshNonce}
                volunteerLat={mapLat}
                volunteerLon={mapLon}
                allowMobileWithoutBox
              />
            </Section>
          )
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

        {(canHost || canBook) && agendaEntries.length > 0 && !simpleUi ? (
          <Section
            title="Planning des réservations"
            subtitle="Vue agenda claire de tes réservations en cours, validées et prévues."
            icon="calendar-clear-outline"
          >
            <View style={styles.agendaLegendRow}>
              <View style={styles.agendaLegendChip}>
                <Text style={styles.agendaLegendText}>
                  En cours: {agendaPhaseCounts.ongoing}
                </Text>
              </View>
              <View style={styles.agendaLegendChip}>
                <Text style={styles.agendaLegendText}>
                  Validées à venir: {agendaPhaseCounts.upcoming}
                </Text>
              </View>
              <View style={styles.agendaLegendChip}>
                <Text style={styles.agendaLegendText}>
                  En attente: {agendaPhaseCounts.pending}
                </Text>
              </View>
            </View>
            {agendaEntries.slice(0, 24).map((item, idx) => {
              const prev = idx > 0 ? agendaEntries[idx - 1] : null;
              const newDay = !prev || prev.dateKey !== item.dateKey;
              return (
                <View key={`agenda-${item.id}-${idx}`}>
                  {newDay ? (
                    <Text style={styles.agendaDayTitle}>
                      {formatDateLongFr(item.dateKey)}
                    </Text>
                  ) : null}
                  <View style={styles.agendaItemRow}>
                    <View
                      style={[
                        styles.agendaItemDot,
                        { backgroundColor: item.phase.color },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {item.slot} · {item.title}
                      </Text>
                      <Text style={styles.cardMeta}>{item.subline}</Text>
                      <Text style={styles.cardDetailLine}>
                        Statut agenda: {item.phase.label}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
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
                    <Text style={styles.cardAvailability}>
                      Demande athlète :{" "}
                      {bookingSpecialRequestLabel(b.special_request)}
                    </Text>
                    {!isBookingPaid(b.payment_status) &&
                    (approval === "pending" ||
                      approval === "pending_host_confirmation") ? (
                      <View style={[styles.infoBanner, { marginBottom: 8 }]}>
                        <Text style={styles.infoBannerTitle}>
                          Valide pour débloquer le paiement
                        </Text>
                        <Text style={styles.infoBannerText}>
                          Le sportif ne peut payer qu’après ton acceptation.
                        </Text>
                      </View>
                    ) : null}
                    {isBookingPaid(b.payment_status) ? (
                      <Text
                        style={[styles.cardAvailability, { color: theme.success }]}
                      >
                        Payé
                      </Text>
                    ) : approval === "accepted" ? (
                      <Text style={styles.cardAvailability}>
                        Validée — en attente de paiement
                      </Text>
                    ) : null}
                    {b.en_route_at ? (
                      <View style={[styles.infoBanner, { marginBottom: 8 }]}>
                        <Text style={styles.infoBannerTitle}>
                          Athlète en approche (~{b.en_route_eta_min || 10} min)
                        </Text>
                        <Text style={styles.infoBannerText}>
                          Prévenu à{" "}
                          {new Date(b.en_route_at).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                    ) : null}
                    {(() => {
                      const live = liveByBookingId[b.id];
                      const sharing =
                        live?.sharing === true || Number(b.live_sharing) === 1;
                      if (!sharing && !live?.distanceKm) return null;
                      const eta =
                        live?.etaMinutes != null
                          ? live.etaMinutes
                          : b.en_route_eta_min;
                      const dist =
                        live?.distanceKm != null ? live.distanceKm : null;
                      return (
                        <View style={[styles.infoBanner, { marginBottom: 8 }]}>
                          <Text style={styles.infoBannerTitle}>
                            {sharing
                              ? "Suivi GPS live"
                              : "Dernière position"}
                          </Text>
                          <Text style={styles.infoBannerText}>
                            {dist != null
                              ? `~${dist} km`
                              : "Position reçue"}
                            {eta != null ? ` · ETA ~${eta} min` : ""}
                            {live?.liveUpdatedAt
                              ? ` · ${new Date(
                                  live.liveUpdatedAt
                                ).toLocaleTimeString("fr-FR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : ""}
                          </Text>
                        </View>
                      );
                    })()}
                    {formatBoxOfferLines({
                      has_water: b.box_has_water,
                      capacity_liters: b.box_capacity_liters,
                      criteria_json: b.box_criteria_json,
                      criteria_note: b.box_criteria_note,
                      availability_note: b.box_availability_note,
                    }).map((line, i) => (
                      <Text
                        key={`host-offer-${b.id}-${i}`}
                        style={styles.cardAvailability}
                      >
                        {line}
                      </Text>
                    ))}
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
                              ? "Valider (débloque le paiement)"
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
                    <MoreActions label="Plus">
                      <OutlineButton
                        compact
                        label="Mettre en évidence sur la carte"
                        icon="locate-outline"
                        onPress={() =>
                          actionsRef.current.spotlightBookingOnMap?.(b)
                        }
                      />
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
                    </MoreActions>
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
            title="Mes réservations"
            subtitle={
              simpleUi
                ? "Statut, code d’accès, arrivée."
                : "Tes demandes de box : modifier, supprimer ou tout effacer."
            }
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
            {athleteBookings.length > 0 && !simpleUi ? (
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
                      <Text style={styles.cardAvailability}>
                        Hôte : {b.host_full_name || "Hôte"}
                        {!simpleUi
                          ? ` — ${formatPublicRatingLine({
                              count: b.host_review_count,
                              avg_score: b.host_avg_score,
                            })}`
                          : ""}
                      </Text>
                    ) : null}
                    <Text style={styles.cardDetailLine}>
                      Étape : {bookingFunnelStepLabel(b)}
                      {b.route_plan_id ? ` · projet #${b.route_plan_id}` : ""}
                    </Text>
                    <Text style={styles.cardDetailLine}>
                      Statut : {bookingApprovalLabel(approval)}
                      {" · "}
                      {bookingPaymentLabel(b.payment_status)}
                      {showAccess && b.access_code
                        ? ` · code ${b.access_code}`
                        : ""}
                    </Text>
                    {bookingCanAthletePay(b) ? (
                      <PrimaryButton
                        compact
                        label={`Payer ${(
                          Number(b.amount_cents || 0) / 100
                        ).toFixed(2)} €`}
                        icon="card-outline"
                        onPress={() =>
                          actionsRef.current.payAthleteBooking?.(b.id)
                        }
                      />
                    ) : null}
                    {bookingCanAthleteEdit(b) ? (
                      <Text style={styles.cardAvailability}>
                        Modifiable tant que non payé (swipe « Modifier »).
                      </Text>
                    ) : null}
                    {!simpleUi ? (
                      <Text style={styles.cardDetailLine}>
                        Ma demande :{" "}
                        {bookingSpecialRequestLabel(b.special_request)}
                      </Text>
                    ) : null}
                    {!simpleUi
                      ? formatBoxOfferLines({
                          has_water: b.box_has_water,
                          capacity_liters: b.box_capacity_liters,
                          criteria_json: b.box_criteria_json,
                          criteria_note: b.box_criteria_note,
                          availability_note: b.box_availability_note,
                        }).map((line, i) => (
                          <Text
                            key={`ath-offer-${b.id}-${i}`}
                            style={styles.cardAvailability}
                          >
                            {line}
                          </Text>
                        ))
                      : null}
                    {b.en_route_at ? (
                      <Text style={[styles.cardAvailability, { color: theme.primary }]}>
                        Préavis envoyé : ~{b.en_route_eta_min || 10} min (
                        {new Date(b.en_route_at).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        )
                      </Text>
                    ) : null}
                    {(() => {
                      const live = liveByBookingId[b.id];
                      const sharing =
                        liveShareBookingId === Number(b.id) ||
                        live?.sharing === true ||
                        Number(b.live_sharing) === 1;
                      if (!sharing && !live?.etaMinutes) return null;
                      return (
                        <Text
                          style={[
                            styles.cardAvailability,
                            { color: theme.primary },
                          ]}
                        >
                          {sharing ? "GPS partagé" : "Dernier suivi"}
                          {live?.distanceKm != null
                            ? ` · ~${live.distanceKm} km`
                            : ""}
                          {live?.etaMinutes != null
                            ? ` · ETA ~${live.etaMinutes} min`
                            : ""}
                        </Text>
                      );
                    })()}
                    {b.status !== "cancelled" &&
                    approval !== "rejected" ? (
                      <>
                        <PrimaryButton
                          compact
                          label="Je suis à ~10 min"
                          icon="navigate-outline"
                          onPress={() =>
                            actionsRef.current.notifyBookingEnRoute?.(b.id, 10)
                          }
                        />
                        <OutlineButton
                          compact
                          label={
                            liveShareBusy && liveShareBookingId === Number(b.id)
                              ? "GPS…"
                              : liveShareBookingId === Number(b.id)
                              ? "Arrêter le suivi GPS"
                              : "Partager ma position"
                          }
                          icon={
                            liveShareBookingId === Number(b.id)
                              ? "stop-circle-outline"
                              : "locate-outline"
                          }
                          onPress={() => toggleLiveShare(b.id)}
                        />
                      </>
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
                    {showAccess && b.access_instructions ? (
                      <Text style={styles.cardAvailability}>
                        Instructions : {b.access_instructions}
                      </Text>
                    ) : null}
                    {!showAccess ? (
                      <Text style={styles.cardAvailability}>
                        {approval !== "accepted"
                          ? "Le code d’accès apparaîtra après validation par l’hôte."
                          : "Accès visible juste avant le créneau."}
                      </Text>
                    ) : null}
                    {changeDraft ? (
                      <Text style={styles.cardAvailability}>
                        {bookingChangePreviewText(b, changeDraft)}
                      </Text>
                    ) : null}
                    <MoreActions label="Plus">
                      {b.host_user_id ? (
                        <OutlineButton
                          compact
                          stretch
                          label="Profil de l’hôte"
                          icon="person-circle-outline"
                          onPress={() =>
                            openUserReviews(
                              b.host_user_id,
                              `Hôte — ${b.host_full_name || "profil & avis"}`
                            )
                          }
                        />
                      ) : null}
                      {b.status !== "cancelled" ? (
                        <OutlineButton
                          compact
                          label="Annuler ma réservation"
                          icon="close-circle-outline"
                          onPress={() =>
                            actionsRef.current.deleteAthleteBooking(b.id)
                          }
                        />
                      ) : null}
                      {!simpleUi ? (
                        <>
                          <Text style={styles.cardDetailLine}>
                            Paiement: {b.payment_status || "simulated_unpaid"} ·
                            remboursement: {b.refund_status || "none"}
                          </Text>
                          <Text style={styles.cardDetailLine}>
                            Accès :{" "}
                            {bookingAccessMethodLabel(b.access_method)}
                          </Text>
                        </>
                      ) : null}
                      <OutlineButton
                        compact
                        label="Voir sur la carte"
                        icon="locate-outline"
                        onPress={() =>
                          actionsRef.current.spotlightBookingOnMap?.(b)
                        }
                      />
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
                        label="Signaler un incident"
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
                    </MoreActions>
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

        {!canHost && !canBook && !canRavito ? (
          <Text style={styles.emptyText}>
            Dans Compte, active Utilisateur, Hôte ou Ravitailleur pour commencer.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabs() {
  const { canHost, simpleUi } = useAppMain();
  const { width } = useWindowDimensions();
  const compactTabs = width < 390;
  const ultraCompactTabs = width < 355;
  const isNarrowScreen = width < 430;
  const [webTabPickerVisible, setWebTabPickerVisible] = useState(false);
  const tabTargets = [
    { key: "Carte", label: "Découvrir" },
    { key: "Plans", label: "Projets" },
    ...(!simpleUi ? [{ key: "Trails", label: "Traces GPX" }] : []),
    ...(canHost ? [{ key: "Host", label: "Mes box" }] : []),
    { key: "Reservations", label: "Réservations" },
    { key: "Profil", label: "Compte" },
  ];
  const openTabPicker = useCallback(
    (navigation) => {
      if (!navigation?.navigate) return;
      if (Platform.OS === "web") {
        mainTabNavigationRef.current = navigation;
        setWebTabPickerVisible(true);
        return;
      }
      Alert.alert(
        "Aller a",
        "Choisis un onglet",
        tabTargets.map((t) => ({
          text: t.label,
          onPress: () => navigation.navigate(t.key),
        }))
      );
    },
    [tabTargets]
  );
  return (
    <>
      <Tab.Navigator
        screenOptions={({ route, navigation }) => {
          mainTabNavigationRef.current = navigation;
          return {
          sceneStyle: { flex: 1 },
          tabBarPosition: "bottom",
          headerStyle: {
            backgroundColor: theme.surface,
            shadowOpacity: 0,
            elevation: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border,
          },
          headerTitleStyle: {
            fontWeight: "800",
            fontSize: 17,
            letterSpacing: -0.2,
            fontFamily: theme.fontDisplay,
            textTransform: "uppercase",
            color: theme.ink,
          },
          headerTintColor: theme.ink,
          headerRight: isNarrowScreen
            ? () => (
                <TouchableOpacity
                  onPress={() => openTabPicker(navigation)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: theme.radius.sm,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.surfaceMuted,
                    marginRight: 6,
                  }}
                >
                  <Ionicons name="menu" size={18} color={theme.ink} />
                </TouchableOpacity>
              )
            : undefined,
          tabBarShowLabel: !ultraCompactTabs,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingTop: compactTabs ? 4 : 6,
            paddingBottom: compactTabs ? 4 : 6,
            height: compactTabs ? 54 : 58,
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            shadowOpacity: 0,
            elevation: 0,
          },
          tabBarItemStyle: { minWidth: 0, flex: 1, maxWidth: "none" },
          tabBarLabelStyle: {
            fontSize: compactTabs ? 9 : 10,
            fontWeight: "700",
            letterSpacing: 0.2,
            fontFamily: theme.font,
            textTransform: "uppercase",
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.inkMuted,
          tabBarIcon: ({ color, size }) => {
            const map = {
              Carte: "map-outline",
              Trails: "navigate-outline",
              Plans: "layers-outline",
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
        };
        }}
      >
        <Tab.Screen
          name="Carte"
          component={ExplorerScreen}
          options={{ title: "Découvrir", tabBarLabel: "Découvrir" }}
        />
        <Tab.Screen
          name="Trails"
          component={TrailsScreen}
          options={{
            title: "Traces GPX",
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none", width: 0, height: 0 },
          }}
        />
        <Tab.Screen
          name="Plans"
          component={PlansScreen}
          options={{ title: "Projets", tabBarLabel: "Projets" }}
        />
        {canHost ? (
          <Tab.Screen
            name="Host"
            component={HostScreen}
            options={
              simpleUi
                ? {
                    title: "Mes box",
                    tabBarButton: () => null,
                    tabBarItemStyle: { display: "none", width: 0, height: 0 },
                  }
                : { title: "Mes box", tabBarLabel: "Box" }
            }
          />
        ) : null}
        <Tab.Screen
          name="Reservations"
          component={ReservationsScreen}
          options={{ title: "Réservations", tabBarLabel: "Réservations" }}
        />
        <Tab.Screen
          name="Profil"
          component={ProfileScreen}
          options={{ title: "Compte", tabBarLabel: "Compte" }}
        />
      </Tab.Navigator>
      {Platform.OS === "web" ? (
        <Modal
          visible={webTabPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setWebTabPickerVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { maxWidth: 360, width: "100%" }]}>
              <View style={styles.modalSheetHeader}>
                <Text style={styles.modalSheetTitle}>Aller a</Text>
                <TouchableOpacity
                  onPress={() => setWebTabPickerVisible(false)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Ionicons name="close-outline" size={18} color={theme.ink} />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                {tabTargets.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      mainTabNavigationRef.current?.navigate?.(t.key);
                      setWebTabPickerVisible(false);
                    }}
                    style={styles.roleChip}
                  >
                    <Text style={styles.roleChipText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function PlansScreen() {
  const appMain = useAppMain();
  return (
    <PlansScreenBase
      appMain={{
        ...appMain,
        staticOrigin: API_STATIC_ORIGIN,
      }}
    />
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
  /** Dernier refresh token (synchrone) pour apiFetch / rotation sans attendre un re-render. */
  const refreshTokenRef = useRef(null);
  const [user, setUser] = useState(null);
  const [simpleUi, setSimpleUiState] = useState(() => readSimpleUiPref());
  const setSimpleUi = useCallback((enabled) => {
    writeSimpleUiPref(!!enabled);
    setSimpleUiState(!!enabled);
  }, []);
  const [capabilities, setCapabilitiesState] = useState({
    user: true,
    host: false,
    ravito: false,
  });
  const [capabilitiesBusy, setCapabilitiesBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("athlete");
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [resetStep, setResetStep] = useState("idle");
  const [recoveryCodeReveal, setRecoveryCodeReveal] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);

  const [boxes, setBoxes] = useState([]);
  const [trails, setTrails] = useState([]);
  /** Corrections trace non encore acceptées par l’API (clé = id trace). */
  const [trailLocalPatches, setTrailLocalPatches] = useState({});
  const [bookingDate, setBookingDate] = useState(() => todayIsoDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [city, setCity] = useState("Annecy");
  const [trailDifficulty, setTrailDifficulty] = useState("medium");
  const [trailImportTerritory, setTrailImportTerritory] = useState("Annecy");
  const [trailImportActivity, setTrailImportActivity] = useState("hike");
  const [trailImportCriteriaTags, setTrailImportCriteriaTags] = useState([]);
  const [trailImportNotes, setTrailImportNotes] = useState("");
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
    availabilitySchedule: cloneDefaultAvailabilitySchedule(),
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
  const actionsRef = useRef({});
  const explorerOpenPlanQueueRef = useRef(null);
  const explorerBookBoxQueueRef = useRef(null);
  const [hostBoxes, setHostBoxes] = useState([]);
  /** Traces épinglées sur le box en cours d’édition (hôte). */
  const [hostBoxTrailPins, setHostBoxTrailPins] = useState([]);
  const [hostRefunds, setHostRefunds] = useState([]);
  const [hostBookings, setHostBookings] = useState([]);
  const [athleteBookings, setAthleteBookings] = useState([]);
  const [followingUsers, setFollowingUsers] = useState([]);
  const [followingBoxes, setFollowingBoxes] = useState([]);
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
  const [ravitoRequestModal, setRavitoRequestModal] = useState({
    visible: false,
    point: null,
  });
  const [ravitoRequestsRefreshNonce, setRavitoRequestsRefreshNonce] =
    useState(0);
  const [spotlightBoxId, setSpotlightBoxId] = useState(null);
  const [bookingUnavailableSlots, setBookingUnavailableSlots] = useState([]);
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
  const [mapNearTrailsMode, setMapNearTrailsMode] = useState("mine");
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
  const [mapNearSingleTrailId, setMapNearSingleTrailId] = useState(null);
  const [mapNearShowAllOnMap, setMapNearShowAllOnMap] = useState(true);
  const [mapBoxesSlotCompatibleOnly, setMapBoxesSlotCompatibleOnly] =
    useState(false);
  const [routePlans, setRoutePlans] = useState([]);
  const [selectedRoutePlanId, setSelectedRoutePlanId] = useState(null);
  const [selectedRoutePlanDetail, setSelectedRoutePlanDetail] = useState(null);
  const [routePlanBusy, setRoutePlanBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setMapTrailsScope("all");
      setMapTrailPickIds([]);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id == null) {
      setTrailLocalPatches({});
      return;
    }
    setTrailLocalPatches(readTrailPatchesFromStorage(user.id));
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readAuthSession();
      if (!stored?.refreshToken) {
        if (!cancelled) setSessionReady(true);
        return;
      }
      refreshTokenRef.current = stored.refreshToken;
      try {
        const result = await apiFetch("/auth/refresh", {
          method: "POST",
          body: { refreshToken: stored.refreshToken },
        });
        if (cancelled) return;
        setToken(result.token);
        setRefreshToken(result.refreshToken);
        setUser(stored.user);
        writeAuthSession({
          token: result.token,
          refreshToken: result.refreshToken,
          user: stored.user,
        });
      } catch {
        if (!cancelled) {
          clearAuthSession();
          setToken(null);
          setRefreshToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (token && refreshToken && user) {
      writeAuthSession({ token, refreshToken, user });
    } else if (!token && !refreshToken) {
      clearAuthSession();
    }
  }, [sessionReady, token, refreshToken, user]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  useEffect(() => {
    apiAuthBridge.getRefreshToken = () => refreshTokenRef.current;
    apiAuthBridge.applySessionTokens = (access, refresh) => {
      refreshTokenRef.current = refresh;
      setToken(access);
      setRefreshToken(refresh);
    };
    return () => {
      apiAuthBridge.getRefreshToken = () => null;
      apiAuthBridge.applySessionTokens = () => {};
    };
  }, []);

  const isAuthed = useMemo(() => Boolean(token), [token]);

  useEffect(() => {
    if (!user?.id) return;
    const stored = getCapabilities(user.id);
    setCapabilitiesState(
      stored || defaultCapabilitiesFromRole(user.role)
    );
  }, [user?.id, user?.role]);

  // Casquettes UI (compte unique). Le rôle API est synchronisé en arrière-plan.
  const canHost = !!capabilities.host;
  const canBook = !!capabilities.user;
  const canRavito = !!capabilities.ravito;

  useEffect(() => {
    if (!token || hostEditingBoxId == null) {
      setHostBoxTrailPins([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiFetch(
          `/host/boxes/${hostEditingBoxId}/trail-pins`,
          { token }
        );
        if (!cancelled) setHostBoxTrailPins(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setHostBoxTrailPins([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, hostEditingBoxId]);

  const trailsMerged = useMemo(
    () => applyTrailLocalPatches(trails, trailLocalPatches, user?.id),
    [trails, trailLocalPatches, user?.id]
  );

  const followingUserIdSet = useMemo(
    () =>
      new Set(
        (followingUsers || [])
          .map((u) => Number(u.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    [followingUsers]
  );

  const trailsForMap = useMemo(() => {
    if (!mapShowTrails) return [];
    let t = trailsMerged;
    const uid = user?.id != null ? Number(user.id) : null;
    if (mapTrailsScope === "following" && followingUserIdSet.size > 0) {
      t = t.filter((tr) => followingUserIdSet.has(Number(tr.creator_user_id)));
    } else if (mapTrailsScope === "mine" && uid != null && Number.isFinite(uid)) {
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
      if (set.size > 0) {
        t = t.filter((tr) => set.has(Number(tr.id)));
      }
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

  const nearTrailReferenceTrails = useMemo(() => {
    if (!mapBoxesNearTrailsOnly) return [];
    const allTrails = Array.isArray(trailsForMap) ? trailsForMap : [];
    if (allTrails.length === 0) return [];
    const uid = user?.id != null ? Number(user.id) : null;
    if (mapNearTrailsMode === "mine" && Number.isFinite(uid)) {
      return allTrails.filter((trail) => Number(trail.creator_user_id) === uid);
    }
    if (mapNearTrailsMode === "picked") {
      const picks = new Set(
        (mapTrailPickIds || []).map((x) => Number(x)).filter(Number.isFinite)
      );
      const pickedTrails = allTrails.filter((trail) =>
        picks.has(Number(trail.id))
      );
      return pickedTrails.length > 0
        ? pickedTrails
        : allTrails.filter(
            (trail) => Number(trail.id) === Number(selectedTrailId)
          );
    }
    if (mapNearTrailsMode === "one") {
      return allTrails.filter(
        (trail) => Number(trail.id) === Number(mapNearSingleTrailId)
      );
    }
    return allTrails;
  }, [
    mapBoxesNearTrailsOnly,
    trailsForMap,
    user?.id,
    mapNearTrailsMode,
    mapTrailPickIds,
    selectedTrailId,
    mapNearSingleTrailId,
  ]);

  const nearTrailDistanceByBoxId = useMemo(() => {
    const byId = {};
    if (!mapBoxesNearTrailsOnly || nearTrailReferenceTrails.length === 0) {
      return byId;
    }
    for (const box of boxes || []) {
      const bid = Number(box.id);
      if (!Number.isFinite(bid)) continue;
      byId[bid] = minDistanceKmFromBoxToTrails(box, nearTrailReferenceTrails);
    }
    return byId;
  }, [mapBoxesNearTrailsOnly, boxes, nearTrailReferenceTrails]);

  const nearTrailCompatibleBoxIds = useMemo(() => {
    if (!mapBoxesNearTrailsOnly || nearTrailReferenceTrails.length === 0) {
      return [];
    }
    const km = Math.max(0.1, parseFloat(mapTrailProximityKm) || 2);
    return Object.entries(nearTrailDistanceByBoxId)
      .filter(([, distance]) => Number(distance) <= km)
      .map(([id]) => Number(id))
      .filter(Number.isFinite);
  }, [
    mapBoxesNearTrailsOnly,
    nearTrailReferenceTrails,
    mapTrailProximityKm,
    nearTrailDistanceByBoxId,
  ]);
  const activePlanBoxIdsForMapFilter = useMemo(() => {
    const detail = selectedRoutePlanDetail;
    if (!detail) return [];
    const pid = Number(detail.id);
    if (!Number.isFinite(pid) || Number(selectedRoutePlanId) !== pid) return [];
    const boxes = Array.isArray(detail.boxes) ? detail.boxes : [];
    return boxes.map((b) => Number(b.id)).filter((id) => Number.isFinite(id));
  }, [selectedRoutePlanDetail, selectedRoutePlanId]);

  const boxesForMap = useMemo(() => {
    if (!mapShowBoxes) return [];
    let list = boxes;
    if (mapTrailsScope === "following" && followingUserIdSet.size > 0) {
      const fromFollowing =
        Array.isArray(followingBoxes) && followingBoxes.length > 0
          ? followingBoxes
          : boxes;
      list = fromFollowing.filter((b) =>
        followingUserIdSet.has(Number(b.host_user_id))
      );
    }
    if (
      mapListSource === "viewport" &&
      mapViewportBounds &&
      mapExplorerLastSearchSource !== "viewport"
    ) {
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
      // In plan-only mode, keep plan boxes visible even if user unselects one.
      if (activePlanBoxIdsForMapFilter.length > 0) {
        activePlanBoxIdsForMapFilter.forEach((id) => picks.add(Number(id)));
      }
      if (picks.size > 0) {
        list = list.filter((b) => picks.has(Number(b.id)));
      }
    }
    if (mapBoxesNearTrailsOnly) {
      const nearSet = new Set(
        nearTrailCompatibleBoxIds.map((x) => Number(x)).filter(Number.isFinite)
      );
      if (!mapNearShowAllOnMap) {
        list = list.filter((box) => nearSet.has(Number(box.id)));
      }
    }
    if (
      mapBoxesSlotCompatibleOnly &&
      explorerSlotWellFormed(bookingDate, startTime, endTime)
    ) {
      const bd = String(bookingDate || "").trim();
      list = list.filter((box) =>
        isSlotMatchingSchedule(
          box.availability_schedule_json,
          bd,
          startTime,
          endTime
        )
      );
    }
    return list;
  }, [
    boxes,
    mapViewportBounds,
    mapExplorerLastSearchSource,
    mapListSource,
    mapShowBoxes,
    mapBoxCriteriaTags,
    mapBoxSelectionMode,
    mapPickedBoxIds,
    activePlanBoxIdsForMapFilter,
    mapBoxesNearTrailsOnly,
    mapTrailProximityKm,
    nearTrailCompatibleBoxIds,
    mapNearShowAllOnMap,
    mapBoxesSlotCompatibleOnly,
    bookingDate,
    startTime,
    endTime,
    mapTrailsScope,
    followingUserIdSet,
    followingBoxes,
  ]);

  const boxesForExplorerList = useMemo(() => {
    const compatibleSet = new Set(
      nearTrailCompatibleBoxIds.map((x) => Number(x)).filter(Number.isFinite)
    );
    const source = mapBoxesNearTrailsOnly
      ? boxesForMap.filter((b) => compatibleSet.has(Number(b.id)))
      : boxesForMap;
    const list = [...source];
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
      case "slot_match": {
        const rank = (b) =>
          isSlotMatchingSchedule(
            b.availability_schedule_json,
            bookingDate,
            startTime,
            endTime
          )
            ? 1
            : 0;
        list.sort((a, b) => {
          const d = rank(b) - rank(a);
          if (d !== 0) return d;
          return (
            (Number(a.distance_km) || 1e9) - (Number(b.distance_km) || 1e9)
          );
        });
        break;
      }
      default:
        if (mapBoxesNearTrailsOnly) {
          list.sort((a, b) => {
            const da = Number(nearTrailDistanceByBoxId[Number(a.id)]);
            const db = Number(nearTrailDistanceByBoxId[Number(b.id)]);
            if (da !== db) return da - db;
            const aReservable = canBook ? 1 : 0;
            const bReservable = canBook ? 1 : 0;
            if (aReservable !== bReservable) return bReservable - aReservable;
            return (
              (Number(a.distance_km) || 1e9) - (Number(b.distance_km) || 1e9)
            );
          });
        } else if (list.some((b) => b.distance_km != null)) {
          list.sort(
            (a, b) =>
              (Number(a.distance_km) || 1e9) - (Number(b.distance_km) || 1e9)
          );
        }
        break;
    }
    return list;
  }, [
    boxesForMap,
    mapBoxSort,
    mapBoxesNearTrailsOnly,
    nearTrailCompatibleBoxIds,
    nearTrailDistanceByBoxId,
    canBook,
    bookingDate,
    startTime,
    endTime,
  ]);

  const trailsForExplorerList = useMemo(() => {
    const list = [...(trailsForMap || [])];
    const diffRank = (d) => {
      if (d === "easy") return 0;
      if (d === "medium") return 1;
      if (d === "hard") return 2;
      return 3;
    };
    switch (mapTrailListSort) {
      case "relevance_desc":
        list.sort((a, b) => {
          const ca = Number(a.relevance_count) || 0;
          const cb = Number(b.relevance_count) || 0;
          if (ca === 0 && cb > 0) return 1;
          if (cb === 0 && ca > 0) return -1;
          const avgDiff =
            (Number(b.relevance_avg_score) || 0) -
            (Number(a.relevance_avg_score) || 0);
          if (avgDiff !== 0) return avgDiff;
          return (Number(b.tip_count) || 0) - (Number(a.tip_count) || 0);
        });
        break;
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
    trailsMerged.find(
      (trail) => Number(trail.id) === Number(selectedTrailId)
    ) || null;

  // Ne pas désélectionner la trace au zoom / filtre viewport : la trace reste active
  // tant que l'utilisateur ne change pas de sélection explicitement.

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
      // Compte unique : rôle API « both » ; les casquettes se choisissent après.
      const result = await apiFetch("/auth/register", {
        method: "POST",
        body: { fullName: name, email: mail, password, role: "both" },
      });
      const starterCaps = { user: true, host: false, ravito: false };
      if (result.user?.id) {
        writeCapabilities(result.user.id, starterCaps);
        setCapabilitiesState(starterCaps);
      }
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      if (result.accountRecoveryCode) {
        setRecoveryCodeReveal({
          code: result.accountRecoveryCode,
          session: {
            token: result.token,
            refreshToken: result.refreshToken,
            user: result.user,
          },
        });
        return;
      }
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      writeAuthSession({
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (error) {
      userAlert("Inscription impossible", error.message);
    } finally {
      setAuthLoading(false);
    }
  }, [fullName, email, password]);

  const completeRecoveryCodeReveal = useCallback(() => {
    const pending = recoveryCodeReveal?.session;
    if (!pending?.token) {
      setRecoveryCodeReveal(null);
      return;
    }
    setToken(pending.token);
    setRefreshToken(pending.refreshToken);
    setUser(pending.user);
    writeAuthSession({
      token: pending.token,
      refreshToken: pending.refreshToken,
      user: pending.user,
    });
    setRecoveryCodeReveal(null);
  }, [recoveryCodeReveal]);

  const showRecoveryCodeReveal = useCallback((code) => {
    const c = String(code || "").trim();
    if (!c) return;
    setRecoveryCodeReveal({ code: c, session: null });
  }, []);

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
      writeAuthSession({
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (error) {
      userAlert("Connexion refusée", error.message);
    } finally {
      setAuthLoading(false);
    }
  }, [email, password]);

  const openPasswordReset = useCallback(() => {
    setResetStep("confirm");
    setPassword("");
  }, []);

  const confirmPasswordReset = useCallback(
    async (recoveryCodeInput) => {
      const mail = email.trim().toLowerCase();
      const recoveryCode = String(recoveryCodeInput || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (!recoveryCode || recoveryCode.length < 8) {
        userAlert(
          "Code de compte",
          "Saisis le code reçu à l’inscription (ex. RB-XXXX-XXXX-XXXX)."
        );
        return;
      }
      if (!password || password.length < 6) {
        userAlert("Mot de passe", "Choisis un nouveau mot de passe (6 caractères min.).");
        return;
      }
      setAuthLoading(true);
      try {
        const result = await apiFetch("/auth/password-reset/confirm", {
          method: "POST",
          body: { email: mail, recoveryCode, newPassword: password },
        });
        setResetStep("idle");
        setPassword("");
        setAuthMode("login");
        if (result.accountRecoveryCode) {
          showRecoveryCodeReveal(result.accountRecoveryCode);
        } else {
          userAlert(
            "Mot de passe mis à jour",
            "Connecte-toi avec ton nouveau mot de passe."
          );
        }
      } catch (error) {
        userAlert("Erreur", error.message);
      } finally {
        setAuthLoading(false);
      }
    },
    [email, password]
  );

  const cancelPasswordReset = useCallback(() => {
    setResetStep("idle");
    setPassword("");
    setAuthMode("login");
  }, []);

  const fetchRecoveryCodeStatus = async () => {
    if (!token) return { hasRecoveryCode: false };
    return apiFetch("/users/me/recovery-code/status", { token });
  };

  const regenerateRecoveryCode = async ({ currentPassword }) => {
    if (!token) return null;
    const result = await apiFetch("/users/me/recovery-code/regenerate", {
      method: "POST",
      token,
      body: { currentPassword },
    });
    return result.accountRecoveryCode || null;
  };

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
      clearAuthSession();
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      setTrailLocalPatches({});
      setBoxes([]);
      setTrails([]);
      setHostBoxes([]);
      setHostBoxTrailPins([]);
      setHostEditingBoxId(null);
      setHostRefunds([]);
      setHostBookings([]);
      setAthleteBookings([]);
      setFollowingUsers([]);
      setFollowingBoxes([]);
      setRoutePlans([]);
      setSelectedRoutePlanId(null);
      setSelectedRoutePlanDetail(null);
      setMapTrailsScope("all");
      setAuthMode("login");
    }
  };

  const updateMyRole = async (nextRole, { silent } = {}) => {
    if (!token) return null;
    try {
      const result = await apiFetch("/users/me/role", {
        method: "PATCH",
        token,
        body: { role: nextRole },
      });
      setUser(result.user);
      if (!silent) {
        userAlert(
          "Profil mis à jour",
          `Activités synchronisées (${
            ROLE_LABELS[result.user.role] || result.user.role
          }).`
        );
      }
      return result.user;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const updateCapabilities = async (nextCaps) => {
    if (!user?.id || capabilitiesBusy) return;
    const safe = {
      user: !!nextCaps?.user,
      host: !!nextCaps?.host,
      ravito: !!nextCaps?.ravito,
    };
    if (!safe.user && !safe.host && !safe.ravito) {
      safe.user = true;
    }
    setCapabilitiesBusy(true);
    try {
      writeCapabilities(user.id, safe);
      setCapabilitiesState(safe);
      const nextRole = roleFromCapabilities(safe);
      if (String(user.role) !== nextRole) {
        await updateMyRole(nextRole, { silent: true });
      }
      userAlert(
        "Activités mises à jour",
        formatCapabilitiesLabel(safe)
      );
    } finally {
      setCapabilitiesBusy(false);
    }
  };

  const changeMyPassword = async ({ currentPassword, newPassword }) => {
    if (!token) return;
    await apiFetch("/users/me/password", {
      method: "PATCH",
      token,
      body: { currentPassword, newPassword },
    });
    userAlert("Compte", "Mot de passe modifié.");
  };

  const loadBoxes = async () => {
    const q = city.trim();
    if (q.length < 2) return;
    try {
      const rows = await apiFetch(`/boxes?city=${encodeURIComponent(q)}`);
      setBoxes(rows);
      setSelectedBoxId((prev) =>
        prev != null && rows.some((b) => Number(b.id) === Number(prev))
          ? prev
          : rows.length > 0
          ? rows[0].id
          : null
      );
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

  const deleteHostBoxTrailPin = async (boxId, pinId) => {
    if (!token) return;
    const bid = Number(boxId);
    const pid = Number(pinId);
    if (!Number.isFinite(bid) || !Number.isFinite(pid)) return;
    try {
      await apiFetch(`/host/boxes/${bid}/trail-pins/${pid}`, {
        method: "DELETE",
        token,
      });
      const rows = await apiFetch(`/host/boxes/${bid}/trail-pins`, { token });
      setHostBoxTrailPins(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const addHostBoxTrailPin = async (
    boxId,
    { trailId, hostNote, isHighlight }
  ) => {
    if (!token) return false;
    const bid = Number(boxId);
    const tid = Number(trailId);
    if (!Number.isFinite(bid) || !Number.isFinite(tid)) return false;
    try {
      await apiFetch(`/host/boxes/${bid}/trail-pins`, {
        method: "POST",
        token,
        body: {
          trailId: tid,
          hostNote:
            hostNote && String(hostNote).trim() !== ""
              ? String(hostNote).trim()
              : undefined,
          isHighlight: Boolean(isHighlight),
        },
      });
      const rows = await apiFetch(`/host/boxes/${bid}/trail-pins`, { token });
      setHostBoxTrailPins(Array.isArray(rows) ? rows : []);
      return true;
    } catch (error) {
      userAlert("Erreur", error.message);
      return false;
    }
  };

  const patchHostBoxTrailPin = async (boxId, pinId, body) => {
    if (!token) return;
    const bid = Number(boxId);
    const pid = Number(pinId);
    if (!Number.isFinite(bid) || !Number.isFinite(pid)) return;
    try {
      await apiFetch(`/host/boxes/${bid}/trail-pins/${pid}`, {
        method: "PATCH",
        token,
        body,
      });
      const rows = await apiFetch(`/host/boxes/${bid}/trail-pins`, { token });
      setHostBoxTrailPins(Array.isArray(rows) ? rows : []);
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

  const loadFollowingUsers = useCallback(async () => {
    if (!token) {
      setFollowingUsers([]);
      setFollowingBoxes([]);
      return [];
    }
    try {
      const rows = await apiFetch("/users/me/following", { token });
      const list = Array.isArray(rows) ? rows : [];
      setFollowingUsers(list);
      return list;
    } catch (error) {
      userAlert("Erreur", error.message);
      return [];
    }
  }, [token]);

  const loadFollowingBoxes = useCallback(async () => {
    if (!token) {
      setFollowingBoxes([]);
      return [];
    }
    try {
      const q = city.trim();
      const suffix =
        q.length >= 2
          ? `?city=${encodeURIComponent(q)}&limit=120`
          : "?limit=120";
      const rows = await apiFetch(`/users/me/following/boxes${suffix}`, {
        token,
      });
      const list = Array.isArray(rows) ? rows : [];
      setFollowingBoxes(list);
      return list;
    } catch (error) {
      userAlert("Erreur", error.message);
      return [];
    }
  }, [token, city]);

  const followUser = useCallback(
    async (userId) => {
      const id = Number(userId);
      if (!token || !Number.isFinite(id) || id <= 0) return false;
      await apiFetch(`/users/${id}/follow`, { method: "POST", token });
      await loadFollowingUsers();
      if (mapTrailsScope === "following") {
        await loadFollowingBoxes();
      }
      return true;
    },
    [token, loadFollowingUsers, loadFollowingBoxes, mapTrailsScope]
  );

  const unfollowUser = useCallback(
    async (userId) => {
      const id = Number(userId);
      if (!token || !Number.isFinite(id) || id <= 0) return false;
      await apiFetch(`/users/${id}/follow`, { method: "DELETE", token });
      setFollowingUsers((prev) => {
        const next = (prev || []).filter((u) => Number(u.id) !== id);
        if (mapTrailsScope === "following" && next.length === 0) {
          setMapTrailsScope("all");
        }
        return next;
      });
      setFollowingBoxes((prev) =>
        (prev || []).filter((b) => Number(b.host_user_id) !== id)
      );
      return true;
    },
    [token, mapTrailsScope]
  );

  const handleUserReviewsFollowChange = useCallback(
    async (userId, shouldFollow) => {
      if (shouldFollow) await followUser(userId);
      else await unfollowUser(userId);
    },
    [followUser, unfollowUser]
  );

  const showFollowingOnMap = useCallback(() => {
    setMapShowTrails(true);
    setMapShowBoxes(true);
    setMapTrailsScope("following");
    setMapExplorerCameraFollowSearch(true);
    setMapExplorerRecenterNonce((n) => n + 1);
    mainTabNavigationRef.current?.navigate?.("Carte");
    void loadFollowingBoxes();
  }, [loadFollowingBoxes]);

  useEffect(() => {
    if (!sessionReady || !token) return;
    void loadFollowingUsers();
  }, [sessionReady, token, loadFollowingUsers]);

  useEffect(() => {
    if (mapTrailsScope !== "following" || !token) return;
    void loadFollowingBoxes();
  }, [mapTrailsScope, token, city, loadFollowingBoxes]);

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

  const notifyBookingEnRoute = async (bookingId, etaMinutes = 10) => {
    if (!token) return;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return;
    try {
      await apiFetch(`/bookings/${bid}/en-route`, {
        method: "POST",
        token,
        body: { etaMinutes: Number(etaMinutes) || 10 },
      });
      userAlert(
        "Préavis envoyé",
        `L’hôte a été prévenu : tu es à ~${Number(etaMinutes) || 10} min.`
      );
      await loadAthleteBookings();
      await loadNotifications();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const pushBookingLiveLocation = async (bookingId) => {
    if (!token) return null;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return null;
    const pos = await getDevicePosition();
    return apiFetch(`/bookings/${bid}/live-location`, {
      method: "POST",
      token,
      body: {
        lat: pos.lat,
        lon: pos.lon,
        accuracyM: pos.accuracy,
        sharing: true,
      },
    });
  };

  const stopBookingLiveLocation = async (bookingId) => {
    if (!token) return;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return;
    await apiFetch(`/bookings/${bid}/live-location/stop`, {
      method: "POST",
      token,
    });
  };

  const fetchBookingLiveLocation = async (bookingId) => {
    if (!token) return null;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return null;
    return apiFetch(`/bookings/${bid}/live-location`, { token });
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
          setSelectedBoxId((prev) =>
            prev != null && rows.some((b) => Number(b.id) === Number(prev))
              ? prev
              : rows.length > 0
              ? rows[0].id
              : null
          );
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
          let rows = [];
          if (west <= east) {
            rows = await apiFetch(
              `/boxes/bounds?south=${encodeURIComponent(
                south
              )}&west=${encodeURIComponent(west)}&north=${encodeURIComponent(
                north
              )}&east=${encodeURIComponent(east)}&limit=200`
            );
          } else {
            const [rowsA, rowsB] = await Promise.all([
              apiFetch(
                `/boxes/bounds?south=${encodeURIComponent(
                  south
                )}&west=${encodeURIComponent(west)}&north=${encodeURIComponent(
                  north
                )}&east=${encodeURIComponent(180)}&limit=200`
              ),
              apiFetch(
                `/boxes/bounds?south=${encodeURIComponent(
                  south
                )}&west=${encodeURIComponent(-180)}&north=${encodeURIComponent(
                  north
                )}&east=${encodeURIComponent(east)}&limit=200`
              ),
            ]);
            const merged = [...(rowsA || []), ...(rowsB || [])];
            const seen = new Set();
            rows = merged.filter((b) => {
              const id = Number(b?.id);
              if (!Number.isFinite(id)) return false;
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          }
          if (reqId !== explorerSearchSeqRef.current) return;
          if (Array.isArray(rows) && rows.length === 0) {
            setBoxes((prev) => {
              const base = Array.isArray(prev) ? prev : [];
              const fallback = base.filter((box) =>
                pointInBounds(
                  Number(box.latitude),
                  Number(box.longitude),
                  bounds
                )
              );
              return fallback.length > 0 ? fallback : rows;
            });
          } else {
            setBoxes(rows);
          }
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
        setSelectedBoxId((prev) =>
          prev != null && rows.some((b) => Number(b.id) === Number(prev))
            ? prev
            : rows.length > 0
            ? rows[0].id
            : null
        );
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
      const rows = await apiFetch("/trails", { token: token || undefined });
      setTrails(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadRoutePlans = async ({ trailId } = {}) => {
    if (!token) return [];
    try {
      const suffix =
        Number.isFinite(Number(trailId)) && Number(trailId) > 0
          ? `?trailId=${Number(trailId)}`
          : "";
      const rows = await apiFetch(`/route-plans${suffix}`, { token });
      const list = Array.isArray(rows) ? rows : [];
      setRoutePlans(list);
      return list;
    } catch (error) {
      userAlert("Erreur", error.message);
      return [];
    }
  };

  const loadRoutePlanDetail = async (routePlanId) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      const detail = await apiFetch(`/route-plans/${pid}`, { token });
      setSelectedRoutePlanId(pid);
      setSelectedRoutePlanDetail(detail || null);
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const refreshRoutePlanBookingLinks = async () => {
    await loadRoutePlans().catch(() => {});
    const pid = Number(selectedRoutePlanId);
    if (Number.isFinite(pid) && pid > 0) {
      await loadRoutePlanDetail(pid);
    }
  };

  const createRoutePlanFromSelection = async ({
    trailId,
    boxIds,
    name,
    notes,
    silent = false,
  } = {}) => {
    if (!token) return null;
    const tid = Number(trailId);
    const ids = Array.isArray(boxIds)
      ? boxIds.map((x) => Number(x)).filter(Number.isFinite)
      : [];
    if (!Number.isFinite(tid) || tid <= 0) {
      userAlert("Planification", "Sélectionne une trace pour créer ton plan.");
      return null;
    }
    setRoutePlanBusy(true);
    try {
      const detail = await apiFetch("/route-plans", {
        method: "POST",
        token,
        body: {
          trailId: tid,
          boxIds: ids,
          ...(name ? { name } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      await loadRoutePlans();
      setSelectedRoutePlanId(Number(detail?.id) || null);
      setSelectedRoutePlanDetail(detail || null);
      if (!silent) {
        userAlert(
          "Projet créé",
          "Ajoute des box ou un ravito GPS, puis suis Demande → Validation → Paiement."
        );
      }
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    } finally {
      setRoutePlanBusy(false);
    }
  };

  /** Import GPX pour le wizard projet (retourne la trace créée). */
  const uploadGpxForProject = async ({ activity, name } = {}) => {
    if (!token) return null;
    const act = activity || trailImportActivity || "trail_run";
    try {
      if (Platform.OS === "web") {
        const file = await new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".gpx,application/gpx+xml";
          input.onchange = () => resolve(input.files?.[0] || null);
          input.click();
        });
        if (!file) return null;
        const formData = new globalThis.FormData();
        formData.append(
          "name",
          (name || file.name || "trace").replace(/\.gpx$/i, "")
        );
        formData.append(
          "territory",
          trailImportTerritory?.trim() || city || "unknown"
        );
        formData.append("difficulty", trailDifficulty);
        formData.append("activity", act);
        formData.append("criteriaTags", JSON.stringify([]));
        formData.append("gpx", file);
        const data = await uploadGpxWithFormData(formData);
        await loadTrails();
        return data?.trail || data;
      }
      const picked = await DocumentPicker.getDocumentAsync({ type: ["*/*"] });
      if (picked.canceled) return null;
      const file = picked.assets[0];
      const formData = new FormData();
      formData.append(
        "name",
        (name || file.name || "trace").replace(/\.gpx$/i, "")
      );
      formData.append(
        "territory",
        trailImportTerritory?.trim() || city || "unknown"
      );
      formData.append("difficulty", trailDifficulty);
      formData.append("activity", act);
      formData.append("criteriaTags", JSON.stringify([]));
      formData.append("gpx", {
        uri: file.uri,
        name: file.name || "trace.gpx",
        type: file.mimeType || "application/gpx+xml",
      });
      const data = await uploadGpxWithFormData(formData);
      await loadTrails();
      return data?.trail || data;
    } catch (error) {
      userAlert("Import GPX", error.message);
      throw error;
    }
  };

  const createAdventureProject = async ({
    name,
    activity,
    needs,
    trailId,
  } = {}) => {
    const actLabel =
      PROJECT_ACTIVITIES.find((a) => a.id === activity)?.label ||
      activity ||
      "Trail";
    const notesParts = [
      `Activité : ${actLabel}`,
      needs ? `Besoins projet : ${needs}` : null,
      "Funnel : demande → validation fournisseur → paiement.",
    ].filter(Boolean);
    return createRoutePlanFromSelection({
      trailId,
      boxIds: [],
      name,
      notes: notesParts.join("\n"),
      silent: true,
    });
  };

  const upsertRoutePlanBoxes = async (
    routePlanId,
    { boxIds = [], mergeWithExisting = true } = {}
  ) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    const incomingIds = Array.isArray(boxIds)
      ? boxIds.map((x) => Number(x)).filter(Number.isFinite)
      : [];
    if (!Number.isFinite(pid) || pid <= 0 || incomingIds.length === 0) {
      userAlert("Planification", "Sélectionne au moins une box à ajouter.");
      return null;
    }
    let baseDetail = null;
    if (Number(selectedRoutePlanId) === pid && selectedRoutePlanDetail) {
      baseDetail = selectedRoutePlanDetail;
    } else {
      baseDetail = await loadRoutePlanDetail(pid);
    }
    const existingIds = Array.isArray(baseDetail?.boxes)
      ? baseDetail.boxes
          .map((b) => Number(b.id))
          .filter((id) => Number.isFinite(id))
      : [];
    const finalIds = mergeWithExisting
      ? Array.from(new Set([...existingIds, ...incomingIds]))
      : Array.from(new Set(incomingIds));
    if (finalIds.length === 0) {
      userAlert("Planification", "Le plan doit garder au moins une box.");
      return null;
    }
    setRoutePlanBusy(true);
    try {
      let detail = null;
      try {
        detail = await apiFetch(`/route-plans/${pid}/boxes`, {
          method: "PATCH",
          token,
          body: { boxIds: finalIds },
        });
      } catch (_e) {
        detail = await apiFetch(`/route-plans/${pid}/boxes/update`, {
          method: "POST",
          token,
          body: { boxIds: finalIds },
        });
      }
      setSelectedRoutePlanId(pid);
      setSelectedRoutePlanDetail(detail || null);
      setMapPickedBoxIds(finalIds);
      await loadRoutePlans().catch(() => {});
      const addedCount = Math.max(0, finalIds.length - existingIds.length);
      userAlert(
        "Plan mis à jour",
        addedCount > 0
          ? `${addedCount} box ajoutée${
              addedCount > 1 ? "s" : ""
            } au plan existant.`
          : "Aucune nouvelle box à ajouter (déjà présentes dans le plan)."
      );
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    } finally {
      setRoutePlanBusy(false);
    }
  };

  const loadTrailTips = async (trailId) => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) return [];
    try {
      return await apiFetch(`/trails/${tid}/tips`);
    } catch (_e) {
      return [];
    }
  };

  const loadSharedPlansForTrail = async (trailId) => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) return [];
    try {
      return await apiFetch(`/trails/${tid}/shared-plans`);
    } catch (_e) {
      return [];
    }
  };

  const loadSharedRoutePlan = async (routePlanId) => {
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      return await apiFetch(`/route-plans/shared/${pid}`);
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const loadDiscoverRoutePlans = async ({
    city: cityQ,
    scope = "others",
    useCity = false,
  } = {}) => {
    try {
      const params = new URLSearchParams();
      if (scope) params.set("scope", String(scope));
      if (useCity) {
        params.set("useCity", "true");
        const c = String(cityQ ?? city ?? "").trim();
        if (c.length >= 2) params.set("city", c);
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      return await apiFetch(`/route-plans/discover${query}`, {
        token: token || undefined,
      });
    } catch (_e) {
      return [];
    }
  };

  const checkResourceRelevanceEligibility = async ({
    resourceType,
    resourceId,
  } = {}) => {
    if (!token) return { eligible: false, message: "Connexion requise." };
    const rid = Number(resourceId);
    if (!Number.isFinite(rid) || rid <= 0) {
      return { eligible: false, message: "Ressource invalide." };
    }
    try {
      const params = new URLSearchParams({
        resourceType: String(resourceType),
        resourceId: String(rid),
      });
      return await apiFetch(`/relevance/eligibility?${params}`, { token });
    } catch (error) {
      return {
        eligible: false,
        message: error.message || "Éligibilité indisponible.",
      };
    }
  };

  const setResourceRelevance = async ({
    resourceType,
    resourceId,
    score,
  } = {}) => {
    if (!token) {
      userAlert(
        "Connexion",
        "Connecte-toi pour indiquer la pertinence (note 1 à 5)."
      );
      return null;
    }
    const rid = Number(resourceId);
    if (!Number.isFinite(rid) || rid <= 0) return null;
    try {
      const stats = await apiFetch("/relevance", {
        method: "POST",
        token,
        body: {
          resourceType,
          resourceId: rid,
          score: Number(score),
        },
      });
      if (resourceType === "trail") {
        await loadTrails();
      } else if (resourceType === "plan") {
        await loadRoutePlans();
        const pid = Number(selectedRoutePlanId);
        if (Number.isFinite(pid) && pid === rid) {
          await loadRoutePlanDetail(pid);
        }
      }
      return stats;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const forkRoutePlan = async (routePlanId, { name } = {}) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    setRoutePlanBusy(true);
    try {
      const detail = await apiFetch(`/route-plans/${pid}/fork`, {
        method: "POST",
        token,
        body: name ? { name } : {},
      });
      await loadRoutePlans();
      setSelectedRoutePlanId(Number(detail?.id) || null);
      setSelectedRoutePlanDetail(detail || null);
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    } finally {
      setRoutePlanBusy(false);
    }
  };

  const createTrailTip = async (trailId, payload = {}) => {
    if (!token) return null;
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) return null;
    try {
      return await apiFetch(`/trails/${tid}/tips`, {
        method: "POST",
        token,
        body: payload,
      });
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const deleteTrailTip = async (trailId, tipId) => {
    if (!token) return false;
    const tid = Number(trailId);
    const id = Number(tipId);
    if (!Number.isFinite(tid) || !Number.isFinite(id)) return false;
    try {
      await apiFetch(`/trails/${tid}/tips/${id}`, {
        method: "DELETE",
        token,
      });
      return true;
    } catch (error) {
      userAlert("Erreur", error.message);
      return false;
    }
  };

  const updateRoutePlan = async (routePlanId, { name, notes, visibility } = {}) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      const payload = {
        ...(name != null ? { name } : {}),
        ...(notes != null ? { notes } : {}),
        ...(visibility != null ? { visibility } : {}),
      };
      let detail = null;
      try {
        detail = await apiFetch(`/route-plans/${pid}`, {
          method: "PATCH",
          token,
          body: payload,
        });
      } catch (_e) {
        detail = await apiFetch(`/route-plans/${pid}/update`, {
          method: "POST",
          token,
          body: payload,
        });
      }
      setRoutePlans((prev) =>
        (Array.isArray(prev) ? prev : []).map((p) =>
          Number(p.id) === pid
            ? {
                ...p,
                ...(detail?.name != null ? { name: detail.name } : {}),
                ...(detail?.notes !== undefined ? { notes: detail.notes } : {}),
                ...(detail?.visibility != null
                  ? { visibility: detail.visibility }
                  : {}),
              }
            : p
        )
      );
      setSelectedRoutePlanDetail(detail || null);
      await loadRoutePlans().catch(() => {});
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const deleteRoutePlan = async (routePlanId) => {
    if (!token) return false;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      try {
        await apiFetch(`/route-plans/${pid}`, { method: "DELETE", token });
      } catch (_e) {
        await apiFetch(`/route-plans/${pid}/delete`, {
          method: "POST",
          token,
        });
      }
      setRoutePlans((prev) =>
        (Array.isArray(prev) ? prev : []).filter((p) => Number(p.id) !== pid)
      );
      if (Number(selectedRoutePlanId) === pid) {
        setSelectedRoutePlanId(null);
        setSelectedRoutePlanDetail(null);
      }
      await loadRoutePlans().catch(() => {});
      return true;
    } catch (error) {
      userAlert("Erreur", error.message);
      return false;
    }
  };

  const updateRoutePlanBoxComment = async (routePlanId, boxId, comment) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    const bid = Number(boxId);
    if (!Number.isFinite(pid) || !Number.isFinite(bid)) return null;
    try {
      let detail = null;
      try {
        detail = await apiFetch(`/route-plans/${pid}/boxes/${bid}`, {
          method: "PATCH",
          token,
          body: { comment: comment ?? "" },
        });
      } catch (_e) {
        detail = await apiFetch(`/route-plans/${pid}/boxes/${bid}/update`, {
          method: "POST",
          token,
          body: { comment: comment ?? "" },
        });
      }
      setSelectedRoutePlanDetail(detail || null);
      await loadRoutePlans();
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const addRoutePlanTrailNote = async (routePlanId, payload = {}) => {
    if (!token) return false;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    const noteText = String(payload.note || "").trim();
    if (!noteText) {
      userAlert("Plan", "Écris une note parcours.");
      return false;
    }
    try {
      const detail = await apiFetch(`/route-plans/${pid}/trail-notes`, {
        method: "POST",
        token,
        body: payload,
      });
      setSelectedRoutePlanDetail(detail || null);
      return true;
    } catch (error) {
      userAlert("Erreur", error.message);
      return false;
    }
  };

  const updateRoutePlanTrailNote = async (
    routePlanId,
    noteId,
    payload = {}
  ) => {
    if (!token) return null;
    const pid = Number(routePlanId);
    const nid = Number(noteId);
    if (!Number.isFinite(pid) || !Number.isFinite(nid)) return null;
    try {
      let detail = null;
      try {
        detail = await apiFetch(`/route-plans/${pid}/trail-notes/${nid}`, {
          method: "PATCH",
          token,
          body: payload,
        });
      } catch (_e) {
        detail = await apiFetch(
          `/route-plans/${pid}/trail-notes/${nid}/update`,
          {
            method: "POST",
            token,
            body: payload,
          }
        );
      }
      setSelectedRoutePlanDetail(detail || null);
      return detail || null;
    } catch (error) {
      userAlert("Erreur", error.message);
      return null;
    }
  };

  const deleteRoutePlanTrailNote = async (routePlanId, noteId) => {
    if (!token) return false;
    const pid = Number(routePlanId);
    const nid = Number(noteId);
    if (!Number.isFinite(pid) || !Number.isFinite(nid)) return false;
    try {
      let detail = null;
      try {
        detail = await apiFetch(`/route-plans/${pid}/trail-notes/${nid}`, {
          method: "DELETE",
          token,
        });
      } catch (_e) {
        detail = await apiFetch(
          `/route-plans/${pid}/trail-notes/${nid}/delete`,
          {
            method: "POST",
            token,
          }
        );
      }
      setSelectedRoutePlanDetail(detail || null);
      return true;
    } catch (error) {
      userAlert("Erreur", error.message);
      return false;
    }
  };

  const showRoutePlanOnMap = useCallback((routePlan, { silent = false } = {}) => {
    const boxesList = Array.isArray(routePlan?.boxes) ? routePlan.boxes : [];
    const boxIds = boxesList
      .map((b) => Number(b.id))
      .filter((id) => Number.isFinite(id));
    const tid = Number(routePlan?.trail_id);
    const hasTrail = Number.isFinite(tid) && tid > 0;
    if (boxIds.length === 0 && !hasTrail) {
      if (!silent) {
        userAlert(
          "Projet",
          "Aucune trace ni box dans ce projet pour l’instant."
        );
      }
      return;
    }
    setMapShowBoxes(true);
    setMapBoxesNearTrailsOnly(false);
    setMapShowTrails(true);
    setMapTrailsScope(hasTrail ? "picked" : "all");
    if (boxIds.length > 0) {
      setMapBoxSelectionMode("picked");
      setMapPickedBoxIds(boxIds);
      setSelectedBoxId(boxIds[0]);
      const first = boxesList.find((b) => Number(b.id) === boxIds[0]);
      const coords = parseMapCoords(first?.latitude, first?.longitude);
      if (coords) {
        setMapLat(coords.lat.toFixed(6));
        setMapLon(coords.lon.toFixed(6));
        setMapExplorerRecenterNonce((n) => n + 1);
      }
    } else {
      setMapBoxSelectionMode("all");
    }
    if (hasTrail) {
      setSelectedTrailId(tid);
      setMapTrailPickIds([tid]);
    }
    if (!silent) {
      const parts = [
        hasTrail ? "trace projet" : null,
        boxIds.length ? `${boxIds.length} box` : null,
      ].filter(Boolean);
      userAlert(
        "Projet sur la carte",
        parts.length
          ? `Affiché : ${parts.join(" · ")}.`
          : "Projet affiché sur la carte."
      );
    }
  }, []);

  const downloadRoutePlanGpx = async (
    routePlanId,
    {
      includePending = true,
      includeRejected = false,
      includeConnectorPaths = false,
    } = {}
  ) => {
    if (!token) return;
    const pid = Number(routePlanId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    try {
      const params = new URLSearchParams();
      if (includePending) params.set("includePending", "true");
      if (includeRejected) params.set("includeRejected", "true");
      if (includeConnectorPaths) params.set("includeConnectorPaths", "true");
      if (includeConnectorPaths) params.set("connectorMaxKm", "1");
      const query = params.toString() ? `?${params.toString()}` : "";
      const resp = await fetch(
        `${API_BASE_URL}/route-plans/${pid}/export-gpx${query}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Export GPX impossible");
      }
      const gpxText = await resp.text();
      if (Platform.OS === "web") {
        const blob = new Blob([gpxText], { type: "application/gpx+xml" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `plan-${pid}-enrichi.gpx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        return;
      }
      userAlert(
        "Export GPX",
        "Export prêt côté serveur. Sur mobile natif, utilise la version web pour télécharger le fichier GPX."
      );
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
    const bid = Number(boxId);
    const box = boxes.find((b) => Number(b.id) === bid);
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
      userAlert(
        "Créneau à corriger",
        `${blocking.join("\n")}\n\nAjuste la date et les heures dans « Créneau & demande », puis confirme la réservation.`
      );
      return;
    }
    setBookingConfirm({ visible: true, boxId: bid });
  };

  const openRavitoRequestAtPoint = useCallback(
    (point) => {
      if (!canBook) {
        userAlert(
          "Rôle athlète",
          "Seuls les comptes Athlète ou Les deux peuvent demander un ravito sur un point."
        );
        return;
      }
      if (!token) {
        userAlert("Connexion", "Connecte-toi pour publier une demande.");
        return;
      }
      const ctx = actionsRef.current.getRavitoPlanSyncContext?.() || {};
      const tid = point?.trailId ?? ctx.trailId;
      setRavitoRequestModal({
        visible: true,
        point: {
          ...(point || {}),
          trailId: tid != null ? Number(tid) : undefined,
          routePlanId:
            point?.routePlanId != null
              ? Number(point.routePlanId)
              : ctx.routePlanId != null
              ? Number(ctx.routePlanId)
              : undefined,
          boxIds: Array.isArray(point?.boxIds)
            ? point.boxIds
            : Array.isArray(ctx.boxIds)
            ? ctx.boxIds
            : [],
        },
      });
    },
    [canBook, token, actionsRef]
  );

  const closeRavitoRequestModal = useCallback(() => {
    setRavitoRequestModal({ visible: false, point: null });
  }, []);

  const submitRavitoRequest = useCallback(
    async (body) => {
      const point = ravitoRequestModal.point;
      const payload = {
        ...body,
        syncToPlan: true,
        trailId: body.trailId ?? point?.trailId,
        routePlanId: point?.routePlanId,
        boxIds: point?.boxIds,
      };
      const created = await apiFetch("/ravito-requests", {
        method: "POST",
        token,
        body: payload,
      });
      setRavitoRequestsRefreshNonce((n) => n + 1);
      const planId = Number(created?.routePlanId);
      const tid = Number(created?.trailId ?? payload.trailId);
      if (Number.isFinite(tid) && tid > 0) {
        setSelectedTrailId(tid);
      }
      if (Number.isFinite(planId) && planId > 0) {
        setSelectedRoutePlanId(planId);
        await loadRoutePlanDetail(planId);
        await loadRoutePlans();
      }
      await actionsRef.current.onRavitoRequestCreated?.(created, point);
      const planHint =
        Number.isFinite(planId) && planId > 0
          ? " Le point et les box cochées sont enregistrés dans ton plan (onglet Plans)."
          : "";
      userAlert(
        "Demande envoyée",
        `Les hôtes proches seront notifiés. Consulte l’onglet Réservations pour les propositions.${planHint}`
      );
      return created;
    },
    [
      token,
      ravitoRequestModal.point,
      loadRoutePlanDetail,
      loadRoutePlans,
      actionsRef,
    ]
  );

  const acceptRavitoProposal = useCallback(
    async (result) => {
      const bid = Number(result?.boxId);
      const mobile = result?.mobileRavito === true || !Number.isFinite(bid);
      if (result.bookingDate) {
        setBookingDate(String(result.bookingDate).slice(0, 10));
      }
      if (result.startTime) {
        setStartTime(String(result.startTime).slice(0, 5));
      }
      if (result.endTime) {
        setEndTime(String(result.endTime).slice(0, 5));
      }
      if (result.specialRequest != null) {
        setSpecialRequest(String(result.specialRequest || ""));
      }
      setRavitoRequestsRefreshNonce((n) => n + 1);
      const planId = Number(result?.routePlanId);
      if (Number.isFinite(planId) && planId > 0) {
        setSelectedRoutePlanId(planId);
        await loadRoutePlanDetail(planId);
        await loadRoutePlans();
      }
      if (mobile) {
        userAlert(
          "Ravito mobile accepté",
          "RDV au point GPS au créneau convenu. L’aidant a été notifié. Tu peux le prévenir avec « Je suis à ~10 min » si tu as aussi une réservation box, ou via le chat/notes du plan."
        );
        mainTabNavigationRef.current?.navigate?.("Reservations");
        return;
      }
      const box = boxes.find((b) => Number(b.id) === bid);
      if (box) {
        const bl = Number(box.latitude);
        const bLng = Number(box.longitude);
        if (Number.isFinite(bl) && Number.isFinite(bLng)) {
          setMapLat(bl.toFixed(6));
          setMapLon(bLng.toFixed(6));
        }
      }
      setSelectedBoxId(bid);
      setMapExplorerCameraFollowSearch(true);
      setMapExplorerRecenterNonce((n) => n + 1);
      mainTabNavigationRef.current?.navigate?.("Carte");
      bookBox(bid);
    },
    [
      boxes,
      bookBox,
      loadRoutePlanDetail,
      loadRoutePlans,
      setBookingDate,
      setStartTime,
      setEndTime,
      setSpecialRequest,
      setSelectedBoxId,
      setMapLat,
      setMapLon,
      setMapExplorerCameraFollowSearch,
      setMapExplorerRecenterNonce,
    ]
  );

  const confirmBookBox = async () => {
    const boxId = Number(bookingConfirm.boxId);
    if (!token || !Number.isFinite(boxId)) return;
    const box = boxes.find((b) => Number(b.id) === boxId);
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
      const planId = Number(selectedRoutePlanId);
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
          ...(Number.isFinite(planId) && planId > 0
            ? { routePlanId: planId }
            : {}),
        },
      });
      setBookingConfirm({ visible: false, boxId: null });
      const approval = String(result.approval_status || "pending");
      const offerLines = formatBoxOfferLines(box);
      const receiptLines = [
        `Box : ${box.title || `#${boxId}`}${box.city ? ` · ${box.city}` : ""}`,
        `Créneau : ${formatDateLongFr(bookingDate)} · ${startTime} → ${endTime}`,
        `Demande : ${bookingSpecialRequestLabel(
          result.special_request || specialRequest
        )}`,
        offerLines.length
          ? `Offre box : ${offerLines.join(" | ")}`
          : null,
        Number.isFinite(planId) && planId > 0
          ? `Projet lié : plan #${planId}`
          : null,
        approval === "accepted"
          ? "Validée — tu peux payer dans Réserver / Projets."
          : "Étape 1/3 : en attente de validation par l’hôte (puis paiement).",
        "Modifiable tant que tu n’as pas payé.",
      ].filter(Boolean);
      userAlert(
        "Demande envoyée",
        [...receiptLines, "Suivi : onglet Réservations (sans quitter la carte)."].join(
          "\n"
        )
      );
      await loadAthleteBookings();
      await refreshRoutePlanBookingLinks();
      // Reste sur Découvrir — évite le saut forcé vers Réservations.
    } catch (error) {
      userAlert("Erreur", error.message);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const cancelBookBoxConfirm = () => {
    if (bookingSubmitting) return;
    setBookingConfirm({ visible: false, boxId: null });
    setBookingUnavailableSlots([]);
  };

  useEffect(() => {
    if (
      !bookingConfirm.visible ||
      bookingConfirm.boxId == null ||
      !bookingDate
    ) {
      setBookingUnavailableSlots([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(
          `/boxes/${bookingConfirm.boxId}/unavailable?date=${encodeURIComponent(
            bookingDate
          )}`
        );
        if (cancelled) return;
        setBookingUnavailableSlots(
          Array.isArray(data?.slots)
            ? data.slots.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
              }))
            : []
        );
      } catch (_error) {
        if (!cancelled) setBookingUnavailableSlots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingConfirm.visible, bookingConfirm.boxId, bookingDate]);

  const uploadGpxWithFormData = async (
    formData,
    endpointPath = "/trails/upload-gpx"
  ) => {
    const response = await fetch(`${API_BASE_URL}${endpointPath}`, {
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
      formData.append(
        "territory",
        trailImportTerritory?.trim() || city || "unknown"
      );
      formData.append("difficulty", trailDifficulty);
      formData.append("activity", trailImportActivity);
      formData.append(
        "criteriaTags",
        JSON.stringify(trailImportCriteriaTags || [])
      );
      const noteMobile = trailImportNotes.trim();
      if (noteMobile) formData.append("notes", noteMobile);
      formData.append("gpx", {
        uri: file.uri,
        name: file.name || "trace.gpx",
        type: file.mimeType || "application/gpx+xml",
      });

      const data = await uploadGpxWithFormData(formData);
      userAlert(
        "Trace importée",
        `${data.distanceKm} km · ${
          data.trail
            ? formatTrailElevationSummary(data.trail)
            : `D+ ${data.elevationM} m`
        }`
      );
      await loadTrails();
      setTrailImportNotes("");
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
        formData.append(
          "territory",
          trailImportTerritory?.trim() || city || "unknown"
        );
        formData.append("difficulty", trailDifficulty);
        formData.append("activity", trailImportActivity);
        formData.append(
          "criteriaTags",
          JSON.stringify(trailImportCriteriaTags || [])
        );
        const noteWeb = trailImportNotes.trim();
        if (noteWeb) formData.append("notes", noteWeb);
        formData.append("gpx", file, name);
      } else {
        formData = new FormData();
        formData.append("name", name.replace(/\.gpx$/i, ""));
        formData.append(
          "territory",
          trailImportTerritory?.trim() || city || "unknown"
        );
        formData.append("difficulty", trailDifficulty);
        formData.append("activity", trailImportActivity);
        formData.append(
          "criteriaTags",
          JSON.stringify(trailImportCriteriaTags || [])
        );
        const noteNat = trailImportNotes.trim();
        if (noteNat) formData.append("notes", noteNat);
        formData.append("gpx", file);
      }
      const data = await uploadGpxWithFormData(formData);
      userAlert(
        "Trace importée",
        `${data.distanceKm} km · ${
          data.trail
            ? formatTrailElevationSummary(data.trail)
            : `D+ ${data.elevationM} m`
        }`
      );
      await loadTrails();
      setTrailImportNotes("");
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const replaceTrailGpxWebFile = async (trailId, file) => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) {
      userAlert("Trace", "Identifiant de trace invalide.");
      return;
    }
    if (!file) {
      userAlert("Erreur", "Aucun fichier GPX sélectionné.");
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
        formData.append("gpx", file, name);
      } else {
        formData = new FormData();
        formData.append("gpx", file);
      }
      const data = await uploadGpxWithFormData(
        formData,
        `/trails/${tid}/replace-gpx`
      );
      userAlert(
        "Trace remplacée",
        `${data.distanceKm} km · ${
          data.trail
            ? formatTrailElevationSummary(data.trail)
            : `D+ ${data.elevationM} m`
        }`
      );
      await loadTrails();
      if (selectedTrailId != null && Number(selectedTrailId) === tid) {
        await loadRoutePlans?.();
      }
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const replaceTrailGpx = async (trailId) => {
    const tid = Number(trailId);
    if (!Number.isFinite(tid) || tid <= 0) {
      userAlert("Trace", "Identifiant de trace invalide.");
      return;
    }
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".gpx,application/gpx+xml,application/xml,text/xml";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          void replaceTrailGpxWebFile(tid, file);
        }
      };
      input.click();
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["*/*"] });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const formData = new FormData();
      formData.append("gpx", {
        uri: file.uri,
        name: file.name || "trace.gpx",
        type: file.mimeType || "application/gpx+xml",
      });
      const data = await uploadGpxWithFormData(
        formData,
        `/trails/${tid}/replace-gpx`
      );
      userAlert(
        "Trace remplacée",
        `${data.distanceKm} km · ${
          data.trail
            ? formatTrailElevationSummary(data.trail)
            : `D+ ${data.elevationM} m`
        }`
      );
      await loadTrails();
      if (selectedTrailId != null && Number(selectedTrailId) === tid) {
        await loadRoutePlans?.();
      }
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
      availabilitySchedule: hostForm.availabilitySchedule,
      criteriaTags: hostForm.criteriaTags,
    };
    const resetHostFormToDefaults = () => {
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
        availabilitySchedule: cloneDefaultAvailabilitySchedule(),
      });
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
        resetHostFormToDefaults();
      } else {
        await apiFetch("/host/boxes", {
          method: "POST",
          token,
          body,
        });
        userAlert("Publication", "Ton box est en ligne.");
        resetHostFormToDefaults();
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
      availabilitySchedule: hostAvailabilityFromBox(box),
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
      availabilitySchedule: cloneDefaultAvailabilitySchedule(),
    });
  }, []);

  const decideHostBooking = async (bookingId, decision) => {
    if (!token) return;
    try {
      const latestRows = await apiFetch("/host/bookings", { token });
      const latest = Array.isArray(latestRows)
        ? latestRows.find((b) => Number(b.id) === Number(bookingId))
        : null;
      const latestApproval = latest?.approval_status || "pending";
      if (
        latest &&
        !["pending", "pending_host_confirmation"].includes(latestApproval)
      ) {
        userAlert(
          "Données mises à jour",
          `Cette réservation n'est plus en attente (statut: ${bookingApprovalLabel(
            latestApproval
          )}). Rafraîchis la liste avant de décider.`
        );
        await loadHostBookings();
        await loadAthleteBookings();
        await loadNotifications();
        await refreshRoutePlanBookingLinks();
        return;
      }
      await apiFetch(`/host/bookings/${bookingId}/decision`, {
        method: "PATCH",
        token,
        body: { decision },
      });
      await loadHostBookings();
      await loadAthleteBookings();
      await loadNotifications();
      await refreshRoutePlanBookingLinks();
      userAlert(
        decision === "accept" ? "Réservation acceptée" : "Réservation refusée",
        decision === "accept"
          ? "L’athlète verra le statut mis à jour dans l’onglet Réservations."
          : "La demande a été annulée côté athlète."
      );
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const decideAthleteBookingChange = async (bookingId, decision) => {
    if (!token) return;
    try {
      const latestRows = await apiFetch("/bookings", { token });
      const latest = Array.isArray(latestRows)
        ? latestRows.find((b) => Number(b.id) === Number(bookingId))
        : null;
      const latestApproval = latest?.approval_status || "pending";
      if (latest && latestApproval !== "pending_athlete_confirmation") {
        userAlert(
          "Données mises à jour",
          `La demande n'attend plus ta validation (statut: ${bookingApprovalLabel(
            latestApproval
          )}).`
        );
        await loadAthleteBookings();
        await loadHostBookings();
        await loadNotifications();
        await refreshRoutePlanBookingLinks();
        return;
      }
      await apiFetch(`/bookings/${bookingId}/decision`, {
        method: "PATCH",
        token,
        body: { decision },
      });
      await loadAthleteBookings();
      await loadHostBookings();
      await loadNotifications();
      await refreshRoutePlanBookingLinks();
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
      await refreshRoutePlanBookingLinks();
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
      await refreshRoutePlanBookingLinks();
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
      await refreshRoutePlanBookingLinks();
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
      await refreshRoutePlanBookingLinks();
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
      const updated = await apiFetch(`/bookings/${bookingId}`, {
        method: "PATCH",
        token,
        body: {
          bookingDate: draft.bookingDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          specialRequest: draft.specialRequest?.trim() || undefined,
        },
      });
      const unpaid = !isBookingPaid(updated?.payment_status);
      userAlert(
        unpaid ? "Projet mis à jour" : "Demande envoyée",
        unpaid
          ? "Créneau modifié. L’hôte doit re-valider avant le paiement."
          : "La modification doit être validée par l'hôte."
      );
      await loadAthleteBookings();
      await loadHostBookings();
      await loadNotifications();
      await refreshRoutePlanBookingLinks();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const payAthleteBooking = async (bookingId) => {
    if (!token) return;
    const bid = Number(bookingId);
    if (!Number.isFinite(bid)) return;
    try {
      await apiFetch(`/bookings/${bid}/pay`, {
        method: "POST",
        token,
      });
      userAlert(
        "Paiement enregistré",
        "Paiement simulé OK. Le code d’accès sera visible à l’approche du créneau."
      );
      await loadAthleteBookings();
      await loadNotifications();
      await refreshRoutePlanBookingLinks();
    } catch (error) {
      userAlert("Paiement", error.message);
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
      await refreshRoutePlanBookingLinks();
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
      await refreshRoutePlanBookingLinks();
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
      if (user?.id) {
        setTrailLocalPatches((prev) => {
          const next = { ...prev };
          delete next[String(trailId)];
          writeTrailPatchesToStorage(user.id, next);
          return next;
        });
      }
      await loadTrails();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const updateTrail = async (trailId, body) => {
    if (!token) return false;
    const tid = Number(trailId);
    const rawBody = body && typeof body === "object" ? body : {};
    const attempts = [
      ["/host/trails/update", "POST", { ...rawBody, trailId: tid }],
      [`/host/trails/${tid}`, "PATCH", rawBody],
      [`/host/trails/${tid}`, "PUT", rawBody],
      ["/update-trail", "POST", { ...rawBody, trailId: tid }],
      [`/trails/${tid}`, "PUT", rawBody],
      [`/trails/${tid}`, "PATCH", rawBody],
      [`/trails/${tid}/update`, "POST", rawBody],
    ];
    const baseCandidates = [
      API_BASE_URL,
      ...(API_BASE_URL !== PROD_API_BASE_URL ? [PROD_API_BASE_URL] : []),
    ];
    let lastError = null;
    for (const baseUrl of baseCandidates) {
      for (const [path, method, payload] of attempts) {
        try {
          await apiFetch(path, { method, token, body: payload, baseUrl });
          if (user?.id) {
            setTrailLocalPatches((prev) => {
              const next = { ...prev };
              delete next[String(tid)];
              writeTrailPatchesToStorage(user.id, next);
              return next;
            });
          }
          userAlert(
            "OK",
            baseUrl !== API_BASE_URL
              ? "Trace mise à jour via l’API par défaut (ton EXPO_PUBLIC_API_URL ne pointe pas vers le bon backend). Corrige la variable puis reconstruis l’app."
              : "Trace mise à jour."
          );
          if (baseUrl !== API_BASE_URL) {
            try {
              const rows = await apiFetch("/trails", { baseUrl });
              setTrails(Array.isArray(rows) ? rows : []);
            } catch (_e) {
              await loadTrails();
            }
          } else {
            await loadTrails();
          }
          return true;
        } catch (error) {
          lastError = error;
        }
      }
    }
    const raw = String(lastError?.message || "");
    const is404Like =
      /HTML|introuvable|404/i.test(raw) || /Cannot (POST|PUT|PATCH)/i.test(raw);
    const hint404 = is404Like
      ? "\n\n→ Sur Render : Web Service Node de l’API, branche main à jour, puis Manual Deploy (Clear build cache si besoin)."
      : "";

    if (is404Like && user?.id) {
      const localPatch = {};
      if (rawBody.name !== undefined) localPatch.name = rawBody.name;
      if (rawBody.territory !== undefined)
        localPatch.territory = rawBody.territory;
      if (rawBody.difficulty !== undefined)
        localPatch.difficulty = rawBody.difficulty;
      if (rawBody.activity !== undefined)
        localPatch.activity = rawBody.activity;
      if (rawBody.criteriaTags !== undefined)
        localPatch.criteriaTags = rawBody.criteriaTags;
      if (rawBody.notes !== undefined) localPatch.notes = rawBody.notes;
      if (Object.keys(localPatch).length > 0) {
        setTrailLocalPatches((prev) => {
          const key = String(tid);
          const next = {
            ...prev,
            [key]: { ...(prev[key] || {}), ...localPatch },
          };
          writeTrailPatchesToStorage(user.id, next);
          return next;
        });
        userAlert(
          "Enregistré sur cet appareil",
          "L’API renvoie encore une erreur (404 / HTML). Tes changements sont conservés ici (web : persistant). Après déploiement Render et une URL API correcte, enregistre à nouveau pour synchroniser le serveur."
        );
        return true;
      }
    }

    userAlert(
      "Erreur",
      (lastError?.message ||
        "Impossible de mettre à jour la trace. Vérifie EXPO_PUBLIC_API_URL et le déploiement de l’API.") +
        hint404
    );
    return false;
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
      if (user?.id) {
        setTrailLocalPatches((prev) => {
          const next = { ...prev };
          for (const id of unique) delete next[String(id)];
          writeTrailPatchesToStorage(user.id, next);
          return next;
        });
      }
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
      const trail = trailsMerged.find((t) => Number(t.id) === tid);
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
    [trailsMerged]
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

  const syncLiveSessionData = useCallback(async () => {
    if (!token) return;
    const a = actionsRef.current || {};
    const jobs = [];
    // Respect the current explorer source (viewport/city/nearby) during background sync.
    // Calling loadBoxes() blindly forces "city" results and can make viewport markers disappear.
    if (typeof a.refetchExplorerBoxes === "function") {
      jobs.push(a.refetchExplorerBoxes());
    } else if (typeof a.loadBoxes === "function") {
      jobs.push(a.loadBoxes());
    }
    if (typeof a.loadTrails === "function") jobs.push(a.loadTrails());
    if (typeof a.loadNotifications === "function")
      jobs.push(a.loadNotifications());
    if (canHost) {
      if (typeof a.loadHostBoxes === "function") jobs.push(a.loadHostBoxes());
      if (typeof a.loadHostBookings === "function")
        jobs.push(a.loadHostBookings());
      if (typeof a.loadHostRefunds === "function")
        jobs.push(a.loadHostRefunds());
    }
    if (canBook) {
      if (typeof a.loadAthleteBookings === "function")
        jobs.push(a.loadAthleteBookings());
      if (typeof a.loadRoutePlans === "function") jobs.push(a.loadRoutePlans());
    }
    if (typeof a.loadFollowingUsers === "function") {
      jobs.push(a.loadFollowingUsers());
    }
    await Promise.allSettled(jobs);
  }, [token, canHost, canBook]);

  useEffect(() => {
    if (!token) return;
    void syncLiveSessionData();
    const id = setInterval(() => {
      void syncLiveSessionData();
    }, 45000);
    return () => clearInterval(id);
  }, [token, syncLiveSessionData]);

  useEffect(() => {
    if (!token) return;
    let visibilityTimer = null;
    const scheduleSync = () => {
      if (visibilityTimer) clearTimeout(visibilityTimer);
      visibilityTimer = setTimeout(() => {
        void syncLiveSessionData();
      }, 2000);
    };
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") scheduleSync();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        if (visibilityTimer) clearTimeout(visibilityTimer);
      };
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleSync();
    });
    return () => {
      sub.remove();
      if (visibilityTimer) clearTimeout(visibilityTimer);
    };
  }, [token, syncLiveSessionData]);

  const spotlightBookingOnMap = useCallback(
    (booking) => {
      const bid = Number(booking?.box_id ?? booking?.boxId);
      if (!Number.isFinite(bid)) return;
      const cityHint = String(booking?.box_city || "").trim();
      if (cityHint.length >= 2) {
        setCity(cityHint);
      }
      setMapListSource("city");
      setSelectedBoxId(bid);
      setSpotlightBoxId(bid);
      setMapExplorerCameraFollowSearch(true);
      setMapExplorerRecenterNonce((n) => n + 1);
      mainTabNavigationRef.current?.navigate?.("Carte");
      setTimeout(() => {
        setSpotlightBoxId((prev) => (Number(prev) === bid ? null : prev));
      }, 12000);
    },
    [
      setCity,
      setMapListSource,
      setSelectedBoxId,
      setMapExplorerCameraFollowSearch,
      setMapExplorerRecenterNonce,
    ]
  );

  actionsRef.current = {
    loadBoxes,
    loadHostBoxes,
    loadHostBookings,
    loadHostRefunds,
    loadAthleteBookings,
    loadNotifications,
    loadMyReviews,
    openUserReviews,
    loadFollowingUsers,
    loadFollowingBoxes,
    followUser,
    unfollowUser,
    showFollowingOnMap,
    markAllNotificationsRead,
    showBookingTimeline,
    notifyBookingEnRoute,
    pushBookingLiveLocation,
    stopBookingLiveLocation,
    fetchBookingLiveLocation,
    reportAccessIncident,
    markRefundDone,
    submitReview,
    loadNearbyBoxes,
    refetchExplorerBoxes,
    markExplorerMapUserGesture,
    recenterExplorerMapOnResults,
    loadTrails,
    loadRoutePlans,
    loadRoutePlanDetail,
    refreshRoutePlanBookingLinks,
    loadTrailTips,
    loadSharedPlansForTrail,
    loadSharedRoutePlan,
    forkRoutePlan,
    createTrailTip,
    deleteTrailTip,
    createRoutePlanFromSelection,
    uploadGpxForProject,
    createAdventureProject,
    upsertRoutePlanBoxes,
    updateRoutePlan,
    deleteRoutePlan,
    updateRoutePlanBoxComment,
    addRoutePlanTrailNote,
    updateRoutePlanTrailNote,
    deleteRoutePlanTrailNote,
    showRoutePlanOnMap,
    downloadRoutePlanGpx,
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
    payAthleteBooking,
    setHostLocationFromMap,
    syncExplorerMapFromHost,
    createHostBox,
    startEditingHostBox,
    cancelHostBoxEdit,
    uploadGpx,
    uploadGpxWebFile,
    replaceTrailGpx,
    replaceTrailGpxWebFile,
    deleteTrail,
    updateTrail,
    deleteTrailsByIds,
    deleteAllMyTrails,
    centerMapOnTrail,
    isolateTrailOnMap,
    openRavitoRequestAtPoint,
    acceptRavitoProposal,
    navigateToReservations: () =>
      mainTabNavigationRef.current?.navigate?.("Reservations"),
    navigateToPlans: () =>
      mainTabNavigationRef.current?.navigate?.("Plans"),
    navigateToTrails: () =>
      mainTabNavigationRef.current?.navigate?.("Trails"),
    spotlightBookingOnMap,
    queueOpenPlanOnMap: ({ planId, kind = "mine" } = {}) => {
      const pid = Number(planId);
      if (!Number.isFinite(pid) || pid <= 0) return;
      explorerOpenPlanQueueRef.current = {
        planId: pid,
        kind: kind === "shared" ? "shared" : "mine",
      };
      mainTabNavigationRef.current?.navigate?.("Carte");
    },
    takeQueuedOpenPlanOnMap: () => {
      const req = explorerOpenPlanQueueRef.current;
      explorerOpenPlanQueueRef.current = null;
      return req;
    },
    queueBookBoxOnCarte: (boxId) => {
      const bid = Number(boxId);
      if (!Number.isFinite(bid)) return;
      explorerBookBoxQueueRef.current = { boxId: bid };
      mainTabNavigationRef.current?.navigate?.("Carte");
    },
    takeQueuedBookBoxOnCarte: () => {
      const req = explorerBookBoxQueueRef.current;
      explorerBookBoxQueueRef.current = null;
      return req;
    },
    loadDiscoverRoutePlans,
    setResourceRelevance,
    checkResourceRelevanceEligibility,
    refreshSession,
    logout,
    updateMyRole,
    updateCapabilities,
    changeMyPassword,
    regenerateRecoveryCode,
    fetchRecoveryCodeStatus,
    showRecoveryCodeReveal,
    deleteHostBoxTrailPin,
    addHostBoxTrailPin,
    patchHostBoxTrailPin,
  };

  const mainContextValue = useMemo(
    () => ({
      boxes,
      trails: trailsMerged,
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
      hostBoxTrailPins,
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
      trailImportTerritory,
      setTrailImportTerritory,
      trailImportActivity,
      setTrailImportActivity,
      trailImportCriteriaTags,
      setTrailImportCriteriaTags,
      trailImportNotes,
      setTrailImportNotes,
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
      mapNearSingleTrailId,
      setMapNearSingleTrailId,
      mapNearShowAllOnMap,
      setMapNearShowAllOnMap,
      mapBoxesSlotCompatibleOnly,
      setMapBoxesSlotCompatibleOnly,
      nearTrailReferenceTrails,
      nearTrailCompatibleBoxIds,
      nearTrailDistanceByBoxId,
      routePlans,
      selectedRoutePlanId,
      setSelectedRoutePlanId,
      selectedRoutePlanDetail,
      setSelectedRoutePlanDetail,
      routePlanBusy,
      upsertRoutePlanBoxes,
      updateRoutePlan,
      deleteRoutePlan,
      updateRoutePlanBoxComment,
      addRoutePlanTrailNote,
      updateRoutePlanTrailNote,
      deleteRoutePlanTrailNote,
      boxesForExplorerList,
      trailsForExplorerList,
      mapViewportBounds,
      setMapViewportBounds,
      mapExplorerRecenterNonce,
      setMapExplorerRecenterNonce,
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
      spotlightBoxId,
      selectedTrailId,
      setSelectedTrailId,
      canHost,
      canBook,
      canRavito,
      capabilities,
      capabilitiesBusy,
      selectedBox,
      selectedTrail,
      webMapCenter,
      openUserReviews,
      closeUserReviews,
      followingUsers,
      followingUserIdSet,
      followUser,
      unfollowUser,
      showFollowingOnMap,
      authToken: token,
      openRavitoRequestAtPoint,
      acceptRavitoProposal,
      ravitoRequestsRefreshNonce,
      simpleUi,
      setSimpleUi,
      actionsRef,
    }),
    [
      boxes,
      trailsMerged,
      trailsForMap,
      city,
      mapLat,
      mapLon,
      hostForm,
      hostEditingBoxId,
      hostReverseGeocode,
      hostBoxes,
      hostBoxTrailPins,
      hostRefunds,
      hostBookings,
      athleteBookings,
      notifications,
      myReviewsSummary,
      myReviews,
      user,
      webDropHover,
      trailDifficulty,
      trailImportTerritory,
      trailImportActivity,
      trailImportCriteriaTags,
      trailImportNotes,
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
      mapNearSingleTrailId,
      mapNearShowAllOnMap,
      mapBoxesSlotCompatibleOnly,
      nearTrailReferenceTrails,
      nearTrailCompatibleBoxIds,
      nearTrailDistanceByBoxId,
      routePlans,
      selectedRoutePlanId,
      selectedRoutePlanDetail,
      routePlanBusy,
      upsertRoutePlanBoxes,
      updateRoutePlan,
      deleteRoutePlan,
      updateRoutePlanBoxComment,
      addRoutePlanTrailNote,
      updateRoutePlanTrailNote,
      deleteRoutePlanTrailNote,
      boxesForExplorerList,
      trailsForExplorerList,
      mapViewportBounds,
      mapExplorerRecenterNonce,
      setMapExplorerRecenterNonce,
      mapExplorerCameraFollowSearch,
      setMapExplorerCameraFollowSearch,
      mapExplorerLastSearchAt,
      mapExplorerLastSearchSource,
      bookingDate,
      startTime,
      endTime,
      specialRequest,
      selectedBoxId,
      spotlightBoxId,
      selectedTrailId,
      canHost,
      canBook,
      canRavito,
      capabilities,
      capabilitiesBusy,
      selectedBox,
      selectedTrail,
      webMapCenter,
      openUserReviews,
      closeUserReviews,
      followingUsers,
      followingUserIdSet,
      followUser,
      unfollowUser,
      showFollowingOnMap,
      token,
      openRavitoRequestAtPoint,
      acceptRavitoProposal,
      ravitoRequestsRefreshNonce,
      simpleUi,
      setSimpleUi,
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
      resetStep,
      recoveryCodeReveal,
      completeRecoveryCodeReveal,
      register,
      login,
      openPasswordReset,
      confirmPasswordReset,
      cancelPasswordReset,
    }),
    [
      authMode,
      email,
      password,
      fullName,
      role,
      authLoading,
      resetStep,
      recoveryCodeReveal,
      completeRecoveryCodeReveal,
      register,
      login,
      openPasswordReset,
      confirmPasswordReset,
      cancelPasswordReset,
    ]
  );

  if (!sessionReady) {
    return (
      <GestureHandlerRootView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.bg,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ marginTop: 12, color: theme.inkMuted, fontSize: 14 }}>
          Ouverture de la session…
        </Text>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthUiContext.Provider value={authUiValue}>
          <AccountRecoveryCodeModal
            visible={Boolean(recoveryCodeReveal?.code)}
            code={recoveryCodeReveal?.code || ""}
            title={
              recoveryCodeReveal?.session
                ? "Code de compte — à conserver"
                : "Nouveau code de compte"
            }
            subtitle={
              recoveryCodeReveal?.session
                ? "Reçu à la création de ton compte. Sans email : garde-le en lieu sûr."
                : "Ton ancien code ne fonctionne plus. Note ce nouveau code."
            }
            onConfirm={() => {
              if (recoveryCodeReveal?.session) {
                completeRecoveryCodeReveal();
              } else {
                setRecoveryCodeReveal(null);
              }
            }}
          />
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
                      authToken={token}
                      onFollowChange={handleUserReviewsFollowChange}
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
                      unavailableSlots={bookingUnavailableSlots}
                      submitting={bookingSubmitting}
                      routePlanId={selectedRoutePlanId}
                      onClose={cancelBookBoxConfirm}
                      onConfirm={confirmBookBox}
                    />
                    <RavitoRequestModal
                      visible={ravitoRequestModal.visible}
                      onClose={closeRavitoRequestModal}
                      point={ravitoRequestModal.point}
                      bookingDate={bookingDate}
                      startTime={startTime}
                      endTime={endTime}
                      specialRequest={specialRequest}
                      slotPicker={
                        <DateTimeSelector
                          dateValue={bookingDate}
                          onDateChange={setBookingDate}
                          startValue={startTime}
                          onStartChange={setStartTime}
                          endValue={endTime}
                          onEndChange={setEndTime}
                        />
                      }
                      onSubmit={submitRavitoRequest}
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
  useAthleticFonts();
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
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  explorerWebPanel: {
    width: 300,
    minWidth: 280,
    maxWidth: 320,
    minHeight: 0,
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.border,
    backgroundColor: theme.bg,
  },
  explorerWebPanelScroll: {
    flex: 1,
    minHeight: 0,
  },
  discoverCoach: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 0,
    backgroundColor: theme.hero,
    overflow: "visible",
    marginHorizontal: -12,
    marginTop: -12,
    paddingTop: 14,
    zIndex: 4,
  },
  discoverCoachTop: {
    marginBottom: 10,
  },
  discoverCoachTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  discoverPanelToggle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  discoverMobileRoot: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    backgroundColor: theme.bg,
  },
  discoverMobileMapFill: {
    ...StyleSheet.absoluteFillObject,
  },
  discoverMobileHud: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  discoverMobileHudBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hero,
  },
  discoverMobileHudBtnText: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: theme.font,
  },
  discoverMobileHudGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  discoverMobileHudGhostText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
  },
  discoverMobilePeek: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 12,
    zIndex: 25,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(16, 22, 20, 0.94)",
    maxHeight: "48%",
  },
  discoverMobilePeekText: {
    color: "#FAFAFA",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    fontFamily: theme.font,
    marginBottom: 8,
  },
  discoverPrepSteps: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  discoverPrepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(250,250,250,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  discoverPrepDotOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  discoverPrepDotDone: {
    backgroundColor: "rgba(250,250,250,0.2)",
    borderColor: "rgba(250,250,250,0.45)",
  },
  discoverPrepDotText: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(250,250,250,0.55)",
  },
  discoverPrepDotTextOn: {
    color: "#fff",
  },
  discoverPrepDotLight: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  discoverPrepDotDoneLight: {
    backgroundColor: theme.surfaceMuted,
    borderColor: theme.inkMuted,
  },
  discoverPrepDotTextLight: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.inkMuted,
  },
  discoverProjectRecap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(250,250,250,0.16)",
    gap: 3,
  },
  discoverProjectRecapTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.heroAccent,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  discoverProjectRecapLine: {
    fontSize: 12,
    color: "rgba(250,250,250,0.72)",
    lineHeight: 17,
    fontFamily: theme.font,
  },
  discoverProjectRecapLink: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  discoverProjectRecapLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    textDecorationLine: "underline",
  },
  discoverMapLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 10,
  },
  discoverMapLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  discoverMapLegendText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.inkMuted,
  },
  discoverReserveModeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  discoverReserveModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  discoverReserveModeBtnOn: {
    backgroundColor: theme.ink,
    borderColor: theme.ink,
  },
  discoverReserveModeBtnLight: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  discoverReserveModeText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.ink,
  },
  discoverReserveModeTextOn: {
    color: "#fff",
  },
  discoverMobilePickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16, 22, 20, 0.45)",
  },
  discoverMobilePickerSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    maxHeight: "78%",
  },
  discoverMobilePickerGrabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginTop: 10,
    marginBottom: 8,
  },
  discoverMobilePickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.ink,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  discoverMobilePreviewCard: {
    padding: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 10,
  },
  discoverMobilePreviewTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.ink,
    marginBottom: 4,
  },
  discoverMobilePreviewLine: {
    fontSize: 12,
    color: theme.inkMuted,
    lineHeight: 17,
  },
  discoverMobilePickerRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.borderSoft,
  },
  discoverMobilePickerRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.ink,
  },
  discoverMobilePickerRowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: theme.inkMuted,
  },
  discoverMapHud: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "70%",
  },
  discoverMapHudBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hero,
  },
  discoverMapHudBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: theme.font,
  },
  discoverMapHudChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    maxWidth: 220,
  },
  discoverMapHudChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
    fontFamily: theme.font,
  },
  discoverToolsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  discoverToolsToggleText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.inkMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontFamily: theme.font,
  },
  discoverCoachKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.heroAccent,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginBottom: 2,
    fontFamily: theme.font,
  },
  discoverCoachTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FAFAFA",
    letterSpacing: -0.3,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  discoverCoachText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(250,250,250,0.62)",
    fontFamily: theme.font,
  },
  discoverCoachLabel: {
    marginBottom: 6,
    fontSize: 9,
    fontWeight: "700",
    color: "rgba(250,250,250,0.45)",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  discoverProjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  discoverProjectBlock: {
    marginTop: 0,
    position: "relative",
    zIndex: 5,
  },
  discoverProjectSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(250,250,250,0.22)",
    backgroundColor: "rgba(250,250,250,0.08)",
  },
  discoverProjectSelectValue: {
    color: "#FAFAFA",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: theme.font,
  },
  discoverProjectSelectMeta: {
    marginTop: 2,
    color: "rgba(250,250,250,0.5)",
    fontSize: 11,
    fontFamily: theme.font,
  },
  discoverProjectMenu: {
    marginTop: 6,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(250,250,250,0.18)",
    backgroundColor: "#1A1F1D",
    overflow: "hidden",
  },
  discoverProjectPreview: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(250,250,250,0.14)",
    backgroundColor: "rgba(15, 122, 101, 0.18)",
  },
  discoverProjectPreviewKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: theme.heroAccent,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  discoverProjectPreviewTitle: {
    color: "#FAFAFA",
    fontSize: 15,
    fontWeight: "800",
    fontFamily: theme.fontDisplay,
    marginBottom: 4,
  },
  discoverProjectPreviewLine: {
    color: "rgba(250,250,250,0.72)",
    fontSize: 12,
    lineHeight: 17,
    fontFamily: theme.font,
  },
  discoverProjectActivateBtn: {
    marginTop: 10,
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  discoverProjectActivateBtnMuted: {
    backgroundColor: "rgba(250,250,250,0.14)",
  },
  discoverProjectActivateBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  discoverProjectMenuScroll: {
    maxHeight: 160,
  },
  discoverProjectMenuRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(250,250,250,0.1)",
  },
  discoverProjectMenuRowOn: {
    backgroundColor: "rgba(15, 122, 101, 0.28)",
  },
  discoverProjectMenuTitle: {
    color: "rgba(250,250,250,0.9)",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: theme.font,
  },
  discoverProjectMenuTitleOn: {
    color: "#fff",
    fontWeight: "700",
  },
  discoverProjectMenuMeta: {
    marginTop: 1,
    color: "rgba(250,250,250,0.45)",
    fontSize: 11,
    fontFamily: theme.font,
  },
  discoverPlanFilter: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 8,
  },
  discoverPlanFilterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
    fontFamily: theme.font,
  },
  discoverPlanFilterSeg: {
    flexDirection: "row",
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: "hidden",
    backgroundColor: theme.surface,
  },
  discoverPlanFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  discoverPlanFilterBtnOn: {
    backgroundColor: theme.ink,
  },
  discoverPlanFilterBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.inkMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  discoverPlanFilterBtnTextOn: {
    color: "#fff",
  },
  discoverChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: "rgba(250,250,250,0.18)",
    backgroundColor: "transparent",
  },
  discoverChipOn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: theme.radius.sm,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  discoverChipText: {
    color: "rgba(250,250,250,0.78)",
    fontWeight: "600",
    fontSize: 12,
    fontFamily: theme.font,
  },
  discoverChipTextOn: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: theme.font,
  },
  discoverEmptyPick: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surfaceMuted,
  },
  explorerWebPanelContent: {
    padding: 12,
    paddingBottom: 36,
  },
  explorerWebProfileRail: {
    width: 300,
    minWidth: 260,
    maxWidth: 320,
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
    flexDirection: "column",
  },
  explorerWebMapPane: {
    flex: 1,
    minWidth: 0,
  },
  selectedTrailCompact: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surfaceMuted,
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
    borderRadius: 16,
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
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  explorerWebMapInnerRelative: {
    position: "relative",
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
  authScrollContentWeb: {
    minHeight: "100vh",
    justifyContent: "center",
    paddingVertical: 24,
  },
  authColumn: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mapCoordCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 12,
  },
  mapCoordTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  mapCoordValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
    marginBottom: 4,
  },
  trailProbeCard: {
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.chipBorder,
    backgroundColor: theme.primarySoft,
    borderRadius: theme.radius?.sm || 12,
    padding: 12,
  },
  trailProbeTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  trailProbeValue: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.ink,
  },
  planListCard: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 14,
    backgroundColor: theme.surfaceMuted,
  },
  planSummaryCard: {
    marginTop: 8,
    borderRadius: 14,
  },
  planEditCard: {
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 14,
    backgroundColor: theme.surface,
    padding: 10,
  },
  authSegment: {
    flexDirection: "row",
    backgroundColor: theme.surfaceMuted,
    borderRadius: theme.radius.sm,
    padding: 3,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 3,
  },
  authSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm - 2,
  },
  authSegmentBtnActive: {
    backgroundColor: theme.ink,
  },
  authSegmentIcon: {
    marginRight: 6,
  },
  authSegmentLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: theme.inkMuted,
    fontFamily: theme.font,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
  },
  heroDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBlob: {
    position: "absolute",
    borderRadius: 0,
    opacity: 0.14,
    backgroundColor: theme.primary,
  },
  heroBlob1: {
    width: 180,
    height: 180,
    top: -90,
    right: -40,
    transform: [{ rotate: "18deg" }],
  },
  heroBlob2: {
    width: 120,
    height: 120,
    bottom: -50,
    left: -30,
    opacity: 0.08,
    backgroundColor: theme.white,
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
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  heroKicker: {
    color: theme.heroAccent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontFamily: theme.font,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FAFAFA",
    letterSpacing: -0.6,
    marginTop: 2,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  heroSubtitle: {
    color: "rgba(250, 250, 250, 0.7)",
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: theme.font,
    maxWidth: 420,
  },
  panel: {
    marginTop: 0,
    marginBottom: 8,
    backgroundColor: theme.surface,
    borderRadius: 0,
    padding: 18,
    borderWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    shadowOpacity: 0,
    elevation: 0,
    zIndex: 2,
    position: "relative",
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontFamily: theme.fontDisplay,
  },
  panelHint: {
    color: theme.inkMuted,
    fontSize: 13,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 19,
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
    borderColor: theme.borderSoft,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
    shadowColor: theme.shadow,
    shadowOpacity: 0.85,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
  dateTimeModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 27, 22, 0.48)",
  },
  dateTimeModalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  dateTimeSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: Platform.OS === "web" ? "92vh" : "92%",
    overflow: "hidden",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.borderSoft,
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 -12px 40px rgba(6, 45, 38, 0.18)",
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }
      : {
          shadowColor: theme.shadow,
          shadowOpacity: 1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 16,
        }),
  },
  dateTimeGrabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  dateTimeSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.borderSoft,
  },
  dateTimeSheetSubtitle: {
    fontSize: 13,
    color: theme.inkMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  dateTimeCloseBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: theme.surfaceMuted,
  },
  dateTimeSheetBody: {
    maxHeight: 520,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  dateTimeSheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === "ios" ? 22 : 16,
    borderTopWidth: 1,
    borderTopColor: theme.borderSoft,
    backgroundColor: theme.surface,
  },
  dateTimeCalendarCard: {
    backgroundColor: theme.surfaceMuted,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.borderSoft,
  },
  calendarNavBtnModern: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  calendarMonthTitleModern: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.ink,
    textTransform: "capitalize",
  },
  calendarWeekCellModern: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: theme.inkMuted,
  },
  calendarDayCellSelectedModern: {
    backgroundColor: theme.primary,
    borderRadius: 999,
    shadowColor: theme.primary,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  calendarDayCellTodayRing: {
    borderWidth: 2,
    borderColor: `${theme.primary}66`,
    borderRadius: 999,
  },
  dateTimeWheelLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.ink,
    marginBottom: 10,
    marginTop: 6,
  },
  timeWheelSection: {
    marginTop: 12,
  },
  timeWheelShell: {
    position: "relative",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surfaceMuted,
    overflow: "hidden",
  },
  timeWheelHighlightBand: {
    position: "absolute",
    left: 1,
    right: 1,
    top: TIME_WHEEL_PAD,
    height: TIME_WHEEL_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(15, 118, 110, 0.22)",
    backgroundColor: "rgba(15, 118, 110, 0.05)",
    zIndex: 1,
    pointerEvents: "none",
  },
  timeWheelInnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  timeWheelScrollCol: {
    height: TIME_WHEEL_VIEW_H,
    width: 76,
  },
  timeWheelItem: {
    height: TIME_WHEEL_ITEM_H,
    justifyContent: "center",
    alignItems: "center",
  },
  timeWheelItemText: {
    fontSize: 17,
    fontWeight: "500",
    color: theme.inkMuted,
  },
  timeWheelItemTextActive: {
    fontSize: 19,
    fontWeight: "700",
    color: theme.primary,
  },
  timeWheelColon: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.inkMuted,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  dateTimeQuickDurLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.inkMuted,
    marginTop: 14,
    marginBottom: 8,
  },
  dateTimeQuickDurRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  dateTimeQuickChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dateTimeQuickChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.secondaryInk,
  },
  explorerFilterSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    marginBottom: 8,
    shadowOpacity: 0,
    elevation: 0,
  },
  explorerFilterSummaryKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  explorerFilterSummaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.ink,
    lineHeight: 20,
  },
  explorerFilterSummaryMeta: {
    fontSize: 12,
    color: theme.inkMuted,
    marginTop: 4,
    lineHeight: 17,
  },
  explorerFilterCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    position: "relative",
  },
  explorerFilterCTAText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
    letterSpacing: 0.2,
  },
  explorerFilterBadge: {
    position: "absolute",
    top: -6,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  explorerFilterBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  explorerFilterModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 27, 22, 0.48)",
  },
  explorerFilterModalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  explorerFilterModalSheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: Platform.OS === "web" ? "92vh" : "92%",
    overflow: "hidden",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.borderSoft,
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 -12px 40px rgba(6, 45, 38, 0.18)",
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
        }
      : {
          shadowColor: theme.shadow,
          shadowOpacity: 1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -8 },
          elevation: 16,
        }),
  },
  explorerFilterModalScroll: {
    maxHeight: 520,
    paddingHorizontal: 18,
    paddingTop: 4,
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
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  sectionFlat: {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    marginBottom: 22,
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  sectionHeaderFlat: {
    marginBottom: 10,
    gap: 0,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.surfaceMuted,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: 0.2,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  sectionTitleFlat: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: theme.inkMuted,
    fontFamily: theme.font,
  },
  sectionSubtitle: {
    color: theme.inkMuted,
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: theme.font,
  },
  sectionSubtitleFlat: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: theme.surface,
    fontSize: 15,
    color: theme.ink,
    fontFamily: theme.font,
  },
  inputHalf: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: theme.surface,
    fontSize: 14,
    color: theme.ink,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  half: {
    flex: 1,
    minWidth: 140,
  },
  roleRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  roleChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.surface,
  },
  roleChipActive: {
    backgroundColor: theme.ink,
    borderColor: theme.ink,
  },
  roleChipText: {
    color: theme.ink,
    fontWeight: "600",
    fontSize: 13,
    fontFamily: theme.font,
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
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    marginTop: 8,
    minHeight: 48,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonCompact: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    borderRadius: theme.radius.sm,
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.4,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  secondaryButton: {
    backgroundColor: theme.secondary || theme.secondaryInk,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    minHeight: 48,
  },
  secondaryButtonCompact: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 42,
    borderRadius: theme.radius.sm,
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.4,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  outlineButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 4,
    backgroundColor: "transparent",
    alignSelf: "flex-start",
    minHeight: 40,
  },
  outlineButtonStretch: {
    alignSelf: "stretch",
  },
  outlineButtonCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 6,
    minHeight: 36,
  },
  outlineButtonDanger: {
    borderColor: "#FECACA",
    backgroundColor: theme.dangerSoft || "#FFFBFB",
  },
  outlineButtonText: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 13,
    fontFamily: theme.font,
  },
  outlineButtonTextCompact: {
    fontSize: 12,
  },
  outlineButtonTextDanger: {
    color: "#B91C1C",
  },
  statBanner: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderWidth: 0,
    gap: 10,
  },
  statBannerIcon: {
    marginTop: 2,
  },
  statBannerTitle: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 14,
  },
  statBannerText: {
    marginTop: 2,
    color: theme.inkMuted,
    fontSize: 12,
    lineHeight: 17,
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
    backgroundColor: theme.surfaceMuted,
    borderRadius: theme.radius.sm,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  infoBannerTitle: {
    color: theme.ink,
    fontWeight: "700",
    fontSize: 14,
    fontFamily: theme.font,
  },
  infoBannerText: {
    marginTop: 2,
    color: theme.inkMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  agendaLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
    gap: 8,
  },
  agendaLegendChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    backgroundColor: theme.surfaceMuted,
  },
  agendaLegendText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.ink,
  },
  agendaDayTitle: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: theme.primary,
  },
  agendaItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  agendaItemDot: {
    marginTop: 6,
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  selectedHostCard: {
    marginTop: 14,
    backgroundColor: theme.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.borderSoft,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    padding: 14,
    paddingTop: 14,
    marginBottom: 8,
    overflow: "hidden",
    shadowOpacity: 0,
    elevation: 0,
  },
  cardFocusState: {
    borderColor: theme.focus || theme.primary,
    borderWidth: 1.5,
    backgroundColor: theme.surface,
  },
  cardPickedState: {
    borderColor: theme.ink,
    borderWidth: 1.5,
    backgroundColor: theme.surface,
  },
  explorerMapSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  bookingConfirmCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: theme.radius?.md || 14,
    borderWidth: 1,
    borderColor: theme.infoBorder,
    backgroundColor: theme.infoBg,
  },
  bookingConfirmTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.primary,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  bookingConfirmMeta: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink,
    marginBottom: 8,
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
  cardAccentFocus: {
    width: 5,
    backgroundColor: theme.primary,
  },
  cardAccentPicked: {
    width: 5,
    backgroundColor: theme.mapTeal || "#0D9488",
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
    backgroundColor: theme.primary,
  },
  swipeDeleteAction: {
    backgroundColor: theme.danger,
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
    backgroundColor: theme.primarySoft,
    borderColor: theme.chipBorder,
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
    color: theme.primary,
  },
  selectionPillTextIdle: {
    color: theme.inkMuted,
  },
  explorerActiveSelectionBar: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.chipBorder,
    backgroundColor: theme.primarySoft,
    borderRadius: theme.radius?.md || 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  explorerActiveSelectionKicker: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  explorerActiveSelectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.ink,
  },
  explorerActiveSelectionCloseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.chipBorder,
    borderRadius: 999,
    backgroundColor: theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  explorerActiveSelectionCloseText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.primary,
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
  hostHeroBanner: {
    borderRadius: 0,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
    marginHorizontal: -16,
    backgroundColor: theme.hero,
    overflow: "hidden",
  },
  hostHeroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FAFAFA",
    letterSpacing: -0.3,
    fontFamily: theme.fontDisplay,
    textTransform: "uppercase",
  },
  hostHeroText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(250,250,250,0.7)",
    fontFamily: theme.font,
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
    resetStep,
    register,
    login,
    openPasswordReset,
    confirmPasswordReset,
    cancelPasswordReset,
  } = ctx;

  const [resetCodeInput, setResetCodeInput] = useState("");
  const isRegister = authMode === "register";
  const isResetConfirm = resetStep === "confirm";

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <ScrollView
        keyboardShouldPersistTaps="always"
        contentContainerStyle={[
          styles.authScrollContent,
          Platform.OS === "web" ? styles.authScrollContentWeb : null,
        ]}
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
                <Ionicons name="leaf" size={24} color="#fff" />
              </View>
              <View style={styles.heroTitleBlock}>
                <Text style={styles.heroKicker}>Outdoor & ravitaillement</Text>
                <Text style={styles.heroTitle}>RavitoBox</Text>
              </View>
            </View>
            <Text style={styles.heroSubtitle}>
              Un compte pour courir, accueillir ou ravitailler — tu choisiras
              après.
            </Text>
          </View>

          <View style={styles.panel}>
            {isResetConfirm ? (
              <>
                <Text style={styles.panelHint}>
                  Saisis l’email du compte et le code de compte reçu à
                  l’inscription (format RB-XXXX-XXXX-XXXX). Ce code sert uniquement
                  si tu as oublié ton mot de passe.
                </Text>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!authLoading}
                />
                <Text style={styles.inputLabel}>Code de compte</Text>
                <TextInput
                  style={styles.input}
                  placeholder="RB-XXXX-XXXX-XXXX"
                  placeholderTextColor={theme.inkMuted}
                  value={resetCodeInput}
                  onChangeText={setResetCodeInput}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!authLoading}
                />
                <Text style={styles.inputLabel}>Nouveau mot de passe</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Au moins 6 caractères"
                  placeholderTextColor={theme.inkMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!authLoading}
                />
                <PrimaryButton
                  label="Valider le nouveau mot de passe"
                  icon="checkmark-circle-outline"
                  onPress={() => confirmPasswordReset(resetCodeInput)}
                  loading={authLoading}
                />
                <TouchableOpacity
                  onPress={cancelPasswordReset}
                  style={styles.forgotLinkWrap}
                  disabled={authLoading}
                >
                  <Text style={styles.forgotLinkText}>Retour à la connexion</Text>
                </TouchableOpacity>
              </>
            ) : (
            <>
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
                <Text style={styles.roleHelp}>
                  Un seul compte pour tout le monde. Après l’inscription, tu
                  actives ce que tu veux : utilisateur, hôte, ravitailleur — ou
                  les trois.
                </Text>
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
                  onPress={openPasswordReset}
                  style={[
                    styles.forgotLinkWrap,
                    Platform.OS === "web" && { cursor: "pointer" },
                  ]}
                  activeOpacity={0.7}
                  disabled={authLoading}
                >
                  <Text style={styles.forgotLinkText} pointerEvents="none">
                    Mot de passe oublié ?
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.helperText, { textAlign: "center" }]}>
                  Utilise le code de compte reçu à l’inscription (pas d’email).
                </Text>
              </>
            )}
            </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}