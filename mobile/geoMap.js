/**
 * Coordonnées carte fiables — évite Null Island (0,0) et swaps lat/lon fréquents.
 */

const NEAR_ZERO = 0.05;

/**
 * @param {unknown} lat
 * @param {unknown} lon
 * @returns {{ lat: number, lon: number } | null}
 */
export function parseMapCoords(lat, lon) {
  let la = Number(lat);
  let lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;

  // Null Island / données vides → océan Atlantique
  if (Math.abs(la) < NEAR_ZERO && Math.abs(lo) < NEAR_ZERO) return null;

  // Swap classique FR : lon saisie en lat (~4–10) et lat en lon (~42–51)
  if (
    Math.abs(la) <= 20 &&
    Math.abs(lo) >= 35 &&
    Math.abs(lo) <= 60 &&
    Math.abs(lo) <= 90
  ) {
    const tmp = la;
    la = lo;
    lo = tmp;
  }

  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lon: lo };
}

export function isUsableMapCoord(lat, lon) {
  return parseMapCoords(lat, lon) != null;
}
