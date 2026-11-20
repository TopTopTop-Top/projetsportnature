import { Platform } from "react-native";

const STORAGE_KEY = "ravitobox_auth_session_v1";

/** Fallback mémoire (natif avant hydrate / private mode). */
let memorySession = null;

function isValidSession(data) {
  return (
    data &&
    typeof data.token === "string" &&
    data.token &&
    typeof data.refreshToken === "string" &&
    data.refreshToken &&
    data.user &&
    typeof data.user === "object"
  );
}

function normalize(data) {
  if (!isValidSession(data)) return null;
  return {
    token: data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
}

function readWeb() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeWeb(session) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

function clearWeb() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let AsyncStorage = null;
try {
  // eslint-disable-next-line global-require
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {
  AsyncStorage = null;
}

/** Lecture sync (web) ou mémoire (natif après hydrate). */
export function readAuthSession() {
  if (Platform.OS === "web") return readWeb();
  return memorySession;
}

/** Hydrate natif au démarrage (AsyncStorage). */
export async function hydrateAuthSession() {
  if (Platform.OS === "web") return readWeb();
  if (!AsyncStorage) return memorySession;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memorySession = null;
      return null;
    }
    memorySession = normalize(JSON.parse(raw));
    return memorySession;
  } catch {
    return memorySession;
  }
}

export function writeAuthSession({ token, refreshToken, user }) {
  if (!token || !refreshToken || !user) return;
  const session = { token, refreshToken, user };
  memorySession = session;
  if (Platform.OS === "web") {
    writeWeb(session);
    return;
  }
  if (AsyncStorage) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(() => {});
  }
}

export function clearAuthSession() {
  memorySession = null;
  if (Platform.OS === "web") {
    clearWeb();
    return;
  }
  if (AsyncStorage) {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }
}
