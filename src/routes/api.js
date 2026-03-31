const express = require("express");
const { z } = require("zod");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");
const { db } = require("../db/database");
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
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
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

  return {
    trackPoints: points.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    elevationM: Math.round(elevationM),
  };
}

function createRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createSessionForUser(user) {
  const token = signToken(user);
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  db.prepare(
    "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).run(user.id, refreshToken, expiresAt);
  return { token, refreshToken };
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ravitobox-api" });
});

router.post("/auth/register", (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { fullName, email, password, role, city } = parsed.data;
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, city)
      VALUES (@fullName, @email, @passwordHash, @role, @city)
    `);
    const result = stmt.run({
      fullName,
      email,
      passwordHash,
      role,
      city: city ?? null,
    });
    const created = db
      .prepare(
        "SELECT id, full_name, email, role, city, created_at FROM users WHERE id = ?"
      )
      .get(result.lastInsertRowid);
    const session = createSessionForUser({
      id: created.id,
      email: created.email,
      role: created.role,
    });
    return res.status(201).json({ user: created, ...session });
  } catch (error) {
    return res
      .status(409)
      .json({ error: "Email already exists", details: `${error}` });
  }
});

router.post("/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;
  const user = db
    .prepare(
      "SELECT id, full_name, email, role, city, password_hash, created_at FROM users WHERE email = ?"
    )
    .get(email);
  if (
    !user ||
    !user.password_hash ||
    !bcrypt.compareSync(password, user.password_hash)
  ) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const session = createSessionForUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const { password_hash: _passwordHash, ...safeUser } = user;
  return res.json({ user: safeUser, ...session });
});

router.post("/auth/refresh", (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const refreshRow = db
    .prepare(
      "SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token = ?"
    )
    .get(parsed.data.refreshToken);
  if (!refreshRow || refreshRow.revoked_at) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  if (new Date(refreshRow.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "Refresh token expired" });
  }

  db.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?"
  ).run(refreshRow.id);
  const session = createSessionForUser({
    id: refreshRow.user_id,
    email: refreshRow.email,
    role: refreshRow.role,
  });
  return res.json(session);
});

router.post("/auth/logout", (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  db.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token = ?"
  ).run(parsed.data.refreshToken);
  return res.json({ ok: true });
});

router.get("/users", requireAuth, (_req, res) => {
  const users = db
    .prepare(
      "SELECT id, full_name, email, role, city, created_at FROM users ORDER BY created_at DESC"
    )
    .all();
  res.json(users);
});

router.post("/boxes", requireAuth, (req, res) => {
  const parsed = createBoxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (parsed.data.hostUserId !== req.auth.sub) {
    return res
      .status(403)
      .json({ error: "hostUserId must match authenticated user" });
  }

  const host = db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(parsed.data.hostUserId);
  if (!host) return res.status(404).json({ error: "Host user not found" });
  if (!["host", "both"].includes(host.role)) {
    return res.status(400).json({ error: "User role must be host or both" });
  }

  const input = parsed.data;
  const stmt = db.prepare(`
    INSERT INTO boxes (host_user_id, title, description, latitude, longitude, city, price_cents, capacity_liters, has_water)
    VALUES (@hostUserId, @title, @description, @latitude, @longitude, @city, @priceCents, @capacityLiters, @hasWater)
  `);
  const result = stmt.run({
    ...input,
    description: input.description ?? null,
    capacityLiters: input.capacityLiters ?? 20,
    hasWater: input.hasWater ? 1 : 0,
  });
  const created = db
    .prepare("SELECT * FROM boxes WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(created);
});

router.post("/host/boxes", requireAuth, (req, res) => {
  const parsed = createHostBoxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const host = db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(req.auth.sub);
  if (!host) return res.status(404).json({ error: "Host user not found" });
  if (!["host", "both"].includes(host.role)) {
    return res.status(400).json({ error: "User role must be host or both" });
  }

  const input = parsed.data;
  const stmt = db.prepare(`
    INSERT INTO boxes (host_user_id, title, description, latitude, longitude, city, price_cents, capacity_liters, has_water)
    VALUES (@hostUserId, @title, @description, @latitude, @longitude, @city, @priceCents, @capacityLiters, @hasWater)
  `);
  const result = stmt.run({
    ...input,
    hostUserId: req.auth.sub,
    description: input.description ?? null,
    capacityLiters: input.capacityLiters ?? 20,
    hasWater: input.hasWater ? 1 : 0,
  });
  const created = db
    .prepare("SELECT * FROM boxes WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(created);
});

router.get("/host/boxes", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM boxes WHERE host_user_id = ? ORDER BY created_at DESC"
    )
    .all(req.auth.sub);
  res.json(rows);
});

router.get("/boxes", (req, res) => {
  const city = req.query.city;
  const rows = city
    ? db
        .prepare(
          "SELECT * FROM boxes WHERE city = ? AND is_active = 1 ORDER BY created_at DESC"
        )
        .all(city)
    : db
        .prepare(
          "SELECT * FROM boxes WHERE is_active = 1 ORDER BY created_at DESC"
        )
        .all();
  res.json(rows);
});

router.post("/trails", requireAuth, (req, res) => {
  const parsed = createTrailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const creator = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(req.auth.sub);
  if (!creator)
    return res.status(404).json({ error: "Creator user not found" });

  const input = parsed.data;
  const stmt = db.prepare(`
    INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes)
    VALUES (@creatorUserId, @name, @territory, @distanceKm, @elevationM, @difficulty, @gpxUrl, @notes)
  `);
  const result = stmt.run({
    ...input,
    creatorUserId: req.auth.sub,
    elevationM: input.elevationM ?? 0,
    gpxUrl: input.gpxUrl ?? null,
    notes: input.notes ?? null,
  });
  const created = db
    .prepare("SELECT * FROM trails WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(created);
});

router.get("/trails", (req, res) => {
  const difficulty = req.query.difficulty;
  const rows = difficulty
    ? db
        .prepare(
          "SELECT * FROM trails WHERE difficulty = ? ORDER BY created_at DESC"
        )
        .all(difficulty)
    : db.prepare("SELECT * FROM trails ORDER BY created_at DESC").all();
  res.json(rows);
});

router.post(
  "/trails/upload-gpx",
  requireAuth,
  upload.single("gpx"),
  (req, res) => {
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
      const insert = db.prepare(`
        INSERT INTO trails (creator_user_id, name, territory, distance_km, elevation_m, difficulty, gpx_url, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(
        req.auth.sub,
        trailName,
        territory,
        stats.distanceKm > 0 ? stats.distanceKm : 0.1,
        stats.elevationM,
        difficulty,
        gpxUrl,
        notes
      );
      const created = db
        .prepare("SELECT * FROM trails WHERE id = ?")
        .get(result.lastInsertRowid);
      return res.status(201).json({
        fileName: req.file.filename,
        gpxUrl,
        ...stats,
        trail: created,
      });
    } catch (error) {
      return res
        .status(400)
        .json({ error: "Invalid GPX content", details: `${error}` });
    }
  }
);

