#!/usr/bin/env node
/**
 * Vérifie que la prod bêta répond (API + mode simulé attendu).
 * Usage: node scripts/verify-beta.js
 *        API_BASE=https://… node scripts/verify-beta.js
 */
const assert = require("assert");

const API_BASE = (
  process.env.API_BASE ||
  "https://projetsportnature.onrender.com"
).replace(/\/$/, "");

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "User-Agent": "ravitobox-verify-beta" },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

(async () => {
  console.log(`Vérif bêta → ${API_BASE}`);
  const health = await getJson("/api/health");
  assert.strictEqual(health.status, 200, `health HTTP ${health.status}`);
  assert.strictEqual(health.data?.ok, true, "health.ok");
  console.log("ok — /api/health");

  const root = await getJson("/");
  assert.strictEqual(root.status, 200, `root HTTP ${root.status}`);
  assert.match(String(root.data?.version || ""), /0\.5/);
  assert.strictEqual(root.data?.mode?.stripe, "simulated");
  console.log(`ok — API ${root.data.version} (stripe simulated, smtp=${root.data.mode?.smtp})`);

  console.log("\nBeta prod OK");
  process.exit(0);
})().catch((e) => {
  console.error("verify-beta FAILED:", e.message || e);
  process.exit(1);
});
