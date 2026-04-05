const { Pool } = require("pg");

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL manquant. Exemple : postgresql://ravitobox:ravitobox@localhost:5432/ravitobox"
    );
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });
  pool.on("error", (err) => {
    console.error("PostgreSQL pool error", err);
  });
  return pool;
}

const pool = createPool();

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL CHECK (role IN ('athlete', 'host', 'both')),
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS boxes (
        id SERIAL PRIMARY KEY,
        host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        city TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        capacity_liters INTEGER NOT NULL DEFAULT 20,
        has_water SMALLINT NOT NULL DEFAULT 0,
        is_active SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS trails (
        id SERIAL PRIMARY KEY,
        creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        territory TEXT NOT NULL,
        distance_km DOUBLE PRECISION NOT NULL CHECK (distance_km > 0),
        elevation_m INTEGER NOT NULL DEFAULT 0,
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
        gpx_url TEXT,
        notes TEXT,
        polyline_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        box_id INTEGER NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
        athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        platform_fee_cents INTEGER NOT NULL,
        host_earnings_cents INTEGER NOT NULL,
        access_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
        special_request TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`
    );
    await client.query(
      `ALTER TABLE trails ADD COLUMN IF NOT EXISTS polyline_json TEXT`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_request TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS availability_note TEXT`
    );

    await client.query("COMMIT");
    console.log("Migration PostgreSQL OK");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Migration PostgreSQL failed", e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, migrate };
