const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const apiRouter = require("./routes/api");
const { migrate } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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
app.use("/api/*", (req, res) => {
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
