try { require('dotenv').config(); } catch (_) { /* dotenv optional; Railway injects env */ }
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');

const { pool, q, init } = require('./db');
const data = require('./data');
const mailer = require('./mailer');
const scheduler = require('./scheduler');
const pdf = require('./pdf');
const brand = require('./brand');
const { requireLogin, requireRole, homeForRole } = require('./auth');
const { tomorrowStr, prettyDate, todayStr } = require('./util');

const app = express();
const APP_TITLE = 'CONDIAN Hotels — Summer Transfers 2026';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 14, httpOnly: true, sameSite: 'lax' },
}));

app.use((req, res, next) => {
  res.locals.title = APP_TITLE;
  res.locals.user = req.session.user || null;
  res.locals.mapsKey = process.env.GOOGLE_MAPS_API_KEY || '';
  res.locals.theme = brand.getTheme();
  res.locals.prettyDate = prettyDate;
  next();
});

// ---------- Branding (public) ----------
app.get('/brand.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.setHeader('Cache-Control', 'no-store');
  res.send(brand.cssVars());
});
const FALLBACK = { 'logo': '/logo.png', 'logo-white': '/logo-white.png', 'favicon': '/logo-mark.png' };
app.get('/brand/:name', async (req, res) => {
  const name = req.params.name;
  try {
    const a = await brand.getAsset(name);
    if (a) {
      res.setHeader('Content-Type', a.mime);
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(Buffer.from(a.data, 'base64'));
    }
  } catch (e) { console.error('[brand] asset error', e.message); }
  return res.redirect(FALLBACK[name] || '/logo-mark.svg');
});
app.get('/favicon.ico', (req, res) => res.redirect('/brand/favicon'));

// ---------- Auth ----------
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect(homeForRole(req.session.user.role));
  res.redirect('/login');
});
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(homeForRole(req.session.user.role));
  res.render('login', { error: null, info: req.query.info || null });
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await q('SELECT * FROM users WHERE lower(username)=lower($1)', [username || '']);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
      return res.status(401).render('login', { error: 'Λάθος όνομα χρήστη ή κωδικός.', info: null });
    }
    if (!u.active) {
      return res.status(403).render('login', { error: 'Ο λογαριασμός σου αναμένει έγκριση από τη διοίκηση.', info: null });
    }
    req.session.user = { id: u.id, name: u.name, role: u.role, username: u.username };
    res.redirect(homeForRole(u.role));
  } catch (e) {
    console.error(e);
    res.status(500).render('login', { error: 'Σφάλμα σύνδεσης. Δοκιμάστε ξανά.', info: null });
  }
});
app.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });

// ---------- Self-registration (με κωδικό + έγκριση) ----------
app.get('/register', async (req, res) => {
  if (req.session.user) return res.redirect('/');
  const regCode = await data.getSetting('reg_code');
  const routes = await data.getRoutes(true);
  res.render('register', { enabled: !!(regCode && regCode.trim()), routes, error: req.query.error || null });
});
app.post('/register', async (req, res) => {
  const regCode = await data.getSetting('reg_code');
  if (!regCode || !regCode.trim()) return res.redirect('/register?error=' + encodeURIComponent('Η εγγραφή δεν είναι ενεργή.'));
  const b = req.body;
  if ((b.code || '').trim() !== regCode.trim()) return res.redirect('/register?error=' + encodeURIComponent('Λάθος κωδικός εγγραφής.'));
  const last = (b.last_name || '').trim(), first = (b.first_name || '').trim(), un = (b.username || '').trim(), pw = b.password || '';
  if (!last || !first || !un || !pw) return res.redirect('/register?error=' + encodeURIComponent('Συμπλήρωσε όλα τα υποχρεωτικά πεδία.'));
  try {
    const hash = await bcrypt.hash(pw, 10);
    await q(`INSERT INTO users (name,last_name,first_name,email,phone,username,password_hash,role,active,favorite_route_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'staff',FALSE,$8)`,
      [last + ' ' + first, last, first, (b.email || '').trim() || null, (b.phone || '').trim() || null, un, hash, b.favorite_route_id || null]);
    res.redirect('/login?info=' + encodeURIComponent('Η εγγραφή καταχωρήθηκε. Θα συνδεθείς μόλις την εγκρίνει η διοίκηση.'));
  } catch (e) {
    res.redirect('/register?error=' + encodeURIComponent('Το username χρησιμοποιείται ήδη ή υπήρξε σφάλμα.'));
  }
});

