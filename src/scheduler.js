const cron = require('node-cron');
const { sendStaffReminders, sendDriverSummaries } = require('./mailer');
const { TZ } = require('./util');

function start() {
  if (process.env.ENABLE_CRON === 'false') {
    console.log('[scheduler] disabled (ENABLE_CRON=false)');
    return;
  }
  const staffCron = process.env.STAFF_REMINDER_CRON || '0 18 * * *';
  const driverCron = process.env.DRIVER_SUMMARY_CRON || '0 23 * * *';
  const opts = { timezone: TZ };

  cron.schedule(staffCron, () => {
    console.log('[scheduler] running staff reminders');
    sendStaffReminders().catch(e => console.error(e));
  }, opts);

  cron.schedule(driverCron, () => {
    console.log('[scheduler] running driver summaries');
    sendDriverSummaries().catch(e => console.error(e));
  }, opts);

  console.log(`[scheduler] staff="${staffCron}" driver="${driverCron}" tz=${TZ}`);
}
module.exports = { start };
