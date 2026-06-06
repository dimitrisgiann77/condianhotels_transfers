const { q } = require('./db');

async function getRoutes(activeOnly = false) {
  const where = activeOnly ? 'WHERE active = TRUE' : '';
  const { rows } = await q(`SELECT * FROM routes ${where} ORDER BY sort_order, id`);
  return rows;
}
async function getStops(routeId) {
  const { rows } = await q(
    `SELECT * FROM stops WHERE route_id = $1 ORDER BY sort_order, id`, [routeId]);
  return rows;
}
async function getAllStops() {
  const { rows } = await q(`SELECT * FROM stops ORDER BY route_id, sort_order, id`);
  return rows;
}
async function getRoutesWithStops(activeOnly = false) {
  const routes = await getRoutes(activeOnly);
  const stops = await getAllStops();
  return routes.map(r => ({ ...r, stops: stops.filter(s => s.route_id === r.id) }));
}
async function getDriverRouteIds(driverId) {
  const { rows } = await q(`SELECT route_id FROM driver_routes WHERE driver_id = $1`, [driverId]);
  return rows.map(r => Number(r.route_id));
}

// Confirmed "work" pickups for a date, optionally limited to certain routes.
async function getPickups(workDate, routeIds = null) {
  const params = [workDate];
  let filter = '';
  if (routeIds && routeIds.length) {
    params.push(routeIds);
    filter = 'AND d.route_id = ANY($2::int[])';
  }
  const { rows } = await q(`
    SELECT u.name AS person, u.email AS person_email, u.phone AS person_phone, u.hotel AS person_hotel,
           r.name AS route, r.id AS route_id,
           s.name AS stop, s.pickup_time, s.lat, s.lng, s.id AS stop_id
    FROM declarations d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN routes r ON r.id = d.route_id
    LEFT JOIN stops  s ON s.id = d.stop_id
    WHERE d.work_date = $1 AND d.status = 'work' ${filter}
    ORDER BY r.sort_order, s.sort_order, s.pickup_time, u.name`, params);
  return rows;
}

// Active staff who have NOT submitted any declaration for a date.
async function getPendingStaff(workDate) {
  const { rows } = await q(`
    SELECT u.id, u.name, u.email, u.phone, u.hotel
    FROM users u
    LEFT JOIN declarations d ON d.user_id = u.id AND d.work_date = $1
    WHERE u.role = 'staff' AND u.active = TRUE AND d.id IS NULL
    ORDER BY u.hotel NULLS FIRST, u.name`, [workDate]);
  return rows;
}
async function getCounts(workDate) {
  const work = await q(`SELECT COUNT(*)::int n FROM declarations WHERE work_date=$1 AND status='work'`, [workDate]);
  const off = await q(`SELECT COUNT(*)::int n FROM declarations WHERE work_date=$1 AND status='off'`, [workDate]);
  const pend = await getPendingStaff(workDate);
  return { work: work.rows[0].n, off: off.rows[0].n, pending: pend.length };
}
async function getMyDeclaration(userId, workDate) {
  const { rows } = await q(`SELECT * FROM declarations WHERE user_id=$1 AND work_date=$2`, [userId, workDate]);
  return rows[0] || null;
}
async function getMyDeclarations(userId) {
  const { rows } = await q(`
    SELECT to_char(d.work_date,'YYYY-MM-DD') AS work_date, d.status, r.name AS route, s.name AS stop, s.pickup_time
    FROM declarations d
    LEFT JOIN routes r ON r.id=d.route_id
    LEFT JOIN stops  s ON s.id=d.stop_id
    WHERE d.user_id=$1 AND d.work_date >= CURRENT_DATE
    ORDER BY d.work_date LIMIT 30`, [userId]);
  return rows;
}
async function getDrivers() {
  const { rows } = await q(`SELECT * FROM users WHERE role='driver' AND active=TRUE ORDER BY name`);
  return rows;
}

// ---- Capacity ----
async function getRouteUsage(workDate) {
  const { rows } = await q(
    `SELECT route_id, COUNT(*)::int AS used FROM declarations
     WHERE work_date=$1 AND status='work' AND route_id IS NOT NULL
     GROUP BY route_id`, [workDate]);
  const m = {};
  rows.forEach(r => { m[r.route_id] = r.used; });
  return m;
}
async function countOnRoute(workDate, routeId, excludeUserId) {
  const { rows } = await q(
    `SELECT COUNT(*)::int AS n FROM declarations
     WHERE work_date=$1 AND route_id=$2 AND status='work' AND user_id<>$3`,
    [workDate, routeId, excludeUserId || -1]);
  return rows[0].n;
}

