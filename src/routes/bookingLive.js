const { z } = require("zod");

/**
 * Suivi GPS live athlète → hôte (attaché au router Express bookings).
 * Dépend de helpers injectés pour éviter un couplage circulaire.
 */
function attachBookingLiveRoutes(router, deps) {
  const {
    pool,
    requireAuth,
    createNotification,
    logBookingEvent,
  } = deps;

  function haversineKm(lat1, lon1, lat2, lon2) {
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

  function estimateEtaMinutes(distKm) {
    if (!Number.isFinite(distKm) || distKm < 0) return null;
    if (distKm < 0.05) return 1;
    return Math.max(1, Math.round((distKm / 10) * 60));
  }

  function mapLive(booking) {
    const boxLat = Number(booking.box_latitude);
    const boxLon = Number(booking.box_longitude);
    const liveLat = Number(booking.live_lat);
    const liveLon = Number(booking.live_lon);
    const sharing = Number(booking.live_sharing) === 1;
    let distanceKm = null;
    let etaMinutes = null;
    if (
      sharing &&
      Number.isFinite(liveLat) &&
      Number.isFinite(liveLon) &&
      Number.isFinite(boxLat) &&
      Number.isFinite(boxLon)
    ) {
      distanceKm = Number(
        haversineKm(liveLat, liveLon, boxLat, boxLon).toFixed(2)
      );
      etaMinutes = estimateEtaMinutes(distanceKm);
    }
    return {
      bookingId: Number(booking.id),
      sharing,
      liveLat: sharing && Number.isFinite(liveLat) ? liveLat : null,
      liveLon: sharing && Number.isFinite(liveLon) ? liveLon : null,
      accuracyM:
        sharing && booking.live_accuracy_m != null
          ? Number(booking.live_accuracy_m)
          : null,
      liveUpdatedAt: sharing ? booking.live_updated_at || null : null,
      boxLat: Number.isFinite(boxLat) ? boxLat : null,
      boxLon: Number.isFinite(boxLon) ? boxLon : null,
      boxTitle: booking.box_title || null,
      distanceKm,
      etaMinutes:
        etaMinutes != null
          ? etaMinutes
          : booking.en_route_eta_min != null
          ? Number(booking.en_route_eta_min)
          : null,
      enRouteAt: booking.en_route_at || null,
    };
  }

  const liveBodySchema = z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(5000).optional().nullable(),
    sharing: z.boolean().optional(),
  });

  router.post("/bookings/:id/live-location", requireAuth, async (req, res) => {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const parsed = liveBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const athleteUserId = Number(req.auth.sub);
    const { lat, lon, accuracyM, sharing } = parsed.data;
    const shareOn = sharing !== false;

    const { rows } = await pool.query(
      `SELECT b.*, bx.host_user_id, bx.title AS box_title, bx.city AS box_city,
              bx.latitude AS box_latitude, bx.longitude AS box_longitude
       FROM bookings b
       JOIN boxes bx ON bx.id = b.box_id
       WHERE b.id = $1 AND b.athlete_user_id = $2`,
      [bookingId, athleteUserId]
    );
    const booking = rows[0];
    if (!booking) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    if (String(booking.status || "") === "cancelled") {
      return res.status(400).json({ error: "Réservation annulée." });
    }

    const boxLat = Number(booking.box_latitude);
    const boxLon = Number(booking.box_longitude);
    let distKm = null;
    let etaMin = null;
    if (Number.isFinite(boxLat) && Number.isFinite(boxLon)) {
      distKm = haversineKm(lat, lon, boxLat, boxLon);
      etaMin = estimateEtaMinutes(distKm);
    }

    const wasSharing = Number(booking.live_sharing) === 1;
    const { rows: updatedRows } = await pool.query(
      `UPDATE bookings
       SET live_lat = $2,
           live_lon = $3,
           live_accuracy_m = $4,
           live_updated_at = NOW(),
           live_sharing = $5,
           en_route_at = COALESCE(en_route_at, NOW()),
           en_route_eta_min = COALESCE($6, en_route_eta_min)
       WHERE id = $1
       RETURNING *`,
      [
        bookingId,
        lat,
        lon,
        accuracyM != null ? Number(accuracyM) : null,
        shareOn ? 1 : 0,
        etaMin,
      ]
    );

    if (shareOn && !wasSharing) {
      await createNotification({
        recipientUserId: booking.host_user_id,
        type: "athlete_live_tracking",
        title: "Suivi live activé",
        body: `L’athlète partage sa position vers « ${
          booking.box_title || "ta box"
        } »${etaMin != null ? ` (~${etaMin} min)` : ""}.`,
        data: { bookingId, etaMinutes: etaMin, distanceKm: distKm },
      });
      await logBookingEvent({
        bookingId,
        actorUserId: athleteUserId,
        eventType: "live_tracking_started",
        message: "Athlete started live location sharing",
        data: { lat, lon, etaMinutes: etaMin, distanceKm: distKm },
      });
    }

    return res.json(mapLive({ ...booking, ...updatedRows[0] }));
  });

  router.post(
    "/bookings/:id/live-location/stop",
    requireAuth,
    async (req, res) => {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "Invalid booking id" });
      }
      const athleteUserId = Number(req.auth.sub);
      const { rows } = await pool.query(
        `UPDATE bookings b
         SET live_sharing = 0,
             live_updated_at = NOW()
         FROM boxes bx
         WHERE b.id = $1
           AND b.athlete_user_id = $2
           AND bx.id = b.box_id
         RETURNING b.*, bx.host_user_id, bx.title AS box_title,
                   bx.latitude AS box_latitude, bx.longitude AS box_longitude`,
        [bookingId, athleteUserId]
      );
      if (!rows[0]) {
        return res.status(404).json({ error: "Réservation introuvable." });
      }
      await logBookingEvent({
        bookingId,
        actorUserId: athleteUserId,
        eventType: "live_tracking_stopped",
        message: "Athlete stopped live location sharing",
      });
      return res.json(mapLive(rows[0]));
    }
  );

  router.get("/bookings/:id/live-location", requireAuth, async (req, res) => {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "Invalid booking id" });
    }
    const { rows } = await pool.query(
      `SELECT b.*, bx.host_user_id, bx.title AS box_title, bx.city AS box_city,
              bx.latitude AS box_latitude, bx.longitude AS box_longitude
       FROM bookings b
       JOIN boxes bx ON bx.id = b.box_id
       WHERE b.id = $1
         AND (b.athlete_user_id = $2 OR bx.host_user_id = $2)`,
      [bookingId, Number(req.auth.sub)]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Réservation introuvable." });
    }
    return res.json(mapLive(rows[0]));
  });
}

module.exports = { attachBookingLiveRoutes };
