#!/usr/bin/env node
/**
 * Smoke checks purs (pas de serveur) — CI rapide.
 */
const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

function ok(name) {
  console.log(`ok — ${name}`);
}

const stripe = require("../src/lib/stripePayments");
assert.strictEqual(typeof stripe.isStripeEnabled, "function");
assert.strictEqual(stripe.isStripeEnabled(), false);
ok("stripePayments.isStripeEnabled (no key)");

const mailer = require("../src/lib/mailer");
assert.strictEqual(typeof mailer.sendMail, "function");
ok("mailer.sendMail export");

const storage = require("../src/lib/objectStorage");
assert.strictEqual(typeof storage.saveGpx, "function");
ok("objectStorage.saveGpx export");

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

console.log("\nSmoke API OK");
process.exit(0);
