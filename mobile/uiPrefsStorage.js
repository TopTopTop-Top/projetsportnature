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
