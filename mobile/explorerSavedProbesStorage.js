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
  const linkedBoxId = Number(raw.linkedBoxId);
  const publishedTipId = Number(raw.publishedTipId);
  const includeInPlan =
    raw.includeInPlan === false || raw.includeInPlan === 0 ? false : true;
  return {
    id: String(id),
    trailId,
    label: String(raw.label || "Point"),
    notes: String(raw.notes || ""),
    linkedBoxId: Number.isFinite(linkedBoxId) ? linkedBoxId : undefined,
    publishedTipId: Number.isFinite(publishedTipId)
      ? publishedTipId
      : undefined,
    includeInPlan,
    savedAt: Number(raw.savedAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.savedAt) || Date.now(),
    probe: { ...probe },
  };
}

/** Associe un conseil serveur à un brouillon local (coords proches). */
export function syncPublishedTipIdsForTrail(entries, trailTips, trailId) {
  const tid = Number(trailId);
  if (!Number.isFinite(tid)) return entries;
  const tips = Array.isArray(trailTips) ? trailTips : [];
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    if (Number(entry.trailId) !== tid || !entry.probe) return entry;
    if (Number.isFinite(Number(entry.publishedTipId))) return entry;
    const lat = Number(entry.probe.lat);
    const lon = Number(entry.probe.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return entry;
    const match = tips.find((t) => {
      const tlat = Number(t.point_lat);
      const tlon = Number(t.point_lon);
      return (
        Number.isFinite(tlat) &&
        Number.isFinite(tlon) &&
        tlat.toFixed(5) === lat.toFixed(5) &&
        tlon.toFixed(5) === lon.toFixed(5)
      );
    });
    if (!match) return entry;
    return { ...entry, publishedTipId: Number(match.id) };
  });
}

export function isEntryPublishedOnTrail(entry, trailTips) {
  const pid = Number(entry?.publishedTipId);
  if (Number.isFinite(pid) && pid > 0) {
    return (trailTips || []).some((t) => Number(t.id) === pid);
  }
  if (!entry?.probe) return false;
  const lat = Number(entry.probe.lat);
  const lon = Number(entry.probe.lng);
  return (trailTips || []).some((t) => {
    const tlat = Number(t.point_lat);
    const tlon = Number(t.point_lon);
    return (
      Number.isFinite(tlat) &&
      Number.isFinite(tlon) &&
      tlat.toFixed(5) === lat.toFixed(5) &&
      tlon.toFixed(5) === lon.toFixed(5)
    );
  });
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

/** Texte pour une note plan serveur (route_plan_trail_notes). */
export function formatExplorerProbePlanNote(entry, { linkedBoxTitle } = {}) {
  if (!entry?.probe) return "";
  const p = entry.probe;
  const parts = [
    entry.label || "Point",
    `${Number(p.distKm || 0).toFixed(1)} km`,
  ];
  if (p.eleM != null) parts.push(`${p.eleM} m`);
  if (p.gainM != null) parts.push(`D+ ${Math.round(p.gainM)} m`);
  if (linkedBoxTitle) parts.push(`Box: ${linkedBoxTitle}`);
  if (entry.notes && String(entry.notes).trim()) {
    parts.push(String(entry.notes).trim());
  }
  return parts.join(" · ").slice(0, 2000);
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
