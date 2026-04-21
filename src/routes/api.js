const express = require("express");
const { z } = require("zod");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");
const { pool } = require("../db/database");
const { computeCommission, generateAccessCode } = require("../utils");
const { signToken, requireAuth } = require("../auth");

const router = express.Router();
const parser = new XMLParser({ ignoreAttributes: false });

const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".gpx");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    cb(
      null,
      file.mimetype.includes("xml") || file.originalname.endsWith(".gpx")
    );
  },
});

const createUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.email(),
  password: z.string().min(6),
  role: z.enum(["athlete", "host", "both"]),
  city: z.string().min(2).optional(),
});

const createBoxSchema = z.object({
  hostUserId: z.number().int().positive(),
  title: z.string().min(3),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().min(2),
  priceCents: z.number().int().nonnegative(),
  capacityLiters: z.number().int().positive().optional(),
  hasWater: z.boolean().optional(),
  accessCode: z.string().trim().min(4).max(32).optional(),
  accessMethod: z
    .enum(["manual_meetup", "padlock_code", "digital_code", "key_lockbox"])
    .optional(),
  accessInstructions: z.string().max(4000).optional(),
  accessDisplayBeforeMin: z.number().int().min(0).max(1440).optional(),
  accessDisplayAfterMin: z.number().int().min(0).max(1440).optional(),
  availabilityNote: z.string().max(2000).optional(),
  criteriaTags: z.array(z.string().min(1).max(50)).max(20).optional(),
  criteriaNote: z.string().max(2000).optional(),
});

const createHostBoxSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().min(2),
  priceCents: z.number().int().nonnegative(),
  capacityLiters: z.number().int().positive().optional(),
  hasWater: z.boolean().optional(),
  accessCode: z.string().trim().min(4).max(32).optional(),
  accessMethod: z
    .enum(["manual_meetup", "padlock_code", "digital_code", "key_lockbox"])
    .optional(),
  accessInstructions: z.string().max(4000).optional(),
  accessDisplayBeforeMin: z.number().int().min(0).max(1440).optional(),
  accessDisplayAfterMin: z.number().int().min(0).max(1440).optional(),
  availabilityNote: z.string().max(2000).optional(),
  criteriaTags: z.array(z.string().min(1).max(50)).max(20).optional(),
  criteriaNote: z.string().max(2000).optional(),
});

const trailActivityEnum = z.enum([
  "hike",
  "trail_run",
  "road_bike",
  "mtb",
  "gravel",
  "ski_nordic",
  "ski_alp",
  "other",
]);

const createTrailSchema = z.object({
  name: z.string().min(3),
  territory: z.string().min(2),
  distanceKm: z.number().positive(),
  elevationM: z.number().int().nonnegative().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  gpxUrl: z.string().url().optional(),
  notes: z.string().max(4000).optional(),
  activity: trailActivityEnum.optional(),
  criteriaTags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

const updateTrailSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    territory: z.string().min(2).max(120).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    activity: trailActivityEnum.optional(),
    criteriaTags: z.array(z.string().min(1).max(60)).max(20).optional(),
    notes: z.union([z.string().max(4000), z.literal("")]).optional(),
  })
  .superRefine((val, ctx) => {
    const keys = Object.keys(val).filter((k) => val[k] !== undefined);
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required",
      });
    }
  });

function normalizeTrailActivity(value) {
  const v = String(value || "").trim();
  return trailActivityEnum.safeParse(v).success ? v : "hike";
}

function parseTrailCriteriaTagsFromBody(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  const s = String(value);
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) {
      return j
        .filter((t) => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  } catch (_e) {
    // ignore
  }
  return s
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

const createBookingSchema = z.object({
  boxId: z.number().int().positive(),
  bookingDate: z.string().min(10),
  startTime: z.string().min(4),
  endTime: z.string().min(4),
  specialRequest: z.string().max(2000).optional(),
});

const updateBookingSchema = z.object({
  bookingDate: z.string().min(10),
  startTime: z.string().min(4),
  endTime: z.string().min(4),
  specialRequest: z.string().max(2000).optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const hostBookingDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
});

const bookingChangeDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
});

const deleteHostBoxSchema = z.object({
  confirmImpact: z.boolean().optional(),
});

const notificationsQuerySchema = z.object({
  unreadOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const createReviewSchema = z.object({
  bookingId: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1500).optional(),
});

const updateMyRoleSchema = z.object({
  role: z.enum(["athlete", "host", "both"]),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Rectangle visible carte (pas d’antiméridien en v1). */
const boundsQuerySchema = z.object({
  south: z.coerce.number().min(-90).max(90),
  north: z.coerce.number().min(-90).max(90),
  west: z.coerce.number().min(-180).max(180),
  east: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function simplifyLatLngs(points, maxPoints) {
  if (points.length <= maxPoints) {
    return points.map((p) => [p.lat, p.lon]);
  }
  const step = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += step) {
    out.push([points[i].lat, points[i].lon]);
  }
  const last = points[points.length - 1];
  const lastPair = [last.lat, last.lon];
  const prev = out[out.length - 1];
  if (prev[0] !== lastPair[0] || prev[1] !== lastPair[1]) {
    out.push(lastPair);
  }
  return out;
}

function parseGpxStats(gpxContent) {
  const xml = parser.parse(gpxContent);
  const tracks = toArray(xml?.gpx?.trk);
  const points = [];

  for (const trk of tracks) {
    const segments = toArray(trk.trkseg);
    for (const seg of segments) {
      const trkpts = toArray(seg.trkpt);
      for (const point of trkpts) {
        points.push({
          lat: Number(point["@_lat"]),
          lon: Number(point["@_lon"]),
          ele: point.ele !== undefined ? Number(point.ele) : undefined,
        });
      }
    }
  }

  let distanceKm = 0;
  let elevationM = 0;
  for (let i = 1; i < points.length; i += 1) {
    distanceKm += haversineKm(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    if (
      typeof points[i - 1].ele === "number" &&
      typeof points[i].ele === "number" &&
      points[i].ele > points[i - 1].ele
    ) {
      elevationM += points[i].ele - points[i - 1].ele;
    }
  }

  const polylineLatLngs = points.length > 0 ? simplifyLatLngs(points, 450) : [];

  return {
    trackPoints: points.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    elevationM: Math.round(elevationM),
    polylineLatLngs,
  };
}

function createRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSessionForUser(user) {
  const token = signToken(user);
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshToken, expiresAt]
  );
  return { token, refreshToken };
}

function sanitizeBookingDraft(input) {
  return {
    bookingDate: input.bookingDate,
    startTime: input.startTime,
    endTime: input.endTime,
    specialRequest: input.specialRequest?.trim() || null,
  };
}

function parseChangeRequest(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_e) {
    return null;
  }
}

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return String(value).trim();
}

function buildBoxChangedFields(beforeBox, afterBox) {
  const descriptors = [
    { key: "title", label: "Titre" },
    { key: "description", label: "Description" },
    { key: "city", label: "Ville" },
    { key: "price_cents", label: "Prix" },
    { key: "access_code", label: "Code d'accès" },
    { key: "capacity_liters", label: "Capacité" },
    { key: "has_water", label: "Eau disponible" },
    { key: "availability_note", label: "Disponibilités" },
    { key: "criteria_note", label: "Note critères" },
    { key: "criteria_json", label: "Tags critères" },
  ];
  const out = [];
  for (const f of descriptors) {
    const before = normalizeComparable(beforeBox?.[f.key]);
    const after = normalizeComparable(afterBox?.[f.key]);
    if (before !== after) {
      out.push({
        label: f.label,
        before: before || "(vide)",
        after: after || "(vide)",
      });
    }
  }
  return out;
}

function toMinutesFromHHMM(value) {
  const str = String(value || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isIntervalOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function parseISODateTimeUtc(dateText, timeText) {
  if (!dateText || !timeText) return null;
  const d = new Date(`${dateText}T${timeText}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function createNotification({
  recipientUserId,
  type,
  title,
  body = null,
  data = null,
}) {
  if (!recipientUserId) return;
  await pool.query(
    `INSERT INTO notifications (recipient_user_id, type, title, body, data_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipientUserId, type, title, body, data ? JSON.stringify(data) : null]
  );
}

async function logBookingEvent({
  bookingId,
  actorUserId = null,
  eventType,
  message = null,
  data = null,
}) {
  if (!bookingId || !eventType) return;
  await pool.query(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, message, data_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      bookingId,
      actorUserId,
      eventType,
      message,
      data ? JSON.stringify(data) : null,
    ]
  );
}

async function ensureNoBookingOverlap({
  boxId,
  bookingDate,
  startTime,
  endTime,
  ignoreBookingId = null,
}) {
  const startMin = toMinutesFromHHMM(startTime);
  const endMin = toMinutesFromHHMM(endTime);
  if (startMin == null || endMin == null || endMin <= startMin) {
    throw new Error("Invalid booking time range");
  }
  const params = [boxId, bookingDate];
  let sql = `SELECT id, start_time, end_time
    FROM bookings
    WHERE box_id = $1
      AND booking_date = $2
      AND status <> 'cancelled'
      AND status <> 'completed'`;
  if (ignoreBookingId != null) {
    params.push(ignoreBookingId);
    sql += ` AND id <> $3`;
  }
  const { rows } = await pool.query(sql, params);
  for (const row of rows) {
    const rowStart = toMinutesFromHHMM(row.start_time);
    const rowEnd = toMinutesFromHHMM(row.end_time);
    if (rowStart == null || rowEnd == null) continue;
    if (isIntervalOverlap(startMin, endMin, rowStart, rowEnd)) {
      throw new Error("Booking time overlaps with another reservation");
    }
  }
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ravitobox-api", db: "postgresql" });
});

function normalizeCityLabel(addr = {}, displayName = "") {
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.locality ||
    addr.suburb ||
    addr.city_district ||
    addr.hamlet ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.county ||
    addr.state_district ||
    null;
  let placeLabel = city;
  if (!placeLabel && typeof displayName === "string") {
    const first = displayName.split(",")[0]?.trim();
    if (first) placeLabel = first;
  }
  return { city: city || null, placeLabel: placeLabel || null };
}

/** Nominatim peut dépasser 60s depuis certains hébergeurs ; Photon/BDC sont en général plus rapides. */
const GEOCODE_FETCH_MS = 22000;
const NOMINATIM_UA =
  "RavitoBox/1.0 (https://github.com/TopTopTop-Top/projetsportnature)";

function geocodeAbortSignal() {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    return AbortSignal.timeout(GEOCODE_FETCH_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), GEOCODE_FETCH_MS);
  return c.signal;
}

