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
  availabilityNote: z.string().max(2000).optional(),
  criteriaTags: z.array(z.string().min(1).max(50)).max(20).optional(),
  criteriaNote: z.string().max(2000).optional(),
});

const createTrailSchema = z.object({
  name: z.string().min(3),
  territory: z.string().min(2),
  distanceKm: z.number().positive(),
  elevationM: z.number().int().nonnegative().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  gpxUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

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

/** Géocodage inverse (Nominatim OSM) — ville depuis lat/lon pour publication box. */
router.get("/geocode/reverse", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: "Invalid lat or lon" });
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Coordinates out of range" });
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "fr");
    const r = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "RavitoBox/1.0 (https://github.com/TopTopTop-Top/projetsportnature)",
      },
    });
    if (!r.ok) {
      return res.status(502).json({ error: "Geocoding service error" });
    }
    const data = await r.json();
    const addr = data.address || {};
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
    if (!placeLabel && typeof data.display_name === "string") {
      const first = data.display_name.split(",")[0]?.trim();
      if (first) placeLabel = first;
    }
    return res.json({
      city,
      placeLabel: placeLabel || null,
      displayName: data.display_name || null,
      postcode: addr.postcode || null,
    });
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
    `INSERT INTO boxes (host_user_id, title, description, latitude, longitude, city, price_cents, capacity_liters, has_water, availability_note, criteria_json, criteria_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
    `INSERT INTO boxes (host_user_id, title, description, latitude, longitude, city, price_cents, capacity_liters, has_water, availability_note, criteria_json, criteria_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
       capacity_liters = $7,
       has_water = $8,
       availability_note = $9,
       criteria_json = $10,
       criteria_note = $11
     WHERE id = $12 AND host_user_id = $13 AND is_active = 1
     RETURNING *`,
    [
      input.title,
      input.description ?? null,
      input.latitude,
      input.longitude,
      input.city,
      input.priceCents,
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
          capacityLiters: beforeBox.capacity_liters,
          hasWater: beforeBox.has_water,
          availabilityNote: beforeBox.availability_note,
          criteriaNote: beforeBox.criteria_note,
        },
        after: {
          title: updated.title,
          city: updated.city,
          priceCents: updated.price_cents,
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
  const latSpan = north - south;
  const lonSpan = east - west;
  const maxSpan = 12;
  if (latSpan > maxSpan || lonSpan > maxSpan) {
    return res.status(400).json({
      error: `Viewport too large (max ${maxSpan}° per axis). Zoom in.`,
    });
  }
  const lim = limit ?? 200;
  const { rows } = await pool.query(
    `SELECT * FROM boxes
     WHERE is_active = 1
       AND latitude >= $1 AND latitude <= $2
       AND longitude >= $3 AND longitude <= $4
     ORDER BY created_at DESC
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
    `SELECT *,
      (6371000 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
          + sin(radians($1)) * sin(radians(latitude))
        ))
      )) / 1000 AS distance_km
     FROM boxes
     WHERE is_active = 1
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
        `SELECT * FROM boxes WHERE city = $1 AND is_active = 1 ORDER BY created_at DESC`,
        [city]
      )
    : await pool.query(
        `SELECT * FROM boxes WHERE is_active = 1 ORDER BY created_at DESC`
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
  const { rows } = await pool.query(
    `INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    ]
  );
  return res.status(201).json(rows[0]);
});

router.get("/trails", async (req, res) => {
  const difficulty = req.query.difficulty;
  const { rows } = difficulty
    ? await pool.query(
        `SELECT * FROM trails WHERE difficulty = $1 ORDER BY created_at DESC`,
        [difficulty]
      )
    : await pool.query(`SELECT * FROM trails ORDER BY created_at DESC`);
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
      const notes = req.body.notes || null;
      const gpxUrl = `/uploads/${req.file.filename}`;
      const polylineJson =
        stats.polylineLatLngs.length > 0
          ? JSON.stringify(stats.polylineLatLngs)
          : null;

      const { rows } = await pool.query(
        `INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes, polyline_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    `SELECT id, price_cents FROM boxes WHERE id = $1 AND is_active = 1`,
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
  const accessCode = generateAccessCode();

  const { rows } = await pool.query(
    `INSERT INTO bookings (
      box_id, athlete_user_id, booking_date, start_time, end_time,
      amount_cents, platform_fee_cents, host_earnings_cents, access_code, special_request, approval_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
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
      u.full_name AS athlete_full_name,
      u.email AS athlete_email
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
    `SELECT b.*, bx.title AS box_title, bx.city AS box_city
     FROM bookings b
     JOIN boxes bx ON bx.id = b.box_id
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
  if (impactedCount > 0 && !parsed.data.confirmImpact) {
    return res.status(409).json({
      error: "This box has active bookings. Confirm impact before deleting.",
      requiresConfirmImpact: true,
      impactedBookingsCount: impactedCount,
    });
  }
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
     RETURNING id, athlete_user_id`,
    [boxId]
  );
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
  if (impactRows.length > 0 && !parsed.data.confirmImpact) {
    return res.status(409).json({
      error:
        "Some boxes have active bookings. Confirm impact before deleting all boxes.",
      requiresConfirmImpact: true,
      impactedBookingsCount: impactRows.length,
    });
  }
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
     RETURNING b.id, b.athlete_user_id, bx.id AS box_id, bx.title AS box_title`,
    [req.auth.sub]
  );
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
    `DELETE FROM bookings WHERE id = $1 AND athlete_user_id = $2 RETURNING id`,
    [bookingId, req.auth.sub]
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
  await pool.query(`DELETE FROM bookings WHERE athlete_user_id = $1`, [
    req.auth.sub,
  ]);
  return res.json({ ok: true });
});

module.exports = router;
