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
const i18n = require('./i18n');
const multer = require('multer');
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const { requireLogin, requireRole, homeForRole } = require('./auth');
const { tomorrowStr, prettyDate, todayStr, mondayOf, weekDays, DAYNAMES, datePlus } = require('./util');

const MAP_STYLES = {
  osm:     { tile: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc',  attribution: '© OpenStreetMap' },
  gray:    { tile: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  voyager: { tile: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  dark:    { tile: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
};
function mapCfgFor(theme) {
  const st = (theme && theme.map_style) || 'gray';
  const base = MAP_STYLES[st] || MAP_STYLES.gray;
  return { style: st, tile: base.tile, subdomains: base.subdomains, attribution: base.attribution, pin: (theme && theme.primary) || '#193847' };
}

const app = express();
const APP_TITLE = 'CONDIAN Hotels — Summer Transfers 2026';
const APP_VERSION = (() => { try { return require('../package.json').version; } catch (e) { return '?'; } })();
const APP_COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7);

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
  res.locals.mapCfg = mapCfgFor(res.locals.theme);
  res.locals.publicUrl = process.env.PUBLIC_URL || '';
  res.locals.appVersion = APP_VERSION;
  res.locals.appCommit = APP_COMMIT;
  const _cm = (req.headers.cookie || '').match(/(?:^|;\s*)lang=(\w+)/);
  res.locals.lang = (req.session.user && req.session.user.lang) || (_cm ? _cm[1] : null) || 'el';
  res.locals.t = (k) => i18n.t(res.locals.lang, k);
  res.locals.prettyDate = prettyDate;
  next();
});

// notifications for the topbar (all logged-in users)
app.use(async (req, res, next) => {
  res.locals.notifUnread = 0; res.locals.notifs = [];
  try {
    if (req.session && req.session.user) {
      res.locals.notifUnread = await data.countUnread(req.session.user.id);
      res.locals.notifs = await data.getNotifications(req.session.user.id, 25);
    }
  } catch (e) { /* table may not exist yet */ }
  next();
});

// ---------- Branding (public) ----------
app.get('/brand.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.setHeader('Cache-Control', 'no-store');
  res.send(brand.cssVars());
});
const FALLBACK = { 'logo': '/logo.png', 'logo-white': '/logo-white.png', 'favicon': '/logo-mark.png', 'share': '/share.png' };
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
  const fb = (FALLBACK[name] || '/logo-mark.svg').replace(/^\//, '');
  return res.sendFile(path.join(__dirname, '..', 'public', fb));
});
app.get('/favicon.ico', (req, res) => res.redirect('/brand/favicon'));
app.get('/avatar/:id', async (req, res) => {
  try {
    const a = await brand.getAsset('avatar-' + parseInt(req.params.id, 10));
    if (a) { res.setHeader('Content-Type', a.mime); res.setHeader('Cache-Control', 'no-cache'); return res.send(Buffer.from(a.data, 'base64')); }
  } catch (e) {}
  res.sendFile(path.join(__dirname, '..', 'public', 'avatar.svg'));
});
app.post('/profile/photo', requireLogin, avatarUpload.single('photo'), async (req, res) => {
  try {
    if (req.file && /^image\//.test(req.file.mimetype)) {
      await brand.setAsset('avatar-' + req.session.user.id, req.file.mimetype, req.file.buffer);
      await data.logActivity(req.session.user.id, 'Αλλαγή φωτογραφίας', null);
    }
  } catch (e) { console.error('[avatar] upload failed', e.message); }
  res.redirect('/profile?saved=1');
});

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
    req.session.user = { id: u.id, name: u.name, role: u.role, username: u.username, lang: u.lang || null };
    try { await q('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]); await data.logActivity(u.id, 'Σύνδεση', null); } catch (e) {}
    res.redirect(homeForRole(u.role));
  } catch (e) {
    console.error(e);
    res.status(500).render('login', { error: 'Σφάλμα σύνδεσης. Δοκιμάστε ξανά.', info: null });
  }
});
app.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
app.get('/lang/:l', (req, res) => {
  const l = req.params.l === 'en' ? 'en' : 'el';
  res.setHeader('Set-Cookie', 'lang=' + l + '; Path=/; Max-Age=31536000; SameSite=Lax');
  if (req.session.user) { req.session.user.lang = l; q('UPDATE users SET lang=$1 WHERE id=$2', [l, req.session.user.id]).catch(()=>{}); }
  res.redirect(req.get('referer') || '/');
});

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
  const em=(b.email||'').trim(), ph=(b.phone||'').trim();
  if (!last || !first || !un || !pw || !em || !ph) return res.redirect('/register?error=' + encodeURIComponent('Συμπλήρωσε όλα τα πεδία (μαζί με email & κινητό).'));
  try {
    const hash = await bcrypt.hash(pw, 10);
    await q(`INSERT INTO users (name,last_name,first_name,email,phone,username,password_hash,role,active,favorite_route_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'staff',FALSE,$8)`,
      [last + ' ' + first, last, first, em, ph, un, hash, b.favorite_route_id || null]);
    res.redirect('/login?info=' + encodeURIComponent('Η εγγραφή καταχωρήθηκε. Θα συνδεθείς μόλις την εγκρίνει η διοίκηση.'));
  } catch (e) {
    res.redirect('/register?error=' + encodeURIComponent('Το username χρησιμοποιείται ήδη ή υπήρξε σφάλμα.'));
  }
});

