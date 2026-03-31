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
  process.env.EXPO_PUBLIC_API_URL || "https://ravitobox-api.onrender.com/api";
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
      Alert.alert("Compte cree", "Bienvenue sur RavitoBox");
    } catch (error) {
      Alert.alert("Erreur register", error.message);
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
      Alert.alert("Connecte", `Bonjour ${result.user.full_name}`);
    } catch (error) {
      Alert.alert("Erreur login", error.message);
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
      Alert.alert("Session rafraichie", "Token renouvelle");
    } catch (error) {
      Alert.alert("Erreur refresh", error.message);
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
      // no-op
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
      Alert.alert("Erreur boxes", error.message);
    }
  };

  const loadTrails = async () => {
    try {
      const rows = await apiFetch(
        `/trails?difficulty=${encodeURIComponent(trailDifficulty)}`
      );
      setTrails(rows);
    } catch (error) {
      Alert.alert("Erreur trails", error.message);
    }
  };

  const bookBox = async (boxId) => {
    try {
      const result = await apiFetch("/bookings", {
        method: "POST",
        token,
        body: { boxId, bookingDate, startTime, endTime },
      });
      Alert.alert("Reservation", `Code acces: ${result.access_code}`);
    } catch (error) {
      Alert.alert("Erreur reservation", error.message);
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
        "GPX importe",
        `${data.distanceKm} km / D+ ${data.elevationM} m`
      );
      await loadTrails();
    } catch (error) {
      Alert.alert("Erreur upload GPX", error.message);
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
      Alert.alert("Box cree", "Publication reussie");
      await loadBoxes();
    } catch (error) {
      Alert.alert("Erreur host", error.message);
    }
  };

  function AuthScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <Text style={styles.title}>RavitoBox</Text>
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
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setRole("athlete")}
          >
            <Text style={styles.buttonText}>Athlete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setRole("host")}
          >
            <Text style={styles.buttonText}>Host</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setRole("both")}
          >
            <Text style={styles.buttonText}>Both</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.buttonPrimary} onPress={register}>
          <Text style={styles.buttonText}>S'inscrire ({role})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonDark} onPress={login}>
          <Text style={styles.buttonText}>Se connecter</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  function ExplorerScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          <Text style={styles.title}>Explorer</Text>
          <TextInput
            style={styles.input}
            placeholder="Ville"
            value={city}
            onChangeText={setCity}
          />
          <TouchableOpacity style={styles.buttonPrimary} onPress={loadBoxes}>
            <Text style={styles.buttonText}>Charger boxes</Text>
          </TouchableOpacity>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              Carte desactivee (mode stabilise)
            </Text>
            <Text style={styles.mapPlaceholderText}>Boxes: {boxes.length}</Text>
          </View>
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
          <FlatList
            data={boxes}
            scrollEnabled={false}
            keyExtractor={(item) => `${item.id}`}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text>{item.city}</Text>
                <Text>Prix: {(item.price_cents / 100).toFixed(2)} EUR</Text>
                <TouchableOpacity
                  style={styles.buttonDark}
                  onPress={() => bookBox(item.id)}
                >
                  <Text style={styles.buttonText}>Reserver</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  function TrailsScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          <Text style={styles.title}>Trails</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setTrailDifficulty("easy")}
            >
              <Text style={styles.buttonText}>Easy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setTrailDifficulty("medium")}
            >
              <Text style={styles.buttonText}>Medium</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => setTrailDifficulty("hard")}
            >
              <Text style={styles.buttonText}>Hard</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.buttonPrimary} onPress={loadTrails}>
            <Text style={styles.buttonText}>Charger trails</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonDark} onPress={uploadGpx}>
            <Text style={styles.buttonText}>Uploader GPX</Text>
          </TouchableOpacity>
          {trails.map((trail) => (
            <View key={`${trail.id}`} style={styles.card}>
              <Text style={styles.cardTitle}>{trail.name}</Text>
              <Text>{trail.territory}</Text>
              <Text>
                {trail.distance_km} km - D+ {trail.elevation_m} m
              </Text>
              <Text>Difficulte: {trail.difficulty}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  function HostScreen() {
    const canHost = user?.role === "host" || user?.role === "both";
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          <Text style={styles.title}>Host</Text>
          {!canHost ? (
            <Text style={styles.card}>Compte host requis.</Text>
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
                placeholder="Prix centimes"
                value={hostForm.priceCents}
                onChangeText={(v) =>
                  setHostForm((s) => ({ ...s, priceCents: v }))
                }
              />
              <TouchableOpacity
                style={styles.buttonPrimary}
                onPress={createHostBox}
              >
                <Text style={styles.buttonText}>Publier box</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  function ProfileScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Profil</Text>
        <Text>Nom: {user?.full_name}</Text>
        <Text>Email: {user?.email}</Text>
        <Text>Role: {user?.role}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={refreshSession}
          >
            <Text style={styles.buttonText}>Refresh token</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonDark} onPress={logout}>
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function MainTabs() {
    return (
      <Tab.Navigator>
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
        <StatusBar style="auto" />
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
  container: { flex: 1, padding: 16, backgroundColor: "#F4F7FB" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#CCD3DF",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#FFF",
  },
  inputHalf: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CCD3DF",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#FFF",
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  button: {
    flex: 1,
    backgroundColor: "#4A7AFF",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#4A7AFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  buttonDark: {
    backgroundColor: "#20314F",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  buttonText: { color: "#FFF", fontWeight: "600" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  mapPlaceholder: {
    height: 120,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#E8EEF9",
    justifyContent: "center",
    alignItems: "center",
  },
  mapPlaceholderText: { color: "#20314F", fontWeight: "500" },
});
