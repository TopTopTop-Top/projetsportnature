#!/usr/bin/env node
/**
 * Reset admin d’un mot de passe utilisateur (hash bcrypt).
 *
 * Usage:
 *   node scripts/reset-user-password.js --list
 *   node scripts/reset-user-password.js --email toi@example.com --password NouveauMdp123
 *
 * Charge DATABASE_URL depuis .env à la racine.
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] == null) process.env[m[1]] = v;
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  return process.argv[i + 1] || null;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquant (.env).");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    if (process.argv.includes("--list")) {
      const { rows } = await pool.query(
        `SELECT id, email, full_name, role,
                (password_hash IS NOT NULL AND TRIM(password_hash) <> '') AS has_password,
                (account_recovery_code_hash IS NOT NULL AND TRIM(account_recovery_code_hash) <> '') AS has_recovery
         FROM users
         ORDER BY id`
      );
      if (!rows.length) {
        console.log("Aucun utilisateur.");
        return;
      }
      console.log("id | email | nom | rôle | mdp | code secours");
      for (const u of rows) {
        console.log(
          `${u.id} | ${u.email} | ${u.full_name || "—"} | ${u.role} | ${
            u.has_password ? "oui" : "non"
          } | ${u.has_recovery ? "oui" : "non"}`
        );
      }
      return;
    }

    const email = String(arg("email") || "")
      .trim()
      .toLowerCase();
    const password = arg("password");
    if (!email || !password) {
      console.error(
        "Usage: node scripts/reset-user-password.js --email X --password Y\n       node scripts/reset-user-password.js --list"
      );
      process.exit(1);
    }
    if (password.length < 6) {
      console.error("Mot de passe : 6 caractères min.");
      process.exit(1);
    }

    const { rows } = await pool.query(
      `SELECT id, email FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY id DESC LIMIT 1`,
      [email]
    );
    if (!rows[0]) {
      console.error("Aucun compte pour cet email.");
      process.exit(1);
    }
    const hash = bcrypt.hashSync(password, 10);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      hash,
      rows[0].id,
    ]);
    console.log(`OK — mot de passe mis à jour pour ${rows[0].email} (id ${rows[0].id}).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
