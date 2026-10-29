/**
 * Critères métier outdoor — allègement du sac (eau / alimentation / aide).
 * Source unique pour box, ravito, demandes et reçus.
 */

/** Ce que propose une box (hôte). */
export const BOX_OFFER_TAGS = [
  "Eau potable",
  "Eau fraîche / glaçons",
  "Snacks sucrés",
  "Snacks salés",
  "Repas chaud",
  "Option vegan",
  "Sans gluten",
  "Fruits",
  "Boisson énergique",
  "WC",
  "Douche",
  "Abri / local",
  "Prise électrique",
  "Kit premiers secours",
  "Parking / accès voiture",
  "Accueil vélo (pompe, kit)",
];

/** Besoins du demandeur (box ou ravito). */
export const ATHLETE_NEED_TAGS = [
  "Eau (remplir gourdes)",
  "Snacks sucrés",
  "Snacks salés",
  "Repas / plat",
  "Option vegan",
  "Sans gluten",
  "Boisson énergique",
  "Abri / pause",
  "WC",
  "Douche",
  "Recharge téléphone",
  "Aide légère / premiers soins",
];

/** Ce qu’apporte un ravitailleur mobile. */
export const RAVITO_OFFER_TAGS = [
  "Eau",
  "Snacks",
  "Repas",
  "Option vegan",
  "Sans gluten",
  "Boisson énergique",
  "Couverture / abri léger",
  "Aide / encouragement",
];

export const PROJECT_ACTIVITIES = [
  { id: "trail_run", label: "Trail" },
  { id: "run", label: "Running" },
  { id: "hike", label: "Rando" },
  { id: "road_bike", label: "Vélo route" },
  { id: "mtb", label: "VTT" },
];

/** Étapes du funnel (demandeur). */
export const FUNNEL_STEPS = [
  {
    id: "ask",
    title: "1. Demande",
    short: "Tu envoies créneau + besoins",
  },
  {
    id: "validate",
    title: "2. Validation",
    short: "L’hôte / ravitailleur accepte",
  },
  {
    id: "pay",
    title: "3. Paiement",
    short: "Tu paies seulement après validation",
  },
];

export function parseTagsJson(raw) {
  try {
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function boxWaterLabel(box) {
  const w = box?.has_water ?? box?.box_has_water;
  return w === 1 || w === true || w === "1" ? "Oui" : "Non";
}

/** Lignes d’offre box pour reçus / cartes. */
export function formatBoxOfferLines(box) {
  if (!box) return [];
  const lines = [];
  const liters = box.capacity_liters ?? box.box_capacity_liters;
  lines.push(
    `Eau : ${boxWaterLabel(box)}${
      liters != null && liters !== "" ? ` · ${liters} L` : ""
    }`
  );
  const crit = parseTagsJson(box.criteria_json ?? box.box_criteria_json);
  if (crit.length) {
    lines.push(`Offre : ${crit.join(" · ")}`);
  }
  const note = String(
    box.criteria_note || box.box_criteria_note || ""
  ).trim();
  if (note) lines.push(`Précisions : ${note}`);
  const avail = String(
    box.availability_note || box.box_availability_note || ""
  ).trim();
  if (avail) lines.push(`Dispo : ${avail}`);
  return lines;
}

export function toggleTagInText(current, tag) {
  const cur = String(current || "").trim();
  const parts = cur
    ? cur.split(/[,;·]+/).map((p) => p.trim()).filter(Boolean)
    : [];
  const lower = String(tag).toLowerCase();
  const has = parts.some((p) => p.toLowerCase() === lower);
  const next = has
    ? parts.filter((p) => p.toLowerCase() !== lower)
    : [...parts, tag];
  return next.join(", ");
}

export function textHasTag(text, tag) {
  return String(text || "")
    .toLowerCase()
    .includes(String(tag).toLowerCase());
}
