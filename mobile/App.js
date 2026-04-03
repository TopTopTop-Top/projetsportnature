import "react-native-gesture-handler";
import React, { useEffect, useMemo, useState } from "react";
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
} from "react-native";
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
const DIFFICULTY_LABELS = {
  easy: "Facile",
  medium: "Modéré",
  hard: "Difficile",
};

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

function PrimaryButton({ label, onPress, icon, disabled, loading }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
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
            />
          ) : null}
          <Text style={styles.primaryButtonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress, icon }) {
  return (
    <TouchableOpacity
      style={styles.secondaryButton}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color="#fff"
          style={styles.buttonIconLeft}
        />
      ) : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
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
    latitude: "45.8992",
    longitude: "6.1294",
    city: "Annecy",
    priceCents: "700",
    capacityLiters: "20",
  });
  const [mapLat, setMapLat] = useState("45.8992");
  const [mapLon, setMapLon] = useState("6.1294");
  const [specialRequest, setSpecialRequest] = useState("");
  const [webDropHover, setWebDropHover] = useState(false);

  const isAuthed = useMemo(() => Boolean(token), [token]);
  const canHost = useMemo(
    () => user?.role === "host" || user?.role === "both",
    [user?.role]
  );
  const canBook = useMemo(
    () => user?.role === "athlete" || user?.role === "both",
    [user?.role]
  );

  const selectedBox = boxes.find((box) => box.id === selectedBoxId) || null;

  const webMapCenter = selectedBox
    ? [selectedBox.latitude, selectedBox.longitude]
    : [
        parseFloat(mapLat) || 45.8992,
        parseFloat(mapLon) || 6.1294,
      ];

  const register = async () => {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) {
      Alert.alert("Nom manquant", "Indique ton nom ou pseudo affiché.");
      return;
    }
    if (!mail || !mail.includes("@")) {
      Alert.alert("Email invalide", "Vérifie ton adresse email.");
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert(
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
      Alert.alert("Compte créé", "Bienvenue sur RavitoBox.");
    } catch (error) {
      Alert.alert("Inscription impossible", error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async () => {
    const mail = email.trim().toLowerCase();
    if (!mail || !mail.includes("@")) {
      Alert.alert("Email invalide", "Saisis l’email de ton compte.");
      return;
    }
    if (!password) {
      Alert.alert("Mot de passe", "Saisis ton mot de passe.");
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
      Alert.alert("Connexion", `Bonjour ${result.user.full_name} !`);
    } catch (error) {
      Alert.alert("Connexion refusée", error.message);
    } finally {
      setAuthLoading(false);
    }
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
      Alert.alert("Session", "Token rafraichi");
    } catch (error) {
      Alert.alert("Erreur", error.message);
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
      setAuthMode("login");
    }
  };

  const loadBoxes = async () => {
    try {
      const rows = await apiFetch(`/boxes?city=${encodeURIComponent(city)}`);
      setBoxes(rows);
      setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  const loadNearbyBoxes = async () => {
    const lat = parseFloat(mapLat);
    const lon = parseFloat(mapLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      Alert.alert("Position", "Indique une latitude et une longitude valides.");
      return;
    }
    try {
      const rows = await apiFetch(
        `/boxes/nearby?lat=${lat}&lon=${lon}&limit=35`
      );
      setBoxes(rows);
      setSelectedBoxId(rows.length > 0 ? rows[0].id : null);
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  const loadTrails = async () => {
    try {
      const rows = await apiFetch(
        `/trails?difficulty=${encodeURIComponent(trailDifficulty)}`
      );
      setTrails(rows);
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  const bookBox = async (boxId) => {
    if (!canBook) {
      Alert.alert(
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
      Alert.alert(
        "Réservation enregistrée",
        `Code d’accès : ${result.access_code}${
          result.special_request ? `\nDemande : ${result.special_request}` : ""
        }`
      );
    } catch (error) {
      Alert.alert("Erreur", error.message);
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
      formData.append("name", file.name.replace(".gpx", ""));
      formData.append("territory", city);
      formData.append("difficulty", trailDifficulty);
      formData.append("gpx", {
        uri: file.uri,
        name: file.name || "trace.gpx",
        type: file.mimeType || "application/gpx+xml",
      });

      const data = await uploadGpxWithFormData(formData);
      Alert.alert(
        "Trace importée",
        `${data.distanceKm} km / D+ ${data.elevationM} m`
      );
      await loadTrails();
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  const uploadGpxWebFile = async (file) => {
    if (!file) return;
    const name = file.name || "trace.gpx";
    if (!name.toLowerCase().endsWith(".gpx")) {
      Alert.alert("Format", "Utilise un fichier .gpx");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("name", name.replace(".gpx", ""));
      formData.append("territory", city);
      formData.append("difficulty", trailDifficulty);
      formData.append("gpx", file);
      const data = await uploadGpxWithFormData(formData);
      Alert.alert(
        "Trace importée",
        `${data.distanceKm} km / D+ ${data.elevationM} m`
      );
      await loadTrails();
    } catch (error) {
      Alert.alert("Erreur", error.message);
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
          hasWater: true,
        },
      });
      Alert.alert("Publication", "Ton box est en ligne.");
      await loadBoxes();
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  function WebInteractiveMap() {
    if (Platform.OS !== "web") {
      return (
        <View style={styles.infoBanner}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={theme.primary}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Carte sur le web</Text>
            <Text style={styles.infoBannerText}>
              Sur mobile, la liste des box et les distances affichées
              ci-dessous remplacent la carte interactive.
            </Text>
          </View>
        </View>
      );
    }

    // eslint-disable-next-line global-require
    require("leaflet/dist/leaflet.css");
    // eslint-disable-next-line global-require
    const {
      MapContainer,
      TileLayer,
      Marker,
      Popup,
      Polyline,
    } = require("react-leaflet");

    return (
      <View style={styles.webMapWrapper}>
        <MapContainer
          center={webMapCenter}
          zoom={12}
          scrollWheelZoom
          style={{ height: 420, width: "100%", borderRadius: 12 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {trails.map((trail) => {
            let positions = [];
            try {
              if (trail.polyline_json) {
                positions = JSON.parse(trail.polyline_json);
              }
            } catch (_e) {
              positions = [];
            }
            if (!positions.length) return null;
            return (
              <Polyline
                key={`trail-line-${trail.id}`}
                positions={positions}
                pathOptions={{ color: "#0F766E", weight: 4, opacity: 0.85 }}
              />
            );
          })}
          {boxes.map((box) => (
            <Marker
              key={`map-${box.id}`}
              position={[box.latitude, box.longitude]}
              eventHandlers={{
                click: () => setSelectedBoxId(box.id),
              }}
            >
              <Popup>
                <strong>{box.title}</strong>
                <br />
                {box.city} · {(box.price_cents / 100).toFixed(2)} €
                {box.distance_km != null && (
                  <>
                    <br />
                    ≈ {Number(box.distance_km).toFixed(1)} km
                  </>
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </View>
    );
  }

  function AuthScreen() {
    const isRegister = authMode === "register";
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <StatusBar style="light" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
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
                  <Text style={styles.heroKicker}>
                    Outdoor & ravitaillement
                  </Text>
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
                  />
                  <Text
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
                  />
                  <Text
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
                    Athlète : réserver des box. Hôte : en publier. Les deux :
                    les deux.
                  </Text>
                  <View style={styles.roleRow}>
                    {["athlete", "host", "both"].map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.roleChip,
                          role === r && styles.roleChipActive,
                        ]}
                        onPress={() => setRole(r)}
                        activeOpacity={0.85}
                        disabled={authLoading}
                      >
                        <Text
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
                <PrimaryButton
                  label="Se connecter"
                  icon="arrow-forward-outline"
                  onPress={login}
                  loading={authLoading}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function ExplorerScreen() {
    useEffect(() => {
      loadTrails();
      loadBoxes();
      // chargement initial carte + tracés
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.content, WEB_READABLE]}
          showsVerticalScrollIndicator={false}
        >
          <Section
            title="Carte & hôtes"
            subtitle={
              canHost && !canBook
                ? "Vue hôte : les athlètes réservent depuis leur compte."
                : "Repère les box, les tracés GPX importés, et les hôtes les plus proches."
            }
            icon="map-outline"
          >
            <Text style={styles.inputLabel}>Centre carte (lat / lon)</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.inputHalf}
                placeholder="Latitude"
                placeholderTextColor={theme.inkMuted}
                value={mapLat}
                onChangeText={setMapLat}
              />
              <TextInput
                style={styles.inputHalf}
                placeholder="Longitude"
                placeholderTextColor={theme.inkMuted}
                value={mapLon}
                onChangeText={setMapLon}
              />
            </View>
            <PrimaryButton
              label="Hôtes les plus proches"
              icon="navigate-outline"
              onPress={loadNearbyBoxes}
            />
            <Text style={styles.inputLabel}>Ou par ville</Text>
            <TextInput
              style={styles.input}
              placeholder="Ville"
              placeholderTextColor={theme.inkMuted}
              value={city}
              onChangeText={setCity}
            />
            <SecondaryButton
              label="Charger les box (ville)"
              icon="refresh-outline"
              onPress={loadBoxes}
            />
            <View style={styles.statBanner}>
              <View style={styles.statBannerIcon}>
                <Ionicons name="cube-outline" size={22} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statBannerTitle}>
                  {boxes.length === 0
                    ? "Aucune box chargée"
                    : `${boxes.length} box affichée${boxes.length > 1 ? "s" : ""}`}
                </Text>
                <Text style={styles.statBannerText}>
                  Web : tracés verts + marqueurs box. Clique un marqueur pour le
                  détail.
                </Text>
              </View>
            </View>
            <WebInteractiveMap />
            {selectedBox ? (
              <View style={styles.selectedHostCard}>
                <Text style={styles.selectedLabel}>Box sélectionnée</Text>
                <Text style={styles.cardTitle}>{selectedBox.title}</Text>
                <Text style={styles.cardMeta}>
                  {selectedBox.city} ·{" "}
                  {(selectedBox.price_cents / 100).toFixed(2)} €
                  {selectedBox.distance_km != null && (
                    <>
                      {" "}
                      · ≈ {Number(selectedBox.distance_km).toFixed(1)} km
                    </>
                  )}
                </Text>
                {canBook ? (
                  <SecondaryButton
                    label="Réserver ce box"
                    icon="calendar-outline"
                    onPress={() => bookBox(selectedBox.id)}
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
                  <PrimaryButton
                    label="Voir sur la carte"
                    icon="location-outline"
                    onPress={() => setSelectedBoxId(item.id)}
                  />
                  {canBook ? (
                    <SecondaryButton
                      label="Réserver"
                      icon="checkmark-circle-outline"
                      onPress={() => bookBox(item.id)}
                    />
                  ) : null}
                </View>
              )}
            />
          </Section>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function TrailsScreen() {
    const webDropProps =
      Platform.OS === "web"
        ? {
            onDragOver: (e) => {
              e.preventDefault();
              setWebDropHover(true);
            },
            onDragLeave: () => setWebDropHover(false),
            onDrop: (e) => {
              e.preventDefault();
              setWebDropHover(false);
              const f = e.dataTransfer?.files?.[0];
              uploadGpxWebFile(f);
            },
          }
        : {};

    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.content, WEB_READABLE]}
          showsVerticalScrollIndicator={false}
        >
          <Section
            title="Traces locales"
            subtitle="Athlètes et hôtes : importez vos GPX. Elles apparaissent sur la carte (web)."
            icon="footsteps-outline"
          >
            {Platform.OS === "web" ? (
              <View
                style={[
                  styles.dropZone,
                  webDropHover && styles.dropZoneActive,
                ]}
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
                  ou utilise le bouton ci-dessous (mobile / fichier)
                </Text>
              </View>
            ) : null}
            <Text style={styles.fieldLabel}>Difficulté</Text>
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
            <PrimaryButton
              label="Charger les traces"
              icon="download-outline"
              onPress={loadTrails}
            />
            <SecondaryButton
              label="Importer un GPX"
              icon="cloud-upload-outline"
              onPress={uploadGpx}
            />
          </Section>

          <Section title="Traces disponibles" icon="navigate-outline">
            {trails.map((trail) => {
              const b = difficultyBadgeStyle(trail.difficulty);
              return (
                <View key={`${trail.id}`} style={styles.card}>
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
                </View>
              );
            })}
            {trails.length === 0 ? (
              <Text style={styles.emptyText}>Aucune trace chargée.</Text>
            ) : null}
          </Section>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function HostScreen() {
    const canHost = user?.role === "host" || user?.role === "both";
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.content, WEB_READABLE]}
          showsVerticalScrollIndicator={false}
        >
          <Section
            title="Publier un box"
            subtitle="Accueille des sportifs et propose ton point ravito."
            icon="storefront-outline"
          >
            {!canHost ? (
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
                  style={styles.input}
                  placeholder="Description"
                  placeholderTextColor={theme.inkMuted}
                  value={hostForm.description}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, description: v }))
                  }
                  multiline
                />
                <Text style={styles.fieldLabel}>Localisation</Text>
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
                <TextInput
                  style={styles.input}
                  placeholder="Ville"
                  placeholderTextColor={theme.inkMuted}
                  value={hostForm.city}
                  onChangeText={(v) => setHostForm((s) => ({ ...s, city: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Prix (centimes)"
                  placeholderTextColor={theme.inkMuted}
                  value={hostForm.priceCents}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, priceCents: v }))
                  }
                  keyboardType="number-pad"
                />
                <PrimaryButton
                  label="Publier mon box"
                  icon="rocket-outline"
                  onPress={createHostBox}
                />
              </>
            )}
          </Section>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function ProfileScreen() {
    const roleLabel = ROLE_LABELS[user?.role] || user?.role;
    return (
      <SafeAreaView style={styles.screen} edges={["left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.content, WEB_READABLE]}
          showsVerticalScrollIndicator={false}
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
          <PrimaryButton
            label="Rafraîchir la session"
            icon="refresh-outline"
            onPress={refreshSession}
          />
          <SecondaryButton
            label="Se déconnecter"
            icon="log-out-outline"
            onPress={logout}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  function MainTabs() {
    return (
      <Tab.Navigator
        screenOptions={({ route }) => ({
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!isAuthed ? (
              <Stack.Screen name="Auth" component={AuthScreen} />
            ) : (
              <Stack.Screen name="Main" component={MainTabs} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
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
  webMapWrapper: {
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
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
});
