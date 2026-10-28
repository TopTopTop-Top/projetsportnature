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

export function subscribeSimpleUi(listener) {
  if (typeof listener !== "function") return () => {};
  const key = `_simple_ui_listeners`;
  if (!globalThis[key]) globalThis[key] = new Set();
  globalThis[key].add(listener);
  return () => globalThis[key]?.delete(listener);
}

export function notifySimpleUiListeners() {
  const set = globalThis._simple_ui_listeners;
  if (!set) return;
  const value = isSimpleUi();
  set.forEach((fn) => {
    try {
      fn(value);
    } catch {
      /* ignore */
    }
  });
}