router.post("/bookings", requireAuth, (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const input = parsed.data;
  const athleteUserId = req.auth.sub;
  const box = db
    .prepare("SELECT id, price_cents FROM boxes WHERE id = ? AND is_active = 1")
    .get(input.boxId);
  if (!box) return res.status(404).json({ error: "Box not found" });

  const athlete = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(athleteUserId);
  if (!athlete)
    return res.status(404).json({ error: "Athlete user not found" });

  const amountCents = box.price_cents;
  const { platformFeeCents, hostEarningsCents } =
    computeCommission(amountCents);
  const accessCode = generateAccessCode();

  const stmt = db.prepare(`
    INSERT INTO bookings (
      box_id, athlete_user_id, booking_date, start_time, end_time,
      amount_cents, platform_fee_cents, host_earnings_cents, access_code
    )
    VALUES (
      @boxId, @athleteUserId, @bookingDate, @startTime, @endTime,
      @amountCents, @platformFeeCents, @hostEarningsCents, @accessCode
    )
  `);

  const result = stmt.run({
    ...input,
    athleteUserId,
    amountCents,
    platformFeeCents,
    hostEarningsCents,
    accessCode,
  });
  const created = db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(result.lastInsertRowid);
  return res.status(201).json(created);
});

router.get("/bookings", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM bookings WHERE athlete_user_id = ? ORDER BY created_at DESC"
    )
    .all(req.auth.sub);
  res.json(rows);
});

module.exports = router;