// ---- Settings (key/value) ----
async function getSetting(key) {
  const { rows } = await q('SELECT value FROM settings WHERE key=$1', [key]);
  return rows[0] ? rows[0].value : null;
}
async function setSetting(key, value) {
  await q(`INSERT INTO settings (key,value) VALUES ($1,$2)
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [key, value]);
}
async function getPendingUsers() {
  const { rows } = await q(`SELECT id,name,username,email,phone,role,created_at
    FROM users WHERE active=FALSE ORDER BY created_at`);
  return rows;
}

// ---- Profile ----
async function getUser(id) {
  const { rows } = await q('SELECT id,name,email,phone,username,role,favorite_route_id,notify_enabled,notify_time,hotel,supervisor_id FROM users WHERE id=$1', [id]);
  return rows[0] || null;
}
async function updateProfile(id, { email, phone, favorite_route_id, notify_enabled, notify_time }) {
  await q('UPDATE users SET email=$1, phone=$2, favorite_route_id=$3, notify_enabled=$4, notify_time=$5 WHERE id=$6',
    [email || null, phone || null, favorite_route_id || null,
     notify_enabled === undefined ? true : !!notify_enabled, notify_time || null, id]);
}
async function getStaffDue(hhmm) {
  const { rows } = await q(`SELECT id,name,email FROM users
    WHERE role='staff' AND active=TRUE AND notify_enabled=TRUE AND COALESCE(notify_time,'18:00')=$1`, [hhmm]);
  return rows;
}
async function getDriversDue(hhmm) {
  const { rows } = await q(`SELECT id,name,email FROM users
    WHERE role='driver' AND active=TRUE AND notify_enabled=TRUE AND COALESCE(notify_time,'23:00')=$1`, [hhmm]);
  return rows;
}

// ---- Stats ----
async function routeStats(days = 30) {
  const { rows } = await q(`
    SELECT r.id, r.name, r.capacity,
      COALESCE(SUM(CASE WHEN d.status='work' THEN 1 ELSE 0 END),0)::int AS work_total,
      COUNT(DISTINCT CASE WHEN d.status='work' THEN d.work_date END)::int AS active_days
    FROM routes r
    LEFT JOIN declarations d ON d.route_id=r.id AND d.work_date >= (CURRENT_DATE - ($1::int))
    GROUP BY r.id, r.name, r.capacity
    ORDER BY r.sort_order, r.id`, [days]);
  return rows;
}
async function staffStats(days = 30) {
  const { rows } = await q(`
    SELECT u.id, u.name,
      COALESCE(SUM(CASE WHEN d.status='work' THEN 1 ELSE 0 END),0)::int AS work_days,
      COALESCE(SUM(CASE WHEN d.status='off'  THEN 1 ELSE 0 END),0)::int AS off_days
    FROM users u
    LEFT JOIN declarations d ON d.user_id=u.id AND d.work_date >= (CURRENT_DATE - ($1::int))
    WHERE u.role='staff'
    GROUP BY u.id, u.name
    ORDER BY u.name`, [days]);
  return rows;
}
async function ratingAverages(days = 90) {
  const { rows } = await q(`
    SELECT ROUND(AVG(r_route)::numeric,2) AS route_avg,
           ROUND(AVG(r_driver)::numeric,2) AS driver_avg,
           ROUND(AVG(r_vehicle)::numeric,2) AS vehicle_avg,
           COUNT(*)::int AS n
    FROM ratings WHERE created_at::date >= (CURRENT_DATE - ($1::int))`, [days]);
  return rows[0];
}
async function ratingByDriver(days = 90) {
  const { rows } = await q(`
    SELECT u.name AS driver, ROUND(AVG(rt.r_driver)::numeric,2) AS avg, COUNT(*)::int AS n
    FROM ratings rt JOIN users u ON u.id=rt.driver_id
    WHERE rt.driver_id IS NOT NULL AND rt.created_at::date >= (CURRENT_DATE - ($1::int))
    GROUP BY u.name ORDER BY avg DESC`, [days]);
  return rows;
}
async function recentRatings(limit = 20) {
  const { rows } = await q(`
    SELECT rt.id, to_char(rt.work_date,'YYYY-MM-DD') AS work_date, rt.r_route, rt.r_driver, rt.r_vehicle, rt.comment, rt.created_at, u.name AS person, r.name AS route, dv.name AS driver_name
    FROM ratings rt
    JOIN users u ON u.id=rt.user_id
    LEFT JOIN routes r ON r.id=rt.route_id
    LEFT JOIN users dv ON dv.id=rt.driver_id
    ORDER BY rt.created_at DESC LIMIT $1`, [limit]);
  return rows;
}
async function listQuestions() {
  const { rows } = await q(`
    SELECT q.*, u.name AS person, u.email AS person_email
    FROM questions q JOIN users u ON u.id=q.user_id
    ORDER BY (q.answer IS NULL) DESC, q.created_at DESC`);
  return rows;
}

async function getSupervisors() {
  const { rows } = await q("SELECT id, name FROM users WHERE role IN ('admin','superuser') AND active=TRUE ORDER BY name");
  return rows;
}
async function getUsersAdmin() {
  const { rows } = await q(`
    SELECT u.id,u.name,u.email,u.phone,u.username,u.role,u.active,u.hotel,
           sup.name AS supervisor_name, u.supervisor_id
    FROM users u LEFT JOIN users sup ON sup.id=u.supervisor_id
    ORDER BY u.role, u.hotel NULLS FIRST, u.name`);
  return rows;
}
async function getHotels() {
  const v = await getSetting('hotels');
  if (!v) return [];
  return v.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
}

module.exports = {
  getRoutes, getStops, getAllStops, getRoutesWithStops, getDriverRouteIds,
  getPickups, getPendingStaff, getCounts, getMyDeclaration, getDrivers,
  getRouteUsage, countOnRoute, getUser, updateProfile, getMyDeclarations,
  getSetting, setSetting, getPendingUsers, getStaffDue, getDriversDue,
  getSupervisors, getUsersAdmin, getHotels,
  routeStats, staffStats, ratingAverages, ratingByDriver, recentRatings, listQuestions,
};
