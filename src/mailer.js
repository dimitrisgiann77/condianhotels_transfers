const nodemailer = require('nodemailer');
const data = require('./data');
const pdf = require('./pdf');
const brand = require('./brand');
const graph = require('./graph');
const { q } = require('./db');
const { tomorrowStr, prettyDate, esc } = require('./util');

let cached = null; // { transporter, label }

function fromAddr() { return process.env.MAIL_FROM || process.env.SMTP_USER; }

function buildConfigs() {
  const host = process.env.SMTP_HOST;
  if (!host) return [];
  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined;
  const hosts = [host];
  if (!/^mail\./i.test(host)) hosts.push('mail.' + host);
  const cfgPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const cfgSecure = process.env.SMTP_SECURE === 'true';
  const ports = [
    { port: cfgPort, secure: cfgSecure },
    { port: 587, secure: false },
    { port: 465, secure: true },
  ];
  const list = [], seen = new Set();
  for (const h of hosts) for (const p of ports) {
    const key = `${h}:${p.port}:${p.secure}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      host: h, port: p.port, secure: p.secure, auth,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
      tls: { rejectUnauthorized: false },
    });
  }
  return list;
}

async function ensureTransport() {
  if (cached) return cached;
  const configs = buildConfigs();
  if (!configs.length) { console.warn('[mailer] SMTP not configured'); return null; }
  let lastErr;
  for (const c of configs) {
    try {
      const t = nodemailer.createTransport(c);
      await t.verify();
      cached = { transporter: t, label: `${c.host}:${c.port} secure=${c.secure}` };
      console.log('[mailer] using ' + cached.label);
      return cached;
    } catch (e) {
      lastErr = e;
      console.warn(`[mailer] ${c.host}:${c.port} secure=${c.secure} -> ${e.message}`);
    }
  }
  throw lastErr || new Error('No SMTP configuration worked');
}

async function logEmail(to, subject, status, error) {
  try { await q('INSERT INTO email_log (to_email,subject,status,error) VALUES ($1,$2,$3,$4)', [to || null, subject || null, status, error || null]); }
  catch (e) { console.error('[mailer] log failed:', e.message); }
}
async function send(to, subject, html, attachments) {
  if (!to) return { skipped: true };
  try {
    const r = await sendRaw(to, subject, html, attachments);
    await logEmail(to, subject, r && r.skipped ? 'skipped' : 'sent', r && r.skipped ? 'no SMTP/Graph' : null);
    return r;
  } catch (e) { await logEmail(to, subject, 'failed', e.message); throw e; }
}
async function sendRaw(to, subject, html, attachments) {
  if (!to) return { skipped: true };
  if (graph.enabled()) return graph.send({ to, subject, html, attachments });
  const ct = await ensureTransport();
  if (!ct) return { skipped: true };
  const payload = { from: fromAddr(), to, subject, html, attachments: attachments || [] };
  try {
    return await ct.transporter.sendMail(payload);
  } catch (e) {
    cached = null; // reset and retry once with fresh probe
    const ct2 = await ensureTransport();
    if (!ct2) throw e;
    return ct2.transporter.sendMail(payload);
  }
}

async function sendTest(to) {
  if (!to) return { ok: false, error: 'Δώσε διεύθυνση email.' };
  if (graph.enabled()) {
    try {
      await graph.send({ to, subject: 'CONDIAN Transfers — δοκιμαστικό email',
        html: '<p>Δοκιμαστικό email μέσω Microsoft Graph. Λειτουργεί!</p>' });
      await logEmail(to, 'Δοκιμαστικό email', 'sent', null);
      return { ok: true, label: 'Microsoft Graph (' + graph.senderAddress() + ')' };
    } catch (e) { await logEmail(to, 'Δοκιμαστικό email', 'failed', e.message); return { ok: false, error: e.message }; }
  }
  try {
    const ct = await ensureTransport();
    if (!ct) { await logEmail(to, 'Δοκιμαστικό email', 'skipped', 'Δεν έχουν οριστεί στοιχεία SMTP'); return { ok: false, error: 'Δεν έχουν οριστεί στοιχεία SMTP.' }; }
    await ct.transporter.sendMail({
      from: fromAddr(), to,
      subject: 'CONDIAN Transfers — δοκιμαστικό email',
      html: '<p>Δοκιμαστικό email από το σύστημα μεταφορών. Αν το βλέπεις, το SMTP δουλεύει!</p>',
    });
    await logEmail(to, 'Δοκιμαστικό email', 'sent', null);
    return { ok: true, label: ct.label };
  } catch (e) {
    cached = null;
    await logEmail(to, 'Δοκιμαστικό email', 'failed', e.message);
    return { ok: false, error: e.message };
  }
}
const wrap = (title, body) => {
  const C = brand.getColors();
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
    <h2 style="color:${C.navy};border-bottom:3px solid ${C.gold};padding-bottom:6px">CONDIAN Hotels — Summer Transfers 2026</h2>
    <h3>${esc(title)}</h3>${body}
    <p style="color:#888;font-size:12px;margin-top:24px">Αυτόματο μήνυμα από το σύστημα μεταφορών.</p>
  </div>`;
};

// --- per-user senders ---
async function sendStaffReminderTo(p, workDate = tomorrowStr()) {
  if (!p.email) return { skipped: true };
  const existing = await data.getMyDeclaration(p.id, workDate);
  if (existing) return { skipped: true }; // ήδη δήλωσε
  const url = process.env.PUBLIC_URL || '';
  const body = `
    <p>Γεια σου ${esc(p.name)},</p>
    <p>Δεν έχεις δηλώσει ακόμη τη βάρδιά σου για <b>${prettyDate(workDate)}</b> (αύριο).</p>
    <p>Παρακαλώ μπες και δήλωσε αν εργάζεσαι ή έχεις ρεπό, και τη στάση παραλαβής σου.</p>
    <p><a href="${esc(url)}/staff" style="background:#193847;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px">Δήλωση βάρδιας</a></p>`;
  await send(p.email, `Υπενθύμιση: δήλωσε τη βάρδια σου για ${prettyDate(workDate)}`, wrap('Υπενθύμιση δήλωσης βάρδιας', body));
  return { sent: true };
}

async function sendDriverSummaryTo(drv, workDate = tomorrowStr()) {
  if (!drv.email) return { skipped: true };
  const routeIds = await data.getDriverRouteIds(drv.id);
  const pickups = await data.getPickups(workDate, routeIds.length ? routeIds : null);
  const pending = await data.getPendingStaff(workDate);
  const rowsHtml = pickups.length
    ? pickups.map(p => `<tr><td style="padding:4px 8px;border:1px solid #ddd">${esc(p.route || '')}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(p.stop || '')}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(p.pickup_time || '')}</td><td style="padding:4px 8px;border:1px solid #ddd">${esc(p.person)}</td></tr>`).join('')
    : `<tr><td colspan="4" style="padding:8px;color:#888">Καμία δήλωση εργασίας.</td></tr>`;
  const pendHtml = pending.length
    ? `<ul>${pending.map(p => `<li>${esc(p.name)}</li>`).join('')}</ul>`
    : '<p style="color:#0a0">Όλο το προσωπικό έχει δηλώσει.</p>';
  const body = `
    <p>Δρομολόγιο για <b>${prettyDate(workDate)}</b> (αύριο):</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr style="background:#193847;color:#fff"><th style="padding:6px 8px;text-align:left">Δρομολόγιο</th><th style="padding:6px 8px;text-align:left">Στάση</th><th style="padding:6px 8px;text-align:left">Ώρα</th><th style="padding:6px 8px;text-align:left">Όνομα</th></tr>
      ${rowsHtml}
    </table>
    <h4 style="color:#a60">Δεν δήλωσαν ακόμη (${pending.length}):</h4>
    ${pendHtml}`;
  let attachments = [];
  try {
    const buf = await pdf.buildBuffer({ workDate, pickups, pending });
    attachments = [{ filename: `transfers-${workDate}.pdf`, content: buf }];
  } catch (e) { console.error('[mailer] PDF build failed:', e.message); }
  await send(drv.email, `Πρόγραμμα παραλαβών — ${prettyDate(workDate)}`, wrap('Πρόγραμμα παραλαβών', body), attachments);
  return { sent: true };
}

async function sendDriverWeeklyTo(drv, startDate = tomorrowStr()) {
  if (!drv.email) return { skipped: true };
  const routeIds = await data.getDriverRouteIds(drv.id);
  const week = await data.getWeekPickups(routeIds.length ? routeIds : null, startDate, 7);
  let body = '<p>Πρόγραμμα παραλαβών για τις επόμενες 7 ημέρες:</p>';
  for (const day of week) {
    const rows = day.pickups.length
      ? day.pickups.map(p => `<tr><td style="padding:3px 8px;border:1px solid #ddd">${esc(p.pickup_time || '')}</td><td style="padding:3px 8px;border:1px solid #ddd">${esc(p.stop || '')}</td><td style="padding:3px 8px;border:1px solid #ddd">${esc(p.person)}</td></tr>`).join('')
      : '<tr><td colspan="3" style="padding:6px;color:#888">Καμία δήλωση.</td></tr>';
    body += `<h4 style="color:#193847;margin:14px 0 4px">${prettyDate(day.date)}</h4>` +
      `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#193847;color:#fff"><th style="padding:4px 8px;text-align:left">Ώρα</th><th style="padding:4px 8px;text-align:left">Στάση</th><th style="padding:4px 8px;text-align:left">Όνομα</th></tr>${rows}</table>`;
  }
  await send(drv.email, 'Εβδομαδιαίο πρόγραμμα παραλαβών', wrap('Εβδομαδιαίο πρόγραμμα', body));
  return { sent: true };
}

// --- bulk (manual buttons) ---
async function sendStaffReminders(workDate = tomorrowStr()) {
  const pending = await data.getPendingStaff(workDate);
  let sent = 0;
  for (const p of pending) {
    try { const r = await sendStaffReminderTo(p, workDate); if (r.sent) sent++; }
    catch (e) { console.error('[mailer] staff reminder failed for', p.email, e.message); }
  }
  console.log(`[mailer] staff reminders: ${sent}/${pending.length} sent for ${workDate}`);
  return { pending: pending.length, sent };
}

async function sendDriverSummaries(workDate = tomorrowStr()) {
  const drivers = await data.getDrivers();
  let sent = 0;
  for (const drv of drivers) {
    try { const r = await sendDriverSummaryTo(drv, workDate); if (r.sent) sent++; }
    catch (e) { console.error('[mailer] driver summary failed for', drv.email, e.message); }
  }
  console.log(`[mailer] driver summaries: ${sent}/${drivers.length} sent for ${workDate}`);
  return { drivers: drivers.length, sent };
}

module.exports = { send, sendTest, sendStaffReminders, sendDriverSummaries, sendStaffReminderTo, sendDriverSummaryTo, sendDriverWeeklyTo };
