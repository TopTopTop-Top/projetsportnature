import "react-native-gesture-handler";
import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://projetsportnature.onrender.com/api";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

async function apiFetch(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function Section({ title, subtitle, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function PrimaryButton({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.primaryButton} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.secondaryButton} onPress={onPress}>
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

  const [boxes, setBoxes] = useState([]);
  const [trails, setTrails] = useState([]);
  const [bookingDate, setBookingDate] = useState("2026-04-01");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [city, setCity] = useState("Annecy");
  const [trailDifficulty, setTrailDifficulty] = useState("medium");
  const [hostForm, setHostForm] = useState({
    title: "",
    description: "",
    latitude: "45.8992",
    longitude: "6.1294",
    city: "Annecy",
    priceCents: "700",
    capacityLiters: "20",
  });

  const isAuthed = useMemo(() => Boolean(token), [token]);

  const register = async () => {
    try {
      const result = await apiFetch("/auth/register", {
        method: "POST",
        body: { fullName, email, password, role },
      });
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      Alert.alert("Compte cree", "Bienvenue sur RavitoBox.");
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
  };

  const login = async () => {
    try {
      const result = await apiFetch("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(result.token);
      setRefreshToken(result.refreshToken);
      setUser(result.user);
      Alert.alert("Connexion ok", `Salut ${result.user.full_name}`);
    } catch (error) {
      Alert.alert("Erreur", error.message);
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
    }
  };

  const loadBoxes = async () => {
    try {
      const rows = await apiFetch(`/boxes?city=${encodeURIComponent(city)}`);
      setBoxes(rows);
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
    try {
      const result = await apiFetch("/bookings", {
        method: "POST",
        token,
        body: { boxId, bookingDate, startTime, endTime },
      });
      Alert.alert("Reservation validee", `Code: ${result.access_code}`);
    } catch (error) {
      Alert.alert("Erreur", error.message);
    }
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

      const response = await fetch(`${API_BASE_URL}/trails/upload-gpx`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      Alert.alert(
        "Trace importee",
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

  function AuthScreen() {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>RavitoBox</Text>
          <Text style={styles.heroSubtitle}>
            Loue des box ravito et explore des traces outdoor locales.
          </Text>
        </View>
        <View style={styles.panel}>
          <TextInput
            style={styles.input}
            placeholder="Nom complet"
            value={fullName}
            onChangeText={setFullName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View style={styles.roleRow}>
            {["athlete", "host", "both"].map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.roleChip, role === r && styles.roleChipActive]}
                onPress={() => setRole(r)}
              >
                <Text
                  style={[
                    styles.roleChipText,
                    role === r && styles.roleChipTextActive,
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton label={`S'inscrire (${role})`} onPress={register} />
          <SecondaryButton label="Se connecter" onPress={login} />
        </View>
      </SafeAreaView>
    );
  }

  function ExplorerScreen() {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Section
            title="Explorer les box"
            subtitle="Trouve des points ravito sur ton parcours."
          >
            <TextInput
              style={styles.input}
              placeholder="Ville"
              value={city}
              onChangeText={setCity}
            />
            <PrimaryButton label="Charger les box" onPress={loadBoxes} />
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>
                {boxes.length} box disponibles
              </Text>
              <Text style={styles.bannerText}>
                Carte web avancee arrive bientot.
              </Text>
            </View>
          </Section>

          <Section title="Reservation rapide">
            <View style={styles.row}>
              <TextInput
                style={styles.inputHalf}
                value={bookingDate}
                onChangeText={setBookingDate}
              />
              <TextInput
                style={styles.inputHalf}
                value={startTime}
                onChangeText={setStartTime}
              />
              <TextInput
                style={styles.inputHalf}
                value={endTime}
                onChangeText={setEndTime}
              />
            </View>
          </Section>

          <Section title="Liste des box">
            <FlatList
              data={boxes}
              scrollEnabled={false}
              keyExtractor={(item) => `${item.id}`}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>
                    {item.city} · {(item.price_cents / 100).toFixed(2)} EUR
                  </Text>
                  <SecondaryButton
                    label="Reserver ce box"
                    onPress={() => bookBox(item.id)}
                  />
                </View>
              )}
            />
          </Section>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function TrailsScreen() {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Section
            title="Traces locales"
            subtitle="Importe ou consulte des parcours par difficulte."
          >
            <View style={styles.roleRow}>
              {["easy", "medium", "hard"].map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.roleChip,
                    trailDifficulty === level && styles.roleChipActive,
                  ]}
                  onPress={() => setTrailDifficulty(level)}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      trailDifficulty === level && styles.roleChipTextActive,
                    ]}
                  >
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryButton label="Charger les traces" onPress={loadTrails} />
            <SecondaryButton label="Uploader un GPX" onPress={uploadGpx} />
          </Section>

          <Section title="Traces disponibles">
            {trails.map((trail) => (
              <View key={`${trail.id}`} style={styles.card}>
                <Text style={styles.cardTitle}>{trail.name}</Text>
                <Text style={styles.cardMeta}>
                  {trail.territory} · {trail.distance_km} km · D+{" "}
                  {trail.elevation_m} m
                </Text>
                <Text style={styles.badge}>{trail.difficulty}</Text>
              </View>
            ))}
            {trails.length === 0 ? (
              <Text style={styles.emptyText}>Aucune trace chargee.</Text>
            ) : null}
          </Section>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function HostScreen() {
    const canHost = user?.role === "host" || user?.role === "both";
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Section
            title="Publier un box"
            subtitle="Gagne une commission en accueillant des sportifs."
          >
            {!canHost ? (
              <Text style={styles.emptyText}>
                Ton compte doit etre en role host ou both.
              </Text>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Titre"
                  value={hostForm.title}
                  onChangeText={(v) => setHostForm((s) => ({ ...s, title: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Description"
                  value={hostForm.description}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, description: v }))
                  }
                />
                <TextInput
                  style={styles.input}
                  placeholder="Latitude"
                  value={hostForm.latitude}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, latitude: v }))
                  }
                />
                <TextInput
                  style={styles.input}
                  placeholder="Longitude"
                  value={hostForm.longitude}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, longitude: v }))
                  }
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ville"
                  value={hostForm.city}
                  onChangeText={(v) => setHostForm((s) => ({ ...s, city: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Prix (centimes)"
                  value={hostForm.priceCents}
                  onChangeText={(v) =>
                    setHostForm((s) => ({ ...s, priceCents: v }))
                  }
                />
                <PrimaryButton
                  label="Publier mon box"
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
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Section title="Mon profil">
            <Text style={styles.profileLine}>Nom: {user?.full_name}</Text>
            <Text style={styles.profileLine}>Email: {user?.email}</Text>
            <Text style={styles.profileLine}>Role: {user?.role}</Text>
          </Section>
          <PrimaryButton
            label="Rafraichir la session"
            onPress={refreshSession}
          />
          <SecondaryButton label="Se deconnecter" onPress={logout} />
        </View>
      </SafeAreaView>
    );
  }

  function MainTabs() {
    return (
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#0B1220" },
          headerTintColor: "#fff",
          tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#E5EAF3" },
          tabBarActiveTintColor: "#1D4ED8",
          tabBarInactiveTintColor: "#6B7280",
        }}
      >
        <Tab.Screen name="Explorer" component={ExplorerScreen} />
        <Tab.Screen name="Trails" component={TrailsScreen} />
        <Tab.Screen name="Host" component={HostScreen} />
        <Tab.Screen name="Profil" component={ProfileScreen} />
      </Tab.Navigator>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthed ? (
            <Stack.Screen name="Auth" component={AuthScreen} />
          ) : (
            <Stack.Screen name="Main" component={MainTabs} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: "#0B1220",
    padding: 22,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  heroSubtitle: {
    color: "#C7D2FE",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#0B1220",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E6ECF5",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: "#64748B",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D6DEEA",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: "#FAFCFF",
  },
  inputHalf: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D6DEEA",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: "#FAFCFF",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  roleChip: {
    borderWidth: 1,
    borderColor: "#C6D2E5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F8FAFF",
  },
  roleChipActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8",
  },
  roleChipText: {
    color: "#1E293B",
    fontWeight: "600",
  },
  roleChipTextActive: {
    color: "#fff",
  },
  primaryButton: {
    backgroundColor: "#1D4ED8",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  banner: {
    marginTop: 6,
    backgroundColor: "#E8EEFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#C9D8FF",
  },
  bannerTitle: {
    color: "#1E3A8A",
    fontWeight: "700",
  },
  bannerText: {
    marginTop: 2,
    color: "#334155",
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6ECF5",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: {
    fontWeight: "700",
    color: "#0F172A",
    fontSize: 16,
    marginBottom: 3,
  },
  cardMeta: {
    color: "#475569",
    marginBottom: 8,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    color: "#166534",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "700",
    overflow: "hidden",
  },
  emptyText: {
    color: "#64748B",
    fontStyle: "italic",
    marginTop: 6,
  },
  profileLine: {
    color: "#0F172A",
    marginBottom: 6,
  },
});
