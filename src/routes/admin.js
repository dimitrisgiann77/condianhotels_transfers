const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { q } = require('../db');
const data = require('../data');
const { requireRole } = require('../auth');
const brand = require('../brand');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const { tomorrowStr } = require('../util');

router.use(requireRole('admin', 'superuser'));
const adminOnly = requireRole('admin'); // user management & branding

router.get('/', async (req, res) => {
  const routes = await data.getRoutesWithStops(false);
  const users = await data.getUsersAdmin();
  const supervisors = await data.getSupervisors();
  const hotels = await data.getHotels();
  const editUser = req.query.user ? (await q('SELECT * FROM users WHERE id=$1', [req.query.user])).rows[0] : null;
  const drivers = users.filter(u => u.role === 'driver');
  const driverRoutes = {};
  for (const d of drivers) driverRoutes[d.id] = await data.getDriverRouteIds(d.id);
  const pendingUsers = await data.getPendingUsers();
  const regCode = await data.getSetting('reg_code');
  const questions = await data.listQuestions();
  const emailLog = await data.getEmailLog();
  const feedback = await data.listFeedback();
  res.render('admin', {
    routes, users, drivers, driverRoutes, colors: brand.getColors(), pendingUsers, regCode, questions,
    supervisors, hotels, editUser, pdf: brand.getPdf(), emailLog, feedback,
    allRoutes: routes,
    msg: req.query.msg || null,
    tomorrow: tomorrowStr(),
    editStop: req.query.stop ? routes.flatMap(r => r.stops).find(s => String(s.id) === req.query.stop) : null,
  });
});