/** @returns {Promise<{ city: string|null, placeLabel: string|null, displayName: string|null, postcode: string|null }|null>} */
async function reverseGeocodePhoton(lat, lon) {
  try {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lang", "fr");
    const r = await fetch(url.toString(), { signal: geocodeAbortSignal() });
    if (!r.ok) return null;
    const data = await r.json();
    const feat = Array.isArray(data.features) ? data.features[0] : null;
    const p = feat?.properties;
    if (!p || typeof p !== "object") return null;
    const city =
      (typeof p.city === "string" && p.city.trim()) ||
      (typeof p.town === "string" && p.town.trim()) ||
      (typeof p.village === "string" && p.village.trim()) ||
      (typeof p.district === "string" && p.district.trim()) ||
      (typeof p.locality === "string" && p.locality.trim()) ||
      (typeof p.county === "string" && p.county.trim()) ||
      null;
    const placeLabel =
      city || (typeof p.name === "string" && p.name.trim()) || null;
    if (!placeLabel && !city) return null;
    const displayName = [p.name, p.street, city, p.postcode, p.country]
      .filter((x) => typeof x === "string" && x.trim())
      .join(", ");
    return {
      city: city || null,
      placeLabel: placeLabel || city || null,
      displayName: displayName || null,
      postcode: (typeof p.postcode === "string" && p.postcode.trim()) || null,
    };
  } catch (_e) {
    return null;
  }
}

/** @returns {Promise<{ city: string|null, placeLabel: string|null, displayName: string|null, postcode: string|null }|null>} */
async function reverseGeocodeNominatim(lat, lon) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "fr");
    const r = await fetch(url.toString(), {
      signal: geocodeAbortSignal(),
      headers: { "User-Agent": NOMINATIM_UA },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const addr = data.address || {};
    const normalized = normalizeCityLabel(addr, data.display_name);
    if (!normalized.placeLabel && !normalized.city) return null;
    return {
      city: normalized.city,
      placeLabel: normalized.placeLabel,
      displayName: data.display_name || null,
      postcode: addr.postcode || null,
    };
  } catch (_e) {
    return null;
  }
}

/** @returns {Promise<{ city: string|null, placeLabel: string|null, displayName: string|null, postcode: string|null }|null>} */
async function reverseGeocodeBigDataCloud(lat, lon) {
  try {
    const fallbackUrl = new URL(
      "https://api.bigdatacloud.net/data/reverse-geocode-client"
    );
    fallbackUrl.searchParams.set("latitude", String(lat));
    fallbackUrl.searchParams.set("longitude", String(lon));
    fallbackUrl.searchParams.set("localityLanguage", "fr");
    const fallbackResp = await fetch(fallbackUrl.toString(), {
      signal: geocodeAbortSignal(),
    });
    if (!fallbackResp.ok) return null;
    const data = await fallbackResp.json();
    const city =
      data.city ||
      data.locality ||
      data.principalSubdivision ||
      data.localityInfo?.administrative?.[2]?.name ||
      null;
    const placeLabel =
      city ||
      data.locality ||
      data.principalSubdivision ||
      data.countryName ||
      null;
    if (!placeLabel && !city) return null;
    return {
      city: city || null,
      placeLabel: placeLabel || null,
      displayName: data.locality || data.city || data.countryName || null,
      postcode: data.postcode || null,
    };
  } catch (_e) {
    return null;
  }
}

/** Géocodage inverse (Photon + BigDataCloud en parallèle, puis Nominatim) — uniquement côté serveur. */
router.get("/geocode/reverse", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat or lon" });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Coordinates out of range" });
  }
  const [fromPhoton, fromBdc] = await Promise.all([
    reverseGeocodePhoton(lat, lon),
    reverseGeocodeBigDataCloud(lat, lon),
  ]);
  if (fromPhoton) {
    return res.json({ ...fromPhoton, provider: "photon" });
  }
  if (fromBdc) {
    return res.json({ ...fromBdc, provider: "bigdatacloud" });
  }
  const fromNominatim = await reverseGeocodeNominatim(lat, lon);
  if (fromNominatim) {
    return res.json({ ...fromNominatim, provider: "nominatim" });
  }
  return res.status(502).json({ error: "Geocoding service error" });
});

/** Géocodage direct (ville / lieu → lat, lon) — proxy avec fallback provider. */
router.get("/geocode/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    return res.status(400).json({ error: "Query too short" });
  }
  if (q.length > 160) {
    return res.status(400).json({ error: "Query too long" });
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "fr");
    url.searchParams.set("q", q);
    const r = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "RavitoBox/1.0 (https://github.com/TopTopTop-Top/projetsportnature)",
      },
    });
    if (r.ok) {
      const data = await r.json();
      const first = Array.isArray(data) ? data[0] : null;
      const lat = first != null ? parseFloat(first.lat) : NaN;
      const lon = first != null ? parseFloat(first.lon) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return res.json({ lat, lon, provider: "nominatim" });
      }
    }
  } catch (_e) {
    // fallback below
  }

  try {
    const fallbackUrl = new URL("https://geocode.maps.co/search");
    fallbackUrl.searchParams.set("q", q);
    fallbackUrl.searchParams.set("limit", "1");
    const fallbackResp = await fetch(fallbackUrl.toString());
    if (!fallbackResp.ok) {
      return res.status(502).json({ error: "Geocoding service error" });
    }
    const data = await fallbackResp.json();
    const first = Array.isArray(data) ? data[0] : null;
    const lat = first != null ? parseFloat(first.lat) : NaN;
    const lon = first != null ? parseFloat(first.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(404).json({ error: "No results" });
    }
    return res.json({ lat, lon, provider: "mapsco" });
  } catch (_e) {
    return res.status(502).json({ error: "Geocoding failed" });
  }
});

