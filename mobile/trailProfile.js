/**
 * Profil le long d'une trace : distance, D+ cumulé, altitude (si GPX).
 * profile_json : [[distKm, gainM] | [distKm, gainM, eleM], ...]
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
      raw =
        typeof polylineJson === "string" ? JSON.parse(polylineJson) : polylineJson;
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
      const eleM =
        row.length >= 3 && Number.isFinite(Number(row[2]))
          ? Math.round(Number(row[2]))
          : null;
      profile.push([distKm, Number.isFinite(gainM) ? gainM : 0, eleM]);
    }
    return profile.length ? profile : null;
  } catch {
    return null;
  }
}

/** Profil distance seul ; D+ interpolé depuis elevation_m si besoin. */
function buildFallbackProfile(positions, totalElevationM) {
  if (positions.length < 1) return { profile: [], hasGainData: false };
  const profile = [[0, 0, null]];
  let dist = 0;
  for (let i = 1; i < positions.length; i += 1) {
    dist += haversineKm(
      positions[i - 1][0],
      positions[i - 1][1],
      positions[i][0],
      positions[i][1]
    );
    profile.push([Number(dist.toFixed(3)), 0, null]);
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
    hasElevationData: false,
  };
}

export function getTrailGeometry(trail) {
  const positions = normalizePositions(trail?.polyline_json);
  if (positions.length < 2) {
    return {
      positions: [],
      profile: [],
      hasGainData: false,
      gainEstimated: false,
      hasElevationData: false,
    };
  }
  let stored = parseStoredProfile(trail?.profile_json);
  let hasGainData = false;
  let gainEstimated = false;
  let hasElevationData = false;
  if (stored && stored.length >= 2) {
    hasGainData = stored.some((row) => row[1] > 0);
    hasElevationData = stored.some((row) => row[2] != null);
  } else {
    const fb = buildFallbackProfile(positions, trail?.elevation_m);
    stored = fb.profile;
    hasGainData = fb.hasGainData;
    gainEstimated = fb.gainEstimated;
    hasElevationData = false;
  }
  return {
    positions,
    profile: stored,
    hasGainData,
    gainEstimated,
    hasElevationData,
  };
}

/**
 * Métadonnées altitude / D+ pour affichage liste et fiches.
 * status: "profile" | "gain_only" | "none"
 */
export function getTrailAltitudeMeta(trail) {
  const geo = getTrailGeometry(trail);
  const elevationM = Math.round(Number(trail?.elevation_m) || 0);
  const hasPolyline = geo.positions.length >= 2;

  if (geo.hasElevationData) {
    return {
      status: "profile",
      hasElevationData: true,
      hasGainData: true,
      gainEstimated: false,
      elevationM,
      hasPolyline,
      badgeLabel: `D+ ${elevationM} m`,
      badgeShort: "Profil GPX",
      listElevationText: `D+ ${elevationM} m · profil altimétrique`,
      canShowElevationChart: true,
      canShowAltitudeProbe: true,
      canShowMapHighlight: true,
      missingMessage: null,
    };
  }

  if (geo.hasGainData || elevationM > 0) {
    return {
      status: "gain_only",
      hasElevationData: false,
      hasGainData: true,
      gainEstimated: true,
      elevationM,
      hasPolyline,
      badgeLabel: elevationM > 0 ? `D+ ${elevationM} m` : "D+ ?",
      badgeShort: "Sans courbe",
      listElevationText:
        elevationM > 0
          ? `D+ ${elevationM} m · sans altitudes GPX`
          : "Dénivelé sans profil alti",
      canShowElevationChart: false,
      canShowAltitudeProbe: false,
      canShowMapHighlight: hasPolyline,
      missingMessage:
        "Ce tracé n’a pas d’altitudes dans le fichier GPX. Le D+ affiché est une estimation ou une saisie manuelle : pas de courbe altimétrique ni suivi altitude / pente sur la carte. Re-importe un GPX avec balises <ele> pour activer le profil.",
    };
  }

  return {
    status: "none",
    hasElevationData: false,
    hasGainData: false,
    gainEstimated: false,
    elevationM: 0,
    hasPolyline,
    badgeLabel: "Sans altitude",
    badgeShort: "Pas de D+",
    listElevationText: "Sans altitude ni D+ GPX",
    canShowElevationChart: false,
    canShowAltitudeProbe: false,
    canShowMapHighlight: hasPolyline,
    missingMessage:
      "Ce tracé n’a pas de données d’altitude ni de dénivelé calculé. Importe ou remplace le GPX (avec altitudes) pour afficher le profil et le suivi sur la carte.",
  };
}