// ----- Routes -----
router.post('/route', async (req, res) => {
  const { name, sort_order, capacity } = req.body;
  await q('INSERT INTO routes (name, destination, sort_order, capacity) VALUES ($1,$2,$3,$4)',
    [name, (req.body.destination || '').trim() || null, parseInt(sort_order || '0', 10), parseInt(capacity || '8', 10)]);
  res.redirect('/admin?tab=routes&msg=' + encodeURIComponent('Το δρομολόγιο προστέθηκε'));
});
router.post('/route/:id/capacity', async (req, res) => {
  await q('UPDATE routes SET capacity=$1 WHERE id=$2', [parseInt(req.body.capacity || '8', 10), req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Το όριο θέσεων ενημερώθηκε'));
});
router.post('/route/:id/rename', async (req, res) => {
  const name = (req.body.name || '').trim();
  const destination = (req.body.destination || '').trim() || null;
  if (name) {
    const before = (await q('SELECT name FROM routes WHERE id=$1', [req.params.id])).rows[0];
    await q('UPDATE routes SET name=$1, destination=$2 WHERE id=$3', [name, destination, req.params.id]);
    if (before && before.name !== name) {
      try {
        const ids = await data.getFutureDeclUserIds(req.params.id);
        await data.notifyUsers(ids, 'route_change', 'Αλλαγή δρομολογίου', 'Το δρομολόγιο «' + before.name + '» άλλαξε σε «' + name + '».', '/staff?tab=mine');
      } catch (e) {}
    }
  }
  res.redirect('/admin?tab=routes&msg=' + encodeURIComponent('Το δρομολόγιο ενημερώθηκε'));
});
router.post('/routes/reorder', async (req, res) => {
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [];
  for (let i = 0; i < ids.length; i++) {
    await q('UPDATE routes SET sort_order=$1 WHERE id=$2', [i + 1, parseInt(ids[i], 10)]);
  }
  res.json({ ok: true });
});
router.post('/stops/reorder', async (req, res) => {
  let orders = req.body.orders || [];
  if (!Array.isArray(orders)) orders = [];
  for (const arr of orders) {
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      await q('UPDATE stops SET sort_order=$1 WHERE id=$2', [i + 1, parseInt(arr[i], 10)]);
    }
  }
  res.json({ ok: true });
});
router.post('/route/:id/delete', async (req, res) => {
  try {
    const before = (await q('SELECT name FROM routes WHERE id=$1', [req.params.id])).rows[0];
    const ids = await data.getFutureDeclUserIds(req.params.id);
    await q('DELETE FROM routes WHERE id=$1', [req.params.id]);
    if (before) await data.notifyUsers(ids, 'route_removed', 'Κατάργηση δρομολογίου', 'Το δρομολόγιο «' + before.name + '» αφαιρέθηκε. Παρακαλώ δήλωσε ξανά το pick up σου.', '/staff?tab=declare');
  } catch (e) { await q('DELETE FROM routes WHERE id=$1', [req.params.id]); }
  res.redirect('/admin?tab=routes&msg=' + encodeURIComponent('Το δρομολόγιο διαγράφηκε'));
});
router.post('/route/:id/toggle', async (req, res) => {
  await q('UPDATE routes SET active = NOT active WHERE id=$1', [req.params.id]);
  try {
    const r = (await q('SELECT name, active FROM routes WHERE id=$1', [req.params.id])).rows[0];
    if (r && !r.active) {
      const ids = await data.getFutureDeclUserIds(req.params.id);
      await data.notifyUsers(ids, 'route_off', 'Δρομολόγιο ανενεργό', 'Το δρομολόγιο «' + r.name + '» απενεργοποιήθηκε. Δήλωσε ξανά το pick up σου.', '/staff?tab=declare');
    }
  } catch (e) {}
  res.redirect('/admin?tab=routes');
});

// ----- Stops -----
router.post('/stop', async (req, res) => {
  const { route_id, name, pickup_time, sort_order, lat, lng } = req.body;
  await q(`INSERT INTO stops (route_id,name,pickup_time,sort_order,lat,lng)
           VALUES ($1,$2,$3,$4,$5,$6)`,
    [route_id, name, pickup_time || null, parseInt(sort_order || '0', 10),
     lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null]);
  res.redirect('/admin?msg=' + encodeURIComponent('Η στάση προστέθηκε'));
});
router.post('/stop/:id', async (req, res) => {
  const { name, pickup_time, sort_order, lat, lng, route_id } = req.body;
  await q(`UPDATE stops SET name=$1, pickup_time=$2, sort_order=$3, lat=$4, lng=$5, route_id=COALESCE($6, route_id) WHERE id=$7`,
    [name, pickup_time || null, parseInt(sort_order || '0', 10),
     lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null,
     route_id ? parseInt(route_id, 10) : null, req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Η στάση ενημερώθηκε'));
});
router.post('/stop/:id/delete', async (req, res) => {
  await q('DELETE FROM stops WHERE id=$1', [req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Η στάση διαγράφηκε'));
});

// ----- Users -----
function fullName(last, first) {
  return [(last || '').trim(), (first || '').trim()].filter(Boolean).join(' ');
}
router.post('/user', adminOnly, async (req, res) => {
  const { last_name, first_name, email, username, password, role, hotel, supervisor_id } = req.body;
  if (!(email||'').trim() || !(req.body.phone||'').trim()) {
    return res.redirect('/admin?tab=users&msg=' + encodeURIComponent('Email και κινητό είναι υποχρεωτικά'));
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await q(`INSERT INTO users (name,last_name,first_name,email,phone,username,password_hash,role,hotel,supervisor_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [fullName(last_name, first_name), last_name || null, first_name || null,
       email || null, req.body.phone || null, username, hash, role,
       hotel || null, supervisor_id ? parseInt(supervisor_id,10) : null]);
    res.redirect('/admin?msg=' + encodeURIComponent('Ο χρήστης προστέθηκε'));
  } catch (e) {
    res.redirect('/admin?msg=' + encodeURIComponent('Σφάλμα: το username υπάρχει ήδη;'));
  }
});
router.post('/user/bulk', adminOnly, async (req, res) => {
  const arr = k => { const v = req.body[k]; return Array.isArray(v) ? v : (v == null ? [] : [v]); };
  const last = arr('last_name'), first = arr('first_name'), un = arr('username'),
        pw = arr('password'), role = arr('role'), email = arr('email'), phone = arr('phone');
  let added = 0, skipped = 0;
  for (let i = 0; i < un.length; i++) {
    const u = (un[i] || '').trim(), p = (pw[i] || '').trim();
    if (!u || !p || !(email[i]||'').trim() || !(phone[i]||'').trim()) { if ((last[i] || first[i] || email[i] || un[i])) skipped++; continue; }
    try {
      const hash = await bcrypt.hash(p, 10);
      await q(`INSERT INTO users (name,last_name,first_name,email,phone,username,password_hash,role)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [fullName(last[i], first[i]), (last[i]||'').trim()||null, (first[i]||'').trim()||null,
         (email[i]||'').trim()||null, (phone[i]||'').trim()||null, u, hash, (role[i]||'staff')]);
      added++;
    } catch (e) { skipped++; }
  }
  res.redirect('/admin?msg=' + encodeURIComponent(`Μαζική εισαγωγή: ${added} προστέθηκαν, ${skipped} παραλείφθηκαν`));
});
router.post('/user/:id/password', adminOnly, async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Ο κωδικός άλλαξε'));
});
router.post('/user/:id/toggle', adminOnly, async (req, res) => {
  await q('UPDATE users SET active = NOT active WHERE id=$1', [req.params.id]);
  res.redirect('/admin');
});
router.post('/user/:id/delete', adminOnly, async (req, res) => {
  await q('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Ο χρήστης διαγράφηκε'));
});

// ----- Driver -> routes assignment -----
router.post('/driver/:id/routes', async (req, res) => {
  const did = req.params.id;
  let ids = req.body.route_ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  await q('DELETE FROM driver_routes WHERE driver_id=$1', [did]);
  for (const rid of ids) await q('INSERT INTO driver_routes (driver_id,route_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [did, rid]);
  res.redirect('/admin?msg=' + encodeURIComponent('Τα δρομολόγια οδηγού ενημερώθηκαν'));
});

// ----- Stats -----
router.get('/stats', async (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  const [routes, staff, avg, byDriver, recent] = await Promise.all([
    data.routeStats(days), data.staffStats(days), data.ratingAverages(Math.max(days,90)),
    data.ratingByDriver(Math.max(days,90)), data.recentRatings(20),
  ]);
  res.render('admin_stats', { days, routes, staff, avg, byDriver, recent });
});

// ----- Questions -----
router.get('/questions', async (req, res) => {
  const questions = await data.listQuestions();
  const emailLog = await data.getEmailLog();
  res.render('admin_questions', { questions, msg: req.query.msg || null });
});
router.post('/feedback/:id/resolve', async (req, res) => {
  await data.setFeedbackStatus(req.params.id, 'resolved');
  res.redirect('/admin?tab=feedback');
});
router.post('/feedback/:id/reopen', async (req, res) => {
  await data.setFeedbackStatus(req.params.id, 'open');
  res.redirect('/admin?tab=feedback');
});
router.post('/question/:id/answer', async (req, res) => {
  await q('UPDATE questions SET answer=$1, answered_at=now() WHERE id=$2',
    [(req.body.answer || '').trim() || null, req.params.id]);
  res.redirect('/admin?tab=questions&msg=' + encodeURIComponent('Η απάντηση αποθηκεύτηκε'));
});

// ----- Branding -----
router.post('/branding/colors', adminOnly, async (req, res) => {
  await brand.setColors(req.body);
  res.redirect('/admin?msg=' + encodeURIComponent('Τα χρώματα ενημερώθηκαν'));
});
router.post('/branding/theme', adminOnly, async (req, res) => {
  await brand.setTheme(req.body);
  res.redirect('/admin?msg=' + encodeURIComponent('Το θέμα ενημερώθηκε'));
});
router.post('/branding/pdf', adminOnly, async (req, res) => {
  await brand.setPdf(req.body);
  res.redirect('/admin?msg=' + encodeURIComponent('Οι ρυθμίσεις PDF ενημερώθηκαν'));
});
const LOGO_MAP = { logo: 'logo', logo_white: 'logo-white', favicon: 'favicon', share: 'share' };
router.post('/branding/logos', adminOnly,
  upload.fields([{ name: 'logo' }, { name: 'logo_white' }, { name: 'favicon' }, { name: 'share' }]),
  async (req, res) => {
    try {
      for (const field of Object.keys(LOGO_MAP)) {
        const f = req.files && req.files[field] && req.files[field][0];
        if (f && /^image\//.test(f.mimetype)) {
          await brand.setAsset(LOGO_MAP[field], f.mimetype, f.buffer);
        }
      }
      res.redirect('/admin?msg=' + encodeURIComponent('Τα λογότυπα ενημερώθηκαν'));
    } catch (e) {
      console.error('[branding] upload failed', e.message);
      res.redirect('/admin?msg=' + encodeURIComponent('Σφάλμα στο ανέβασμα λογοτύπου'));
    }
  });

// ----- Registration approvals (admin + superuser) -----
router.post('/user/:id/approve', async (req, res) => {
  await q('UPDATE users SET active=TRUE WHERE id=$1', [req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Η εγγραφή εγκρίθηκε'));
});
router.post('/user/:id/reject', async (req, res) => {
  await q('DELETE FROM users WHERE id=$1 AND active=FALSE', [req.params.id]);
  res.redirect('/admin?msg=' + encodeURIComponent('Η εγγραφή απορρίφθηκε'));
});
// ----- Registration code (admin only) -----
router.post('/registration-code', adminOnly, async (req, res) => {
  await data.setSetting('reg_code', (req.body.reg_code || '').trim());
  res.redirect('/admin?msg=' + encodeURIComponent('Ο κωδικός εγγραφής ενημερώθηκε'));
});

router.post('/user/:id/edit', adminOnly, async (req, res) => {
  const b = req.body;
  if (!(b.email||'').trim() || !(b.phone||'').trim()) {
    return res.redirect('/admin?user='+req.params.id+'&tab=users&msg=' + encodeURIComponent('Email και κινητό είναι υποχρεωτικά'));
  }
  await q(`UPDATE users SET name=$1,last_name=$2,first_name=$3,email=$4,phone=$5,role=$6,hotel=$7,supervisor_id=$8 WHERE id=$9`,
    [fullName(b.last_name, b.first_name), b.last_name || null, b.first_name || null,
     b.email || null, b.phone || null, b.role || 'staff', b.hotel || null,
     b.supervisor_id ? parseInt(b.supervisor_id, 10) : null, req.params.id]);
  res.redirect('/admin?tab=users&msg=' + encodeURIComponent('Ο χρήστης ενημερώθηκε'));
});
router.post('/hotels', adminOnly, async (req, res) => {
  await data.setSetting('hotels', (req.body.hotels || '').trim());
  res.redirect('/admin?tab=users&msg=' + encodeURIComponent('Η λίστα ξενοδοχείων ενημερώθηκε'));
});

router.get('/user/:id/activity', async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE id=$1', [req.params.id])).rows[0];
  if (!u) return res.redirect('/admin?tab=users');
  const activities = await data.getUserActivity(u.id);
  const emails = u.email ? await data.getEmailLogFor(u.email) : [];
  res.render('admin_activity', { u, activities, emails });
});

module.exports = router;
