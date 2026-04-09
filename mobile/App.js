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
} from "react-native";
import NativeExplorerMap from "./NativeExplorerMap";
import ExplorerWebMap from "./ExplorerWebMap";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://projetsportnature.onrender.com/api";

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

async function apiFetch(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
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
    const msg =
      typeof err === "string"
        ? err
        : err && typeof err === "object"
        ? JSON.stringify(err)
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
    bookingDate,
    setBookingDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    specialRequest,
    setSpecialRequest,
    webMapCenter,
    actionsRef,
  } = useAppMain();

  const trailsOnMap = Array.isArray(trailsForMap) ? trailsForMap : [];
  const boxesOnMap = Array.isArray(boxesForMap) ? boxesForMap : [];

  useEffect(() => {
    actionsRef.current.loadTrails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webSplit = Platform.OS === "web";

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
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[
              styles.roleChip,
              mapListSource === "city" && styles.roleChipActive,
            ]}
            onPress={() => setMapListSource("city")}
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
            onPress={() => setMapListSource("nearby")}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.roleChipText,
                mapListSource === "nearby" && styles.roleChipTextActive,
              ]}
            >
              Par position (lat / lon)
            </Text>
          </TouchableOpacity>
        </View>
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
                setMapListSource("nearby");
              }}
              keyboardType="decimal-pad"
            />
          </>
        ) : (
          <>
            <Text style={styles.inputLabel}>Ville</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. Annecy"
              placeholderTextColor={theme.inkMuted}
              value={city}
              onChangeText={(v) => {
                setCity(v);
                setMapListSource("city");
              }}
            />
          </>
        )}
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
                : `Box les plus proches du point lat/lon (automatique). ${
                    webSplit
                      ? "Carte : OSM · marqueurs = box ; lignes = traces."
                      : "Carte native : marqueurs et tracés."
                  }`}
            </Text>
          </View>
        </View>
        <Text style={styles.fieldLabel}>Box sur la carte</Text>
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
            style={[styles.roleChip, !mapShowBoxes && styles.roleChipActive]}
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
            <Text style={styles.fieldLabel}>Critères des box (carte)</Text>
            <Text style={styles.helperText}>
              Sans sélection : tous les box chargés. Avec une ou plusieurs puces
              : uniquement les box qui ont au moins un de ces critères.
            </Text>
            <View style={[styles.roleRow, { flexWrap: "wrap" }]}>
              {HOST_CRITERIA_OPTIONS.map((label) => {
                const active = mapBoxCriteriaTags.includes(label);
                return (
                  <TouchableOpacity
                    key={`map-crit-${label}`}
                    style={[styles.roleChip, active && styles.roleChipActive]}
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
                label="Effacer les critères (carte)"
                icon="close-circle-outline"
                compact
                onPress={() => setMapBoxCriteriaTags([])}
              />
            ) : null}
            <Text style={styles.helperText}>
              Sur la carte : {boxesOnMap.length} marqueur
              {boxesOnMap.length !== 1 ? "s" : ""} · Liste : {boxes.length} box
              chargé{boxes.length !== 1 ? "s" : ""}
            </Text>
          </>
        ) : null}
        <Text style={styles.fieldLabel}>Tracés sur la carte</Text>
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
        {mapShowTrails ? (
          <>
            <Text style={styles.fieldLabel}>Portée des traces</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleChip,
                  mapTrailsScope === "all" && styles.roleChipActive,
                ]}
                onPress={() => setMapTrailsScope("all")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    mapTrailsScope === "all" && styles.roleChipTextActive,
                  ]}
                >
                  Toutes
                </Text>
              </TouchableOpacity>
              {user ? (
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    mapTrailsScope === "mine" && styles.roleChipActive,
                  ]}
                  onPress={() => setMapTrailsScope("mine")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      mapTrailsScope === "mine" && styles.roleChipTextActive,
                    ]}
                  >
                    Les miennes
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.fieldLabel}>Difficulté (carte)</Text>
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
            <Text style={styles.helperText}>
              {trailsOnMap.length} tracé
              {trailsOnMap.length !== 1 ? "s" : ""} sur la carte (sur{" "}
              {trails.length} au total)
            </Text>
            {mapShowBoxes ? (
              <>
                <Text style={styles.fieldLabel}>Box près du tracé GPX</Text>
                <Text style={styles.helperText}>
                  Sur la carte uniquement : garde les box à moins de X km d’au
                  moins un point des tracés visibles (filtres ci-dessus).
                </Text>
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
                    <Text style={styles.inputLabel}>
                      Distance max. au tracé (km)
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="3"
                      placeholderTextColor={theme.inkMuted}
                      value={mapTrailProximityKm}
                      onChangeText={setMapTrailProximityKm}
                      keyboardType="decimal-pad"
                    />
                    {trailsOnMap.length === 0 ? (
                      <Text style={styles.helperText}>
                        Aucun tracé sur la carte avec les filtres actuels : le
                        filtre « près des tracés » est ignoré jusqu’à ce qu’au
                        moins une trace soit visible.
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        {!webSplit ? (
          <NativeExplorerMap
            center={webMapCenter}
            boxes={boxesOnMap}
            trails={trailsOnMap}
            onSelectBox={setSelectedBoxId}
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
            {canBook ? (
              <PrimaryButton
                compact
                label="Réserver ce box"
                icon="calendar-outline"
                onPress={() => actionsRef.current.bookBox(selectedBox.id)}
              />
            ) : (
              <Text style={styles.roleHintOnlyHost}>
                Compte hôte : la réservation est faite par les athlètes.
              </Text>
            )}
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
            <View style={styles.row}>
              <TextInput
                style={styles.inputHalf}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={theme.inkMuted}
                value={bookingDate}
                onChangeText={setBookingDate}
              />
              <TextInput
                style={styles.inputHalf}
                placeholder="Début"
                placeholderTextColor={theme.inkMuted}
                value={startTime}
                onChangeText={setStartTime}
              />
              <TextInput
                style={styles.inputHalf}
                placeholder="Fin"
                placeholderTextColor={theme.inkMuted}
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
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
        <FlatList
          data={boxes}
          scrollEnabled={false}
          keyExtractor={(item) => `${item.id}`}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.city} · {(item.price_cents / 100).toFixed(2)} €
                {item.distance_km != null &&
                  ` · ≈ ${Number(item.distance_km).toFixed(1)} km`}
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
              {canBook ? (
                <PrimaryButton
                  compact
                  label="Réserver"
                  icon="checkmark-circle-outline"
                  onPress={() => actionsRef.current.bookBox(item.id)}
                />
              ) : null}
            </View>
          )}
        />
      </Section>
    </>
  );

  if (webSplit) {
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
                onSelectBox={setSelectedBoxId}
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
    trailDifficulty,
    setTrailDifficulty,
    webDropHover,
    setWebDropHover,
    trailListFilter,
    setTrailListFilter,
    user,
    actionsRef,
  } = useAppMain();

  const webGpxInputRef = useRef(null);
  const [selectedTrailIds, setSelectedTrailIds] = useState([]);

  useEffect(() => {
    actionsRef.current.loadTrails();
  }, [actionsRef]);

  const myTrails = useMemo(() => {
    if (user?.id == null) return [];
    const uid = Number(user.id);
    return trails.filter((t) => Number(t.creator_user_id) === uid);
  }, [trails, user?.id]);

  const communityTrails = useMemo(() => {
    const uid = user?.id != null ? Number(user.id) : null;
    return trails
      .filter((t) => uid == null || Number(t.creator_user_id) !== uid)
      .filter(
        (t) => trailListFilter === "all" || t.difficulty === trailListFilter
      );
  }, [trails, user?.id, trailListFilter]);

  useEffect(() => {
    setSelectedTrailIds((prev) =>
      prev.filter((id) => myTrails.some((t) => t.id === id))
    );
  }, [myTrails]);

  const toggleTrailSelect = (id) => {
    setSelectedTrailIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllMyTrailsToggle = () => {
    if (myTrails.length === 0) return;
    if (selectedTrailIds.length === myTrails.length) {
      setSelectedTrailIds([]);
    } else {
      setSelectedTrailIds(myTrails.map((t) => t.id));
    }
  };

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
            const ne = e.nativeEvent;
            const dt = ne?.dataTransfer ?? e.dataTransfer;
            const f = dt?.files?.[0];
            actionsRef.current.uploadGpxWebFile(f);
          },
        }
      : {};

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
              <View
                style={[styles.dropZone, webDropHover && styles.dropZoneActive]}
                {...webDropProps}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={28}
                  color={theme.primary}
                />
                <Text style={styles.dropZoneText}>
                  Glisse-dépose un fichier .gpx ici
                </Text>
                <Text style={styles.dropZoneHint}>
                  ou choisis un fichier avec le bouton ci-dessous
                </Text>
              </View>
            </>
          ) : null}
          <Text style={styles.fieldLabel}>Difficulté à l’import GPX</Text>
          <View style={styles.roleRow}>
            {["easy", "medium", "hard"].map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.roleChip,
                  trailDifficulty === level && styles.roleChipActive,
                ]}
                onPress={() => setTrailDifficulty(level)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailDifficulty === level && styles.roleChipTextActive,
                  ]}
                >
                  {DIFFICULTY_LABELS[level]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helperText}>
            Cette difficulté est enregistrée avec le fichier GPX. Les filtres
            d’affichage carte et liste sont ailleurs.
          </Text>
          <PrimaryButton
            label="Charger les traces"
            icon="download-outline"
            onPress={() => actionsRef.current.loadTrails()}
          />
          <SecondaryButton
            label="Importer un GPX"
            icon="cloud-upload-outline"
            onPress={() =>
              Platform.OS === "web"
                ? webGpxInputRef.current?.click?.()
                : actionsRef.current.uploadGpx()
            }
          />
        </Section>

        <Section
          title="Mes traces"
          subtitle="Traces que tu as importées : suppression une par une, plusieurs à la fois, ou tout effacer."
          icon="person-outline"
        >
          {!user ? (
            <Text style={styles.emptyText}>
              Connecte-toi pour voir et gérer tes propres traces.
            </Text>
          ) : myTrails.length === 0 ? (
            <Text style={styles.emptyText}>
              Tu n’as pas encore de trace à ton nom. Importe un GPX ci-dessus.
            </Text>
          ) : (
            <>
              <View style={{ marginBottom: 12, gap: 10 }}>
                <Text style={styles.fieldLabel}>Suppression</Text>
                <TouchableOpacity
                  style={styles.selectAllChip}
                  onPress={selectAllMyTrailsToggle}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={
                      selectedTrailIds.length === myTrails.length &&
                      myTrails.length > 0
                        ? "checkbox"
                        : "square-outline"
                    }
                    size={20}
                    color={theme.primary}
                  />
                  <Text style={styles.selectAllChipText}>
                    {selectedTrailIds.length === myTrails.length &&
                    myTrails.length > 0
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </Text>
                </TouchableOpacity>
                {selectedTrailIds.length > 0 ? (
                  <OutlineButton
                    danger
                    stretch
                    label={`Supprimer la sélection (${selectedTrailIds.length})`}
                    icon="trash-outline"
                    onPress={() =>
                      actionsRef.current.deleteTrailsByIds([
                        ...selectedTrailIds,
                      ])
                    }
                  />
                ) : null}
                <OutlineButton
                  danger
                  stretch
                  label="Supprimer toutes mes traces"
                  icon="trash-outline"
                  onPress={() => actionsRef.current.deleteAllMyTrails()}
                />
              </View>
              {myTrails.map((trail) => {
                const b = difficultyBadgeStyle(trail.difficulty);
                return (
                  <View key={`my-trail-${trail.id}`} style={styles.card}>
                    <View style={styles.cardAccent} />
                    <TouchableOpacity
                      style={styles.boxSelectRow}
                      onPress={() => toggleTrailSelect(trail.id)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={
                          selectedTrailIds.includes(trail.id)
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={22}
                        color={theme.primary}
                      />
                      <Text style={styles.boxSelectLabel}>
                        Inclure dans la suppression groupée
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.cardTitle}>{trail.name}</Text>
                    <Text style={styles.cardMeta}>
                      {trail.territory} · {trail.distance_km} km · D+{" "}
                      {trail.elevation_m} m
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: b.bg, borderColor: b.border },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: b.fg }]}>
                        {DIFFICULTY_LABELS[trail.difficulty] ||
                          trail.difficulty}
                      </Text>
                    </View>
                    {absoluteUploadUrl(trail.gpx_url) ? (
                      <SecondaryButton
                        label="Ouvrir / télécharger GPX"
                        icon="download-outline"
                        onPress={() =>
                          Linking.openURL(absoluteUploadUrl(trail.gpx_url))
                        }
                      />
                    ) : null}
                    <SecondaryButton
                      label="Supprimer uniquement cette trace"
                      icon="trash-outline"
                      onPress={() =>
                        actionsRef.current.deleteTrail(trail.id, trail.name)
                      }
                    />
                  </View>
                );
              })}
            </>
          )}
        </Section>

        <Section
          title="Autres traces (communauté)"
          subtitle="Traces des autres utilisateurs. Filtre par difficulté."
          icon="navigate-outline"
        >
          <Text style={styles.fieldLabel}>Filtrer la liste</Text>
          <View style={styles.roleRow}>
            {["all", "easy", "medium", "hard"].map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.roleChip,
                  trailListFilter === level && styles.roleChipActive,
                ]}
                onPress={() => setTrailListFilter(level)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    trailListFilter === level && styles.roleChipTextActive,
                  ]}
                >
                  {level === "all" ? "Tous" : DIFFICULTY_LABELS[level]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {communityTrails.map((trail) => {
            const b = difficultyBadgeStyle(trail.difficulty);
            return (
              <View key={`co-trail-${trail.id}`} style={styles.card}>
                <View style={styles.cardAccent} />
                <Text style={styles.cardTitle}>{trail.name}</Text>
                <Text style={styles.cardMeta}>
                  {trail.territory} · {trail.distance_km} km · D+{" "}
                  {trail.elevation_m} m
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
            );
          })}
          {communityTrails.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune autre trace avec ce filtre.
            </Text>
          ) : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function HostScreen() {
  const { user, hostForm, setHostForm, hostBoxes, hostBookings, actionsRef } =
    useAppMain();
  const canHostLocal = user?.role === "host" || user?.role === "both";
  const hostLat = Number(hostForm.latitude) || 45.8992;
  const hostLon = Number(hostForm.longitude) || 6.1294;
  const [selectedBoxIds, setSelectedBoxIds] = useState([]);

  useEffect(() => {
    if (!canHostLocal) return;
    actionsRef.current.loadHostBoxes();
    actionsRef.current.loadHostBookings();
  }, [canHostLocal, actionsRef]);

  useEffect(() => {
    setSelectedBoxIds((prev) =>
      prev.filter((id) => hostBoxes.some((b) => b.id === id))
    );
  }, [hostBoxes]);

  const toggleBoxSelect = (id) => {
    setSelectedBoxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllBoxesToggle = () => {
    if (hostBoxes.length === 0) return;
    if (selectedBoxIds.length === hostBoxes.length) {
      setSelectedBoxIds([]);
    } else {
      setSelectedBoxIds(hostBoxes.map((b) => b.id));
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
              <TextInput
                style={styles.input}
                placeholder="Remplie automatiquement depuis le point bleu"
                placeholderTextColor={theme.inkMuted}
                value={hostForm.city}
                onChangeText={(v) => setHostForm((s) => ({ ...s, city: v }))}
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
                label="Publier mon box"
                icon="rocket-outline"
                onPress={() => actionsRef.current.createHostBox()}
              />
            </>
          )}
        </Section>
        {canHostLocal ? (
          <Section
            title="Mes box actives"
            subtitle="Toutes tes box publiées actuellement."
            icon="layers-outline"
          >
            {hostBoxes.length > 0 ? (
              <OutlineButton
                danger
                stretch
                label="Supprimer tous mes box"
                icon="trash-outline"
                onPress={() => actionsRef.current.deleteAllHostBoxes()}
              />
            ) : null}
            {hostBoxes.map((box) => (
              <View key={`host-box-${box.id}`} style={styles.card}>
                <View style={styles.cardAccent} />
                <Text style={styles.cardTitle}>{box.title}</Text>
                <Text style={styles.cardMeta}>
                  {box.city} · {(box.price_cents / 100).toFixed(2)} €
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
                  <Text style={styles.cardAvailability}>{box.description}</Text>
                ) : null}
                {box.availability_note ? (
                  <Text style={styles.cardAvailability}>
                    {box.availability_note}
                  </Text>
                ) : null}
                <OutlineButton
                  danger
                  stretch
                  label="Supprimer ce box"
                  icon="trash-outline"
                  onPress={() =>
                    actionsRef.current.deleteHostBox(box.id, box.title)
                  }
                />
              </View>
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
            title="Réservations reçues"
            subtitle="Accepte ou refuse les demandes des athlètes."
            icon="calendar-outline"
          >
            {hostBookings.map((b) => {
              const approval = b.approval_status || "pending";
              return (
                <View key={`host-booking-${b.id}`} style={styles.card}>
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardTitle}>
                    {b.box_title || `Box #${b.box_id}`}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {b.athlete_full_name || "Athlète"} · {b.booking_date}{" "}
                    {b.start_time}-{b.end_time}
                  </Text>
                  <Text style={styles.cardDetailLine}>
                    Statut: {approval} · gain hôte{" "}
                    {(Number(b.host_earnings_cents || 0) / 100).toFixed(2)} €
                  </Text>
                  {b.special_request ? (
                    <Text style={styles.cardAvailability}>
                      Demande: {b.special_request}
                    </Text>
                  ) : null}
                  {approval === "pending" ? (
                    <>
                      <PrimaryButton
                        label="Accepter"
                        icon="checkmark-outline"
                        onPress={() =>
                          actionsRef.current.decideHostBooking(b.id, "accept")
                        }
                      />
                      <SecondaryButton
                        label="Refuser"
                        icon="close-outline"
                        onPress={() =>
                          actionsRef.current.decideHostBooking(b.id, "reject")
                        }
                      />
                    </>
                  ) : null}
                  <SecondaryButton
                    label="Supprimer cette entrée"
                    icon="trash-outline"
                    onPress={() =>
                      actionsRef.current.deleteHostBooking(
                        b.id,
                        b.box_title || `Box #${b.box_id}`
                      )
                    }
                  />
                </View>
              );
            })}
            {hostBookings.length === 0 ? (
              <Text style={styles.emptyText}>Aucune réservation reçue.</Text>
            ) : null}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileScreen() {
  const { user, canBook, athleteBookings, actionsRef } = useAppMain();
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;
  const canEnableBoth = user?.role !== "both";

  useEffect(() => {
    if (!canBook) return;
    actionsRef.current.loadAthleteBookings();
  }, [canBook, actionsRef]);

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
        {canBook ? (
          <Section
            title="Mes réservations (athlète)"
            subtitle="Tes demandes de box : tu peux retirer une entrée ou tout effacer."
            icon="calendar-outline"
          >
            {athleteBookings.length > 0 ? (
              <SecondaryButton
                label="Effacer tout mon historique de réservations"
                icon="trash-outline"
                onPress={() => actionsRef.current.deleteAllAthleteBookings()}
              />
            ) : null}
            {athleteBookings.map((b) => {
              const approval = b.approval_status || "pending";
              return (
                <View key={`ath-booking-${b.id}`} style={styles.card}>
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
                  <Text style={styles.cardDetailLine}>
                    Statut : {approval}
                    {b.access_code ? ` · code ${b.access_code}` : ""}
                  </Text>
                  {b.special_request ? (
                    <Text style={styles.cardAvailability}>
                      Demande : {b.special_request}
                    </Text>
                  ) : null}
                  <SecondaryButton
                    label="Supprimer cette entrée"
                    icon="trash-outline"
                    onPress={() =>
                      actionsRef.current.deleteAthleteBooking(b.id)
                    }
                  />
                </View>
              );
            })}
            {athleteBookings.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucune réservation enregistrée.
              </Text>
            ) : null}
          </Section>
        ) : null}
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
  const [bookingDate, setBookingDate] = useState("2026-04-01");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [city, setCity] = useState("Annecy");
  const [trailDifficulty, setTrailDifficulty] = useState("medium");
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [hostForm, setHostForm] = useState({
    title: "",
    description: "",
    availabilityNote: "",
    latitude: "45.8992",
    longitude: "6.1294",
    city: "Annecy",
    priceCents: "700",
    capacityLiters: "20",
    hasWater: true,
    criteriaTags: [],
  });
  const [hostBoxes, setHostBoxes] = useState([]);
  const [hostBookings, setHostBookings] = useState([]);
  const [athleteBookings, setAthleteBookings] = useState([]);
  const [mapLat, setMapLat] = useState("45.8992");
  const [mapLon, setMapLon] = useState("6.1294");
  const [specialRequest, setSpecialRequest] = useState("");
  const [webDropHover, setWebDropHover] = useState(false);
  const [trailListFilter, setTrailListFilter] = useState("all");
  const [mapShowTrails, setMapShowTrails] = useState(true);
  const [mapTrailDifficultyFilter, setMapTrailDifficultyFilter] =
    useState("all");
  const [mapTrailsScope, setMapTrailsScope] = useState("all");
  const [mapShowBoxes, setMapShowBoxes] = useState(true);
  const [mapBoxCriteriaTags, setMapBoxCriteriaTags] = useState([]);
  const [mapListSource, setMapListSource] = useState("city");
  const [mapBoxesNearTrailsOnly, setMapBoxesNearTrailsOnly] = useState(false);
  const [mapTrailProximityKm, setMapTrailProximityKm] = useState("3");

  useEffect(() => {
    if (!user) setMapTrailsScope("all");
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
    if (mapTrailsScope === "mine" && user?.id != null) {
      const uid = Number(user.id);
      t = t.filter((tr) => Number(tr.creator_user_id) === uid);
    }
    if (mapTrailDifficultyFilter !== "all") {
      t = t.filter((tr) => tr.difficulty === mapTrailDifficultyFilter);
    }
    return t;
  }, [
    trails,
    mapShowTrails,
    mapTrailsScope,
    mapTrailDifficultyFilter,
    user?.id,
  ]);

  const boxesForMap = useMemo(() => {
    if (!mapShowBoxes) return [];
    let list = boxes;
    if (mapBoxCriteriaTags?.length > 0) {
      list = list.filter((box) => {
        const tags = parseBoxCriteria(box);
        return mapBoxCriteriaTags.some((c) => tags.includes(c));
      });
    }
    if (mapBoxesNearTrailsOnly && trailsForMap.length > 0) {
      const km = Math.max(0.1, parseFloat(mapTrailProximityKm) || 3);
      list = list.filter((box) => {
        const d = minDistanceKmFromBoxToTrails(box, trailsForMap);
        return d <= km;
      });
    }
    return list;
  }, [
    boxes,
    mapShowBoxes,
    mapBoxCriteriaTags,
    mapBoxesNearTrailsOnly,
    mapTrailProximityKm,
    trailsForMap,
  ]);

  const selectedBox = boxes.find((box) => box.id === selectedBoxId) || null;

  const webMapCenter = selectedBox
    ? [selectedBox.latitude, selectedBox.longitude]
    : [parseFloat(mapLat) || 45.8992, parseFloat(mapLon) || 6.1294];

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

  const loadAthleteBookings = async () => {
    if (!token) return;
    try {
      const rows = await apiFetch("/bookings", { token });
      setAthleteBookings(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadNearbyBoxes = async () => {
    const lat = parseFloat(mapLat);
    const lon = parseFloat(mapLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      userAlert("Position", "Indique une latitude et une longitude valides.");
      return;
    }
    try {
      const rows = await apiFetch(
        `/boxes/nearby?lat=${lat}&lon=${lon}&limit=35`
      );
      setBoxes(rows);
      setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const loadTrails = async () => {
    try {
      const rows = await apiFetch("/trails");
      setTrails(Array.isArray(rows) ? rows : []);
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  useEffect(() => {
    if (mapListSource !== "city") return;
    const t = setTimeout(() => {
      const q = city.trim();
      if (q.length < 2) return;
      (async () => {
        try {
          const rows = await apiFetch(`/boxes?city=${encodeURIComponent(q)}`);
          setBoxes(rows);
          setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
        } catch (error) {
          userAlert("Erreur", error.message);
        }
      })();
    }, 550);
    return () => clearTimeout(t);
  }, [city, mapListSource]);

  useEffect(() => {
    if (mapListSource !== "nearby") return;
    const t = setTimeout(() => {
      const lat = parseFloat(mapLat);
      const lon = parseFloat(mapLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      (async () => {
        try {
          const rows = await apiFetch(
            `/boxes/nearby?lat=${lat}&lon=${lon}&limit=35`
          );
          setBoxes(rows);
          setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
        } catch (error) {
          userAlert("Erreur", error.message);
        }
      })();
    }, 550);
    return () => clearTimeout(t);
  }, [mapLat, mapLon, mapListSource]);

  useEffect(() => {
    const lat = parseFloat(hostForm.latitude);
    const lng = parseFloat(hostForm.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const t = setTimeout(() => {
      (async () => {
        try {
          const data = await apiFetch(
            `/geocode/reverse?lat=${encodeURIComponent(
              lat
            )}&lon=${encodeURIComponent(lng)}`
          );
          if (data?.city && typeof data.city === "string") {
            setHostForm((s) => ({ ...s, city: data.city }));
          }
        } catch {
          /* géocodage optionnel */
        }
      })();
    }, 650);
    return () => clearTimeout(t);
  }, [hostForm.latitude, hostForm.longitude]);

  const bookBox = async (boxId) => {
    if (!canBook) {
      userAlert(
        "Rôle athlète",
        "Seuls les comptes Athlète ou Les deux peuvent réserver une box."
      );
      return;
    }
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
      userAlert(
        "Réservation enregistrée",
        `Code d’accès : ${result.access_code}${
          result.special_request ? `\nDemande : ${result.special_request}` : ""
        }`
      );
      await loadAthleteBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
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
    try {
      await apiFetch("/host/boxes", {
        method: "POST",
        token,
        body: {
          title: hostForm.title,
          description: hostForm.description,
          latitude: Number(hostForm.latitude),
          longitude: Number(hostForm.longitude),
          city: hostForm.city,
          priceCents: Number(hostForm.priceCents),
          capacityLiters: Number(hostForm.capacityLiters),
          hasWater: Boolean(hostForm.hasWater),
          availabilityNote: hostForm.availabilityNote?.trim() || undefined,
          criteriaTags: hostForm.criteriaTags,
        },
      });
      userAlert("Publication", "Ton box est en ligne.");
      await loadBoxes();
      await loadHostBoxes();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const decideHostBooking = async (bookingId, decision) => {
    if (!token) return;
    try {
      await apiFetch(`/host/bookings/${bookingId}/decision`, {
        method: "PATCH",
        token,
        body: { decision },
      });
      await loadHostBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteHostBox = async (boxId, title) => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer ce box ?",
      `« ${
        title || "Box"
      } » sera retiré définitivement (réservations liées incluses).`
    );
    if (!ok) return;
    try {
      await apiFetch(`/host/boxes/${boxId}`, { method: "DELETE", token });
      userAlert("Supprimé", "Le box a été retiré.");
      await refetchExplorerBoxes();
      await loadHostBoxes();
      await loadHostBookings();
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
          apiFetch(`/host/boxes/${id}`, { method: "DELETE", token })
        )
      );
      userAlert("OK", n === 1 ? "Box supprimé." : `${n} box supprimés.`);
      await loadBoxes();
      await loadHostBoxes();
      await loadHostBookings();
    } catch (error) {
      userAlert("Erreur", error.message);
    }
  };

  const deleteAllHostBoxes = async () => {
    if (!token) return;
    const ok = await confirmDestructive(
      "Supprimer tous tes box ?",
      "Action irréversible : chaque box et ses réservations seront supprimés."
    );
    if (!ok) return;
    try {
      await apiFetch("/host/boxes", { method: "DELETE", token });
      userAlert("OK", "Tous tes box ont été supprimés.");
      await refetchExplorerBoxes();
      await loadHostBoxes();
      await loadHostBookings();
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
    setHostForm((s) => ({
      ...s,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
  };

  const actionsRef = useRef({});

  actionsRef.current = {
    loadBoxes,
    loadHostBoxes,
    loadHostBookings,
    loadAthleteBookings,
    loadNearbyBoxes,
    loadTrails,
    bookBox,
    decideHostBooking,
    deleteHostBox,
    deleteHostBoxesByIds,
    deleteAllHostBoxes,
    deleteHostBooking,
    deleteAllHostBookings,
    deleteAthleteBooking,
    deleteAllAthleteBookings,
    setHostLocationFromMap,
    createHostBox,
    uploadGpx,
    uploadGpxWebFile,
    deleteTrail,
    deleteTrailsByIds,
    deleteAllMyTrails,
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
      hostBoxes,
      hostBookings,
      athleteBookings,
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
      canHost,
      canBook,
      selectedBox,
      webMapCenter,
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
      hostBoxes,
      hostBookings,
      athleteBookings,
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
      bookingDate,
      startTime,
      endTime,
      specialRequest,
      selectedBoxId,
      canHost,
      canBook,
      selectedBox,
      webMapCenter,
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
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!isAuthed ? (
                  <Stack.Screen name="Auth" component={AuthScreen} />
                ) : (
                  <Stack.Screen name="Main" component={AuthenticatedRoot} />
                )}
              </Stack.Navigator>
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
  explorerWebScroll: {
    flex: 1,
    minHeight: 0,
  },
  explorerWebMapHost: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: theme.bg,
  },
  explorerWebMapInner: {
    height: 320,
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
    marginTop: 8,
    fontWeight: "700",
    color: theme.ink,
    fontSize: 15,
  },
  dropZoneHint: {
    marginTop: 4,
    fontSize: 12,
    color: theme.inkMuted,
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
