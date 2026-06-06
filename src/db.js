const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const q = (text, params) => pool.query(text, params);

async function init() {
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','superuser','staff','driver')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0
  )`);

  await q(`CREATE TABLE IF NOT EXISTS stops (
    id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    pickup_time TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    sort_order INT NOT NULL DEFAULT 0
  )`);

  await q(`CREATE TABLE IF NOT EXISTS declarations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('work','off')),
    route_id INT REFERENCES routes(id) ON DELETE SET NULL,
    stop_id INT REFERENCES stops(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, work_date)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS driver_routes (
    driver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    PRIMARY KEY (driver_id, route_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  await q(`CREATE TABLE IF NOT EXISTS assets (
    name TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  // --- Additive migrations (idempotent) ---
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS phone TEXT`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS first_name TEXT`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS last_name TEXT`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS notify_time TEXT`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS hotel TEXT`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS supervisor_id INT REFERENCES users(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE users  DROP CONSTRAINT IF EXISTS users_role_check`);
  await q(`ALTER TABLE users  ADD CONSTRAINT users_role_check CHECK (role IN ('admin','superuser','staff','driver'))`);
  await q(`ALTER TABLE users  ADD COLUMN IF NOT EXISTS favorite_route_id INT REFERENCES routes(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 9`);

  await q(`CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    answer TEXT,
    answered_at TIMESTAMPTZ
  )`);

  await q(`CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_date DATE,
    route_id INT REFERENCES routes(id) ON DELETE SET NULL,
    driver_id INT REFERENCES users(id) ON DELETE SET NULL,
    r_route INT CHECK (r_route BETWEEN 1 AND 5),
    r_driver INT CHECK (r_driver BETWEEN 1 AND 5),
    r_vehicle INT CHECK (r_vehicle BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await seed();
}

async function seed() {
  const { rows } = await q('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    const name = process.env.ADMIN_NAME || 'Administrator';
    const email = process.env.ADMIN_EMAIL || null;
    const username = process.env.ADMIN_USERNAME || 'admin';
    const pass = process.env.ADMIN_PASSWORD || 'admin';
    const hash = await bcrypt.hash(pass, 10);
    await q(`INSERT INTO users (name,email,username,password_hash,role) VALUES ($1,$2,$3,$4,'admin')`,
      [name, email, username, hash]);
    console.log(`[seed] created admin user "${username}"`);
  }

  const r = await q('SELECT COUNT(*)::int AS n FROM routes');
  if (r.rows[0].n === 0) {
    const ins = await q(
      `INSERT INTO routes (name, sort_order) VALUES ($1,1) RETURNING id`,
      ['Ηράκλειο – Χερσόνησος (Πρωί)']
    );
    const rid = ins.rows[0].id;
    const morning = [
      ['Γιοφυρο', '05:55'], ['Ταλος', '06:00'], ['Μητερα', '06:05'],
      ['Λουνα παρκ', '06:10'], ['Καζατζιδη', '06:10'], ['Μοστακα', '06:15'],
      ['Καρτετος', '06:20'], ['Κοκκίνη Χάνι', '06:30'], ['Δινοσαυρια', '06:35'],
    ];
    for (let i = 0; i < morning.length; i++) {
      await q(`INSERT INTO stops (route_id,name,pickup_time,sort_order) VALUES ($1,$2,$3,$4)`,
        [rid, morning[i][0], morning[i][1], i + 1]);
    }
    console.log('[seed] created morning Heraklion route + stops');
  }
}

module.exports = { pool, q, init };