// ---------- Profile (όλοι) ----------
app.get('/profile', requireLogin, async (req, res) => {
  const me = await data.getUser(req.session.user.id);
  const routes = await data.getRoutes(true);
  const myRouteIds = me.role === 'driver' ? await data.getDriverRouteIds(me.id) : [];
  res.render('profile', { me, routes, myRouteIds, saved: req.query.saved === '1' });
});
app.post('/profile', requireLogin, async (req, res) => {
  await data.updateProfile(req.session.user.id, {
    email: req.body.email, phone: req.body.phone, favorite_route_id: req.body.favorite_route_id || null,
  });
  if (req.session.user.role === 'driver') {
    let ids = req.body.route_ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    await q('DELETE FROM driver_routes WHERE driver_id=$1', [req.session.user.id]);
    for (const rid of ids) await q('INSERT INTO driver_routes (driver_id,route_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.session.user.id, rid]);
  }
  res.redirect('/profile?saved=1');
});

// ---------- Feedback / αξιολογήσεις (προσωπικό) ----------
app.get('/feedback', requireRole('staff'), async (req, res) => {
  const routes = await data.getRoutes(true);
  const drivers = await data.getDrivers();
  const me = await data.getUser(req.session.user.id);
  res.render('feedback', { routes, drivers, favorite: me.favorite_route_id,
    today: todayStr(), saved: req.query.saved || null });
});
app.post('/feedback/question', requireRole('staff'), async (req, res) => {
  const msg = (req.body.message || '').trim();
  if (msg) await q('INSERT INTO questions (user_id, message) VALUES ($1,$2)', [req.session.user.id, msg]);
  res.redirect('/feedback?saved=q');
});
app.post('/feedback/rating', requireRole('staff'), async (req, res) => {
  const b = req.body; const num = v => (v ? parseInt(v, 10) : null);
  await q(`INSERT INTO ratings (user_id, work_date, route_id, driver_id, r_route, r_driver, r_vehicle, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.session.user.id, b.work_date || null, b.route_id || null, b.driver_id || null,
     num(b.r_route), num(b.r_driver), num(b.r_vehicle), (b.comment || '').trim() || null]);
  res.redirect('/feedback?saved=r');
});

// ---------- Staff ----------
app.get('/staff', requireRole('staff'), async (req, res) => {
  const workDate = req.query.date || tomorrowStr();
  const routes = await data.getRoutesWithStops(true);
  const mine = await data.getMyDeclaration(req.session.user.id, workDate);
  const usage = await data.getRouteUsage(workDate);
  const me = await data.getUser(req.session.user.id);
  const myDeclarations = await data.getMyDeclarations(req.session.user.id);
  res.render('staff', { routes, workDate, mine, usage, favorite: me.favorite_route_id,
    saved: req.query.saved === '1', error: req.query.error || null, minDate: todayStr(), myDeclarations });
});
app.post('/staff', requireRole('staff'), async (req, res) => {
  const { work_date, status } = req.body;
  let route_id = req.body.route_id || null;
  let stop_id = req.body.stop_id || null;
  if (status === 'off') { route_id = null; stop_id = null; }
  if (status === 'work' && route_id) {
    const routes = await data.getRoutes(false);
    const route = routes.find(r => String(r.id) === String(route_id));
    const cap = route ? route.capacity : 9;
    const used = await data.countOnRoute(work_date, route_id, req.session.user.id);
    if (used >= cap) {
      return res.redirect('/staff?date=' + encodeURIComponent(work_date) + '&error=full');
    }
  }
  try {
    await q(`INSERT INTO declarations (user_id, work_date, status, route_id, stop_id, updated_at)
             VALUES ($1,$2,$3,$4,$5, now())
             ON CONFLICT (user_id, work_date)
             DO UPDATE SET status=EXCLUDED.status, route_id=EXCLUDED.route_id,
                           stop_id=EXCLUDED.stop_id, updated_at=now()`,
      [req.session.user.id, work_date, status, route_id, stop_id]);
    res.redirect('/staff?date=' + encodeURIComponent(work_date) + '&saved=1');
  } catch (e) {
    console.error(e);
    res.status(500).render('error', { title: 'Σφάλμα', message: 'Η δήλωση δεν αποθηκεύτηκε.' });
  }
});

// ---------- Driver ----------
async function driverRouteIds(user) {
  if (user.role === 'admin') return null; // all routes
  const ids = await data.getDriverRouteIds(user.id);
  return ids.length ? ids : null;
}
app.get('/driver', requireRole('driver', 'admin'), async (req, res) => {
  const workDate = req.query.date || tomorrowStr();
  const routeIds = await driverRouteIds(req.session.user);
  const pickups = await data.getPickups(workDate, routeIds);
  const pending = await data.getPendingStaff(workDate);
  const counts = await data.getCounts(workDate);
  res.render('driver', { workDate, pickups, pending, counts, minDate: todayStr() });
});
app.get('/api/driver/data', requireRole('driver', 'admin'), async (req, res) => {
  const workDate = req.query.date || tomorrowStr();
  const routeIds = await driverRouteIds(req.session.user);
  const pickups = await data.getPickups(workDate, routeIds);
  res.json({ workDate, pickups });
});

async function fetchSchedule(user, date) {
  const workDate = date || tomorrowStr();
  const routeIds = await driverRouteIds(user);
  const pickups = await data.getPickups(workDate, routeIds);
  const pending = await data.getPendingStaff(workDate);
  return { workDate, pickups, pending };
}
app.get('/driver/print', requireRole('driver', 'admin'), async (req, res) => {
  const s = await fetchSchedule(req.session.user, req.query.date);
  res.render('driver_print', s);
});
app.get('/driver/export.csv', requireRole('driver', 'admin'), async (req, res) => {
  const s = await fetchSchedule(req.session.user, req.query.date);
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let csv = ['Δρομολόγιο', 'Στάση', 'Ώρα', 'Όνομα'].map(esc).join(',') + '\r\n';
  s.pickups.forEach(p => { csv += [p.route, p.stop, p.pickup_time, p.person].map(esc).join(',') + '\r\n'; });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transfers-${s.workDate}.csv"`);
  res.send('\ufeff' + csv);
});
app.get('/driver/export.pdf', requireRole('driver', 'admin'), async (req, res) => {
  const s = await fetchSchedule(req.session.user, req.query.date);
  pdf.streamSchedule(res, s);
});

// ---------- Admin ----------
app.use('/admin', require('./routes/admin'));

// Manual email triggers (admin only) — handy for testing.
app.post('/admin/send/staff', requireRole('admin','superuser'), async (req, res) => {
  const r = await mailer.sendStaffReminders(req.body.date || tomorrowStr());
  res.redirect('/admin?msg=' + encodeURIComponent(`Υπενθυμίσεις προσωπικού: ${r.sent}/${r.pending}`));
});
app.post('/admin/send/driver', requireRole('admin','superuser'), async (req, res) => {
  const r = await mailer.sendDriverSummaries(req.body.date || tomorrowStr());
  res.redirect('/admin?msg=' + encodeURIComponent(`Emails οδηγών: ${r.sent}/${r.drivers}`));
});
app.post('/admin/test-email', requireRole('admin', 'superuser'), async (req, res) => {
  const to = (req.body.email || '').trim();
  const r = await mailer.sendTest(to);
  const msg = r.ok
    ? `Δοκιμαστικό email στάλθηκε σε ${to} (μέσω ${r.label}). Έλεγξε και τα spam.`
    : `Αποτυχία αποστολής: ${r.error}`;
  res.redirect('/admin?msg=' + encodeURIComponent(msg));
});

app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Η σελίδα δεν βρέθηκε.' }));

const PORT = process.env.PORT || 3000;
async function start() {
  await init();
  await brand.load();
  scheduler.start();
  app.listen(PORT, () => console.log(`[app] listening on ${PORT}`));
}
if (require.main === module) {
  start().catch(e => { console.error('[app] init failed', e); process.exit(1); });
}
module.exports = { app, start, init };
