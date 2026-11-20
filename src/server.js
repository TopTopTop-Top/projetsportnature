const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const apiRouter = require("./routes/api");
const { migrate } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 3000;

// Derrière le proxy Render : nécessaire pour que req.ip (rate limit auth) soit l'IP client.
if (process.env.RENDER || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(cors());
// Le webhook Stripe a besoin du corps brut (vérification de signature) :
// on saute express.json() pour cette route ; le raw parser est monté dans routes/api.js.
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.originalUrl.split("?")[0] === "/api/webhooks/stripe") return next();
  return jsonParser(req, res, next);
});
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/", (_req, res) => {
  res.json({
    name: "RavitoBox API",
    version: "0.4.0",
    endpoints: [
      "/api/health",
      "/api/geocode/reverse",
      "/api/geocode/search",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/password-reset/request",
      "/api/auth/password-reset/confirm",
      "/api/webhooks/stripe (POST, raw body)",
      "/api/users",
      "/api/users/me/role",
      "/api/notifications",
      "/api/notifications/:id/read",
      "/api/notifications/read-all",
      "/api/boxes",
      "/api/boxes/bounds",
      "/api/boxes/nearby",
      "/api/host/boxes",
      "/api/host/trails/:id (PUT, PATCH)",
      "/api/host/trails/update (POST)",
      "/api/trails",
      "/api/update-trail (POST)",
      "/api/trails/:id (PUT, PATCH, DELETE)",
      "/api/trails/:id/update (POST)",
      "/api/trails/upload-gpx",
      "/api/bookings",
      "/api/bookings/:id",
      "/api/bookings/:id/events",
      "/api/host/bookings",
      "/api/host/bookings/:id (PATCH, DELETE)",
      "/api/host/bookings/:id",
      "/api/host/bookings/:id/decision",
      "/api/host/boxes/:id/deletion-impact",
      "/api/host/boxes/:id (DELETE, PATCH)",
      "/api/host/boxes/:id/restore",
      "/api/bookings/:id (PATCH, DELETE)",
      "/api/bookings/:id/decision",
      "/api/reviews",
      "/api/users/:id/reviews",
    ],
  });
});

app.use("/api", apiRouter);
app.use(/^\/api\/.*/, (req, res) => {
  res.status(404).json({
    error: `Unknown API route: ${req.method} ${req.originalUrl}`,
  });
});

(async function start() {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log(`RavitoBox API running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("Server failed to start", e);
    process.exit(1);
  }
})();