router.post("/auth/register", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { fullName, email, password, role, city } = parsed.data;
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, city)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, city, created_at`,
      [fullName, email, passwordHash, role, city ?? null]
    );
    const created = rows[0];
    const session = await createSessionForUser({
      id: created.id,
      email: created.email,
      role: created.role,
    });
    return res.status(201).json({ user: created, ...session });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error(error);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    `SELECT id, full_name, email, role, city, password_hash, created_at FROM users WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (
    !user ||
    !user.password_hash ||
    !bcrypt.compareSync(password, user.password_hash)
  ) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const session = await createSessionForUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const { password_hash: _p, ...safeUser } = user;
  return res.json({ user: safeUser, ...session });
});

router.post("/auth/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { rows } = await pool.query(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token = $1`,
    [parsed.data.refreshToken]
  );
  const refreshRow = rows[0];
  if (!refreshRow || refreshRow.revoked_at) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  if (new Date(refreshRow.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "Refresh token expired" });
  }

  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [refreshRow.id]
  );
  const session = await createSessionForUser({
    id: refreshRow.user_id,
    email: refreshRow.email,
    role: refreshRow.role,
  });
  return res.json(session);
});

router.post("/auth/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1`,
    [parsed.data.refreshToken]
  );
  return res.json({ ok: true });
});

router.get("/users", requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, email, role, city, created_at FROM users ORDER BY created_at DESC`
  );
  res.json(rows);
});

router.get("/notifications", requireAuth, async (req, res) => {
  const parsed = notificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { unreadOnly, limit, offset } = parsed.data;
  const lim = limit ?? 120;
  const off = offset ?? 0;
  const { rows } = await pool.query(
    `SELECT id, type, title, body, data_json, is_read, created_at
     FROM notifications
     WHERE recipient_user_id = $1
       AND ($2::boolean = false OR is_read = 0)
     ORDER BY created_at DESC
     LIMIT $3
     OFFSET $4`,
    [req.auth.sub, Boolean(unreadOnly), lim, off]
  );
  res.json(rows);
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ error: "Invalid notification id" });
  }
  const { rows } = await pool.query(
    `UPDATE notifications
     SET is_read = 1
     WHERE id = $1 AND recipient_user_id = $2
     RETURNING id`,
    [notificationId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Notification not found" });
  }
  return res.json({ ok: true });
});

router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  await pool.query(
    `UPDATE notifications SET is_read = 1 WHERE recipient_user_id = $1`,
    [req.auth.sub]
  );
  return res.json({ ok: true });
});

router.patch("/users/me/role", requireAuth, async (req, res) => {
  const parsed = updateMyRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { role } = parsed.data;
  const { rows } = await pool.query(
    `UPDATE users
     SET role = $1
     WHERE id = $2
     RETURNING id, full_name, email, role, city, created_at`,
    [role, req.auth.sub]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

router.post("/users/me/deactivate", requireAuth, async (req, res) => {
  const userId = req.auth.sub;
  const { rows: pendingRefunds } = await pool.query(
    `SELECT id FROM refunds
     WHERE host_user_id = $1
       AND status = 'pending'
     LIMIT 1`,
    [userId]
  );
  if (pendingRefunds[0]) {
    return res.status(409).json({
      error:
        "Cannot close account while pending refunds exist. Process refunds first.",
    });
  }
  const { rows: activeHostBookings } = await pool.query(
    `SELECT b.id
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE bx.host_user_id = $1
       AND bx.is_active = 1
       AND b.status <> 'cancelled'
       AND b.status <> 'completed'
     LIMIT 1`,
    [userId]
  );
  if (activeHostBookings[0]) {
    return res.status(409).json({
      error:
        "Cannot close account while active host bookings exist. Deactivate boxes first.",
    });
  }
  await pool.query(
    `UPDATE boxes
     SET is_active = 0, archived_at = NOW()
     WHERE host_user_id = $1`,
    [userId]
  );
  const { rows } = await pool.query(
    `UPDATE users
     SET role = 'athlete'
     WHERE id = $1
     RETURNING id, full_name, email, role, city, created_at`,
    [userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  return res.json({
    ok: true,
    user: rows[0],
    message: "Host account deactivated to athlete mode.",
  });
});

router.post("/boxes", requireAuth, async (req, res) => {
  const parsed = createBoxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (parsed.data.hostUserId !== req.auth.sub) {
    return res
      .status(403)
      .json({ error: "hostUserId must match authenticated user" });
  }

  const { rows: hostRows } = await pool.query(
    `SELECT id, role FROM users WHERE id = $1`,
    [parsed.data.hostUserId]
  );
  const host = hostRows[0];
  if (!host) return res.status(404).json({ error: "Host user not found" });
  if (!["host", "both"].includes(host.role)) {
    return res.status(400).json({ error: "User role must be host or both" });
  }

  const input = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO boxes (
       host_user_id, title, description, latitude, longitude, city, price_cents,
       capacity_liters, has_water, access_code,
       access_method, access_instructions, access_display_before_min, access_display_after_min,
       availability_note, criteria_json, criteria_note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      input.hostUserId,
      input.title,
      input.description ?? null,
      input.latitude,
      input.longitude,
      input.city,
      input.priceCents,
      input.capacityLiters ?? 20,
      input.hasWater ? 1 : 0,
      input.accessCode?.trim() || generateAccessCode(),
      input.accessMethod || "padlock_code",
      input.accessInstructions?.trim() || null,
      input.accessDisplayBeforeMin ?? 15,
      input.accessDisplayAfterMin ?? 15,
      input.availabilityNote?.trim() || null,
      input.criteriaTags?.length ? JSON.stringify(input.criteriaTags) : null,
      input.criteriaNote?.trim() || null,
    ]
  );
  return res.status(201).json(rows[0]);
});

router.post("/host/boxes", requireAuth, async (req, res) => {
  const parsed = createHostBoxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { rows: hostRows } = await pool.query(
    `SELECT id, role FROM users WHERE id = $1`,
    [req.auth.sub]
  );
  const host = hostRows[0];
  if (!host) return res.status(404).json({ error: "Host user not found" });
  if (!["host", "both"].includes(host.role)) {
    return res.status(400).json({ error: "User role must be host or both" });
  }

  const input = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO boxes (
       host_user_id, title, description, latitude, longitude, city, price_cents,
       capacity_liters, has_water, access_code,
       access_method, access_instructions, access_display_before_min, access_display_after_min,
       availability_note, criteria_json, criteria_note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      req.auth.sub,
      input.title,
      input.description ?? null,
      input.latitude,
      input.longitude,
      input.city,
      input.priceCents,
      input.capacityLiters ?? 20,
      input.hasWater ? 1 : 0,
      input.accessCode?.trim() || generateAccessCode(),
      input.accessMethod || "padlock_code",
      input.accessInstructions?.trim() || null,
      input.accessDisplayBeforeMin ?? 15,
      input.accessDisplayAfterMin ?? 15,
      input.availabilityNote?.trim() || null,
      input.criteriaTags?.length ? JSON.stringify(input.criteriaTags) : null,
      input.criteriaNote?.trim() || null,
    ]
  );
  return res.status(201).json(rows[0]);
});

router.get("/host/boxes", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM boxes WHERE host_user_id = $1 AND is_active = 1 ORDER BY created_at DESC`,
    [req.auth.sub]
  );
  res.json(rows);
});

