#!/usr/bin/env node
/**
 * Smoke checks purs (pas de serveur HTTP) — CI rapide.
 * Couvre exports critiques + auth hard-fail + helpers Stripe simulé.
 */
const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function ok(name) {
  console.log(`ok — ${name}`);
}

const root = path.join(__dirname, "..");

const stripe = require("../src/lib/stripePayments");
assert.strictEqual(typeof stripe.isStripeEnabled, "function");
assert.strictEqual(stripe.isStripeEnabled(), false);
assert.strictEqual(typeof stripe.constructWebhookEvent, "function");
ok("stripePayments (simulated, no key)");

const mailer = require("../src/lib/mailer");
assert.strictEqual(typeof mailer.sendMail, "function");
ok("mailer.sendMail export");

const storage = require("../src/lib/objectStorage");
assert.strictEqual(typeof storage.saveGpx, "function");
assert.strictEqual(typeof storage.isRemoteStorageEnabled, "function");
assert.strictEqual(storage.isRemoteStorageEnabled(), false);
ok("objectStorage local fallback");

const push = require("../src/lib/pushNotify");
assert.strictEqual(typeof push.sendExpoPush, "function");
ok("pushNotify.sendExpoPush export");

const authCheck = spawnSync(
  process.execPath,
  [
    "-e",
    `process.env.RENDER='1'; delete process.env.JWT_SECRET; require(${JSON.stringify(
      path.join(__dirname, "../src/auth.js")
    )});`,
  ],
  { encoding: "utf8" }
);
assert.notStrictEqual(authCheck.status, 0, "auth child must exit non-zero");
assert.match(
  String(authCheck.stderr || authCheck.stdout || ""),
  /JWT_SECRET/,
  "auth error must mention JWT_SECRET"
);
ok("auth.js hard-fails without JWT_SECRET on Render");

const syntaxTargets = [
  "src/server.js",
  "src/routes/api.js",
  "src/auth.js",
  "src/db/database.js",
  "src/lib/stripePayments.js",
  "src/lib/mailer.js",
  "src/lib/objectStorage.js",
  "src/lib/pushNotify.js",
];
for (const rel of syntaxTargets) {
  const full = path.join(root, rel);
  assert.ok(fs.existsSync(full), `missing ${rel}`);
  const check = spawnSync(process.execPath, ["--check", full], {
    encoding: "utf8",
  });
  assert.strictEqual(
    check.status,
    0,
    `syntax fail ${rel}: ${check.stderr || check.stdout}`
  );
}
ok(`node --check (${syntaxTargets.length} files)`);

const mobileApi = path.join(root, "mobile/api.js");
assert.ok(fs.existsSync(mobileApi), "mobile/api.js must exist");
const apiSrc = fs.readFileSync(mobileApi, "utf8");
assert.match(apiSrc, /export async function apiFetch/);
assert.match(apiSrc, /onSessionExpired/);
assert.match(apiSrc, /isAuthSessionError/);
ok("mobile/api.js exports session helpers");

const appSrc = fs.readFileSync(path.join(root, "mobile/App.js"), "utf8");
assert.match(appSrc, /from ["']\.\/api["']/);
assert.match(appSrc, /from ["']\.\/AuthScreen["']/);
assert.match(appSrc, /apiOffline/);
assert.doesNotMatch(
  appSrc,
  /Causes fréquentes : \(1\) EXPO_PUBLIC_API_URL/,
  "App.js must not show raw Render debug HTML errors to users"
);
ok("App.js uses mobile/api + AuthScreen + offline banner");

assert.ok(fs.existsSync(path.join(root, "mobile/AuthScreen.js")));
assert.ok(fs.existsSync(path.join(root, "mobile/authUiContext.js")));
ok("AuthScreen extracted");

console.log("\nSmoke API OK");
process.exit(0);
