import { Platform } from "react-native";

const STORAGE_KEY = "ravitobox_auth_session_v1";

/** @returns {{ token: string, refreshToken: string, user: object } | null} */
export function readAuthSession() {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (
        data &&
        typeof data.token === "string" &&
        data.token &&
        typeof data.refreshToken === "string" &&
        data.refreshToken &&
        data.user &&
        typeof data.user === "object"
      ) {
        return {
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
        };
      }
    }
  } catch {
    /* private mode / quota */
  }
  return null;
}

export function writeAuthSession({ token, refreshToken, user }) {
  if (!token || !refreshToken || !user) return;
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token, refreshToken, user })
      );
    }
  } catch {
    /* ignore */
  }
}

export function clearAuthSession() {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