/** Ligne courte pour listes (km · dénivelé · …). */
export function formatTrailElevationSummary(trail) {
  return getTrailAltitudeMeta(trail).listElevationText;
}

export function getTrailProfileStats(trail) {
  const { profile, hasElevationData, hasGainData, gainEstimated } =
    getTrailGeometry(trail);
  if (!profile.length) {
    return {
      points: [],
      hasElevationData: false,
      hasGainData: false,
      gainEstimated: false,
      minEle: null,
      maxEle: null,
      totalDistKm: 0,
      totalGainM: 0,
      totalLossM: 0,
    };
  }
  const points = profile.map(([distKm, gainM, eleM]) => ({
    distKm,
    gainM,
    eleM: eleM != null ? eleM : null,
  }));
  let minEle = Infinity;
  let maxEle = -Infinity;
  let totalLossM = 0;
  for (let i = 0; i < points.length; i += 1) {
    const ele = points[i].eleM;
    if (ele != null) {
      minEle = Math.min(minEle, ele);
      maxEle = Math.max(maxEle, ele);
      if (i > 0 && points[i - 1].eleM != null && ele < points[i - 1].eleM) {
        totalLossM += points[i - 1].eleM - ele;
      }
    }
  }
  const totalDistKm = points[points.length - 1]?.distKm || 0;
  const totalGainM =
    Number(trail?.elevation_m) ||
    (points.length ? points[points.length - 1].gainM : 0);
  return {
    points,
    hasElevationData,
    hasGainData,
    gainEstimated,
    minEle: Number.isFinite(minEle) ? minEle : null,
    maxEle: Number.isFinite(maxEle) ? maxEle : null,
    totalDistKm,
    totalGainM: Math.round(totalGainM),
    totalLossM: Math.round(totalLossM),
  };
}

/** Pente en % (montée positive). */
export function gradePercentAtDist(profile, distKm) {
  if (!profile?.length) return null;
  let i = 0;
  while (i < profile.length - 2 && profile[i + 1][0] < distKm) i += 1;
  const a = profile[i];
  const b = profile[Math.min(i + 1, profile.length - 1)];
  const dDist = b[0] - a[0];
  if (dDist <= 0) return 0;
  const eleA = a[2];
  const eleB = b[2];
  if (eleA == null || eleB == null) return null;
  const dEle = eleB - eleA;
  return Number(((dEle / (dDist * 1000)) * 100).toFixed(1));
}

export function terrainLabelFromGrade(gradePct) {
  if (gradePct == null || !Number.isFinite(gradePct)) return "Pente inconnue";
  if (gradePct >= 18) return "Montée très raide";
  if (gradePct >= 8) return "Montée soutenue";
  if (gradePct >= 3) return "Montée douce";
  if (gradePct > -3) return "Plat / faible pente";
  if (gradePct > -8) return "Descente douce";
  if (gradePct > -18) return "Descente soutenue";
  return "Descente raide";
}

/** Interpolation le long du profil par distance cumulée (km), pas par index. */
function profileAtDistKm(profile, distKm) {
  if (!profile?.length) {
    return { distKm: 0, gainM: 0, eleM: null, gradePct: null };
  }
  const target = Math.max(0, Number(distKm) || 0);
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (target <= first[0]) {
    const g = gradePercentAtDist(profile, first[0]);
    return {
      distKm: Number(first[0].toFixed(2)),
      gainM: Math.round(first[1] || 0),
      eleM: first[2] != null ? first[2] : null,
      gradePct: g,
    };
  }
  if (target >= last[0]) {
    const g = gradePercentAtDist(profile, last[0]);
    return {
      distKm: Number(last[0].toFixed(2)),
      gainM: Math.round(last[1] || 0),
      eleM: last[2] != null ? last[2] : null,
      gradePct: g,
    };
  }
  let i = 0;
  while (i < profile.length - 1 && profile[i + 1][0] < target) i += 1;
  const pi = profile[i];
  const pj = profile[Math.min(i + 1, profile.length - 1)];
  const seg = pj[0] - pi[0];
  const t = seg > 1e-9 ? (target - pi[0]) / seg : 0;
  const dist = pi[0] + seg * t;
  const gainM = pi[1] + (pj[1] - pi[1]) * t;
  let eleM = null;
  if (pi[2] != null && pj[2] != null) {
    eleM = Math.round(pi[2] + (pj[2] - pi[2]) * t);
  }
  const gradePct = gradePercentAtDist(profile, dist);
  return {
    distKm: Number(dist.toFixed(2)),
    gainM: Math.round(gainM),
    eleM,
    gradePct,
  };
}

