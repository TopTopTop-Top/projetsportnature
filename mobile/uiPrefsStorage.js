import { Platform } from "react-native";

const STORAGE_KEY = "ravitobox_ui_prefs_v1";
const memoryPrefs = {};

function readRaw() {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...memoryPrefs };
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? { ...memoryPrefs, ...data } : { ...memoryPrefs };
    }
  } catch {
    /* private mode / quota */
  }
  return { ...memoryPrefs };
}

function writeRaw(next) {
  const safe = next && typeof next === "object" ? { ...next } : {};
  Object.keys(memoryPrefs).forEach((k) => delete memoryPrefs[k]);
  Object.assign(memoryPrefs, safe);
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    }
  } catch {
    /* ignore */
  }
}

export function isGuideDismissed(guideId) {
  if (!guideId) return false;
  const prefs = readRaw();
  return !!prefs[`guide_dismissed_${guideId}`];
}

export function dismissGuide(guideId) {
  if (!guideId) return;
  const prefs = readRaw();
  prefs[`guide_dismissed_${guideId}`] = true;
  writeRaw(prefs);
}

export function undismissGuide(guideId) {
  if (!guideId) return;
  const prefs = readRaw();
  delete prefs[`guide_dismissed_${guideId}`];
  writeRaw(prefs);
}

/** Interface épurée (défaut). Mode expert = tout visible. */
export function isSimpleUi() {
  const prefs = readRaw();
  if (prefs.simple_ui === undefined || prefs.simple_ui === null) return true;
  return !!prefs.simple_ui;
}

export function setSimpleUi(enabled) {
  const prefs = readRaw();
  prefs.simple_ui = !!enabled;
  writeRaw(prefs);
}

/**
 * Casquettes du compte unique (après inscription).
 * user = demande / réserve ; host = box fixe ; ravito = ravitailleur mobile.
 */
export function defaultCapabilitiesFromRole(role) {
  const r = String(role || "athlete");
  if (r === "both") return { user: true, host: true, ravito: true };
  if (r === "host") return { user: false, host: true, ravito: true };
  return { user: true, host: false, ravito: false };
}

export function getCapabilities(userId) {
  if (userId == null) return null;
  const prefs = readRaw();
  const raw = prefs[`caps_${userId}`];
  if (!raw || typeof raw !== "object") return null;
  return {
    user: !!raw.user,
    host: !!raw.host,
    ravito: !!raw.ravito,
  };
}

export function setCapabilities(userId, caps) {
  if (userId == null || !caps) return;
  const prefs = readRaw();
  prefs[`caps_${userId}`] = {
    user: !!caps.user,
    host: !!caps.host,
    ravito: !!caps.ravito,
  };
  writeRaw(prefs);
}

/** Rôle API dérivé des casquettes (compat backend athlete/host/both). */
export function roleFromCapabilities(caps) {
  const user = !!caps?.user || !!caps?.ravito;
  const host = !!caps?.host;
  if (host && user) return "both";
  if (host) return "host";
  return "athlete";
}