router.patch("/host/boxes/:id", requireAuth, async (req, res) => {
  const boxId = parseInt(req.params.id, 10);
  if (!Number.isFinite(boxId) || boxId < 1) {
    return res.status(400).json({ error: "Invalid box id" });
  }
  const parsed = createHostBoxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: beforeRows } = await pool.query(
    `SELECT * FROM boxes WHERE id = $1 AND host_user_id = $2 AND is_active = 1`,
    [boxId, req.auth.sub]
  );
  const beforeBox = beforeRows[0];
  if (!beforeBox) {
    return res.status(404).json({ error: "Box not found" });
  }
  const input = parsed.data;
  const { rows } = await pool.query(
    `UPDATE boxes SET
       title = $1,
       description = $2,
       latitude = $3,
       longitude = $4,
       city = $5,
       price_cents = $6,
       access_code = $7,
       access_method = $8,
       access_instructions = $9,
       access_display_before_min = $10,
       access_display_after_min = $11,
       capacity_liters = $12,
       has_water = $13,
       availability_note = $14,
       criteria_json = $15,
       criteria_note = $16
     WHERE id = $17 AND host_user_id = $18 AND is_active = 1
     RETURNING *`,
    [
      input.title,
      input.description ?? null,
      input.latitude,
      input.longitude,
      input.city,
      input.priceCents,
      input.accessCode?.trim() || beforeBox.access_code || generateAccessCode(),
      input.accessMethod || beforeBox.access_method || "padlock_code",
      input.accessInstructions?.trim() || null,
      input.accessDisplayBeforeMin ?? beforeBox.access_display_before_min ?? 15,
      input.accessDisplayAfterMin ?? beforeBox.access_display_after_min ?? 15,
      input.capacityLiters ?? 20,
      input.hasWater ? 1 : 0,
      input.availabilityNote?.trim() || null,
      input.criteriaTags?.length ? JSON.stringify(input.criteriaTags) : null,
      input.criteriaNote?.trim() || null,
      boxId,
      req.auth.sub,
    ]
  );
  const updated = rows[0];
  if (
    normalizeComparable(beforeBox.access_code) !==
    normalizeComparable(updated.access_code)
  ) {
    await pool.query(
      `UPDATE bookings
       SET access_code = $1
       WHERE box_id = $2
         AND status <> 'cancelled'
         AND status <> 'completed'`,
      [updated.access_code, boxId]
    );
  }
  const changedFields = buildBoxChangedFields(beforeBox, updated);
  const changeLabels =
    changedFields.length > 0
      ? changedFields.map((f) => f.label).join(", ")
      : "Aucun détail de champ";
  const { rows: impactedBookings } = await pool.query(
    `SELECT id, athlete_user_id, booking_date, start_time, end_time
     FROM bookings
     WHERE box_id = $1
       AND status <> 'cancelled'
       AND status <> 'completed'`,
    [boxId]
  );
  for (const booking of impactedBookings) {
    await createNotification({
      recipientUserId: booking.athlete_user_id,
      type: "box_updated_by_host",
      title: "Mise à jour d'un box réservé",
      body: `Le box « ${
        updated.title || "sans titre"
      } » a été modifié par l'hôte. Changements: ${changeLabels}.`,
      data: {
        boxId,
        bookingId: booking.id,
        changedFields,
        before: {
          title: beforeBox.title,
          city: beforeBox.city,
          priceCents: beforeBox.price_cents,
          accessCode: beforeBox.access_code,
          capacityLiters: beforeBox.capacity_liters,
          hasWater: beforeBox.has_water,
          availabilityNote: beforeBox.availability_note,
          criteriaNote: beforeBox.criteria_note,
        },
        after: {
          title: updated.title,
          city: updated.city,
          priceCents: updated.price_cents,
          accessCode: updated.access_code,
          capacityLiters: updated.capacity_liters,
          hasWater: updated.has_water,
          availabilityNote: updated.availability_note,
          criteriaNote: updated.criteria_note,
        },
      },
    });
  }
  return res.json({
    ...updated,
    impactedBookingsCount: impactedBookings.length,
  });
});

router.get("/boxes/bounds", async (req, res) => {
  const parsed = boundsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { south, north, west, east, limit } = parsed.data;
  if (south > north) {
    return res.status(400).json({ error: "south must be <= north" });
  }
  if (west > east) {
    return res
      .status(400)
      .json({ error: "Bounds crossing antimeridian not supported" });
  }
  const lim = limit ?? 200;
  const { rows } = await pool.query(
    `SELECT b.*,
            u.full_name AS host_full_name,
            (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_review_count,
            (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_avg_score
     FROM boxes b
     LEFT JOIN users u ON u.id = b.host_user_id
     WHERE b.is_active = 1
       AND b.latitude >= $1 AND b.latitude <= $2
       AND b.longitude >= $3 AND b.longitude <= $4
     ORDER BY b.created_at DESC
     LIMIT $5`,
    [south, north, west, east, lim]
  );
  res.json(rows);
});

router.get("/boxes/nearby", async (req, res) => {
  const parsed = nearbyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { lat, lon, limit } = parsed.data;
  const lim = limit ?? 30;
  const { rows } = await pool.query(
    `SELECT b.*,
            u.full_name AS host_full_name,
            (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_review_count,
            (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_avg_score,
      (6371000 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians($1)) * cos(radians(b.latitude)) * cos(radians(b.longitude) - radians($2))
          + sin(radians($1)) * sin(radians(b.latitude))
        ))
      )) / 1000 AS distance_km
     FROM boxes b
     LEFT JOIN users u ON u.id = b.host_user_id
     WHERE b.is_active = 1
     ORDER BY distance_km ASC
     LIMIT $3`,
    [lat, lon, lim]
  );
  res.json(rows);
});

router.get("/boxes", async (req, res) => {
  const city = req.query.city;
  const { rows } = city
    ? await pool.query(
        `SELECT b.*,
                u.full_name AS host_full_name,
                (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_review_count,
                (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_avg_score
         FROM boxes b
         LEFT JOIN users u ON u.id = b.host_user_id
         WHERE b.is_active = 1 AND b.city = $1
         ORDER BY b.created_at DESC`,
        [city]
      )
    : await pool.query(
        `SELECT b.*,
                u.full_name AS host_full_name,
                (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_review_count,
                (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = b.host_user_id) AS host_avg_score
         FROM boxes b
         LEFT JOIN users u ON u.id = b.host_user_id
         WHERE b.is_active = 1
         ORDER BY b.created_at DESC`
      );
  res.json(rows);
});

router.post("/trails", requireAuth, async (req, res) => {
  const parsed = createTrailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { rows: creatorRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1`,
    [req.auth.sub]
  );
  if (!creatorRows[0])
    return res.status(404).json({ error: "Creator user not found" });

  const input = parsed.data;
  const activity = input.activity ?? "hike";
  const criteriaJson = JSON.stringify(input.criteriaTags ?? []);
  const { rows } = await pool.query(
    `INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes, activity, criteria_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      req.auth.sub,
      input.name,
      input.territory,
      input.distanceKm,
      input.elevationM ?? 0,
      input.difficulty,
      input.gpxUrl ?? null,
      input.notes ?? null,
      activity,
      criteriaJson,
    ]
  );
  return res.status(201).json(rows[0]);
});

router.get("/trails", async (req, res) => {
  const difficulty = req.query.difficulty;
  const activity = req.query.activity;
  const hasDiff =
    difficulty && ["easy", "medium", "hard"].includes(String(difficulty));
  const hasAct =
    activity && trailActivityEnum.safeParse(String(activity)).success;
  const conds = [];
  const params = [];
  if (hasDiff) {
    params.push(String(difficulty));
    conds.push(`difficulty = $${params.length}`);
  }
  if (hasAct) {
    params.push(String(activity));
    conds.push(`activity = $${params.length}`);
  }
  const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT * FROM trails${where} ORDER BY created_at DESC`,
    params
  );
  res.json(rows);
});

function unlinkTrailGpxFile(gpxUrl) {
  if (!gpxUrl || typeof gpxUrl !== "string") return;
  if (!gpxUrl.startsWith("/uploads/")) return;
  const base = path.basename(gpxUrl);
  if (!base || base.includes("..") || base.includes("/")) return;
  const full = path.resolve(path.join(uploadsDir, base));
  const resolvedUploads = path.resolve(uploadsDir);
  if (
    !full.startsWith(resolvedUploads + path.sep) &&
    full !== resolvedUploads
  ) {
    return;
  }
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_e) {
    // ignore
  }
}

router.patch("/trails/:id", requireAuth, async (req, res) => {
  const trailId = Number(req.params.id);
  if (!Number.isInteger(trailId) || trailId <= 0) {
    return res.status(400).json({ error: "Invalid trail id" });
  }
  const parsed = updateTrailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const u = parsed.data;
  const parts = [];
  const vals = [];
  let n = 1;
  if (u.name !== undefined) {
    parts.push(`name = $${n++}`);
    vals.push(u.name);
  }
  if (u.territory !== undefined) {
    parts.push(`territory = $${n++}`);
    vals.push(u.territory);
  }
  if (u.difficulty !== undefined) {
    parts.push(`difficulty = $${n++}`);
    vals.push(u.difficulty);
  }
  if (u.activity !== undefined) {
    parts.push(`activity = $${n++}`);
    vals.push(u.activity);
  }
  if (u.criteriaTags !== undefined) {
    parts.push(`criteria_json = $${n++}`);
    vals.push(JSON.stringify(u.criteriaTags));
  }
  if (u.notes !== undefined) {
    parts.push(`notes = $${n++}`);
    vals.push(u.notes.trim() === "" ? null : u.notes);
  }
  vals.push(trailId, req.auth.sub);
  const { rows } = await pool.query(
    `UPDATE trails SET ${parts.join(
      ", "
    )} WHERE id = $${n++} AND creator_user_id = $${n} RETURNING *`,
    vals
  );
  const row = rows[0];
  if (!row) {
    return res.status(404).json({ error: "Trail not found or not yours" });
  }
  return res.json(row);
});

router.delete("/trails/:id", requireAuth, async (req, res) => {
  const trailId = Number(req.params.id);
  if (!Number.isInteger(trailId) || trailId <= 0) {
    return res.status(400).json({ error: "Invalid trail id" });
  }
  const { rows } = await pool.query(
    `DELETE FROM trails WHERE id = $1 AND creator_user_id = $2 RETURNING gpx_url`,
    [trailId, req.auth.sub]
  );
  const row = rows[0];
  if (!row) {
    return res.status(404).json({ error: "Trail not found or not yours" });
  }
  unlinkTrailGpxFile(row.gpx_url);
  return res.json({ ok: true });
});

router.delete("/trails", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT gpx_url FROM trails WHERE creator_user_id = $1`,
    [req.auth.sub]
  );
  await pool.query(`DELETE FROM trails WHERE creator_user_id = $1`, [
    req.auth.sub,
  ]);
  for (const r of rows) {
    unlinkTrailGpxFile(r.gpx_url);
  }
  return res.json({ ok: true, deleted: rows.length });
});

