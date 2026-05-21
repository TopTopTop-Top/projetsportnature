const STORAGE_KEY = "ravitobox-explorer-saved-probes-v1";

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id;
  const trailId = Number(raw.trailId);
  if (!id || !Number.isFinite(trailId)) return null;
  const probe = raw.probe;
  if (!probe || !Number.isFinite(probe.lat) || !Number.isFinite(probe.lng)) {
    return null;
  }
  return {
    id: String(id),
    trailId,
    label: String(raw.label || "Point"),
    notes: String(raw.notes || ""),
    savedAt: Number(raw.savedAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.savedAt) || Date.now(),
    probe: { ...probe },
  };
}

export function loadExplorerSavedProbes() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter(Boolean);
  } catch {
    return [];
  }
}

export function persistExplorerSavedProbes(entries) {
  if (typeof localStorage === "undefined") return;
  try {
    const list = Array.isArray(entries)
      ? entries.map(normalizeEntry).filter(Boolean)
      : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}
