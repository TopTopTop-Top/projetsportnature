import { Platform } from "react-native";

/** Backend Node (Render « Web Service »), pas l’URL du site statique. */
export const PROD_API_BASE_URL = "https://projetsportnature.onrender.com/api";
export const DEV_API_BASE_URL = "http://localhost:3000/api";

function withApiSuffix(url) {
  if (!url || typeof url !== "string") return "";
  const t = url.trim().replace(/\/$/, "");
  if (!t) return "";
  return /\/api$/i.test(t) ? t : `${t}/api`;
}

/**
 * URL du backend JSON. En prod web sur Render : si EXPO_PUBLIC_API_URL pointe vers
 * le même hôte que la page (site statique), on utilise PROD_API_BASE_URL.
 */
export function getApiBaseUrl() {
  const envRaw =
    typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL
      ? String(process.env.EXPO_PUBLIC_API_URL).trim()
      : "";
  const envNorm = withApiSuffix(envRaw);

  if (typeof __DEV__ !== "undefined" && __DEV__) {
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

export const API_BASE_URL = getApiBaseUrl();

/** Origine du serveur (fichiers statiques /uploads, sans /api). */
export const API_STATIC_ORIGIN = API_BASE_URL.replace(/\/api\/?$/i, "");

export function absoluteUploadUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_STATIC_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function parseFieldErrorsFromApiError(errObj) {
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
 * Rempli par RavitoApp : refresh synchrone (ref) pour les retries 401 après rotation
 * du refresh token, et callbacks session / offline.
 */
export const apiAuthBridge = {
  getRefreshToken: () => null,
  applySessionTokens: (_access, _refresh) => {},
  onSessionExpired: () => {},
  onNetworkIssue: () => {},
  onNetworkOk: () => {},
};

let authRefreshPromise = null;

function throwIfHtmlResponse(trimmed, response, method, path, root) {
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.toLowerCase().startsWith("<html")
  ) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        `[api] HTML instead of JSON: ${method} ${path} on ${root} (status ${response.status}). Check EXPO_PUBLIC_API_URL / Render deploy.`
      );
    }
    throw new Error(
      "Le serveur a renvoyé une page au lieu de l’API. Réessaie dans un instant."
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
  let response;
  try {
    response = await fetch(`${root}/auth/refresh`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
  } catch (e) {
    apiAuthBridge.onNetworkIssue?.(e);
    return null;
  }
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
    apiAuthBridge.onNetworkOk?.();
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

/** True si l’erreur indique un refresh token invalide / expiré (pas un hors-ligne). */
export function isAuthSessionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token expired") ||
    msg.includes("invalid or expired token") ||
    msg.includes("jwt expired") ||
    msg.includes("session expirée")
  );
}

export async function apiFetch(
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
  let response;
  try {
    response = await fetch(`${root}${path}`, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    apiAuthBridge.onNetworkIssue?.(e);
    throw new Error(
      "Pas de connexion au serveur. Vérifie ton réseau ou réessaie plus tard."
    );
  }
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
      apiAuthBridge.onSessionExpired?.();
      throw new Error("Session expirée. Reconnecte-toi.");
    }
    const msg = errorMessageFromApiData(data, response, method, path);
    throw new Error(msg);
  }
  apiAuthBridge.onNetworkOk?.();
  return data;
}
