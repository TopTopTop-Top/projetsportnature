/** Points GPS affichés sur la carte (plan, aperçu communauté). */

export function trailMapPointId(source, noteId, index) {
  return `${source}-${noteId ?? index}`;
}

export function buildTrailMapPoints({
  trailId,
  plan = null,
  sharedPreview = null,
} = {}) {
  const tid = Number(trailId);
  if (!Number.isFinite(tid)) return [];
  const out = [];

  const pushNote = (n, index, source) => {
    const lat = Number(n.point_lat);
    const lon = Number(n.point_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const noteId = n.id ?? index;
    out.push({
      id: trailMapPointId(source, noteId, index),
      noteId: n.id,
      lat,
      lon,
      note: n.note || "",
      label:
        source === "shared_preview"
          ? `Plan partagé · point ${index + 1}`
          : `Mon plan · point ${index + 1}`,
      source,
    });
  };

  if (plan && Number(plan.trail_id) === tid) {
    (Array.isArray(plan.trail_notes) ? plan.trail_notes : []).forEach((n, i) =>
      pushNote(n, i, "plan")
    );
  }
  if (sharedPreview && Number(sharedPreview.trail_id) === tid) {
    (Array.isArray(sharedPreview.trail_notes) ? sharedPreview.trail_notes : []).forEach(
      (n, i) => pushNote(n, i, "shared_preview")
    );
  }
  return out;
}

export function tipMapPointId(tipId) {
  return `tip-${tipId}`;
}