/** Longueur du tracé sur la carte (km, distances haversine entre points). */
export function getTrailRouteLengthKm(trail) {
  const { positions } = getTrailGeometry(trail);
  if (positions.length >= 2) {
    const dists = trailCumulativeDistances(positions);
    return dists[dists.length - 1] || 0;
  }
  const { profile } = getTrailGeometry(trail);
  if (profile.length) return profile[profile.length - 1][0];
  return Number(trail?.distance_km) || 0;
}

/** Distance profil (axe courbe) à partir d'une distance route (carte). */
export function profileDistFromRouteKm(trail, routeDistKm) {
  const { profile } = getTrailGeometry(trail);
  const routeTotal = getTrailRouteLengthKm(trail);
  const profileTotal = profile.length ? profile[profile.length - 1][0] : routeTotal;
  if (routeTotal <= 0 || profileTotal <= 0) return Math.max(0, Number(routeDistKm) || 0);
  const frac = Math.min(1, Math.max(0, Number(routeDistKm) / routeTotal));
  return frac * profileTotal;
}

/** Distance route (carte / surbrillance) à partir d'une distance profil (courbe). */
export function routeDistFromProfileKm(trail, profileDistKm) {
  const { profile } = getTrailGeometry(trail);
  const routeTotal = getTrailRouteLengthKm(trail);
  const profileTotal = profile.length ? profile[profile.length - 1][0] : routeTotal;
  if (profileTotal <= 0) return Math.max(0, Number(profileDistKm) || 0);
  const frac = Math.min(1, Math.max(0, Number(profileDistKm) / profileTotal));
  return frac * routeTotal;
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

function trailCumulativeDistances(positions) {
  const dists = [0];
  for (let i = 1; i < positions.length; i += 1) {
    dists.push(
      dists[i - 1] +
        haversineKm(
          positions[i - 1][0],
          positions[i - 1][1],
          positions[i][0],
          positions[i][1]
        )
    );
  }
  return dists;
}

/** Parcours parcouru depuis le départ jusqu'à distKm (pour surbrillance progressive). */
export function getTrailProgressSlice(trail, distKm) {
  const { positions } = getTrailGeometry(trail);
  if (positions.length < 2 || !Number.isFinite(distKm)) return null;
  const target = Math.max(0, Number(distKm) || 0);
  const dists = trailCumulativeDistances(positions);
  const total = dists[dists.length - 1] || 0;
  if (target <= 0) return [positions[0], positions[1]];
  if (target >= total) return positions;

  const out = [positions[0]];
  for (let i = 1; i < positions.length; i += 1) {
    if (dists[i] <= target + 1e-6) {
      out.push(positions[i]);
      continue;
    }
    const segLen = dists[i] - dists[i - 1];
    const t = segLen > 1e-9 ? (target - dists[i - 1]) / segLen : 0;
    const lat =
      positions[i - 1][0] + t * (positions[i][0] - positions[i - 1][0]);
    const lng =
      positions[i - 1][1] + t * (positions[i][1] - positions[i - 1][1]);
    out.push([lat, lng]);
    break;
  }
  return out.length >= 2 ? out : null;
}

/** Reste du tracé après distKm (affiché atténué). */
export function getTrailRemainderSlice(trail, distKm) {
  const progress = getTrailProgressSlice(trail, distKm);
  const { positions } = getTrailGeometry(trail);
  if (!progress || progress.length < 1 || positions.length < 2) return null;
  const target = Math.max(0, Number(distKm) || 0);
  const dists = trailCumulativeDistances(positions);
  if (target >= (dists[dists.length - 1] || 0) - 1e-6) return null;

  const out = [progress[progress.length - 1]];
  let startIdx = positions.length - 1;
  for (let i = 1; i < positions.length; i += 1) {
    if (dists[i] >= target) {
      startIdx = i;
      break;
    }
  }
  for (let i = startIdx; i < positions.length; i += 1) {
    out.push(positions[i]);
  }
  return out.length >= 2 ? out : null;
}

/** Tronçon du tracé à surligner autour d'une distance (km). */
export function getTrailHighlightSlice(trail, distKm, windowKm = 0.5) {
  const { positions } = getTrailGeometry(trail);
  if (positions.length < 2 || !Number.isFinite(distKm)) return null;
  const dists = trailCumulativeDistances(positions);
  const lo = distKm - windowKm;
  const hi = distKm + windowKm;
  const slice = [];
  for (let i = 0; i < positions.length; i += 1) {
    if (dists[i] >= lo && dists[i] <= hi) slice.push(positions[i]);
  }
  if (slice.length < 2) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < dists.length; i += 1) {
      const d = Math.abs(dists[i] - distKm);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const a = Math.max(0, bestI - 1);
    const b = Math.min(positions.length - 1, bestI + 1);
    return positions.slice(a, b + 1);
  }
  return slice;
}

