const TZ = process.env.APP_TZ || 'Europe/Athens';

function ymd(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}
function todayStr() { return ymd(new Date()); }
function tomorrowStr() { return ymd(new Date(Date.now() + 24 * 3600 * 1000)); }
function prettyDate(str) {
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
module.exports = { TZ, ymd, todayStr, tomorrowStr, prettyDate, esc };