// ---------- Profile (όλοι) ----------
app.get('/profile', requireLogin, async (req, res) => {
  const me = await data.getUser(req.session.user.id);
  const routes = await data.getRoutesWithStops(true);
  const myRouteIds = me.role === 'driver' ? await data.getDriverRouteIds(me.id) : [];
  res.render('profile', { me, routes, myRouteIds, saved: req.query.saved === '1', error: req.query.err === '1' });
});
app.post('/profile', requireLogin, async (req, res) => {
  if (!(req.body.email || '').trim() || !(req.body.phone || '').trim()) {
    return res.redirect('/profile?err=1');
  }
  let nt = req.body.notify_time;
  if (Array.isArray(nt)) nt = nt.filter(Boolean).join(',');
  else nt = (nt || '').trim();
  await data.updateProfile(req.session.user.id, {
    email: req.body.email, phone: req.body.phone, favorite_route_id: req.body.favorite_route_id || null,
    favorite_stop_id: req.body.favorite_stop_id || null,
    notify_enabled: req.body.notify_enabled === '1' || req.body.notify_enabled === 'on',
    notify_time: nt || null,
    notify_weekly_enabled: req.body.notify_weekly_enabled === '1' || req.body.notify_weekly_enabled === 'on',
    notify_weekly_day: req.body.notify_weekly_day,
    notify_weekly_time: (req.body.notify_weekly_time || '').trim() || null,
    lang: req.body.lang || res.locals.lang,
  });
  if (req.body.lang) req.session.user.lang = req.body.lang;
  if (req.session.user.role === 'driver') {
    let ids = req.body.route_ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    await q('DELETE FROM driver_routes WHERE driver_id=$1', [req.session.user.id]);
    for (const rid of ids) await q('INSERT INTO driver_routes (driver_id,route_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.session.user.id, rid]);
  }
  try { await data.logActivity(req.session.user.id, 'Ενημέρωση προφίλ', null); } catch (e) {}
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

// ---------- Notifications ----------
app.post('/notifications/read', requireLogin, async (req, res) => {
  try { await data.markNotificationsRead(req.session.user.id); } catch (e) {}
  if ((req.get('accept') || '').indexOf('json') >= 0 || req.xhr) return res.json({ ok: true });
  res.redirect(req.get('referer') || '/');
});

// ---------- Issue report (all logged-in users) ----------
app.post('/report', requireLogin, async (req, res) => {
  const msg = (req.body.message || '').trim();
  const area = (req.body.area || '').trim() || null;
  const back = req.get('referer') || '/';
  if (!msg) return res.redirect(back);
  try {
    const me = await data.getUser(req.session.user.id);
    await data.addFeedback(me.id, area, msg);
    await data.logActivity(me.id, 'feedback', area || 'general');
    const to = (await data.getSetting('feedback_email')) || process.env.FEEDBACK_EMAIL || process.env.ADMIN_EMAIL || 'info@condianhotels.gr';
    const areaLabels = { general:'Γενικά', pickup:'Δήλωση pick up', schedule:'Πρόγραμμα/Οδηγός', account:'Σύνδεση/Λογαριασμός', notify:'Ειδοποιήσεις/Email', map:'Χάρτης', other:'Άλλο' };
    const esc = (x)=>String(x||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#193847">
      <h2 style="color:#193847">Νέα αναφορά προβλήματος</h2>
      <p><strong>Από:</strong> ${esc(me.name)} (${esc(me.role)})${me.hotel?(' · '+esc(me.hotel)):''}<br>
      <strong>Email:</strong> ${esc(me.email||'-')} · <strong>Κινητό:</strong> ${esc(me.phone||'-')}<br>
      <strong>Λειτουργία:</strong> ${esc(areaLabels[area]||area||'-')}</p>
      <p style="white-space:pre-wrap;background:#f4f6f8;border-radius:8px;padding:12px">${esc(msg)}</p>
      <p style="color:#888;font-size:12px">CONDIAN Transfers · αυτόματο μήνυμα</p></div>`;
    mailer.send(to, 'Αναφορά προβλήματος — ' + (me.name||'χρήστης'), html).catch(e=>console.error('[report] mail', e.message));
  } catch (e) { console.error('[report]', e.message); }
  res.redirect(back.indexOf('?')>=0 ? back+'&reported=1' : back+'?reported=1');
});

// notify drivers (and confirm to staff) when a pick up is created/edited/cancelled
async function notifyPickupChange(user, workDate, routeId, stopId, kind) {
  const routes = await data.getRoutesWithStops(false);
  const r = routeId ? routes.find(x => String(x.id) === String(routeId)) : null;
  const stop = r && stopId ? (r.stops || []).find(s => String(s.id) === String(stopId)) : null;
  const dest = r && r.destination ? r.destination + ' · ' : '';
  const rl = r ? (dest + r.name) : '';
  const sl = stop ? (' · ' + stop.name + (stop.pickup_time ? ' (' + stop.pickup_time + ')' : '')) : '';
  const pd = prettyDate(workDate);
  if (kind === 'cancel') {
    if (routeId) {
      const drv = await data.getRouteDriverIds(routeId);
      await data.notifyUsers(drv, 'pickup_cancel', 'Ακύρωση pick up', user.name + ' — ' + pd + ' · ' + rl + sl, '/driver?date=' + workDate);
    }
    await data.addNotification(user.id, 'pickup_cancel_self', 'Ακυρώθηκε το pick up σου', pd, '/staff?tab=mine');
    return;
  }
  if (routeId) {
    const drv = await data.getRouteDriverIds(routeId);
    const title = kind === 'edit' ? 'Αλλαγή pick up' : 'Νέο pick up';
    await data.notifyUsers(drv, 'pickup', title, user.name + ' — ' + pd + ' · ' + rl + sl, '/driver?date=' + workDate);
  }
  await data.addNotification(user.id, 'pickup_self', kind === 'edit' ? 'Ενημερώθηκε το pick up σου' : 'Καταχωρήθηκε το pick up σου', pd + (rl ? ' · ' + rl : '') + sl, '/staff?tab=mine');
}

// ---------- Staff ----------
app.get('/staff', requireRole('staff'), async (req, res) => {
  const workDate = req.query.date || tomorrowStr();
  const routes = await data.getRoutesWithStops(true);
  const mine = await data.getMyDeclaration(req.session.user.id, workDate);
  const usage = await data.getRouteUsage(workDate);
  const me = await data.getUser(req.session.user.id);
  const myDeclarations = await data.getMyDeclarations(req.session.user.id);
  const w = parseInt(req.query.w || '0', 10) || 0;
  const days = weekDays(mondayOf(todayStr(), w));
  const declMap = await data.getUserDeclMap(req.session.user.id, days);
  const dn = i18n.dayNames(res.locals.lang);
  const weekcells = days.map((ds, i) => {
    const d = declMap[ds];
    const isPast = ds < todayStr();
    let cell = { date: ds, dayName: dn[i], dayNum: ds.slice(8,10)+'/'+ds.slice(5,7),
      isToday: ds === todayStr(), isPast, has: false,
      href: '/staff?tab=declare&date=' + ds };
    if (d && d.status === 'work') {
      cell.has = true;
      cell.time = d.pickup_time || '';
      cell.destination = d.destination || '';
      cell.route = d.route || '';
      cell.stop = d.stop || '';
    }
    return cell;
  });
  const destinations = [...new Set(routes.map(r => (r.destination||'').trim()).filter(Boolean))];
  const mapPoints = await data.getMapPoints();
  const upDates = []; for (let i = 0; i < 21; i++) upDates.push(datePlus(i));
  const upMap = await data.getUserDeclMap(req.session.user.id, upDates);
  const multiDates = upDates.map(ds => {
    const dow = (new Date(ds + 'T00:00:00').getDay() + 6) % 7;
    const dd = upMap[ds];
    return { date: ds, dayName: dn[dow], num: ds.slice(8,10) + '/' + ds.slice(5,7),
      declared: !!(dd && dd.status === 'work'), checked: ds === workDate };
  });
  res.render('staff', { multiDates, routes, destinations, mapPoints, workDate, mine, usage, favorite: me.favorite_route_id, favoriteStop: me.favorite_stop_id,
    saved: req.query.saved === '1', error: req.query.error || null, minDate: todayStr(), myDeclarations, msg: req.query.msg || null,
    weekcells, weekLabel: prettyDate(days[0]) + ' – ' + prettyDate(days[6]),
    prevHref: '/staff?tab=cal&w=' + (w - 1), nextHref: '/staff?tab=cal&w=' + (w + 1) });
});
app.post('/staff', requireRole('staff'), async (req, res) => {
  const { work_date, status } = req.body;
  let route_id = req.body.route_id || null;
  let stop_id = req.body.stop_id || null;
  if (status === 'off') { route_id = null; stop_id = null; }
  if (status === 'work' && route_id) {
    const routes = await data.getRoutes(false);
    const route = routes.find(r => String(r.id) === String(route_id));
    const cap = route ? route.capacity : 8;
    const used = await data.countOnRoute(work_date, route_id, req.session.user.id);
    if (used >= cap) {
      return res.redirect('/staff?date=' + encodeURIComponent(work_date) + '&error=full');
    }
  }
  try {
    const prev = await data.getMyDeclaration(req.session.user.id, work_date);
    const isEdit = !!(prev && prev.status === 'work');
    await q(`INSERT INTO declarations (user_id, work_date, status, route_id, stop_id, updated_at)
             VALUES ($1,$2,$3,$4,$5, now())
             ON CONFLICT (user_id, work_date)
             DO UPDATE SET status=EXCLUDED.status, route_id=EXCLUDED.route_id,
                           stop_id=EXCLUDED.stop_id, updated_at=now()`,
      [req.session.user.id, work_date, status, route_id, stop_id]);
    await data.logActivity(req.session.user.id, 'Δήλωση βάρδιας', work_date + ' · ' + (status === 'off' ? 'Ρεπό' : 'Εργασία' + (route_id ? ' (δρομ. ' + route_id + ')' : '')));
    try { await notifyPickupChange(req.session.user, work_date, route_id, stop_id, isEdit ? 'edit' : 'new'); } catch (e) { console.error('[notif]', e.message); }
    res.redirect('/staff?date=' + encodeURIComponent(work_date) + '&saved=1');
  } catch (e) {
    console.error(e);
    res.status(500).render('error', { title: 'Σφάλμα', message: 'Η δήλωση δεν αποθηκεύτηκε.' });
  }
});
async function notifyPickupMulti(user, dates, routeId, stopId, anyEdit) {
  if (!dates.length) return;
  dates = dates.slice().sort();
  const routes = await data.getRoutesWithStops(false);
  const r = routeId ? routes.find(x => String(x.id) === String(routeId)) : null;
  const stop = r && stopId ? (r.stops || []).find(s => String(s.id) === String(stopId)) : null;
  const dest = r && r.destination ? r.destination + ' · ' : '';
  const rl = r ? (dest + r.name) : '';
  const sl = stop ? (' · ' + stop.name + (stop.pickup_time ? ' (' + stop.pickup_time + ')' : '')) : '';
  const range = dates.length === 1 ? prettyDate(dates[0]) : (dates.length + ' ημέρες (' + prettyDate(dates[0]) + ' – ' + prettyDate(dates[dates.length - 1]) + ')');
  if (routeId) {
    const drv = await data.getRouteDriverIds(routeId);
    await data.notifyUsers(drv, 'pickup', anyEdit ? 'Ενημέρωση pick up' : 'Νέα pick up', user.name + ' — ' + rl + sl + ' · ' + range, '/driver');
  }
  await data.addNotification(user.id, 'pickup_self', 'Καταχωρήθηκαν τα pick up σου', range + (rl ? ' · ' + rl : '') + sl, '/staff?tab=mine');
}
app.post('/staff/multi', requireRole('staff'), async (req, res) => {
  let dates = req.body.work_dates || [];
  if (!Array.isArray(dates)) dates = [dates];
  dates = [...new Set(dates.filter(Boolean))].sort();
  const route_id = req.body.route_id || null;
  const stop_id = req.body.stop_id || null;
  if (!dates.length) return res.redirect('/staff?tab=declare&msg=' + encodeURIComponent('Διάλεξε τουλάχιστον μία ημέρα'));
  if (!route_id || !stop_id) return res.redirect('/staff?tab=declare&msg=' + encodeURIComponent('Διάλεξε σημείο παραλαβής στον χάρτη'));
  const routes = await data.getRoutes(false);
  const route = routes.find(r => String(r.id) === String(route_id));
  const cap = route ? route.capacity : 8;
  const saved = [], full = []; let anyEdit = false;
  try {
    for (const ds of dates) {
      const used = await data.countOnRoute(ds, route_id, req.session.user.id);
      if (used >= cap) { full.push(ds); continue; }
      const prev = await data.getMyDeclaration(req.session.user.id, ds);
      if (prev && prev.status === 'work') anyEdit = true;
      await q(`INSERT INTO declarations (user_id, work_date, status, route_id, stop_id, updated_at)
               VALUES ($1,$2,'work',$3,$4, now())
               ON CONFLICT (user_id, work_date)
               DO UPDATE SET status='work', route_id=EXCLUDED.route_id, stop_id=EXCLUDED.stop_id, updated_at=now()`,
        [req.session.user.id, ds, route_id, stop_id]);
      saved.push(ds);
    }
    await data.logActivity(req.session.user.id, 'Δήλωση pick up', saved.join(', '));
    try { await notifyPickupMulti(req.session.user, saved, route_id, stop_id, anyEdit); } catch (e) { console.error('[notif]', e.message); }
    let msg = saved.length ? ('Αποθηκεύτηκαν ' + saved.length + ' ημέρες') : 'Καμία ημέρα δεν αποθηκεύτηκε';
    if (full.length) msg += ', ' + full.length + ' πλήρεις παραλείφθηκαν';
    res.redirect('/staff?tab=mine&msg=' + encodeURIComponent(msg));
  } catch (e) {
    console.error(e);
    res.redirect('/staff?tab=declare&msg=' + encodeURIComponent('Σφάλμα κατά την αποθήκευση'));
  }
});
app.post('/staff/delete', requireRole('staff'), async (req, res) => {
  const work_date = req.body.work_date;
  try {
    const removed = await data.deleteDeclaration(req.session.user.id, work_date);
    await data.logActivity(req.session.user.id, 'Διαγραφή pick up', work_date);
    if (removed) { try { await notifyPickupChange(req.session.user, work_date, removed.route_id, removed.stop_id, 'cancel'); } catch (e) {} }
  } catch (e) { console.error('[staff/delete]', e.message); }
  res.redirect('/staff?tab=mine&msg=' + encodeURIComponent('Το pick up διαγράφηκε'));
});
app.post('/staff/range', requireRole('staff'), async (req, res) => {
  const { from, to, status } = req.body;
  let route_id = req.body.route_id || null, stop_id = req.body.stop_id || null;
  if (status === 'off') { route_id = null; stop_id = null; }
  if (!from || !to) return res.redirect('/staff?msg=' + encodeURIComponent('Συμπλήρωσε εύρος ημερομηνιών'));
  const routes = await data.getRoutes(false);
  const cap = route_id ? ((routes.find(r => String(r.id) === String(route_id)) || {}).capacity || 8) : null;
  let saved = 0, full = 0, n = 0;
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  try {
    while (d <= end && n < 90) {
      n++;
      const ds = d.toISOString().slice(0, 10);
      if (status === 'work' && route_id) {
        const used = await data.countOnRoute(ds, route_id, req.session.user.id);
        if (used >= cap) { full++; d = new Date(d.getTime() + 86400000); continue; }
      }
      await q(`INSERT INTO declarations (user_id, work_date, status, route_id, stop_id, updated_at)
               VALUES ($1,$2,$3,$4,$5, now())
               ON CONFLICT (user_id, work_date)
               DO UPDATE SET status=EXCLUDED.status, route_id=EXCLUDED.route_id, stop_id=EXCLUDED.stop_id, updated_at=now()`,
        [req.session.user.id, ds, status, route_id, stop_id]);
      saved++;
      d = new Date(d.getTime() + 86400000);
    }
    res.redirect('/staff?msg=' + encodeURIComponent(`Αποθηκεύτηκαν ${saved} ημέρες${full ? ', ' + full + ' πλήρεις παραλείφθηκαν' : ''}`));
  } catch (e) {
    console.error(e);
    res.redirect('/staff?msg=' + encodeURIComponent('Σφάλμα κατά την αποθήκευση'));
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
  const pending = await data.getPendingStaff(workDate);
  const counts = await data.getCounts(workDate);
  const allRoutes = await data.getRoutes(true);
  const usage = await data.getRouteUsage(workDate);
  const seats = allRoutes.filter(r => !routeIds || routeIds.includes(r.id))
    .map(r => ({ name: r.name, capacity: r.capacity, used: usage[r.id] || 0 }));
  const pickups = await data.getPickups(workDate, routeIds);
  const week = await data.getWeekPickups(routeIds, workDate, 7);
  const w = parseInt(req.query.w || '0', 10) || 0;
  const calWeek = await data.getWeekPickups(routeIds, mondayOf(todayStr(), w), 7);
  const dn = i18n.dayNames(res.locals.lang);
  const weekcells = calWeek.map((day, i) => {
    const byRoute = {}; day.pickups.forEach(p => { const k = p.route || '—'; byRoute[k] = (byRoute[k] || 0) + 1; });
    const lines = Object.keys(byRoute).map(rn => rn + ': ' + byRoute[rn]);
    return { date: day.date, dayName: dn[i], dayNum: day.date.slice(8,10)+'/'+day.date.slice(5,7),
      isToday: day.date === todayStr(),
      badge: day.pickups.length ? { text: day.pickups.length + ' άτομα', cls: 'work' } : null,
      lines, href: '/driver?tab=day&date=' + day.date };
  });
  res.render('driver', { workDate, pickups, week, pending, counts, seats,
    minDate: todayStr(), today: todayStr(), tomorrow: tomorrowStr(), msg: req.query.msg || null,
    weekcells, weekLabel: prettyDate(calWeek[0].date) + ' – ' + prettyDate(calWeek[6].date),
    prevHref: '/driver?tab=cal&w=' + (w - 1), nextHref: '/driver?tab=cal&w=' + (w + 1) });
});
app.post('/driver/remind-pending', requireRole('driver', 'admin', 'superuser'), async (req, res) => {
  const date = req.body.date || tomorrowStr();
  const r = await mailer.sendStaffReminders(date);
  res.redirect('/driver?date=' + encodeURIComponent(date) + '&msg=' + encodeURIComponent('Υπενθύμιση στάλθηκε σε ' + r.sent + ' άτομα που δεν είχαν δηλώσει'));
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
app.get('/driver/export.pdf', requireRole('driver', 'admin'), async (req, res) => {
  const s = await fetchSchedule(req.session.user, req.query.date);
  await pdf.streamSchedule(res, s);
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