/** Position sur le tracé à une distance cumulée depuis le départ (km). */
export function probeTrailAtDist(trail, profileDistKm) {
  const { positions, profile, hasGainData, gainEstimated, hasElevationData } =
    getTrailGeometry(trail);
  if (positions.length < 2) return null;
  const profileTarget = Math.max(0, Number(profileDistKm) || 0);
  const routeDistKm = routeDistFromProfileKm(trail, profileTarget);
  const dists = trailCumulativeDistances(positions);
  const total = dists[dists.length - 1] || 0;
  const clamped = Math.min(routeDistKm, total);

  let segIdx = 1;
  for (let i = 1; i < positions.length; i += 1) {
    if (dists[i] >= clamped) {
      segIdx = i;
      break;
    }
  }
  const prevCum = dists[segIdx - 1];
  const segLen = dists[segIdx] - prevCum;
  const t =
    segLen > 1e-9 ? Math.min(1, Math.max(0, (clamped - prevCum) / segLen)) : 0;
  const lat =
    positions[segIdx - 1][0] +
    t * (positions[segIdx][0] - positions[segIdx - 1][0]);
  const lng =
    positions[segIdx - 1][1] +
    t * (positions[segIdx][1] - positions[segIdx - 1][1]);
  const at = profileAtDistKm(profile, profileTarget);
  return {
    lat,
    lng,
    distToPointKm: 0,
    distKm: Number(clamped.toFixed(2)),
    profileDistKm: Number(profileTarget.toFixed(2)),
    gainM: at.gainM,
    eleM: at.eleM,
    gradePct: at.gradePct,
    terrainLabel: terrainLabelFromGrade(at.gradePct),
    hasGainData,
    gainEstimated,
    hasElevationData,
    segmentIndex: segIdx - 1,
    source: "chart",
  };
}

export function probeTrailAt(trail, lat, lng) {
  const { positions, profile, hasGainData, gainEstimated, hasElevationData } =
    getTrailGeometry(trail);
  if (positions.length < 2) return null;

  const dists = trailCumulativeDistances(positions);
  let best = null;
  for (let i = 1; i < positions.length; i += 1) {
    const proj = projectOnSegment(lat, lng, positions[i - 1], positions[i]);
    if (!best || proj.distToPointKm < best.distToPointKm) {
      const prevCum = dists[i - 1];
      const segLen = dists[i] - prevCum;
      const routeDistKm = prevCum + proj.t * segLen;
      const profileDist = profileDistFromRouteKm(trail, routeDistKm);
      const at = profileAtDistKm(profile, profileDist);
      best = {
        lat: proj.lat,
        lng: proj.lng,
        distToPointKm: proj.distToPointKm,
        distKm: Number(routeDistKm.toFixed(2)),
        profileDistKm: Number(profileDist.toFixed(2)),
        gainM: at.gainM,
        eleM: at.eleM,
        gradePct: at.gradePct,
        terrainLabel: terrainLabelFromGrade(at.gradePct),
        hasGainData,
        gainEstimated,
        hasElevationData,
        segmentIndex: i - 1,
        source: "map",
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
  const parts = [`${km} km`, gainPart];
  if (probe.eleM != null) parts.push(`${probe.eleM} m`);
  if (probe.terrainLabel) parts.push(probe.terrainLabel);
  return parts.join(" · ");
}

export function formatTrailProbeCoords(probe) {
  if (!probe || !Number.isFinite(probe.lat) || !Number.isFinite(probe.lng)) {
    return "";
  }
  return `Lat ${Number(probe.lat).toFixed(5)} · Lon ${Number(probe.lng).toFixed(5)}`;
}
