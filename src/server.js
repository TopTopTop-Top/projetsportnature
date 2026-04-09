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
    version: "0.3.0",
    endpoints: [
      "/api/health",
      "/api/geocode/reverse",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/users",
      "/api/users/me/role",
      "/api/boxes",
      "/api/boxes/bounds",
      "/api/boxes/nearby",
      "/api/host/boxes",
      "/api/trails",
      "/api/trails/:id",
      "/api/trails/upload-gpx",
      "/api/bookings",
      "/api/bookings/:id",
      "/api/host/bookings",
      "/api/host/bookings/:id",
      "/api/host/bookings/:id/decision",
      "/api/host/boxes/:id",
    ],
  });
});

app.use("/api", apiRouter);

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