router.post(
  "/trails/upload-gpx",
  requireAuth,
  upload.single("gpx"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Missing GPX file in form-data field 'gpx'" });
    }
    try {
      const gpxContent = fs.readFileSync(req.file.path, "utf-8");
      const stats = parseGpxStats(gpxContent);
      const trailName =
        req.body.name || req.file.originalname.replace(".gpx", "");
      const territory = req.body.territory || "unknown";
      const difficulty = ["easy", "medium", "hard"].includes(
        req.body.difficulty
      )
        ? req.body.difficulty
        : "medium";
      const activity = normalizeTrailActivity(req.body.activity);
      const criteriaTags = parseTrailCriteriaTagsFromBody(
        req.body.criteriaTags
      );
      const criteriaJson = JSON.stringify(criteriaTags);
      const notesRaw = req.body.notes;
      const notes =
        notesRaw != null && String(notesRaw).trim()
          ? String(notesRaw).slice(0, 4000)
          : null;
      const gpxUrl = `/uploads/${req.file.filename}`;
      const polylineJson =
        stats.polylineLatLngs.length > 0
          ? JSON.stringify(stats.polylineLatLngs)
          : null;

      const { rows } = await pool.query(
        `INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes, polyline_json, activity, criteria_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.auth.sub,
          trailName,
          territory,
          stats.distanceKm > 0 ? stats.distanceKm : 0.1,
          stats.elevationM,
          difficulty,
          gpxUrl,
          notes,
          polylineJson,
          activity,
          criteriaJson,
        ]
      );
      return res.status(201).json({
        fileName: req.file.filename,
        gpxUrl,
        distanceKm: stats.distanceKm,
        elevationM: stats.elevationM,
        trackPoints: stats.trackPoints,
        trail: rows[0],
      });
    } catch (error) {
      return res
        .status(400)
        .json({ error: "Invalid GPX content", details: `${error}` });
    }
  }
);

router.post("/bookings", requireAuth, async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const input = parsed.data;
  const athleteUserId = req.auth.sub;
  const { rows: boxRows } = await pool.query(
    `SELECT id, price_cents, access_code, access_method, access_instructions,
            access_display_before_min, access_display_after_min
     FROM boxes WHERE id = $1 AND is_active = 1`,
    [input.boxId]
  );
  const box = boxRows[0];
  if (!box) return res.status(404).json({ error: "Box not found" });

  const { rows: athleteRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1`,
    [athleteUserId]
  );
  if (!athleteRows[0])
    return res.status(404).json({ error: "Athlete user not found" });
  try {
    await ensureNoBookingOverlap({
      boxId: input.boxId,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }

  const amountCents = box.price_cents;
  const { platformFeeCents, hostEarningsCents } =
    computeCommission(amountCents);
  const accessCode =
    (typeof box.access_code === "string" && box.access_code.trim()) ||
    generateAccessCode();

  const { rows } = await pool.query(
    `INSERT INTO bookings (
      box_id, athlete_user_id, booking_date, start_time, end_time,
      amount_cents, platform_fee_cents, host_earnings_cents, access_code, payment_status, special_request, approval_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'simulated_authorized', $10, 'pending')
    RETURNING *`,
    [
      input.boxId,
      athleteUserId,
      input.bookingDate,
      input.startTime,
      input.endTime,
      amountCents,
      platformFeeCents,
      hostEarningsCents,
      accessCode,
      input.specialRequest?.trim() || null,
    ]
  );
  const created = rows[0];
  await logBookingEvent({
    bookingId: created.id,
    actorUserId: req.auth.sub,
    eventType: "booking_created",
    message: "Reservation created by athlete",
    data: {
      bookingDate: created.booking_date,
      startTime: created.start_time,
      endTime: created.end_time,
      specialRequest: created.special_request,
    },
  });
  return res.status(201).json(created);
});

router.get("/host/bookings", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
      b.*,
      bx.title AS box_title,
      bx.city AS box_city,
      bx.access_method,
      bx.access_instructions,
      bx.access_display_before_min,
      bx.access_display_after_min,
      u.full_name AS athlete_full_name,
      u.email AS athlete_email,
      (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = b.athlete_user_id) AS athlete_review_count,
      (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = b.athlete_user_id) AS athlete_avg_score
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     JOIN users u ON u.id = b.athlete_user_id
     WHERE bx.host_user_id = $1
     ORDER BY b.created_at DESC`,
    [req.auth.sub]
  );
  return res.json(rows);
});

router.patch("/host/bookings/:id/decision", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const parsed = hostBookingDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: ownerRows } = await pool.query(
    `SELECT
      b.*,
      bx.host_user_id,
      bx.title AS box_title
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND bx.host_user_id = $2`,
    [bookingId, req.auth.sub]
  );
  const booking = ownerRows[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found for this host" });
  }

  if (booking.approval_status === "pending_athlete_confirmation") {
    return res.status(409).json({
      error: "This change must be validated by the athlete",
    });
  }

  if (parsed.data.decision === "accept") {
    if (booking.approval_status === "pending_host_confirmation") {
      const draft = parseChangeRequest(booking.change_request_json);
      if (!draft) {
        return res
          .status(409)
          .json({ error: "Missing change request payload" });
      }
      try {
        await ensureNoBookingOverlap({
          boxId: booking.box_id,
          bookingDate: draft.bookingDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          ignoreBookingId: bookingId,
        });
      } catch (error) {
        return res.status(409).json({ error: error.message });
      }
      const { rows } = await pool.query(
        `UPDATE bookings
         SET booking_date = $1,
             start_time = $2,
             end_time = $3,
             special_request = $4,
             approval_status = 'accepted',
             change_request_json = NULL,
             change_requested_by = NULL,
             change_requested_at = NULL
         WHERE id = $5
         RETURNING *`,
        [
          draft.bookingDate,
          draft.startTime,
          draft.endTime,
          draft.specialRequest ?? null,
          bookingId,
        ]
      );
      if (booking.change_requested_by) {
        await createNotification({
          recipientUserId: booking.change_requested_by,
          type: "booking_change_accepted",
          title: "Modification de réservation acceptée",
          body: `Ta demande de modification pour « ${
            booking.box_title || "ta box"
          } » a été acceptée.`,
          data: { bookingId },
        });
      }
      await logBookingEvent({
        bookingId,
        actorUserId: req.auth.sub,
        eventType: "booking_change_accepted_by_host",
        message: "Host accepted athlete change request",
        data: draft,
      });
      return res.json(rows[0]);
    }

    try {
      await ensureNoBookingOverlap({
        boxId: booking.box_id,
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        ignoreBookingId: bookingId,
      });
    } catch (error) {
      return res.status(409).json({ error: error.message });
    }
    const { rows } = await pool.query(
      `UPDATE bookings
       SET approval_status = 'accepted', status = 'confirmed'
       WHERE id = $1
       RETURNING *`,
      [bookingId]
    );
    await createNotification({
      recipientUserId: booking.athlete_user_id,
      type: "booking_approved",
      title: "Réservation acceptée",
      body: `L'hôte a accepté ta réservation pour « ${
        booking.box_title || "ce box"
      } ».`,
      data: { bookingId },
    });
    await logBookingEvent({
      bookingId,
      actorUserId: req.auth.sub,
      eventType: "booking_accepted",
      message: "Host accepted booking request",
    });
    return res.json(rows[0]);
  }

  if (booking.approval_status === "pending_host_confirmation") {
    await pool.query(
      `UPDATE bookings
       SET approval_status = 'accepted',
           change_request_json = NULL,
           change_requested_by = NULL,
           change_requested_at = NULL
       WHERE id = $1`,
      [bookingId]
    );
    if (booking.change_requested_by) {
      await createNotification({
        recipientUserId: booking.change_requested_by,
        type: "booking_change_rejected",
        title: "Modification refusée",
        body: `Ta demande de modification pour « ${
          booking.box_title || "ta box"
        } » a été refusée.`,
        data: { bookingId },
      });
    }
    await logBookingEvent({
      bookingId,
      actorUserId: req.auth.sub,
      eventType: "booking_change_rejected_by_host",
      message: "Host rejected athlete change request",
    });
    const { rows } = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [
      bookingId,
    ]);
    return res.json(rows[0]);
  }

  const { rows } = await pool.query(
    `UPDATE bookings
     SET approval_status = 'rejected', status = 'cancelled'
     WHERE id = $1
     RETURNING *`,
    [bookingId]
  );
  await createNotification({
    recipientUserId: booking.athlete_user_id,
    type: "booking_rejected",
    title: "Réservation refusée",
    body: `L'hôte a refusé ta réservation pour « ${
      booking.box_title || "ce box"
    } ».`,
    data: { bookingId },
  });
  await logBookingEvent({
    bookingId,
    actorUserId: req.auth.sub,
    eventType: "booking_rejected",
    message: "Host rejected booking request",
  });
  return res.json(rows[0]);
});

router.get("/bookings", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, bx.title AS box_title, bx.city AS box_city,
            bx.host_user_id,
            bx.access_method, bx.access_instructions,
            bx.access_display_before_min, bx.access_display_after_min,
            uh.full_name AS host_full_name,
            (SELECT COUNT(*)::int FROM reviews r WHERE r.reviewee_user_id = bx.host_user_id) AS host_review_count,
            (SELECT COALESCE(AVG(score), 0)::float FROM reviews r WHERE r.reviewee_user_id = bx.host_user_id) AS host_avg_score
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     LEFT JOIN users uh ON uh.id = bx.host_user_id
     WHERE b.athlete_user_id = $1
     ORDER BY b.created_at DESC`,
    [req.auth.sub]
  );
  res.json(rows);
});

