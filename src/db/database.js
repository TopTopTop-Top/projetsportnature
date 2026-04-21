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
        criteria_json TEXT,
        criteria_note TEXT,
        access_method TEXT,
        access_instructions TEXT,
        access_display_before_min INTEGER,
        access_display_after_min INTEGER,
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
        payment_status TEXT NOT NULL DEFAULT 'simulated_unpaid',
        refund_status TEXT NOT NULL DEFAULT 'none',
        refund_amount_cents INTEGER,
        refunded_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
        approval_status TEXT NOT NULL DEFAULT 'pending',
        special_request TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refunds (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        host_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        amount_cents INTEGER NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS access_incidents (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
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

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        data_json TEXT,
        is_read SMALLINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS booking_events (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        message TEXT,
        data_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
        comment TEXT,
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
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS availability_note TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS criteria_json TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS criteria_note TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS access_code TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS access_method TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS access_instructions TEXT`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS access_display_before_min INTEGER`
    );
    await client.query(
      `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS access_display_after_min INTEGER`
    );
    await client.query(
      `UPDATE boxes
       SET access_method = COALESCE(access_method, 'padlock_code'),
           access_display_before_min = COALESCE(access_display_before_min, 15),
           access_display_after_min = COALESCE(access_display_after_min, 15)
       WHERE access_method IS NULL
          OR access_display_before_min IS NULL
          OR access_display_after_min IS NULL`
    );
    await client.query(
      `UPDATE boxes
       SET access_code = LPAD(FLOOR(100000 + RANDOM() * 900000)::text, 6, '0')
       WHERE access_code IS NULL OR TRIM(access_code) = ''`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_request_json TEXT`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS change_requested_at TIMESTAMPTZ`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'simulated_unpaid'`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none'`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER`
    );
    await client.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS refunds (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
        athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        host_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        amount_cents INTEGER NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS access_incidents (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
        box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
        reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_user_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_booking_events_booking_created ON booking_events(booking_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_created ON reviews(reviewee_user_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_bookings_box_date_time ON bookings(box_id, booking_date, start_time, end_time)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_refunds_status_created ON refunds(status, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_access_logs_box_created ON access_logs(box_id, created_at DESC)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_access_incidents_box_created ON access_incidents(box_id, created_at DESC)`
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
