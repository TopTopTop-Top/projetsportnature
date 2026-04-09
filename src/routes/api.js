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
    `SELECT * FROM boxes WHERE host_user_id = $1 ORDER BY created_at DESC`,
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
     WHERE id = $12 AND host_user_id = $13
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
  if (rows.length === 0) {
    return res.status(404).json({ error: "Box not found" });
  }
  return res.json(rows[0]);
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
  return res.status(201).json(rows[0]);
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
  const nextApproval =
    parsed.data.decision === "accept" ? "accepted" : "rejected";
  const nextStatus =
    parsed.data.decision === "accept" ? "confirmed" : "cancelled";

  const { rows } = await pool.query(
    `UPDATE bookings b
     SET approval_status = $1, status = $2
     FROM boxes bx
     WHERE b.id = $3
       AND bx.id = b.box_id
       AND bx.host_user_id = $4
     RETURNING b.*`,
    [nextApproval, nextStatus, bookingId, req.auth.sub]
  );
  const booking = rows[0];
  if (!booking) {
    return res.status(404).json({ error: "Booking not found for this host" });
  }
  return res.json(booking);
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

router.delete("/host/boxes/:id", requireAuth, async (req, res) => {
  const boxId = Number(req.params.id);
  if (!Number.isInteger(boxId) || boxId <= 0) {
    return res.status(400).json({ error: "Invalid box id" });
  }
  const { rows } = await pool.query(
    `DELETE FROM boxes WHERE id = $1 AND host_user_id = $2 RETURNING id`,
    [boxId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Box not found for this host" });
  }
  return res.json({ ok: true });
});

router.delete("/host/boxes", requireAuth, async (req, res) => {
  await pool.query(`DELETE FROM boxes WHERE host_user_id = $1`, [req.auth.sub]);
  return res.json({ ok: true });
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
  const { rows } = await pool.query(
    `DELETE FROM bookings WHERE id = $1 AND athlete_user_id = $2 RETURNING id`,
    [bookingId, req.auth.sub]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Booking not found" });
  }
  return res.json({ ok: true });
});

router.delete("/bookings", requireAuth, async (req, res) => {
  await pool.query(`DELETE FROM bookings WHERE athlete_user_id = $1`, [
    req.auth.sub,
  ]);
  return res.json({ ok: true });
});

module.exports = router;