router.get("/bookings/:id/events", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const { rows: authRows } = await pool.query(
    `SELECT b.id
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1
       AND (b.athlete_user_id = $2 OR bx.host_user_id = $2)`,
    [bookingId, req.auth.sub]
  );
  if (!authRows[0]) {
    return res.status(404).json({ error: "Booking not found" });
  }
  const { rows } = await pool.query(
    `SELECT e.id, e.event_type, e.message, e.data_json, e.created_at,
            u.full_name AS actor_name
     FROM booking_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.booking_id = $1
     ORDER BY e.created_at DESC`,
    [bookingId]
  );
  return res.json(rows);
});

router.post("/reviews", requireAuth, async (req, res) => {
  const parsed = createReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { bookingId, score, comment } = parsed.data;
  const { rows: bookingRows } = await pool.query(
    `SELECT b.id, b.status, b.athlete_user_id, bx.host_user_id
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = bookingRows[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "completed") {
    return res.status(409).json({
      error: "Review is allowed only for completed bookings",
    });
  }
  const reviewerId = req.auth.sub;
  let revieweeId = null;
  if (reviewerId === booking.athlete_user_id) {
    revieweeId = booking.host_user_id;
  } else if (reviewerId === booking.host_user_id) {
    revieweeId = booking.athlete_user_id;
  } else {
    return res.status(403).json({ error: "You are not part of this booking" });
  }
  const { rows } = await pool.query(
    `INSERT INTO reviews (booking_id, reviewer_user_id, reviewee_user_id, score, comment)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (booking_id) DO UPDATE
       SET reviewer_user_id = EXCLUDED.reviewer_user_id,
           reviewee_user_id = EXCLUDED.reviewee_user_id,
           score = EXCLUDED.score,
           comment = EXCLUDED.comment
     RETURNING *`,
    [bookingId, reviewerId, revieweeId, score, comment?.trim() || null]
  );
  await createNotification({
    recipientUserId: revieweeId,
    type: "new_review",
    title: "Nouvel avis reçu",
    body: `Tu as reçu une note ${score}/5.`,
    data: { bookingId, score },
  });
  return res.status(201).json(rows[0]);
});

router.get("/users/:id/reviews", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  const { rows: userRows } = await pool.query(
    `SELECT id, full_name, city FROM users WHERE id = $1`,
    [userId]
  );
  const publicUser = userRows[0] || null;
  const { rows } = await pool.query(
    `SELECT r.id, r.booking_id, r.score, r.comment, r.created_at,
            u.full_name AS reviewer_name
     FROM reviews r
     JOIN users u ON u.id = r.reviewer_user_id
     WHERE r.reviewee_user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  const { rows: aggRows } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(score), 0)::float AS avg_score
     FROM reviews
     WHERE reviewee_user_id = $1`,
    [userId]
  );
  return res.json({
    user: publicUser,
    stats: aggRows[0] || { count: 0, avg_score: 0 },
    reviews: rows,
  });
});

router.patch("/host/bookings/:id", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const parsed = updateBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: ownership } = await pool.query(
    `SELECT b.id, b.athlete_user_id, b.status, b.approval_status, bx.title AS box_title
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND bx.host_user_id = $2`,
    [bookingId, req.auth.sub]
  );
  const booking = ownership[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found for this host" });
  }
  if (
    booking.status === "cancelled" ||
    booking.approval_status === "rejected"
  ) {
    return res
      .status(409)
      .json({ error: "Cannot request changes on a cancelled booking" });
  }
  const draft = sanitizeBookingDraft(parsed.data);
  const { rows } = await pool.query(
    `UPDATE bookings
     SET approval_status = 'pending_athlete_confirmation',
         change_request_json = $1,
         change_requested_by = $2,
         change_requested_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(draft), req.auth.sub, bookingId]
  );
  await createNotification({
    recipientUserId: booking.athlete_user_id,
    type: "booking_change_requested_by_host",
    title: "Validation requise",
    body: `L'hôte propose une modification pour « ${
      booking.box_title || "ta réservation"
    } ».`,
    data: { bookingId, draft },
  });
  await logBookingEvent({
    bookingId,
    actorUserId: req.auth.sub,
    eventType: "booking_change_requested_by_host",
    message: "Host requested booking changes",
    data: draft,
  });
  return res.json(rows[0]);
});

