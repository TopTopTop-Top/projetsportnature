/**
 * Profil le long d'une trace : distance cumulée (km) et D+ cumulé (m).
 * profile_json : [[distKm, gainM], ...] aligné sur polyline_json.
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePositions(polylineJson) {
  let raw = [];
  try {
    if (polylineJson) {
      raw = typeof polylineJson === "string" ? JSON.parse(polylineJson) : polylineJson;
    }
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const pt of raw) {
    const lat = Array.isArray(pt) ? Number(pt[0]) : Number(pt?.lat ?? pt?.latitude);
    const lng = Array.isArray(pt)
      ? Number(pt[1])
      : Number(pt?.lng ?? pt?.lon ?? pt?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
  }
  return out;
}

function parseStoredProfile(profileJson) {
  if (!profileJson) return null;
  try {
    const raw =
      typeof profileJson === "string" ? JSON.parse(profileJson) : profileJson;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const profile = [];
    for (const row of raw) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const distKm = Number(row[0]);
      const gainM = Number(row[1]);
      if (!Number.isFinite(distKm)) continue;
      profile.push([distKm, Number.isFinite(gainM) ? gainM : 0]);
    }
    return profile.length ? profile : null;
  } catch {
    return null;
  }
}

/** Profil distance seul ; D+ interpolé depuis elevation_m si besoin. */
function buildFallbackProfile(positions, totalElevationM) {
  if (positions.length < 1) return { profile: [], hasGainData: false };
  const profile = [[0, 0]];
  let dist = 0;
  for (let i = 1; i < positions.length; i += 1) {
    dist += haversineKm(
      positions[i - 1][0],
      positions[i - 1][1],
      positions[i][0],
      positions[i][1]
    );
    profile.push([Number(dist.toFixed(3)), 0]);
  }
  const totalD = Number(totalElevationM) || 0;
  const totalKm = profile[profile.length - 1][0] || 0;
  if (totalD > 0 && totalKm > 0) {
    for (let i = 0; i < profile.length; i += 1) {
      const frac = profile[i][0] / totalKm;
      profile[i][1] = Math.round(totalD * frac);
    }
  }
  return {
    profile,
    hasGainData: totalD > 0,
    gainEstimated: totalD > 0,
  };
}

export function getTrailGeometry(trail) {
  const positions = normalizePositions(trail?.polyline_json);
  if (positions.length < 2) {
    return { positions: [], profile: [], hasGainData: false, gainEstimated: false };
  }
  let stored = parseStoredProfile(trail?.profile_json);
  let hasGainData = false;
  let gainEstimated = false;
  if (stored && stored.length >= 2) {
    hasGainData = stored.some((row) => row[1] > 0);
  } else {
    const fb = buildFallbackProfile(positions, trail?.elevation_m);
    stored = fb.profile;
    hasGainData = fb.hasGainData;
    gainEstimated = fb.gainEstimated;
  }
  return {
    positions,
    profile: stored,
    hasGainData,
    gainEstimated,
  };
}

function profileAtFraction(profile, positions, segIndex, t) {
  const n = positions.length;
  if (!profile.length || n < 2) return { distKm: 0, gainM: 0 };
  const frac = (segIndex + Math.max(0, Math.min(1, t))) / Math.max(1, n - 1);
  const idx = frac * (profile.length - 1);
  const i = Math.min(Math.floor(idx), profile.length - 2);
  const j = i + 1;
  const localT = idx - i;
  const pi = profile[i] || [0, 0];
  const pj = profile[j] || pi;
  const distKm = pi[0] + (pj[0] - pi[0]) * localT;
  const gainM = pi[1] + (pj[1] - pi[1]) * localT;
  return {
    distKm: Number(distKm.toFixed(2)),
    gainM: Math.round(gainM),
  };
}

function projectOnSegment(pLat, pLon, a, b) {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-14) {
    return {
      lat: ax,
      lng: ay,
      t: 0,
      distToPointKm: haversineKm(pLat, pLon, ax, ay),
    };
  }
  let t = ((pLat - ax) * dx + (pLon - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const lat = ax + t * dx;
  const lng = ay + t * dy;
  return {
    lat,
    lng,
    t,
    distToPointKm: haversineKm(pLat, pLon, lat, lng),
  };
}

/**
 * Point le plus proche sur le tracé + km / D+ depuis le départ.
 */
export function probeTrailAt(trail, lat, lng) {
  const { positions, profile, hasGainData, gainEstimated } = getTrailGeometry(trail);
  if (positions.length < 2) return null;

  let best = null;
  for (let i = 1; i < positions.length; i += 1) {
    const proj = projectOnSegment(
      lat,
      lng,
      positions[i - 1],
      positions[i]
    );
    if (!best || proj.distToPointKm < best.distToPointKm) {
      const at = profileAtFraction(profile, positions, i - 1, proj.t);
      best = {
        lat: proj.lat,
        lng: proj.lng,
        distToPointKm: proj.distToPointKm,
        distKm: at.distKm,
        gainM: at.gainM,
        hasGainData,
        gainEstimated,
        segmentIndex: i - 1,
      };
    }
  }
  return best;
}

export function formatTrailProbeLabel(probe) {
  if (!probe) return "";
  const km = Number(probe.distKm || 0).toFixed(2);
  const gain = Math.round(Number(probe.gainM || 0));
  let gainPart = `D+ ${gain} m`;
  if (!probe.hasGainData) {
    gainPart = "D+ — (GPX sans altitude)";
  } else if (probe.gainEstimated) {
    gainPart = `D+ ~${gain} m (estim.)`;
  }
  return `${km} km · ${gainPart}`;
}
