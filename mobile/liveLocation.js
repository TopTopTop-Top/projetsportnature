import { Platform } from "react-native";

/**
 * Position GPS appareil (web + native via navigator / polyfill).
 * Pas de dépendance expo-location pour rester léger.
 */
export function getDevicePosition(options = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    maximumAge = 4000,
  } = options;

  return new Promise((resolve, reject) => {
    const geo =
      typeof navigator !== "undefined" && navigator.geolocation
        ? navigator.geolocation
        : null;
    if (!geo || typeof geo.getCurrentPosition !== "function") {
      reject(
        new Error(
          Platform.OS === "web"
            ? "Autorise la localisation dans le navigateur."
            : "GPS indisponible sur cet appareil."
        )
      );
      return;
    }
    geo.getCurrentPosition(
      (pos) => {
        const c = pos?.coords;
        const lat = Number(c?.latitude);
        const lon = Number(c?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          reject(new Error("Position GPS invalide."));
          return;
        }
        resolve({
          lat,
          lon,
          accuracy: Number.isFinite(Number(c?.accuracy))
            ? Number(c.accuracy)
            : null,
          speed:
            c?.speed != null && Number.isFinite(Number(c.speed))
              ? Number(c.speed)
              : null,
          heading:
            c?.heading != null && Number.isFinite(Number(c.heading))
              ? Number(c.heading)
              : null,
          at: Date.now(),
        });
      },
      (err) => {
        const msg =
          err?.code === 1
            ? "Permission localisation refusée."
            : err?.message || "Impossible de lire le GPS.";
        reject(new Error(msg));
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}

/** Distance haversine en km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * ETA approx (minutes) en supposant une vitesse trail/vélo.
 * @param {number} distKm
 * @param {number|null} speedMps vitesse GPS m/s si dispo
 */
export function estimateEtaMinutes(distKm, speedMps = null) {
  if (!Number.isFinite(distKm) || distKm < 0) return null;
  if (distKm < 0.05) return 1;
  let kmh = 10; // marche/trail par défaut
  if (speedMps != null && Number.isFinite(speedMps) && speedMps > 0.5) {
    kmh = Math.min(45, Math.max(4, speedMps * 3.6));
  }
  return Math.max(1, Math.round((distKm / kmh) * 60));
}