router.patch("/bookings/:id", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const parsed = updateBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: ownership } = await pool.query(
    `SELECT b.id, b.status, b.approval_status, b.athlete_user_id, bx.host_user_id, bx.title AS box_title
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND b.athlete_user_id = $2`,
    [bookingId, req.auth.sub]
  );
  const booking = ownership[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (
    booking.status === "cancelled" ||
    booking.approval_status === "rejected"
  ) {
    return res
      .status(409)
      .json({ error: "Cannot request changes on a cancelled booking" });
  }
  const draft = sanitizeBookingDraft(parsed.data);
  const { rows } = await pool.query(
    `UPDATE bookings
     SET approval_status = 'pending_host_confirmation',
         change_request_json = $1,
         change_requested_by = $2,
         change_requested_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(draft), req.auth.sub, bookingId]
  );
  await createNotification({
    recipientUserId: booking.host_user_id,
    type: "booking_change_requested_by_athlete",
    title: "Validation requise",
    body: `L'athlète propose une modification pour « ${
      booking.box_title || "ta réservation"
    } ».`,
    data: { bookingId, draft },
  });
  await logBookingEvent({
    bookingId,
    actorUserId: req.auth.sub,
    eventType: "booking_change_requested_by_athlete",
    message: "Athlete requested booking changes",
    data: draft,
  });
  return res.json(rows[0]);
});

router.patch("/bookings/:id/decision", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const parsed = bookingChangeDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: ownership } = await pool.query(
    `SELECT b.*, bx.host_user_id, bx.title AS box_title
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND b.athlete_user_id = $2`,
    [bookingId, req.auth.sub]
  );
  const booking = ownership[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.approval_status !== "pending_athlete_confirmation") {
    return res.status(409).json({
      error: "No pending host change to validate for this booking",
    });
  }
  if (parsed.data.decision === "accept") {
    const draft = parseChangeRequest(booking.change_request_json);
    if (!draft) {
      return res.status(409).json({ error: "Missing change request payload" });
    }
    try {
      await ensureNoBookingOverlap({
        boxId: booking.box_id,
        bookingDate: draft.bookingDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        ignoreBookingId: bookingId,
      });
    } catch (error) {
      return res.status(409).json({ error: error.message });
    }
    const { rows } = await pool.query(
      `UPDATE bookings
       SET booking_date = $1,
           start_time = $2,
           end_time = $3,
           special_request = $4,
           approval_status = 'accepted',
           change_request_json = NULL,
           change_requested_by = NULL,
           change_requested_at = NULL
       WHERE id = $5
       RETURNING *`,
      [
        draft.bookingDate,
        draft.startTime,
        draft.endTime,
        draft.specialRequest ?? null,
        bookingId,
      ]
    );
    await createNotification({
      recipientUserId: booking.host_user_id,
      type: "booking_change_accepted",
      title: "Modification acceptée",
      body: `L'athlète a accepté la modification pour « ${
        booking.box_title || "la réservation"
      } ».`,
      data: { bookingId },
    });
    await logBookingEvent({
      bookingId,
      actorUserId: req.auth.sub,
      eventType: "booking_change_accepted_by_athlete",
      message: "Athlete accepted host change request",
      data: draft,
    });
    return res.json(rows[0]);
  }
  await pool.query(
    `UPDATE bookings
     SET approval_status = 'accepted',
         change_request_json = NULL,
         change_requested_by = NULL,
         change_requested_at = NULL
     WHERE id = $1`,
    [bookingId]
  );
  await createNotification({
    recipientUserId: booking.host_user_id,
    type: "booking_change_rejected",
    title: "Modification refusée",
    body: `L'athlète a refusé la modification pour « ${
      booking.box_title || "la réservation"
    } ».`,
    data: { bookingId },
  });
  await logBookingEvent({
    bookingId,
    actorUserId: req.auth.sub,
    eventType: "booking_change_rejected_by_athlete",
    message: "Athlete rejected host change request",
  });
  const { rows } = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [
    bookingId,
  ]);
  return res.json(rows[0]);
});

router.get("/host/boxes/:id/deletion-impact", requireAuth, async (req, res) => {
  const boxId = Number(req.params.id);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return res.status(400).json({ error: "Invalid box id" });
  }
  const { rows: boxRows } = await pool.query(
    `SELECT id, title FROM boxes WHERE id = $1 AND host_user_id = $2 AND is_active = 1`,
    [boxId, req.auth.sub]
  );
  const box = boxRows[0];
  if (!box) {
    return res.status(404).json({ error: "Box not found for this host" });
  }
  const { rows: impactRows } = await pool.query(
    `SELECT b.id, b.athlete_user_id, b.booking_date, b.start_time, b.end_time
     FROM bookings b
     WHERE b.box_id = $1
       AND b.status <> 'cancelled'
       AND b.status <> 'completed'
     ORDER BY b.booking_date ASC, b.start_time ASC`,
    [boxId]
  );
  return res.json({
    boxId,
    boxTitle: box.title,
    impactedBookingsCount: impactRows.length,
    impactedBookingsPreview: impactRows.slice(0, 20),
  });
});

router.delete("/host/boxes/:id", requireAuth, async (req, res) => {
  const boxId = Number(req.params.id);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return res.status(400).json({ error: "Invalid box id" });
  }
  const parsed = deleteHostBoxSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: boxRows } = await pool.query(
    `SELECT id, title FROM boxes WHERE id = $1 AND host_user_id = $2 AND is_active = 1`,
    [boxId, req.auth.sub]
  );
  const box = boxRows[0];
  if (!box) {
    return res.status(404).json({ error: "Box not found for this host" });
  }
  const { rows: impactRows } = await pool.query(
    `SELECT id FROM bookings
     WHERE box_id = $1
       AND status <> 'cancelled'
       AND status <> 'completed'`,
    [boxId]
  );
  const impactedCount = impactRows.length;
  await pool.query(
    `UPDATE boxes
     SET is_active = 0, archived_at = NOW()
     WHERE id = $1 AND host_user_id = $2`,
    [boxId, req.auth.sub]
  );
  const { rows: cancelledRows } = await pool.query(
    `UPDATE bookings
     SET status = 'cancelled',
         approval_status = 'cancelled_box_deleted',
         change_request_json = NULL,
         change_requested_by = NULL,
         change_requested_at = NULL
     WHERE box_id = $1
       AND status <> 'cancelled'
       AND status <> 'completed'
     RETURNING id, athlete_user_id, amount_cents`,
    [boxId]
  );
  // Paiement Phase A: file de remboursement simulée pour chaque réservation annulée.
  for (const row of cancelledRows) {
    await pool.query(
      `INSERT INTO refunds (booking_id, athlete_user_id, host_user_id, box_id, amount_cents, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (booking_id) DO NOTHING`,
      [
        row.id,
        row.athlete_user_id,
        req.auth.sub,
        boxId,
        row.amount_cents,
        "box_deactivated_by_host",
      ]
    );
    await pool.query(
      `UPDATE bookings
       SET refund_status = 'pending',
           refund_amount_cents = $2
       WHERE id = $1`,
      [row.id, row.amount_cents]
    );
  }
  for (const row of cancelledRows) {
    await createNotification({
      recipientUserId: row.athlete_user_id,
      type: "booking_cancelled_box_deleted",
      title: "Réservation annulée",
      body: `Le box « ${
        box.title || "sans titre"
      } » a été supprimé par l'hôte.`,
      data: { bookingId: row.id, boxId },
    });
    await logBookingEvent({
      bookingId: row.id,
      actorUserId: req.auth.sub,
      eventType: "booking_cancelled_box_archived",
      message: "Booking cancelled because host archived the box",
      data: { boxId },
    });
  }
  return res.json({
    ok: true,
    archivedBoxId: boxId,
    cancelledBookingsCount: cancelledRows.length,
  });
});

