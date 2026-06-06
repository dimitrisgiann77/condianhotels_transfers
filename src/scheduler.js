const cron = require('node-cron');
const mailer = require('./mailer');
const data = require('./data');
const { TZ, tomorrowStr } = require('./util');

function nowHHMM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

async function tick() {
  const hhmm = nowHHMM();
  const date = tomorrowStr();
  try {
    const staff = await data.getStaffDue(hhmm);
    for (const u of staff) {
      try { await mailer.sendStaffReminderTo(u, date); }
      catch (e) { console.error('[scheduler] staff reminder', u.email, e.message); }
    }
    const drivers = await data.getDriversDue(hhmm);
    for (const d of drivers) {
      try { await mailer.sendDriverSummaryTo(d, date); }
      catch (e) { console.error('[scheduler] driver summary', d.email, e.message); }
    }
    if (staff.length || drivers.length) {
      console.log(`[scheduler] ${hhmm} dispatched: staff=${staff.length}, drivers=${drivers.length}`);
    }
  } catch (e) { console.error('[scheduler] tick error:', e.message); }
}

function start() {
  if (process.env.ENABLE_CRON === 'false') { console.log('[scheduler] disabled (ENABLE_CRON=false)'); return; }
  cron.schedule('* * * * *', tick, { timezone: TZ });
  console.log('[scheduler] per-user dispatch ανά λεπτό ενεργό · tz=' + TZ + ' (default: προσωπικό 18:00, οδηγοί 23:00)');
}

module.exports = { start };
