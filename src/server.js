const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const apiRouter = require("./routes/api");
const { migrate } = require("./db/database");
const { isRemoteStorageEnabled } = require("./lib/objectStorage");

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
    version: "0.5.0-beta",
    mode: {
      stripe: process.env.STRIPE_SECRET_KEY ? "live-or-test-key" : "simulated",
      gpxStorage: isRemoteStorageEnabled() ? "s3-or-r2" : "local-uploads",
      smtp: !!(process.env.SMTP_URL || process.env.SMTP_HOST),
    },
    endpoints: [
      "/api/health",
      "/api/auth/* (register, login, refresh, logout, password-reset)",
      "/api/users/me/* (role, capabilities, password, push-token)",
      "/api/boxes*, /api/host/boxes*",
      "/api/trails*, /api/route-plans*",
      "/api/bookings*, /api/host/bookings*, /api/host/refunds*",
      "/api/ravito-requests*",
      "/api/notifications*",
      "/api/reviews*",
      "/api/webhooks/stripe",
      "/api/geocode/*",
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
    if (
      (process.env.RENDER || process.env.NODE_ENV === "production") &&
      !isRemoteStorageEnabled()
    ) {
      console.warn(
        "[ravitobox] GPX storage is local (uploads/). Files are lost on Render redeploy. Set AWS_* or R2_* for durable storage."
      );
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      console.info(
        "[ravitobox] Stripe disabled — payments run in simulated beta mode."
      );
    }
    app.listen(PORT, () => {
      console.log(`RavitoBox API running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("Server failed to start", e);
    process.exit(1);
  }
})();