router.delete("/host/boxes", requireAuth, async (req, res) => {
  const parsed = deleteHostBoxSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rows: activeBoxes } = await pool.query(
    `SELECT id, title FROM boxes WHERE host_user_id = $1 AND is_active = 1`,
    [req.auth.sub]
  );
  const boxIds = activeBoxes.map((b) => b.id);
  if (boxIds.length === 0) {
    return res.json({
      ok: true,
      archivedBoxesCount: 0,
      cancelledBookingsCount: 0,
    });
  }
  const { rows: impactRows } = await pool.query(
    `SELECT id FROM bookings
     WHERE box_id = ANY($1::int[])
       AND status <> 'cancelled'
       AND status <> 'completed'`,
    [boxIds]
  );
  await pool.query(
    `UPDATE boxes
     SET is_active = 0, archived_at = NOW()
     WHERE host_user_id = $1 AND is_active = 1`,
    [req.auth.sub]
  );
  const { rows: cancelledRows } = await pool.query(
    `UPDATE bookings b
     SET status = 'cancelled',
         approval_status = 'cancelled_box_deleted',
         change_request_json = NULL,
         change_requested_by = NULL,
         change_requested_at = NULL
     FROM boxes bx
     WHERE b.box_id = bx.id
       AND bx.host_user_id = $1
       AND b.status <> 'cancelled'
       AND b.status <> 'completed'
     RETURNING b.id, b.athlete_user_id, b.amount_cents, bx.id AS box_id, bx.title AS box_title`,
    [req.auth.sub]
  );
  for (const row of cancelledRows) {
    await pool.query(
      `INSERT INTO refunds (booking_id, athlete_user_id, host_user_id, box_id, amount_cents, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (booking_id) DO NOTHING`,
      [
        row.id,
        row.athlete_user_id,
        req.auth.sub,
        row.box_id,
        row.amount_cents,
        "boxes_deactivated_by_host",
      ]
    );
    await pool.query(
      `UPDATE bookings
       SET refund_status = 'pending',
           refund_amount_cents = $2
       WHERE id = $1`,
      [row.id, row.amount_cents]
    );
  }
  for (const row of cancelledRows) {
    await createNotification({
      recipientUserId: row.athlete_user_id,
      type: "booking_cancelled_box_deleted",
      title: "Réservation annulée",
      body: `Le box « ${
        row.box_title || "sans titre"
      } » a été supprimé par l'hôte.`,
      data: { bookingId: row.id, boxId: row.box_id },
    });
    await logBookingEvent({
      bookingId: row.id,
      actorUserId: req.auth.sub,
      eventType: "booking_cancelled_box_archived",
      message: "Booking cancelled because host archived boxes",
      data: { boxId: row.box_id },
    });
  }
  return res.json({
    ok: true,
    archivedBoxesCount: boxIds.length,
    cancelledBookingsCount: cancelledRows.length,
  });
});

router.patch("/host/boxes/:id/restore", requireAuth, async (req, res) => {
  const boxId = Number(req.params.id);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return res.status(400).json({ error: "Invalid box id" });
  }
  const { rows } = await pool.query(
    `UPDATE boxes
     SET is_active = 1, archived_at = NULL
     WHERE id = $1 AND host_user_id = $2
     RETURNING *`,
    [boxId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Box not found for this host" });
  }
  return res.json(rows[0]);
});

router.delete("/host/bookings/:id", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const { rows } = await pool.query(
    `DELETE FROM bookings b
     USING boxes bx
     WHERE b.id = $1 AND b.box_id = bx.id AND bx.host_user_id = $2
     RETURNING b.id`,
    [bookingId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Booking not found for this host" });
  }
  return res.json({ ok: true });
});

router.delete("/host/bookings", requireAuth, async (req, res) => {
  await pool.query(
    `DELETE FROM bookings b
     USING boxes bx
     WHERE b.box_id = bx.id AND bx.host_user_id = $1`,
    [req.auth.sub]
  );
  return res.json({ ok: true });
});

router.delete("/bookings/:id", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const { rows: beforeRows } = await pool.query(
    `SELECT id, status, booking_date, start_time
     FROM bookings
     WHERE id = $1 AND athlete_user_id = $2`,
    [bookingId, req.auth.sub]
  );
  const before = beforeRows[0];
  if (!before) {
    return res.status(404).json({ error: "Booking not found" });
  }
  const startAt = parseISODateTimeUtc(before.booking_date, before.start_time);
  if (
    startAt &&
    before.status !== "cancelled" &&
    before.status !== "completed"
  ) {
    const diffMs = startAt.getTime() - Date.now();
    if (diffMs > 0 && diffMs < 2 * 60 * 60 * 1000) {
      return res.status(409).json({
        error: "Cannot cancel less than 2 hours before start time",
      });
    }
  }
  const { rows } = await pool.query(
    `UPDATE bookings
     SET status = 'cancelled',
         approval_status = 'cancelled_by_athlete'
     WHERE id = $1 AND athlete_user_id = $2
     RETURNING id, box_id, amount_cents`,
    [bookingId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Booking not found" });
  }
  await pool.query(
    `INSERT INTO refunds (booking_id, athlete_user_id, box_id, amount_cents, reason, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (booking_id) DO NOTHING`,
    [
      bookingId,
      req.auth.sub,
      rows[0].box_id,
      rows[0].amount_cents,
      "cancelled_by_athlete",
    ]
  );
  await pool.query(
    `UPDATE bookings
     SET refund_status = 'pending',
         refund_amount_cents = $2
     WHERE id = $1`,
    [bookingId, rows[0].amount_cents]
  );
  await logBookingEvent({
    bookingId,
    actorUserId: req.auth.sub,
    eventType: "booking_deleted_by_athlete",
    message: "Athlete deleted booking",
  });
  return res.json({ ok: true });
});

router.delete("/bookings", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE bookings
     SET status = 'cancelled',
         approval_status = 'cancelled_by_athlete'
     WHERE athlete_user_id = $1
       AND status <> 'cancelled'
       AND status <> 'completed'
     RETURNING id, box_id, amount_cents`,
    [req.auth.sub]
  );
  for (const row of rows) {
    await pool.query(
      `INSERT INTO refunds (booking_id, athlete_user_id, box_id, amount_cents, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (booking_id) DO NOTHING`,
      [
        row.id,
        req.auth.sub,
        row.box_id,
        row.amount_cents,
        "cancelled_by_athlete",
      ]
    );
    await pool.query(
      `UPDATE bookings
       SET refund_status = 'pending',
           refund_amount_cents = $2
       WHERE id = $1`,
      [row.id, row.amount_cents]
    );
  }
  return res.json({ ok: true });
});

router.get("/host/refunds", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, b.booking_date, b.start_time, b.end_time,
            bx.title AS box_title, u.full_name AS athlete_full_name
     FROM refunds r
     JOIN bookings b ON b.id = r.booking_id
     LEFT JOIN boxes bx ON bx.id = r.box_id
     LEFT JOIN users u ON u.id = r.athlete_user_id
     WHERE r.host_user_id = $1
     ORDER BY r.created_at DESC`,
    [req.auth.sub]
  );
  return res.json(rows);
});

router.patch("/refunds/:id/mark-done", requireAuth, async (req, res) => {
  const refundId = Number(req.params.id);
  if (!Number.isInteger(refundId) || refundId <= 0) {
    return res.status(400).json({ error: "Invalid refund id" });
  }
  const { rows } = await pool.query(
    `UPDATE refunds
     SET status = 'done',
         processed_at = NOW()
     WHERE id = $1 AND host_user_id = $2
     RETURNING *`,
    [refundId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Refund not found" });
  }
  await pool.query(
    `UPDATE bookings
     SET refund_status = 'done',
         refunded_at = NOW()
     WHERE id = $1`,
    [rows[0].booking_id]
  );
  return res.json(rows[0]);
});

router.post("/bookings/:id/access-log", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const eventType = String(req.body?.eventType || "access_attempt").slice(
    0,
    80
  );
  const message = String(req.body?.message || "").slice(0, 1500) || null;
  const { rows: authRows } = await pool.query(
    `SELECT b.id, b.box_id
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND (b.athlete_user_id = $2 OR bx.host_user_id = $2)`,
    [bookingId, req.auth.sub]
  );
  const booking = authRows[0];
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const { rows } = await pool.query(
    `INSERT INTO access_logs (booking_id, box_id, user_id, event_type, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [bookingId, booking.box_id, req.auth.sub, eventType, message]
  );
  return res.status(201).json(rows[0]);
});

router.post("/bookings/:id/incidents", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  const kind = String(req.body?.kind || "access_issue").slice(0, 80);
  const details = String(req.body?.details || "").slice(0, 3000) || null;
  const { rows: authRows } = await pool.query(
    `SELECT b.id, b.box_id, bx.host_user_id
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
     WHERE b.id = $1 AND (b.athlete_user_id = $2 OR bx.host_user_id = $2)`,
    [bookingId, req.auth.sub]
  );
  const booking = authRows[0];
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const { rows } = await pool.query(
    `INSERT INTO access_incidents (booking_id, box_id, reporter_user_id, kind, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [bookingId, booking.box_id, req.auth.sub, kind, details]
  );
  await createNotification({
    recipientUserId: booking.host_user_id,
    type: "access_incident_reported",
    title: "Incident d'accès signalé",
    body: "Un athlète a signalé un problème d'accès sur une réservation.",
    data: { bookingId, incidentId: rows[0].id },
  });
  return res.status(201).json(rows[0]);
});

module.exports = router;
